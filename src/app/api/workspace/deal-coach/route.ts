import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/workspace/deal-coach
 *
 * Streaming brainstorming chat scoped to a single property. Loads the
 * property doc + extracted_fields server-side, builds a context-rich
 * system prompt, then streams the OpenAI response back to the client.
 *
 * Request body: {
 *   propertyId: string,
 *   message: string,                       // latest user message
 *   history?: { role: "user"|"assistant"; content: string }[],
 * }
 *
 * Response: text/event-stream — newline-delimited "data: <chunk>\n\n"
 *           with a final "data: [DONE]\n\n".
 */
export async function POST(req: NextRequest) {
  try {
    // ── Auth ──
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.split("Bearer ")[1];
    const decoded = await getAdminAuth().verifyIdToken(token);
    const userId = decoded.uid;

    const body = await req.json().catch(() => ({}));
    const propertyId: string = String(body?.propertyId || "");
    const message: string = String(body?.message || "").trim();
    const history: Array<{ role: "user" | "assistant"; content: string }> = Array.isArray(body?.history)
      ? body.history.slice(-10) // cap turn history so context doesn't bloat
      : [];

    if (!propertyId) return NextResponse.json({ error: "propertyId required" }, { status: 400 });
    if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY missing" }, { status: 503 });
    }

    // ── Load property + fields ──
    const db = getAdminDb();
    const propSnap = await db.collection("workspace_properties").doc(propertyId).get();
    if (!propSnap.exists) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }
    const prop = propSnap.data() as any;
    if (prop.userId && prop.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const fieldsSnap = await db
      .collection("workspace_extracted_fields")
      .where("propertyId", "==", propertyId)
      .get();
    const fields: Record<string, any> = {};
    fieldsSnap.docs.forEach((d) => {
      const data = d.data() as any;
      const key = `${data.fieldGroup}.${data.fieldName}`;
      fields[key] = data.isUserOverridden
        ? data.userOverrideValue
        : (data.normalizedValue ?? data.rawValue);
    });

    // Compact the field map into a markdown digest. Two important
    // calibrations vs the first version:
    //   (a) Rent roll fields (tenant_N_name, tenant_N_sf, tenant_N_rent,
    //       tenant_N_lease_end, etc) are NEVER capped - users want to
    //       ask about specific tenants and lease terms, and those rows
    //       were getting truncated at 30/group, which is why the bot
    //       said "I don't know the lease terms" for big rent rolls.
    //   (b) For other groups we still cap at 80 rows/group (was 30) so
    //       a single bloated group can't blow the system prompt budget.
    //   (c) Tenant-numbered fields are also reorganized into a tenant
    //       table at the end of the digest so the LLM doesn't have to
    //       reconstruct the rent roll from scattered tenant_3_* rows.
    const fieldsByGroup: Record<string, Array<[string, any]>> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v == null || v === "") continue;
      const [group, name] = k.split(".");
      if (!fieldsByGroup[group]) fieldsByGroup[group] = [];
      fieldsByGroup[group].push([name, v]);
    }
    const fieldDigest = Object.entries(fieldsByGroup)
      .map(([g, rows]) => {
        const head = `### ${g}`;
        const cap = g === "rent_roll" ? rows.length : 80;
        const lines = rows
          .slice(0, cap)
          .map(([n, v]) => `- ${n}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
          .join("\n");
        return `${head}\n${lines}`;
      })
      .join("\n\n");

    // Pivot rent_roll fields into a tenant-by-tenant block so the LLM
    // can answer "what's tenant X's lease end?" without joining
    // tenant_3_name to tenant_3_lease_end across separate bullet rows.
    const rentRollRows = fieldsByGroup["rent_roll"] || [];
    const tenants: Record<string, Record<string, any>> = {};
    for (const [name, value] of rentRollRows) {
      const m = name.match(/^tenant_(\d+)_(.+)$/);
      if (!m) continue;
      const idx = m[1];
      const attr = m[2];
      if (!tenants[idx]) tenants[idx] = {};
      tenants[idx][attr] = value;
    }
    const tenantBlock = Object.keys(tenants).length
      ? "\n\n### tenant table (parsed from rent_roll)\n" +
        Object.entries(tenants)
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .map(([idx, t]) => {
            const tName = t.name ?? "(unnamed)";
            const sf = t.sf ?? "?";
            const rent = t.rent ?? t.monthly_rent ?? "?";
            const psf = t.rent_psf ?? "?";
            const start = t.lease_start ?? "?";
            const end = t.lease_end ?? "?";
            const type = t.type ?? "?";
            const status = t.status ?? "?";
            const ext = t.extension ?? "";
            return `- Tenant ${idx}: ${tName} | SF: ${sf} | Rent: ${rent} | $/SF: ${psf} | Lease: ${start} → ${end} | Type: ${type} | Status: ${status}${ext ? ` | Options: ${ext}` : ""}`;
          })
          .join("\n")
      : "";

    // Pull the "First-Pass Investment Brief" note (or any pinned note)
    // so the bot has access to the narrative summary the parse engine
    // wrote, not just the raw fields.
    let briefBody = "";
    try {
      const notesSnap = await db
        .collection("workspace_notes")
        .where("propertyId", "==", propertyId)
        .get();
      const briefDoc = notesSnap.docs.find((d) => {
        const data = d.data() as any;
        return data?.noteType === "investment_thesis" || data?.isPinned;
      });
      if (briefDoc) {
        const c = (briefDoc.data() as any)?.content;
        briefBody = typeof c === "string" ? c.slice(0, 3500) : JSON.stringify(c).slice(0, 3500);
      }
    } catch {
      /* non-blocking */
    }
    const briefBlock = briefBody ? `\n\n### Investment brief (parsed narrative)\n${briefBody}` : "";

    const addr = [prop.address1, prop.city, prop.state, prop.zip].filter(Boolean).join(", ");

    const systemPrompt = `You are Deal Coach, a senior CRE acquisitions analyst working alongside the user on a specific deal.

ALWAYS reason from the deal data below. If a number isn't in the data, say so plainly instead of inventing one. Cite the field/group when you reference an extracted value.

When the user asks open-ended questions ("what should I do", "is this a good deal", "highest and best use"), give 2-4 concrete options with the pros/cons and the assumption that drives each.

Keep answers tight: lead with the answer, then 3-6 bullets of reasoning. Use the deal's numbers, not generic CRE advice.

DEAL CONTEXT
============
Property: ${prop.propertyName || "(unnamed)"}
Address: ${addr || "(unknown)"}
Asset type: ${prop.analysisType || "unknown"}
Score: ${prop.scoreTotal ?? "(not scored)"} / 100${prop.scoreBand ? ` (${prop.scoreBand})` : ""}
Recommendation: ${prop.recommendation || "(none)"}

Card metrics:
- Asking price: ${prop.cardAskingPrice ? `$${Number(prop.cardAskingPrice).toLocaleString()}` : "(unknown)"}
- Cap rate: ${prop.cardCapRate ? `${prop.cardCapRate}%` : "(unknown)"}
- NOI: ${prop.cardNoi ? `$${Number(prop.cardNoi).toLocaleString()}` : "(unknown)"}
- Building SF: ${prop.cardBuildingSf ? `${Number(prop.cardBuildingSf).toLocaleString()} SF` : "(unknown)"}
- Occupancy: ${prop.occupancyPct ? `${prop.occupancyPct}%` : "(unknown)"}

EXTRACTED FIELDS (${fieldsSnap.size} total)
${fieldDigest || "(no extracted fields yet — parse may not have run)"}${tenantBlock}${briefBlock}
`;

    // ── Compose OpenAI messages ──
    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: message },
    ];

    // ── Stream from OpenAI ──
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        max_tokens: 1200,
        stream: true,
        messages,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      console.error("[deal-coach] OpenAI HTTP", upstream.status, detail.slice(0, 300));
      return NextResponse.json(
        { error: "deal_coach_unavailable", detail: `OpenAI HTTP ${upstream.status}` },
        { status: 502 }
      );
    }

    // Re-stream OpenAI's SSE to the client, unwrapping the JSON deltas
    // into plain text chunks so the client can append directly without
    // JSON-parsing each frame.
    const stream = new ReadableStream({
      async start(controller) {
        const reader = upstream.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data: ")) continue;
              const payload = trimmed.slice(6);
              if (payload === "[DONE]") {
                controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
                continue;
              }
              try {
                const parsed = JSON.parse(payload);
                const delta = parsed?.choices?.[0]?.delta?.content;
                if (delta) {
                  controller.enqueue(
                    new TextEncoder().encode(`data: ${JSON.stringify({ delta })}\n\n`)
                  );
                }
              } catch {
                // skip malformed frame
              }
            }
          }
        } catch (err: any) {
          console.error("[deal-coach] stream error", err?.message);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    console.error("[deal-coach] error:", err?.message || err);
    if (err?.code === "auth/id-token-expired" || err?.code === "auth/argument-error") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: err?.message || "deal_coach_failed" }, { status: 500 });
  }
}
