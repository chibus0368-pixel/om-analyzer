import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const maxDuration = 30;

// Generate output records — actual file generation happens client-side
// This just creates the Firestore records for the outputs
export async function POST(request: NextRequest) {
  try {
    const { propertyId, userId, parsedData } = await request.json();

    if (!propertyId || !userId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const db = getAdminDb();
    const now = new Date().toISOString();
    const propertyName = parsedData?.property?.name || "Property";

    // Save brief as a note if it exists (with propertyId for isolation)
    if (parsedData?.brief) {
      try {
        await db.collection("workspace_notes").add({
          projectId: "workspace-default",
          propertyId,
          userId,
          noteType: "investment_thesis",
          title: "First-Pass Investment Brief",
          content: parsedData.brief,
          isPinned: true,
          createdAt: now,
          updatedAt: now,
        });
      } catch { /* non-blocking */ }
    }

    // Create output records (the actual files will be generated client-side)
    const outputs: { type: string; title: string }[] = [];

    if (parsedData?.brief) {
      await db.collection("workspace_outputs").add({
        projectId: "workspace-default",
        propertyId,
        outputType: "brief_txt",
        title: `${propertyName} — First-Pass Brief`,
        storagePath: "",
        fileExt: "txt",
        versionNumber: 1,
        generatedBy: "auto",
        generationStatus: "completed",
        createdAt: now,
      });
      outputs.push({ type: "brief", title: `${propertyName} — First-Pass Brief` });
    }

    if (parsedData?.property || parsedData?.pricing || parsedData?.expenses) {
      await db.collection("workspace_outputs").add({
        projectId: "workspace-default",
        propertyId,
        outputType: "underwriting_csv",
        title: `${propertyName} — Underwriting`,
        storagePath: "",
        fileExt: "csv",
        versionNumber: 1,
        generatedBy: "auto",
        generationStatus: "completed",
        createdAt: now,
      });
      outputs.push({ type: "underwriting", title: `${propertyName} — Underwriting` });
    }

    return NextResponse.json({ success: true, outputs });
  } catch (error: any) {
    console.error("Generate error:", error);
    return NextResponse.json({ error: error.message || "Generation failed" }, { status: 500 });
  }
}
