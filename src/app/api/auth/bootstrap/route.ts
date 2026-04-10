import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { sendEmail, renderTemplate } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing authorization" }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const adminAuth = getAdminAuth();
    const db = getAdminDb();

    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const uid = decodedToken.uid;
    const email = decodedToken.email || "";
    const now = Timestamp.now();

    // Parse optional body data
    const body = await request.json().catch(() => ({}));
    const firstName = body.firstName || decodedToken.name?.split(" ")[0] || "";
    const lastName = body.lastName || decodedToken.name?.split(" ").slice(1).join(" ") || "";

    // Get Firebase Auth user for provider info
    const firebaseUser = await adminAuth.getUser(uid);

    const providerIds = firebaseUser.providerData
      .map((p) => p.providerId)
      .filter(Boolean);

    const fullName = `${firstName} ${lastName}`.trim() || firebaseUser.displayName || email.split("@")[0];

    // ===== 1. Upsert user doc =====
    const userRef = db.collection("users").doc(uid);
    const existingUser = await userRef.get();

    let userDoc: Record<string, any>;

    // ── Merge anonymous usage if anonId provided ──
    let anonUploadsUsed = 0;
    const anonId = body.anonId || null;
    if (anonId) {
      try {
        const anonRef = db.collection("anonymous_trials").doc(anonId);
        const anonDoc = await anonRef.get();
        if (anonDoc.exists) {
          anonUploadsUsed = anonDoc.data()?.uploadsUsed || 0;
          // Delete the anonymous trial doc so it can't be reused
          await anonRef.delete();
        }
      } catch (err) {
        console.warn("[bootstrap] Anonymous usage merge failed:", err);
      }
    }

    if (existingUser.exists) {
      // Update — preserve important fields
      const existing = existingUser.data()!;
      const updates: Record<string, any> = {
        emailVerified: firebaseUser.emailVerified,
        authProviders: providerIds,
        primaryProvider: providerIds[0] || "password",
        lastLoginAt: now,
        updatedAt: now,
      };
      // Only update name if user didn't set their own
      if (!existing.firstName && firstName) updates.firstName = firstName;
      if (!existing.lastName && lastName) updates.lastName = lastName;
      if (!existing.fullName || existing.fullName === email.split("@")[0]) {
        updates.fullName = fullName;
      }
      if (body.company && !existing.company) updates.company = body.company;
      if (body.role && !existing.role) updates.role = body.role;

      // Merge anonymous usage — only increase, never decrease
      if (anonUploadsUsed > 0 && (!existing.uploadsUsed || existing.uploadsUsed < anonUploadsUsed)) {
        updates.uploadsUsed = Math.max(existing.uploadsUsed || 0, anonUploadsUsed);
      }

      await userRef.update(updates);
      userDoc = { ...existing, ...updates };
    } else {
      // Create new user doc
      userDoc = {
        uid,
        email,
        emailLower: email.toLowerCase(),
        emailVerified: firebaseUser.emailVerified,
        firstName,
        lastName,
        fullName,
        displayName: firebaseUser.displayName || fullName,
        photoURL: firebaseUser.photoURL || null,
        company: body.company || null,
        role: body.role || null,
        jobTitle: null,
        phone: null,
        bio: null,
        marketFocus: null,
        assetFocus: null,
        onboardingCompleted: false,
        profileCompleted: !!(firstName && lastName),
        authProviders: providerIds.length > 0 ? providerIds : ["password"],
        primaryProvider: providerIds[0] || "password",
        defaultWorkspaceId: null,
        accountStatus: "active",
        tier: "free",
        tierStatus: "none",
        uploadsUsed: anonUploadsUsed,
        uploadLimit: 5,
        isLifetimeLimit: true,
        newsletterOptIn: false,
        productUpdatesOptIn: false,
        lastLoginAt: now,
        createdAt: now,
        updatedAt: now,
      };
      await userRef.set(userDoc);

      // Send registration welcome email (new users only)
      try {
        const welcomeHtml = await renderTemplate('registration_welcome', {
          name: fullName,
          email,
        });
        if (welcomeHtml) {
          const emailResult = await sendEmail(
            email,
            'Welcome to Deal Signals — Your Workspace Is Ready',
            welcomeHtml
          );
          if (!emailResult.success) {
            console.warn('[bootstrap] Welcome email failed:', emailResult.error);
          }
        }
      } catch (emailErr) {
        // Don't fail bootstrap if email fails
        console.warn('[bootstrap] Welcome email error:', emailErr);
      }
    }

    // ===== 2. Ensure preferences =====
    const prefsRef = db.collection("user_preferences").doc(uid);
    const existingPrefs = await prefsRef.get();
    if (!existingPrefs.exists) {
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
        workspacePreferences: {
          defaultView: "table",
          defaultSort: null,
        },
        createdAt: now,
        updatedAt: now,
      });
    }

    // ===== 3. Ensure default workspace =====
    let workspaceDoc: Record<string, any> | null = null;

    if (userDoc.defaultWorkspaceId) {
      const wsSnap = await db.collection("workspaces").doc(userDoc.defaultWorkspaceId).get();
      if (wsSnap.exists) {
        workspaceDoc = { id: wsSnap.id, ...wsSnap.data() };
      }
    }

    if (!workspaceDoc) {
      // Check if user already has a workspace via membership
      const memberSnap = await db.collection("workspace_members")
        .where("uid", "==", uid)
        .where("role", "==", "owner")
        .limit(1)
        .get();

      if (!memberSnap.empty) {
        const memberData = memberSnap.docs[0].data();
        const wsSnap = await db.collection("workspaces").doc(memberData.workspaceId).get();
        if (wsSnap.exists) {
          workspaceDoc = { id: wsSnap.id, ...wsSnap.data() };
          await userRef.update({ defaultWorkspaceId: wsSnap.id, updatedAt: now });
          userDoc.defaultWorkspaceId = wsSnap.id;
        }
      }
    }

    if (!workspaceDoc) {
      // Create default workspace
      const wsId = `ws_${uid}`;
      workspaceDoc = {
        id: wsId,
        name: `${fullName}'s Workspace`,
        slug: "default",
        ownerUid: uid,
        planTier: "free",
        planStatus: "none",
        billingCustomerId: null,
        billingSubscriptionId: null,
        createdAt: now,
        updatedAt: now,
      };
      await db.collection("workspaces").doc(wsId).set(workspaceDoc);

      // Create membership
      await db.collection("workspace_members").add({
        workspaceId: wsId,
        uid,
        role: "owner",
        joinedAt: now,
        status: "active",
      });

      // Update user doc
      await userRef.update({ defaultWorkspaceId: wsId, updatedAt: now });
      userDoc.defaultWorkspaceId = wsId;
    }

    // ===== 4. Log auth event =====
    await db.collection("auth_events").add({
      uid,
      event: "login_bootstrap",
      provider: providerIds[0] || "password",
      timestamp: now,
      metadata: { emailVerified: firebaseUser.emailVerified },
    });

    return NextResponse.json({
      ok: true,
      userDoc,
      workspace: workspaceDoc,
    });
  } catch (err) {
    console.error("Bootstrap error:", err);
    return NextResponse.json({ error: "Bootstrap failed" }, { status: 500 });
  }
}
