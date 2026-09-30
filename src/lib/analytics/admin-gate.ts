import { NextRequest } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";

/** Admin allowlist from ADMIN_EMAILS (comma-separated). Unset = nobody. */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
}

/** Verifies the Firebase ID token in `Authorization: Bearer` and checks the allowlist. */
export async function isAllowlistedAdmin(req: NextRequest): Promise<boolean> {
  const h = req.headers.get("authorization") || "";
  if (!h.startsWith("Bearer ")) return false;
  try {
    const decoded = await getAdminAuth().verifyIdToken(h.slice(7));
    const email = (decoded.email || "").toLowerCase();
    return !!email && adminEmails().includes(email);
  } catch {
    return false;
  }
}
