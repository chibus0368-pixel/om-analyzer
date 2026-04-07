import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.split("Bearer ")[1];
    await getAdminAuth().verifyIdToken(token);

    const { id } = await params;
    const db = getAdminDb();
    const snap = await db.collection("workspace_properties").doc(id).get();

    if (!snap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ property: { id: snap.id, ...snap.data() } });
  } catch (err: any) {
    console.error("[property GET] Error:", err.message);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
