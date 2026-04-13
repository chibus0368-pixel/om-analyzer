import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";
import { nanoid } from "nanoid";

const db = () => getAdminDb();

/**
 * Share Links API
 *
 * Firestore collection: `share_links`
 * Document schema:
 *   id: string (auto)
 *   shareId: string (short nanoid for URL)
 *   userId: string (owner - real Firebase UID)
 *   workspaceId: string
 *   workspaceName: string
 *   displayName: string (custom override name, or empty)
 *   whiteLabel: boolean (hide Deal Signals branding)
 *   hideDocuments: boolean (don't show source docs)
 *   isActive: boolean
 *   viewCount: number
 *   createdAt: string
 *   updatedAt: string
 */

async function getUserIdFromToken(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.replace("Bearer ", "");
  if (!token || token === "mock") return null;

  try {
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded.uid;
  } catch (err) {
    console.error("[share] Token verification failed:", err);
    return null;
  }
}

// GET - list share links for current user
export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized - valid Firebase token required" }, { status: 401 });
    }
    const workspaceId = req.nextUrl.searchParams.get("workspaceId");

    let q = db().collection("share_links").where("userId", "==", userId);
    if (workspaceId) {
      q = q.where("workspaceId", "==", workspaceId);
    }

    const snap = await q.get();
    const links = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    return NextResponse.json({ links });
  } catch (err: any) {
    console.error("[share] GET error:", err);
    return NextResponse.json({ error: err?.message || "Failed to load share links" }, { status: 500 });
  }
}

// POST - create a new share link
export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized - valid Firebase token required" }, { status: 401 });
    }
    const body = await req.json();
    const { workspaceId, workspaceName, displayName, whiteLabel, hideDocuments, contactName, contactAgency, contactPhone } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    const shareId = nanoid(12);
    const now = new Date().toISOString();

    const doc = {
      shareId,
      userId,
      workspaceId,
      workspaceName: workspaceName || "DealBoard",
      displayName: displayName || "",
      whiteLabel: whiteLabel !== false, // default true
      hideDocuments: hideDocuments !== false, // default true
      contactName: contactName || "",
      contactAgency: contactAgency || "",
      contactPhone: contactPhone || "",
      isActive: true,
      viewCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    const ref = await db().collection("share_links").add(doc);

    return NextResponse.json({
      id: ref.id,
      ...doc,
      url: `${process.env.NEXT_PUBLIC_BASE_URL || "https://www.dealsignals.app"}/share/${shareId}`,
    });
  } catch (err: any) {
    console.error("[share] POST error:", err);
    return NextResponse.json({ error: err?.message || "Failed to create share link" }, { status: 500 });
  }
}

// PATCH - update a share link
export async function PATCH(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized - valid Firebase token required" }, { status: 401 });
    }
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const ref = db().collection("share_links").doc(id);
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json({ error: "Share link not found" }, { status: 404 });
    }

    const data = snap.data();
    if (data?.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Only allow updating specific fields
    const allowed: Record<string, any> = {};
    if (updates.displayName !== undefined) allowed.displayName = updates.displayName;
    if (updates.whiteLabel !== undefined) allowed.whiteLabel = updates.whiteLabel;
    if (updates.hideDocuments !== undefined) allowed.hideDocuments = updates.hideDocuments;
    if (updates.isActive !== undefined) allowed.isActive = updates.isActive;
    if (updates.workspaceId !== undefined) allowed.workspaceId = updates.workspaceId;
    if (updates.workspaceName !== undefined) allowed.workspaceName = updates.workspaceName;
    if (updates.contactName !== undefined) allowed.contactName = updates.contactName;
    if (updates.contactAgency !== undefined) allowed.contactAgency = updates.contactAgency;
    if (updates.contactPhone !== undefined) allowed.contactPhone = updates.contactPhone;
    allowed.updatedAt = new Date().toISOString();

    await ref.update(allowed);

    return NextResponse.json({ success: true, ...allowed });
  } catch (err: any) {
    console.error("[share] PATCH error:", err);
    return NextResponse.json({ error: err?.message || "Failed to update share link" }, { status: 500 });
  }
}

// DELETE - remove a share link
export async function DELETE(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized - valid Firebase token required" }, { status: 401 });
    }
    const id = req.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const ref = db().collection("share_links").doc(id);
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json({ error: "Share link not found" }, { status: 404 });
    }

    const data = snap.data();
    if (data?.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await ref.delete();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[share] DELETE error:", err);
    return NextResponse.json({ error: err?.message || "Failed to delete share link" }, { status: 500 });
  }
}
