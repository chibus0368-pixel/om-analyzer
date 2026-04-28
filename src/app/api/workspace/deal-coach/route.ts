import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { renderSkillsBlock } from "@/lib/workspace/skill-loader";
import { scoreBandLabel } from "@/lib/workspace/score-band-labels";

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

    // Pull peer deals from the same dealboard so the bot can compare
    // ("how does this cap rate stack up against the rest of my Dave
    // Retail board?"). Capped at 25 most recent, only key card
    // metrics + score so we don't bloat the prompt.
    let peerBlock = "";
    try {
      const wsId = (prop as any)?.workspaceId;
      if (wsId) {
        const peersSnap = await db
          .collection("workspace_properties")
          .where("userId", "==", userId)
          .where("workspaceId", "==", wsId)
          .get();
        const peers = peersSnap.docs
          .filter((d) => d.id !== propertyId)
          .map((d) => {
            const p = d.data() as any;
            return {
              id: d.id,
              name: p.propertyName || "(unnamed)",
              type: p.analysisType,
              price: p.cardAskingPrice,
              cap: p.cardCapRate,
              noi: p.cardNoi,
              sf: p.cardBuildingSf,
              score: p.scoreTotal,
              band: p.scoreBand,
              created: p.createdAt,
            };
          })
          .sort((a, b) => String(b.created || "").localeCompare(String(a.created || "")))
          .slice(0, 25);
        if (peers.length > 0) {
          peerBlock = `\n\n### Peer deals on this dealboard (${peers.length})\n` +
            peers
              .map((p) => {
                const parts = [
                  `${p.name}`,
                  p.type ? `(${p.type})` : "",
                  p.price ? `$${(Number(p.price) / 1_000_000).toFixed(2)}M` : "",
                  p.cap ? `${p.cap}% cap` : "",
                  p.noi ? `NOI $${Number(p.noi).toLocaleString()}` : "",
                  p.sf ? `${Number(p.sf).toLocaleString()} SF` : "",
                  p.score != null ? `score ${p.score}${p.band ? ` (${scoreBandLabel(p.band)})` : ""}` : "",
                ].filter(Boolean).join(" · ");
                return `- ${parts}`;
              })
              .join("\n");
        }
      }
    } catch (peerErr: any) {
      console.warn("[deal-coach] peer fetch failed:", peerErr?.message);
    }

    // Per-property research enrichment (nearby Places + ACS demographics).
    // Normally populated by the background pipeline after parse, but
    // for properties that pre-date the research feature, kick off a
    // one-shot enrichment in the background here. The CURRENT chat
    // turn won't see it (we only read the cached doc) but the next
    // turn will.
    let researchBlock = "";
    try {
      const rSnap = await db.collection("workspace_research").doc(propertyId).get();
      if (!rSnap.exists && process.env.CRON_SECRET) {
        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL ||
          process.env.NEXT_PUBLIC_SITE_URL ||
          "https://www.dealsignals.app";
        void fetch(`${baseUrl}/api/workspace/research/${propertyId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-cron-secret": process.env.CRON_SECRET,
          },
          body: JSON.stringify({}),
        }).catch(() => {});
      }
      if (rSnap.exists) {
        const r = rSnap.data() as any;
        const nearby: any[] = Array.isArray(r?.nearby) ? r.nearby : [];
        const dem = r?.demographics || null;

        if (nearby.length > 0 || dem) {
          const grouped: Record<string, any[]> = {};
          for (const n of nearby) {
            const c = n.category || "other";
            if (!grouped[c]) grouped[c] = [];
            grouped[c].push(n);
          }
          const nearbyLines = Object.entries(grouped).map(([cat, items]) => {
            const list = items
              .slice(0, 6)
              .map((n) => `${n.name}${n.distanceMeters ? ` (${n.distanceMeters}m)` : ""}${n.rating ? ` ★${n.rating}` : ""}`)
              .join(", ");
            return `  - ${cat}: ${list}`;
          }).join("\n");

          const demLines: string[] = [];
          if (dem?.population) demLines.push(`Population: ${dem.population.toLocaleString()}`);
          if (dem?.medianIncome) demLines.push(`Median household income: $${dem.medianIncome.toLocaleString()}`);
          if (dem?.medianAge) demLines.push(`Median age: ${dem.medianAge}`);
          if (dem?.medianHomeValue) demLines.push(`Median home value: $${dem.medianHomeValue.toLocaleString()}`);
          if (dem?.housingUnits) demLines.push(`Housing units: ${dem.housingUnits.toLocaleString()}`);
          if (dem?.laborForce && dem?.unemployed) {
            const ur = ((dem.unemployed / dem.laborForce) * 100).toFixed(1);
            demLines.push(`Unemployment: ${ur}%`);
          }

          researchBlock = `\n\n### Local context (background research)\n` +
            (nearbyLines ? `Nearby (within ~1 mi):\n${nearbyLines}\n` : "") +
            (demLines.length ? `\nDemographics (${dem.geo || "city"}):\n  - ${demLines.join("\n  - ")}\n` : "") +
            `\n_Refreshed ${r.refreshedAt || "(unknown)"} — comp transactions are not auto-enriched yet._`;
        }
      }
    } catch (rErr: any) {
      console.warn("[deal-coach] research fetch failed:", rErr?.message);
    }

    const addr = [prop.address1, prop.city, prop.state, prop.zip].filter(Boolean).join(", ");

    // ── Identify missing-but-important fields ──────────────────────
    // Asset-type-aware list of "things every analyst expects to see
    // before they can underwrite". We tell the bot which of these are
    // missing so it can proactively ask the user and call the
    // save_property_field tool with their answer.
    const at = String(prop.analysisType || "").toLowerCase();
    const importantFields: { group: string; name: string; label: string; ask: string }[] = [
      { group: "pricing_deal_terms", name: "asking_price", label: "Asking price", ask: "Do you know the asking price?" },
      { group: "pricing_deal_terms", name: "cap_rate_om", label: "Cap rate (OM-stated)", ask: "What's the OM-stated cap rate?" },
      { group: "expenses", name: "noi_om", label: "NOI (OM-stated)", ask: "What's the stated NOI?" },
      { group: "property_basics", name: "year_built", label: "Year built", ask: "Do you know the year built?" },
      { group: "property_basics", name: "occupancy_pct", label: "Occupancy %", ask: "What's the current occupancy %?" },
    ];
    if (at !== "land" && at !== "multifamily") {
      importantFields.push({ group: "property_basics", name: "building_sf", label: "Building SF / GLA", ask: "What's the building SF / GLA?" });
    }
    if (at === "multifamily") {
      importantFields.push({ group: "multifamily_addons", name: "unit_count", label: "Unit count", ask: "How many units?" });
      importantFields.push({ group: "multifamily_addons", name: "avg_rent_per_unit", label: "Avg rent / unit", ask: "What's the average in-place rent per unit?" });
    }
    if (at === "land") {
      importantFields.push({ group: "property_basics", name: "total_acres", label: "Total acres", ask: "What's the total acreage?" });
      importantFields.push({ group: "property_basics", name: "zoning", label: "Zoning code", ask: "What's the zoning code?" });
    }
    if (at === "retail" || at === "industrial" || at === "office") {
      importantFields.push({ group: "property_basics", name: "tenant_count", label: "Tenant count", ask: "How many tenants?" });
    }

    const missingFields = importantFields.filter((f) => {
      const k = `${f.group}.${f.name}`;
      const v = fields[k];
      return v == null || v === "" || v === 0;
    });

    const missingBlock = missingFields.length > 0
      ? `\n\nMISSING DATA (proactively offer to fill these via save_property_field tool calls):\n${missingFields.map((f) => `- ${f.group}.${f.name} (${f.label}) — suggested ask: "${f.ask}"`).join("\n")}\n`
      : "";

    const systemPrompt = `You are Deal Coach, a senior CRE acquisitions analyst working alongside the user on a specific deal.

ALWAYS reason from the deal data below. If a number isn't in the data, say so plainly instead of inventing one. Cite the field/group when you reference an extracted value.

When the user asks open-ended questions ("what should I do", "is this a good deal", "highest and best use"), give 2-4 concrete options with the pros/cons and the assumption that drives each.

Keep answers tight: lead with the answer, then 3-6 bullets of reasoning. Use the deal's numbers, not generic CRE advice.

When peer deals from the same dealboard are listed below, USE them for comparison ("vs your other 4 retail centers, this cap rate is high/low"). Reference peers by name, not ID.

PROACTIVE DATA-FILL: If MISSING DATA fields are listed below AND the user's question would benefit from one of those values, ASK them for the missing piece in plain English. When they answer, IMMEDIATELY call the save_property_field tool to persist the value. Confirm in the next sentence ("Saved 12,500 SF to the property profile"). Don't batch ask 5 questions at once - ask one or two, save, continue.${missingBlock}

DEAL CONTEXT
============
Property: ${prop.propertyName || "(unnamed)"}
Address: ${addr || "(unknown)"}
Asset type: ${prop.analysisType || "unknown"}
Score: ${prop.scoreTotal ?? "(not scored)"} / 100${prop.scoreBand ? ` (${scoreBandLabel(prop.scoreBand)})` : ""}
Recommendation: ${prop.recommendation || "(none)"}

Card metrics:
- Asking price: ${prop.cardAskingPrice ? `$${Number(prop.cardAskingPrice).toLocaleString()}` : "(unknown)"}
- Cap rate: ${prop.cardCapRate ? `${prop.cardCapRate}%` : "(unknown)"}
- NOI: ${prop.cardNoi ? `$${Number(prop.cardNoi).toLocaleString()}` : "(unknown)"}
- Building SF: ${prop.cardBuildingSf ? `${Number(prop.cardBuildingSf).toLocaleString()} SF` : "(unknown)"}
- Occupancy: ${prop.occupancyPct ? `${prop.occupancyPct}%` : "(unknown)"}

EXTRACTED FIELDS (${fieldsSnap.size} total)
${fieldDigest || "(no extracted fields yet — parse may not have run)"}${tenantBlock}${briefBlock}${peerBlock}${researchBlock}
${renderSkillsBlock(prop.analysisType)}`;

    // ── Compose OpenAI messages ──
    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: message },
    ];

    // ── Tool definitions (function calling) ──
    // The save_property_field tool lets the bot persist a user-given
    // value (e.g. "the building is 12,500 SF") to the property's
    // extracted_fields collection. Backed by the save-field endpoint.
    const tools = [
      {
        type: "function",
        function: {
          name: "save_property_field",
          description:
            "Save a single property field (with the user's confirmed value) into the property profile. " +
            "Use this whenever the user supplies a piece of MISSING DATA listed in the system prompt. " +
            "Always use the canonical group/name from the MISSING DATA list. Do NOT call this for values you computed - only for values the USER told you.",
          parameters: {
            type: "object",
            properties: {
              group: { type: "string", description: "Canonical field group, e.g. 'pricing_deal_terms', 'property_basics', 'expenses'." },
              name: { type: "string", description: "Canonical field name within the group, e.g. 'asking_price', 'building_sf', 'noi_om'." },
              value: { type: ["string", "number"], description: "The value the user gave (raw or numeric)." },
            },
            required: ["group", "name", "value"],
          },
        },
      },
    ];

    // Server-side tool executor. Returns a string result that gets
    // appended to the conversation as a `tool` message before we
    // re-call OpenAI for the follow-up assistant turn.
    const executeTool = async (name: string, args: any): Promise<string> => {
      if (name === "save_property_field") {
        try {
          // Re-use the save-field endpoint logic inline so we don't
          // need a self-fetch (which Vercel docs warn against).
          const g = String(args?.group || "").trim();
          const n = String(args?.name || "").trim();
          const v = args?.value;
          if (!g || !n || v === undefined || v === null || v === "") {
            return JSON.stringify({ ok: false, error: "missing arguments" });
          }
          const stringValue = String(v).trim();
          const numericTry = Number(stringValue.replace(/[$,%\s]/g, ""));
          const normalized: any = Number.isFinite(numericTry) && stringValue.match(/[\d.]/) ? numericTry : stringValue;
          const now = new Date().toISOString();

          const existing = await db
            .collection("workspace_extracted_fields")
            .where("propertyId", "==", propertyId)
            .where("fieldGroup", "==", g)
            .where("fieldName", "==", n)
            .limit(1)
            .get();
          if (!existing.empty) {
            await existing.docs[0].ref.update({
              rawValue: stringValue,
              normalizedValue: normalized,
              isUserOverridden: true,
              isUserConfirmed: true,
              userOverrideValue: normalized,
              sourceLocator: "deal_coach_chat",
              updatedAt: now,
            });
          } else {
            await db.collection("workspace_extracted_fields").doc().set({
              propertyId,
              projectId: prop.projectId || "workspace-default",
              documentId: "",
              fieldGroup: g,
              fieldName: n,
              rawValue: stringValue,
              normalizedValue: normalized,
              confidenceScore: 1.0,
              extractionMethod: "deal_coach_chat",
              sourceLocator: "deal_coach_chat",
              isUserConfirmed: true,
              isUserOverridden: true,
              userOverrideValue: normalized,
              createdAt: now,
              updatedAt: now,
            });
          }
          return JSON.stringify({ ok: true, saved: { group: g, name: n, value: normalized } });
        } catch (err: any) {
          return JSON.stringify({ ok: false, error: err?.message || "save failed" });
        }
      }
      return JSON.stringify({ ok: false, error: `unknown tool ${name}` });
    };

    // ── Helper to call OpenAI (non-streaming) for the tool-call
    //    discovery turn(s), then stream the final answer. We loop up
    //    to MAX_TOOL_TURNS times in case the model wants to call the
    //    save tool for multiple fields in a row. ──
    const MAX_TOOL_TURNS = 3;
    let savedFields: any[] = [];

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const probe = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.4,
          max_tokens: 1200,
          messages,
          tools,
          tool_choice: "auto",
        }),
      });
      if (!probe.ok) {
        const detail = await probe.text().catch(() => "");
        console.error("[deal-coach] OpenAI tool-probe HTTP", probe.status, detail.slice(0, 300));
        return NextResponse.json(
          { error: "deal_coach_unavailable", detail: `OpenAI HTTP ${probe.status}` },
          { status: 502 }
        );
      }
      const probeJson = await probe.json();
      const choice = probeJson?.choices?.[0];
      const msg = choice?.message;
      const toolCalls = msg?.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        // No tool calls — re-issue as a streaming completion for the
        // final answer. Push the assistant message we already have to
        // make sure the streamed turn matches.
        break;
      }

      // Execute each tool call, append assistant + tool messages,
      // then loop to ask the model for its next move.
      messages.push({ role: "assistant", content: msg?.content || "", tool_calls: toolCalls });
      for (const tc of toolCalls) {
        let parsedArgs: any = {};
        try { parsedArgs = JSON.parse(tc?.function?.arguments || "{}"); } catch { /* skip */ }
        const result = await executeTool(tc?.function?.name, parsedArgs);
        if (tc?.function?.name === "save_property_field") {
          try {
            const r = JSON.parse(result);
            if (r?.ok && r?.saved) savedFields.push(r.saved);
          } catch { /* skip */ }
        }
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      }
    }

    // ── Final streaming turn (no tools — just the assistant's reply
    //    after any tool execution). ──
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
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

    // Re-stream OpenAI SSE → plain delta JSON. Also emit a
    // `saved_field` event up front so the client can refresh the
    // property page and show a confirmation chip immediately.
    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        for (const sf of savedFields) {
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ saved_field: sf })}\n\n`));
        }
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
                controller.enqueue(enc.encode("data: [DONE]\n\n"));
                continue;
              }
              try {
                const parsed = JSON.parse(payload);
                const delta = parsed?.choices?.[0]?.delta?.content;
                if (delta) controller.enqueue(enc.encode(`data: ${JSON.stringify({ delta })}\n\n`));
              } catch { /* skip malformed frame */ }
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
