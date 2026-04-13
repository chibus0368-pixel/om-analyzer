import { NextRequest, NextResponse } from "next/server";

/**
 * OCR Endpoint - GPT-4o Vision for scanned/image-based PDFs
 *
 * Accepts an array of OpenAI-format messages containing base64 images
 * and returns extracted text. Used as a fallback when pdfjs text
 * extraction returns empty (scanned documents).
 */
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages array required" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
    }

    console.log("[ocr] Processing vision request with", messages.length, "messages");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages,
        temperature: 0.1,
        max_tokens: 8000,
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "unknown");
      console.error("[ocr] OpenAI Vision API error:", res.status, err.substring(0, 300));
      return NextResponse.json({ error: `Vision API error: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";

    console.log("[ocr] Extracted", text.length, "chars via Vision");

    return NextResponse.json({ text, chars: text.length });
  } catch (err: any) {
    console.error("[ocr] Fatal error:", err);
    return NextResponse.json({ error: err?.message || "OCR failed" }, { status: 500 });
  }
}
