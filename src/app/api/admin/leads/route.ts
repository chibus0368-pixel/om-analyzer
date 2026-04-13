import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

const ADMIN_EMAIL = "chibus0368@gmail.com";

async function verifyAdmin(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const token = authHeader.split("Bearer ")[1];
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (decoded.email !== ADMIN_EMAIL) return null;
    return decoded.uid;
  } catch {
    return null;
  }
}

/**
 * GET /api/admin/leads - list all captured leads
 */
export async function GET(req: NextRequest) {
  const adminUid = await verifyAdmin(req);
  if (!adminUid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const db = getAdminDb();
    const snapshot = await db.collection("leads")
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();

    const leads = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ leads });
  } catch (err) {
    console.error("Admin leads fetch error:", (err as Error).message);
    return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 });
  }
}
