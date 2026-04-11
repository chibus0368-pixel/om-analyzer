"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useWorkspaceAuth as useAuth } from "@/lib/workspace/auth";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import { cleanDisplayName } from "@/lib/workspace/propertyNameUtils";
import type { Property } from "@/lib/workspace/types";

/**
 * Upload History picker.
 *
 * Shows every property the signed-in user has ever uploaded across all
 * DealBoards. Lets the user select one or many and "Add to [active board]"
 * in a single click, which copies them via /api/workspace/duplicate.
 */

type HistoryProperty = Property & {
  workspaceId?: string;
  scoreTotal?: number;
  heroUrl?: string;
  processingStatus?: string;
};

/**
 * Normalize a timestamp field to an ISO string.
 *
 * Properties created by the parse engine store createdAt/updatedAt as
 * ISO strings, but properties created via /api/workspace/duplicate use
 * FieldValue.serverTimestamp() which the Admin SDK reads back as a
 * Timestamp instance and Next.js serializes to { _seconds, _nanoseconds }.
 * Without normalization, sorting on a mixed set throws
 * "(intermediate value).localeCompare is not a function".
 */
function tsToString(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    if (typeof v._seconds === "number") {
      return new Date(v._seconds * 1000).toISOString();
    }
    if (typeof v.seconds === "number") {
      return new Date(v.seconds * 1000).toISOString();
    }
    // Raw Date-like
    if (typeof v.toISOString === "function") {
      try {
        return v.toISOString();
      } catch {
        /* fall through */
      }
    }
  }
  return "";
}

export default function UploadHistoryPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { activeWorkspace, workspaces } = useWorkspace();
  const [allProps, setAllProps] = useState<HistoryProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<"date" | "name" | "score" | "board">("date");
  const [hideInCurrent, setHideInCurrent] = useState(true);
  const [adding, setAdding] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { getAuth } = await import("firebase/auth");
        const auth = getAuth();
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error("Not signed in");
        const token = await currentUser.getIdToken();
        const res = await fetch("/api/workspace/properties?all=true", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const data = await res.json();
        if (cancelled) return;
        setAllProps(data.properties || []);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Failed to load upload history");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const workspaceNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const ws of workspaces) m[ws.id] = ws.name;
    m["default"] = workspaces.find(w => w.id === "default")?.name || "Default DealBoard";
    return m;
  }, [workspaces]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = allProps.slice();
    if (hideInCurrent && activeWorkspace) {
      const currentId = activeWorkspace.id;
      rows = rows.filter(p => {
        const wsId = p.workspaceId || "default";
        return wsId !== currentId;
      });
    }
    if (q) {
      rows = rows.filter(p => {
        const hay = [
          p.propertyName,
          p.address1,
          p.city,
          p.state,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    try {
      rows.sort((a, b) => {
        switch (sortBy) {
          case "name":
            return String(a.propertyName || "").localeCompare(
              String(b.propertyName || ""),
            );
          case "score":
            return ((b as any).scoreTotal || 0) - ((a as any).scoreTotal || 0);
          case "board": {
            const aWs = workspaceNameById[a.workspaceId || "default"] || "";
            const bWs = workspaceNameById[b.workspaceId || "default"] || "";
            return aWs.localeCompare(bWs);
          }
          case "date":
          default: {
            const aTs = tsToString(a.updatedAt) || tsToString(a.createdAt);
            const bTs = tsToString(b.updatedAt) || tsToString(b.createdAt);
            return bTs.localeCompare(aTs);
          }
        }
      });
    } catch (err) {
      // Defensive: never crash the page over a sort error
      console.warn("[upload history] sort failed", err);
    }
    return rows;
  }, [allProps, query, hideInCurrent, activeWorkspace, sortBy, workspaceNameById]);

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    const visibleIds = filtered.map(p => p.id);
    const allSelected = visibleIds.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }

  async function handleAddSelected() {
    if (!activeWorkspace || selected.size === 0 || adding) return;
    setAdding(true);
    const ids = Array.from(selected);
    let success = 0;
    let failed = 0;
    try {
      const { getAuth } = await import("firebase/auth");
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Not signed in");
      const token = await currentUser.getIdToken();
      for (let i = 0; i < ids.length; i++) {
        const propertyId = ids[i];
        setProgress(`Adding ${i + 1}/${ids.length}…`);
        try {
          const res = await fetch("/api/workspace/duplicate", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              propertyId,
              targetWorkspaceId: activeWorkspace.id,
            }),
          });
          if (res.ok) success++;
          else failed++;
        } catch {
          failed++;
        }
      }
      setProgress("");
      setSelected(new Set());
      window.dispatchEvent(new Event("workspace-properties-changed"));
      setToast(
        failed > 0
          ? `Added ${success} to ${activeWorkspace.name}. ${failed} failed.`
          : `Added ${success} ${success === 1 ? "deal" : "deals"} to ${activeWorkspace.name}.`,
      );
      setTimeout(() => {
        router.push("/workspace");
      }, 900);
    } catch (err: any) {
      setProgress("");
      setToast(err?.message || "Failed to add selected deals.");
    } finally {
      setAdding(false);
      setTimeout(() => setToast(null), 4000);
    }
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 20px" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: "#6B7280",
            marginBottom: 8,
          }}
        >
          <Link
            href="/workspace"
            style={{ color: "#6B7280", textDecoration: "none" }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "#151b2b")}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "#6B7280")}
          >
            ← Back to DealBoard
          </Link>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 700,
                margin: 0,
                color: "#111827",
                letterSpacing: -0.3,
              }}
            >
              Upload History
            </h1>
            <p
              style={{
                fontSize: 14,
                color: "#6B7280",
                margin: "4px 0 0",
                fontWeight: 500,
              }}
            >
              Every deal you&rsquo;ve uploaded. Pick any to add to{" "}
              <strong style={{ color: "#111827" }}>
                {activeWorkspace?.name || "the active board"}
              </strong>
              .
            </p>
          </div>
          <Link
            href="/workspace/upload"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 18px",
              background: "#fff",
              border: "1px solid rgba(0,0,0,0.1)",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 800,
              color: "#151b2b",
              textDecoration: "none",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            + Upload New
          </Link>
        </div>
      </div>

      {/* Controls row */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ position: "relative", flex: "1 1 320px", minWidth: 240 }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#9CA3AF"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
            }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name, address, city…"
            style={{
              width: "100%",
              padding: "10px 12px 10px 34px",
              fontSize: 13,
              borderRadius: 8,
              border: "1px solid #E5E7EB",
              outline: "none",
              fontFamily: "inherit",
              background: "#fff",
              boxSizing: "border-box",
            }}
          />
        </div>

        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as any)}
          style={{
            padding: "10px 12px",
            fontSize: 13,
            borderRadius: 8,
            border: "1px solid #E5E7EB",
            outline: "none",
            fontFamily: "inherit",
            background: "#fff",
            color: "#151b2b",
            cursor: "pointer",
          }}
        >
          <option value="date">Newest first</option>
          <option value="name">Name A→Z</option>
          <option value="score">Score (high to low)</option>
          <option value="board">DealBoard</option>
        </select>

        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: "#374151",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={hideInCurrent}
            onChange={e => setHideInCurrent(e.target.checked)}
          />
          Hide deals already on this board
        </label>
      </div>

      {/* Action bar */}
      {selected.size > 0 && (
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            background: "#151b2b",
            color: "#fff",
            borderRadius: 8,
            marginBottom: 12,
            boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {selected.size} selected
          </span>
          <button
            onClick={() => setSelected(new Set())}
            style={{
              padding: "6px 12px",
              background: "transparent",
              color: "#9CA3AF",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Clear
          </button>
          <div style={{ flex: 1 }}>
            {progress && (
              <span style={{ fontSize: 12, color: "#84CC16" }}>{progress}</span>
            )}
          </div>
          <button
            onClick={handleAddSelected}
            disabled={adding || !activeWorkspace}
            style={{
              padding: "9px 20px",
              background: adding ? "#5A7D22" : "#84CC16",
              color: "#0F172A",
              border: "none",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 800,
              cursor: adding ? "default" : "pointer",
              fontFamily: "inherit",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              whiteSpace: "nowrap",
            }}
          >
            {adding
              ? "Adding…"
              : `Add ${selected.size} to ${activeWorkspace?.name || "Board"}`}
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "12px 22px",
            background: "#151b2b",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            zIndex: 100,
          }}
        >
          {toast}
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: "#6B7280", fontSize: 14 }}>
          Loading your upload history…
        </div>
      ) : error ? (
        <div
          style={{
            padding: 40,
            textAlign: "center",
            color: "#DC2626",
            fontSize: 14,
            background: "#FEF2F2",
            border: "1px solid rgba(220,38,38,0.15)",
            borderRadius: 8,
          }}
        >
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            padding: 60,
            textAlign: "center",
            background: "#fff",
            border: "1px dashed #E5E7EB",
            borderRadius: 12,
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: "rgba(132,204,22,0.08)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 12,
            }}
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#84CC16"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#111827", marginBottom: 4 }}>
            {query ? "No matches" : "No upload history yet"}
          </div>
          <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 16 }}>
            {query
              ? "Try a different search term."
              : "Upload your first deal to see it here."}
          </div>
          <Link
            href="/workspace/upload"
            style={{
              display: "inline-block",
              padding: "10px 24px",
              background: "#151b2b",
              color: "#fff",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Upload a deal
          </Link>
        </div>
      ) : (
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.05)",
            overflow: "hidden",
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}
        >
          {/* Table header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "40px 1fr 180px 110px 80px 120px",
              gap: 12,
              padding: "12px 16px",
              background: "#FAFAFA",
              borderBottom: "1px solid #F0F2F5",
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#6B7280",
            }}
          >
            <div>
              <input
                type="checkbox"
                checked={
                  filtered.length > 0 &&
                  filtered.every(p => selected.has(p.id))
                }
                onChange={toggleAllVisible}
                style={{ cursor: "pointer" }}
              />
            </div>
            <div>Property</div>
            <div>Current DealBoard</div>
            <div style={{ textAlign: "right" }}>Uploaded</div>
            <div style={{ textAlign: "center" }}>Score</div>
            <div style={{ textAlign: "right" }}></div>
          </div>

          {/* Rows */}
          {filtered.map(prop => {
            const isSelected = selected.has(prop.id);
            const wsId = prop.workspaceId || "default";
            const boardName = workspaceNameById[wsId] || "Unknown";
            const isInCurrent = activeWorkspace?.id === wsId;
            const display = cleanDisplayName(
              prop.propertyName,
              prop.address1,
              prop.city,
              prop.state,
            );
            const location = [prop.city, prop.state].filter(Boolean).join(", ");
            const score = (prop as any).scoreTotal || 0;
            const uploadedAt =
              tsToString(prop.createdAt) || tsToString(prop.updatedAt);
            let uploadedLabel = "";
            if (uploadedAt) {
              const d = new Date(uploadedAt);
              if (!isNaN(d.getTime())) {
                uploadedLabel = d.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                });
              }
            }
            return (
              <div
                key={prop.id}
                onClick={() => toggle(prop.id)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "40px 1fr 180px 110px 80px 120px",
                  gap: 12,
                  padding: "14px 16px",
                  alignItems: "center",
                  borderBottom: "1px solid #F5F6F8",
                  cursor: "pointer",
                  background: isSelected ? "rgba(132,204,22,0.08)" : "#fff",
                  transition: "background 0.12s",
                }}
                onMouseEnter={e => {
                  if (!isSelected)
                    (e.currentTarget as HTMLElement).style.background = "#FAFAFA";
                }}
                onMouseLeave={e => {
                  if (!isSelected)
                    (e.currentTarget as HTMLElement).style.background = "#fff";
                }}
              >
                <div>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(prop.id)}
                    onClick={e => e.stopPropagation()}
                    style={{ cursor: "pointer" }}
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#111827",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {display}
                  </div>
                  {location && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "#6B7280",
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {location}
                    </div>
                  )}
                </div>
                <div>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "4px 10px",
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 700,
                      background: isInCurrent ? "rgba(132,204,22,0.12)" : "#F3F4F6",
                      color: isInCurrent ? "#4D7C0F" : "#374151",
                      maxWidth: "100%",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {boardName}
                    {isInCurrent && (
                      <span style={{ fontSize: 9, opacity: 0.8 }}>(current)</span>
                    )}
                  </span>
                </div>
                <div
                  style={{
                    textAlign: "right",
                    fontSize: 12,
                    color: "#6B7280",
                  }}
                >
                  {uploadedLabel || "—"}
                </div>
                <div style={{ textAlign: "center" }}>
                  {score > 0 ? (
                    <span
                      style={{
                        display: "inline-block",
                        padding: "3px 10px",
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 800,
                        color:
                          score >= 85
                            ? "#059669"
                            : score >= 70
                              ? "#4D7C0F"
                              : score >= 50
                                ? "#D97706"
                                : "#DC2626",
                        background:
                          score >= 85
                            ? "rgba(16,185,129,0.1)"
                            : score >= 70
                              ? "rgba(132,204,22,0.1)"
                              : score >= 50
                                ? "rgba(217,119,6,0.1)"
                                : "rgba(220,38,38,0.1)",
                      }}
                    >
                      {Math.round(score)}
                    </span>
                  ) : (
                    <span style={{ color: "#D1D5DB", fontSize: 12 }}>—</span>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <Link
                    href={`/workspace/properties/${prop.id}`}
                    onClick={e => e.stopPropagation()}
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#6B7280",
                      textDecoration: "none",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                    onMouseEnter={e =>
                      ((e.currentTarget as HTMLElement).style.color = "#151b2b")
                    }
                    onMouseLeave={e =>
                      ((e.currentTarget as HTMLElement).style.color = "#6B7280")
                    }
                  >
                    View →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer summary */}
      {!loading && !error && filtered.length > 0 && (
        <div
          style={{
            marginTop: 16,
            fontSize: 12,
            color: "#6B7280",
            textAlign: "center",
          }}
        >
          Showing {filtered.length} of {allProps.length} uploads.
        </div>
      )}
    </div>
  );
}
