import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

interface HealthCheck {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  checks: Record<string, {
    status: "ok" | "stale" | "error";
    lastUpdated?: string | null;
    ageMinutes?: number;
    details?: string;
  }>;
  environment: string;
}

const STALE_THRESHOLDS = {
  marketData: 24 * 60,     // 24 hours - FRED updates daily on weekdays
  ticker: 24 * 60,         // 24 hours
  articles: 48 * 60,       // 48 hours - ingestion runs 3x/day
  deals: 72 * 60,          // 72 hours - deals update less frequently
  snapshot: 24 * 60,       // 24 hours
};

export async function GET() {
  const health: HealthCheck = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    checks: {},
    environment: process.env.NEXT_PUBLIC_ENV || "unknown",
  };

  try {
    const db = getAdminDb();

    // 1. Firestore connectivity
    try {
      await db.collection("market_data").doc("latest_rates").get();
      health.checks.firestore = { status: "ok", details: "Connected" };
    } catch (err) {
      health.checks.firestore = { status: "error", details: "Cannot connect to Firestore" };
      health.status = "unhealthy";
    }

    // 2. Market data freshness
    try {
      const ratesDoc = await db.collection("market_data").doc("latest_rates").get();
      if (ratesDoc.exists) {
        const data = ratesDoc.data();
        const updatedAt = data?.updatedAt?.toDate?.() || data?.updatedAt;
        const lastUpdated = updatedAt ? new Date(updatedAt).toISOString() : null;
        const ageMinutes = updatedAt
          ? Math.round((Date.now() - new Date(updatedAt).getTime()) / 60000)
          : Infinity;
        const isStale = ageMinutes > STALE_THRESHOLDS.marketData;

        health.checks.marketData = {
          status: isStale ? "stale" : "ok",
          lastUpdated,
          ageMinutes,
          details: isStale
            ? `Market data is ${Math.round(ageMinutes / 60)}h old (threshold: ${STALE_THRESHOLDS.marketData / 60}h)`
            : `Updated ${Math.round(ageMinutes / 60)}h ago`,
        };
        if (isStale) health.status = health.status === "unhealthy" ? "unhealthy" : "degraded";
      } else {
        health.checks.marketData = { status: "error", details: "No market data document found" };
        health.status = "degraded";
      }
    } catch {
      health.checks.marketData = { status: "error", details: "Failed to check market data" };
    }

    // 3. Ticker freshness
    try {
      const tickerDoc = await db.collection("ticker_config").doc("current").get();
      if (tickerDoc.exists) {
        const data = tickerDoc.data();
        const updatedAt = data?.updatedAt?.toDate?.() || data?.updatedAt;
        const lastUpdated = updatedAt ? new Date(updatedAt).toISOString() : null;
        const ageMinutes = updatedAt
          ? Math.round((Date.now() - new Date(updatedAt).getTime()) / 60000)
          : Infinity;
        const isStale = ageMinutes > STALE_THRESHOLDS.ticker;

        health.checks.ticker = {
          status: isStale ? "stale" : "ok",
          lastUpdated,
          ageMinutes,
          details: isStale
            ? `Ticker is ${Math.round(ageMinutes / 60)}h old`
            : `Updated ${Math.round(ageMinutes / 60)}h ago`,
        };
        if (isStale) health.status = health.status === "unhealthy" ? "unhealthy" : "degraded";
      } else {
        health.checks.ticker = { status: "stale", details: "Using seed data (no Firestore doc)" };
        health.status = "degraded";
      }
    } catch {
      health.checks.ticker = { status: "error", details: "Failed to check ticker" };
    }

    // 4. Articles freshness (most recent published article)
    try {
      const articlesSnap = await db
        .collection("articles")
        .where("status", "==", "published")
        .orderBy("publishedAt", "desc")
        .limit(1)
        .get();

      if (!articlesSnap.empty) {
        const data = articlesSnap.docs[0].data();
        const publishedAt = data?.publishedAt?.toDate?.() || data?.publishedAt;
        const lastUpdated = publishedAt ? new Date(publishedAt).toISOString() : null;
        const ageMinutes = publishedAt
          ? Math.round((Date.now() - new Date(publishedAt).getTime()) / 60000)
          : Infinity;
        const isStale = ageMinutes > STALE_THRESHOLDS.articles;

        health.checks.articles = {
          status: isStale ? "stale" : "ok",
          lastUpdated,
          ageMinutes,
          details: isStale
            ? `Latest article is ${Math.round(ageMinutes / 60)}h old`
            : `Latest article ${Math.round(ageMinutes / 60)}h ago`,
        };
        if (isStale) health.status = health.status === "unhealthy" ? "unhealthy" : "degraded";
      } else {
        health.checks.articles = { status: "stale", details: "No published articles in Firestore" };
        health.status = "degraded";
      }
    } catch {
      health.checks.articles = { status: "error", details: "Failed to check articles" };
    }

    // 5. Deals freshness
    try {
      const dealsSnap = await db
        .collection("deals")
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();

      if (!dealsSnap.empty) {
        const data = dealsSnap.docs[0].data();
        const createdAt = data?.createdAt?.toDate?.() || data?.createdAt;
        const lastUpdated = createdAt ? new Date(createdAt).toISOString() : null;
        const ageMinutes = createdAt
          ? Math.round((Date.now() - new Date(createdAt).getTime()) / 60000)
          : Infinity;
        const isStale = ageMinutes > STALE_THRESHOLDS.deals;

        health.checks.deals = {
          status: isStale ? "stale" : "ok",
          lastUpdated,
          ageMinutes,
          details: isStale
            ? `Latest deal is ${Math.round(ageMinutes / 60)}h old`
            : `Latest deal ${Math.round(ageMinutes / 60)}h ago`,
        };
        if (isStale) health.status = health.status === "unhealthy" ? "unhealthy" : "degraded";
      } else {
        health.checks.deals = { status: "stale", details: "No deals in Firestore - using seed data" };
        health.status = "degraded";
      }
    } catch {
      health.checks.deals = { status: "error", details: "Failed to check deals" };
    }

    // 6. Environment checks
    health.checks.envVars = {
      status: "ok",
      details: [
        process.env.FIREBASE_SERVICE_ACCOUNT_KEY ? "Firebase" : "!Firebase",
        process.env.FRED_API_KEY ? "FRED" : "!FRED",
        process.env.RESEND_API_KEY ? "Resend" : "!Resend",
        process.env.OPENAI_API_KEY ? "OpenAI" : "!OpenAI",
      ].join(", "),
    };

    const missingKeys = [];
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) missingKeys.push("FIREBASE_SERVICE_ACCOUNT_KEY");
    if (!process.env.FRED_API_KEY) missingKeys.push("FRED_API_KEY");
    if (missingKeys.length > 0) {
      health.checks.envVars.status = "error";
      health.checks.envVars.details = `Missing: ${missingKeys.join(", ")}`;
      health.status = "degraded";
    }

    // 7. Admin security check (no details exposed publicly)
    const credentialsConfigured = !!process.env.ADMIN_PASSWORD && !!process.env.ADMIN_SECRET;
    health.checks.adminSecurity = {
      status: credentialsConfigured ? "ok" : "error",
      details: credentialsConfigured ? "Configured" : "Missing credentials",
    };
    if (!credentialsConfigured) {
      health.status = health.status === "unhealthy" ? "unhealthy" : "degraded";
    }

    // 8. Collection counts (diagnostic)
    try {
      const [articlesCount, dealsCount, subscribersCount] = await Promise.all([
        db.collection("articles").count().get(),
        db.collection("deals").count().get(),
        db.collection("subscribers").count().get(),
      ]);
      health.checks.collections = {
        status: "ok",
        details: `Articles: ${articlesCount.data().count}, Deals: ${dealsCount.data().count}, Subscribers: ${subscribersCount.data().count}`,
      };
    } catch {
      health.checks.collections = { status: "error", details: "Failed to count collections" };
    }

  } catch (err) {
    health.status = "unhealthy";
    health.checks.system = {
      status: "error",
      details: err instanceof Error ? err.message : "Unknown system error",
    };
  }

  const statusCode = health.status === "healthy" ? 200 : health.status === "degraded" ? 200 : 503;

  return NextResponse.json(health, {
    status: statusCode,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
