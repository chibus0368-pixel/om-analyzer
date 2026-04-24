/**
 * Server-side metadata wrapper for public share links.
 *
 * The page itself is a client component, so it can't export
 * generateMetadata. This layout runs on the server, fetches the
 * share_links doc + property count directly (no HTTP self-fetch per
 * SPECS.md §4), and returns OG/Twitter tags so link previews in
 * Slack / iMessage / LinkedIn / email clients show the recipient
 * label and property count instead of a bare URL.
 */
import type { Metadata } from "next";
import { getAdminDb } from "@/lib/firebase-admin";

type Props = {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
};

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://www.dealsignals.app";

const FALLBACK_META: Metadata = {
  title: "Shared DealBoard · DealSignals",
  description: "View shared commercial real estate analysis.",
  robots: { index: false, follow: false },
};

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id: shareId } = await params;

  try {
    const db = getAdminDb();

    const snap = await db.collection("share_links")
      .where("shareId", "==", shareId)
      .where("isActive", "==", true)
      .limit(1)
      .get();

    if (snap.empty) return FALLBACK_META;

    const shareData = snap.docs[0].data();

    // Honor hard expiration — match /api/share/[id] logic
    if (shareData.expiresAt && typeof shareData.expiresAt === "string") {
      const expiry = new Date(shareData.expiresAt).getTime();
      if (Number.isFinite(expiry) && Date.now() > expiry) {
        return {
          title: "Share link expired · DealSignals",
          robots: { index: false, follow: false },
        };
      }
    }

    // Count properties using the same filtering rules as /api/share/[id]
    let propsSnap = await db.collection("workspace_properties")
      .where("userId", "==", shareData.userId)
      .get();

    if (propsSnap.empty && shareData.userId === "admin-user") {
      const legacyWsId = shareData.workspaceId;
      if (legacyWsId && legacyWsId !== "default") {
        propsSnap = await db.collection("workspace_properties")
          .where("workspaceId", "==", legacyWsId)
          .get();
      } else {
        propsSnap = await db.collection("workspace_properties").get();
      }
    }

    const allProps = propsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    const wsId = shareData.workspaceId;

    let properties: any[];
    if (wsId === "default") {
      const defaultFiltered = allProps.filter(p => !p.workspaceId || p.workspaceId === "default");
      properties = defaultFiltered.length > 0 ? defaultFiltered : allProps;
    } else {
      properties = allProps.filter(p => p.workspaceId === wsId);
    }

    const count = properties.length;
    const propWord = count === 1 ? "property" : "properties";
    // Use the DealBoard's own name for the preview title, not the
    // recipient-focused displayName ("Q2 NNN Deals for ABC Capital").
    // workspaceName is the actual board name; fall back to displayName
    // only if the board has no name set.
    const label: string = (shareData.workspaceName as string)
      || (shareData.displayName as string)
      || "Shared DealBoard";
    const sender: string = (shareData.contactName as string) || "";
    const agency: string = (shareData.contactAgency as string) || "";

    const title = `${label} · ${count} ${propWord}`;

    const descParts: string[] = [];
    descParts.push(`${count} ${propWord} shared`);
    if (sender) {
      descParts.push(`by ${sender}${agency ? `, ${agency}` : ""}`);
    }
    const description = descParts.join(" ") + ".";

    // First hero image (if any) makes the preview card visual.
    const firstHero = properties.find(p => typeof p.heroImageUrl === "string" && p.heroImageUrl);
    const ogImages = firstHero?.heroImageUrl
      ? [{ url: firstHero.heroImageUrl as string }]
      : undefined;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: `${BASE_URL}/share/${shareId}`,
        siteName: "DealSignals",
        type: "website",
        ...(ogImages ? { images: ogImages } : {}),
      },
      twitter: {
        card: ogImages ? "summary_large_image" : "summary",
        title,
        description,
        ...(ogImages ? { images: ogImages.map(i => i.url) } : {}),
      },
      // Share links are semi-private — don't index them.
      robots: { index: false, follow: false },
    };
  } catch (err) {
    console.error("[share/layout] generateMetadata failed:", err);
    return FALLBACK_META;
  }
}

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
