import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

// GET — fetch user profile + preferences
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing authorization" }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(authHeader.slice(7));
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const uid = decodedToken.uid;
    const db = getAdminDb();

    const [userSnap, prefsSnap] = await Promise.all([
      db.collection("users").doc(uid).get(),
      db.collection("user_preferences").doc(uid).get(),
    ]);

    if (!userSnap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      userDoc: userSnap.data(),
      preferences: prefsSnap.exists ? prefsSnap.data() : null,
    });
  } catch (err) {
    console.error("Profile GET error:", err);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}

// PATCH — update user profile fields and/or preferences
export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing authorization" }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(authHeader.slice(7));
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const uid = decodedToken.uid;
    const db = getAdminDb();
    const body = await request.json();
    const now = Timestamp.now();

    // Allowed user doc fields
    const ALLOWED_USER_FIELDS = [
      "firstName", "lastName", "displayName", "company", "role",
      "jobTitle", "phone", "bio", "marketFocus", "assetFocus",
      "newsletterOptIn", "productUpdatesOptIn",
    ];

    const userUpdates: Record<string, any> = { updatedAt: now };
    let hasUserUpdates = false;

    for (const key of ALLOWED_USER_FIELDS) {
      if (key in body) {
        userUpdates[key] = body[key];
        hasUserUpdates = true;
      }
    }

    // Auto-compute fullName if first/last changed
    if (body.firstName !== undefined || body.lastName !== undefined) {
      const userSnap = await db.collection("users").doc(uid).get();
      const existing = userSnap.data() || {};
      const first = body.firstName ?? existing.firstName ?? "";
      const last = body.lastName ?? existing.lastName ?? "";
      userUpdates.fullName = `${first} ${last}`.trim();

      // Also update profileCompleted
      userUpdates.profileCompleted = !!(first && last);
    }

    if (hasUserUpdates) {
      await db.collection("users").doc(uid).update(userUpdates);
    }

    // Handle preferences update
    if (body.preferences) {
      const prefsRef = db.collection("user_preferences").doc(uid);
      const prefsSnap = await prefsRef.get();

      const prefsUpdates: Record<string, any> = { updatedAt: now };

      if (body.preferences.theme) prefsUpdates.theme = body.preferences.theme;
      if (body.preferences.dateFormat) prefsUpdates.dateFormat = body.preferences.dateFormat;
      if (body.preferences.timezone !== undefined) prefsUpdates.timezone = body.preferences.timezone;
      if (body.preferences.emailNotifications) {
        prefsUpdates.emailNotifications = body.preferences.emailNotifications;
      }

      if (prefsSnap.exists) {
        await prefsRef.update(prefsUpdates);
      } else {
        await prefsRef.set({
          uid,
          theme: "light",
          dateFormat: "MM/DD/YYYY",
          timezone: null,
          emailNotifications: {
            productUpdates: false,
            dealStatus: true,
            analysisComplete: true,
            onboardingEmails: true,
            newsletter: false,
            weeklyDigest: false,
          },
          workspacePreferences: { defaultView: "table", defaultSort: null },
          createdAt: now,
          ...prefsUpdates,
        });
      }
    }

    // Return updated docs
    const [updatedUser, updatedPrefs] = await Promise.all([
      db.collection("users").doc(uid).get(),
      db.collection("user_preferences").doc(uid).get(),
    ]);

    return NextResponse.json({
      ok: true,
      userDoc: updatedUser.data(),
      preferences: updatedPrefs.exists ? updatedPrefs.data() : null,
    });
  } catch (err) {
    console.error("Profile PATCH error:", err);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
