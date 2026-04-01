import { NextRequest, NextResponse } from "next/server";

// Rate limiting: max 20 uploads per IP per hour
const ipCounts = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    ipCounts.set(ip, { count: 1, resetAt: now + 3600_000 });
    return true;
  }
  if (entry.count >= 20) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!rateLimit(ip)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const body = await req.json();
    const { imageBase64 } = body;

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return NextResponse.json({ error: "Missing imageBase64" }, { status: 400 });
    }

    // Validate base64 size (max 5MB decoded)
    const sizeEstimate = (imageBase64.length * 3) / 4;
    if (sizeEstimate > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Image too large (max 5MB)" }, { status: 400 });
    }

    const { getAdminStorage } = await import("@/lib/firebase-admin");
    const storage = getAdminStorage();

    // Use default bucket from FIREBASE_STORAGE_BUCKET or project default
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || undefined;
    const bucket = storage.bucket(bucketName);

    // Generate unique path
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const filePath = `om-analyzer-lite/${id}/hero.jpg`;

    const buffer = Buffer.from(imageBase64, "base64");
    const file = bucket.file(filePath);

    await file.save(buffer, {
      metadata: {
        contentType: "image/jpeg",
        cacheControl: "public, max-age=86400", // 1 day cache
      },
    });

    // Make file publicly readable
    await file.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    return NextResponse.json({ url: publicUrl });
  } catch (err: any) {
    console.error("[upload-image] Error:", err?.message || err);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 }
    );
  }
}
