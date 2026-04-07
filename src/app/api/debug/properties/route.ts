import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  try {
    const db = getAdminDb();
    const snap = await db.collection("workspace_properties").limit(50).get();
    const props = snap.docs.map(d => ({
      id: d.id,
      propertyName: d.data().propertyName,
      userId: d.data().userId,
      workspaceId: d.data().workspaceId,
      processingStatus: d.data().processingStatus,
      createdAt: d.data().createdAt,
    }));
    return NextResponse.json({ total: snap.size, properties: props });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
