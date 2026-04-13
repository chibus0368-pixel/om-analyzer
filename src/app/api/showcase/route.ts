/**
 * Public showcase API - returns up to 6 real property hero photos from the
 * workspace to power the landing-page hero mockup cards.
 *
 * Anonymized: we return heroImageUrl + a minimal identifier only. No names,
 * no addresses, no financials - the landing page already has hardcoded deal
 * narratives; this endpoint only supplies the real imagery layer.
 *
 * Cached aggressively at the edge so it costs us one Firestore read per hour
 * regardless of landing-page traffic.
 */
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ShowcasePhoto = {
  heroImageUrl: string;
  assetType?: string;
  verdict?: "BUY" | "NEUTRAL" | "PASS";
};

export async function GET() {
  try {
    const db = getAdminDb();

    // Pull a pool of recent properties that actually have hero photos.
    // We over-query (40) so we can pick a diverse set after client-side dedup.
    const snap = await db
      .collection("properties")
      .orderBy("updatedAt", "desc")
      .limit(200)
      .get();

    const seen = new Set<string>();
    const photos: ShowcasePhoto[] = [];

    for (const doc of snap.docs) {
      const d = doc.data() as any;
      const url: string | undefined = d.heroImageUrl;
      if (!url || !url.startsWith("https://")) continue;
      // Dedup by URL (same photo sometimes copied across re-parses)
      if (seen.has(url)) continue;
      seen.add(url);

      // Map score band -> verdict
      const score = Number(d.scoreTotal || d.score || 0);
      const verdict: ShowcasePhoto["verdict"] =
        score >= 70 ? "BUY" : score >= 55 ? "NEUTRAL" : "PASS";

      photos.push({
        heroImageUrl: url,
        assetType: d.assetType || d.analysisType || undefined,
        verdict: score > 0 ? verdict : undefined,
      });

      if (photos.length >= 12) break;
    }

    return NextResponse.json(
      { photos },
      {
        headers: {
          // Edge cache for 1 hour, serve stale for another hour while revalidating
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=3600",
        },
      }
    );
  } catch (err: any) {
    console.error("[showcase] failed:", err);
    return NextResponse.json({ photos: [] }, { status: 200 });
  }
}
