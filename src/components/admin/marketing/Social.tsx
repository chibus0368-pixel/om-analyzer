"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ref as sref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { getAuthInstance, getStorageInstance } from "@/lib/firebase";
import { api, Btn, C, Card, Empty, Field, fromLocalInput, inputStyle, Notice, Pill, toLocalInput, when } from "./ui";
import { AiDraft } from "./EmailEditor";

type P = "x" | "instagram" | "tiktok";
const NAMES: Record<P, string> = { x: "X", instagram: "Instagram", tiktok: "TikTok" };
const ALL: P[] = ["x", "instagram", "tiktok"];

interface Post {
  id?: string; text: string; textByChannel?: Partial<Record<P, string>>; mediaUrl?: string | null; mediaType?: "image" | "video" | null;
  channels: P[]; tiktokPrivacy?: string | null; status: string; scheduledAt?: string | null; createdAt?: string;
  results?: Partial<Record<P, { status: string; url?: string | null; error?: string | null }>>;
}
interface Acc { username: string | null; connectedAt: string | null; expiresAt: string | null }

const blank = (): Post => ({ text: "", textByChannel: {}, mediaUrl: "", mediaType: null, channels: ["x"], status: "draft" });

export default function Social({ flash }: { flash?: { tone: "ok" | "error"; text: string } | null }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [accounts, setAccounts] = useState<Partial<Record<P, Acc>>>({});
  const [config, setConfig] = useState<Record<P, { configured: boolean; redirectUri: string }> | null>(null);
  const [edit, setEdit] = useState<Post | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api({ view: "social" }); setPosts(r.posts); setAccounts(r.accounts); setConfig(r.config); setErr(""); }
    catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const connect = async (p: P) => {
    try { const r = await api({ body: { action: "connect", platform: p } }); window.location.href = r.url; } catch (e: any) { setErr(e.message); }
  };
  const disconnect = async (p: P) => {
    if (!window.confirm(`Disconnect ${NAMES[p]}? Scheduled posts to it will fail until you reconnect.`)) return;
    try { await api({ body: { action: "disconnect", platform: p } }); load(); } catch (e: any) { setErr(e.message); }
  };

  if (edit) return <Composer initial={edit} accounts={accounts} onClose={() => { setEdit(null); load(); }} />;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {flash && <Notice tone={flash.tone}>{flash.text}</Notice>}
      {err && <Notice tone="error">{err}</Notice>}
      <Card title="Connected accounts">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
          {ALL.map(p => {
            const a = accounts[p]; const cfg = config?.[p];
            return (
              <div key={p} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <b style={{ fontSize: 15, color: C.ink }}>{NAMES[p]}</b>
                  {a ? <Pill s="ok">Connected</Pill> : cfg?.configured ? <Pill s="warn">Not connected</Pill> : <Pill s="bad">Needs app keys</Pill>}
                </div>
                <div style={{ fontSize: 13, color: C.sub, minHeight: 36 }}>
                  {a ? <>@{a.username || "account"} · since {when(a.connectedAt)}</> : cfg?.configured ? "Keys are set. Connect the account you post from." : "Add the developer app keys in Vercel (see Setup)."}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  {a ? <><Btn onClick={() => connect(p)}>Reconnect</Btn><Btn kind="danger" onClick={() => disconnect(p)}>Disconnect</Btn></>
                    : <Btn kind="primary" disabled={!cfg?.configured} onClick={() => connect(p)}>Connect</Btn>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Post queue" right={<Btn kind="primary" onClick={() => setEdit(blank())}>+ New post</Btn>}>
        {loading ? <Empty>Loading...</Empty> : posts.length === 0 ? <Empty>No posts yet.</Empty> : (
          <div style={{ display: "grid", gap: 8 }}>
            {posts.map(p => (
              <div key={p.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", border: `1px solid ${C.line}`, borderRadius: 10, padding: 12 }}>
                <MediaThumb url={p.mediaUrl} type={p.mediaType} size={56} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: C.ink, whiteSpace: "pre-wrap", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.text || p.textByChannel?.x || "(no text)"}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6, alignItems: "center", fontSize: 12, color: C.sub }}>
                    <Pill s={p.status} />
                    <span>{p.status === "scheduled" ? `for ${when(p.scheduledAt)}` : when(p.createdAt)}</span>
                    {p.channels.map(c => {
                      const r = p.results?.[c];
                      return (
                        <span key={c} title={r?.error || ""} style={{ color: r?.status === "failed" ? C.red : r?.status === "published" ? C.limeDark : C.sub, fontWeight: 600 }}>
                          {r?.url ? <a href={r.url} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>{NAMES[c]} &#8599;</a> : NAMES[c]}
                          {r?.status === "failed" ? " failed" : r?.status === "processing" ? " processing" : ""}
                        </span>
                      );
                    })}
                  </div>
                  {p.channels.map(c => p.results?.[c]?.error ? <div key={c} style={{ fontSize: 11, color: p.results[c]!.status === "failed" ? C.red : C.amber, marginTop: 3 }}>{NAMES[c]}: {p.results[c]!.error}</div> : null)}
                </div>
                <Btn onClick={() => setEdit(p)}>{["published"].includes(p.status) ? "View" : "Edit"}</Btn>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function MediaThumb({ url, type, size }: { url?: string | null; type?: string | null; size: number }) {
  const box = { width: size, height: size, borderRadius: 8, background: "#F3F4F6", flexShrink: 0, objectFit: "cover" as const };
  if (!url) return <div style={{ ...box, display: "flex", alignItems: "center", justifyContent: "center", color: C.faint, fontSize: 10 }}>text</div>;
  return type === "video" ? <video src={url} muted playsInline style={box} /> : <img src={url} alt="" style={box} />;
}

function Composer({ initial, accounts, onClose }: { initial: Post; accounts: Partial<Record<P, Acc>>; onClose: () => void }) {
  const [p, setP] = useState<Post>(initial);
  const [tab, setTab] = useState<"all" | P>("all");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "error" | "warn"; text: string } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const locked = p.status === "published";

  const textFor = (c: P) => (p.textByChannel?.[c] ?? "") || p.text;
  const xLen = textFor("x").length;
  const problems: string[] = [];
  if (p.channels.includes("x") && xLen > 280) problems.push(`X text is ${xLen} characters (max 280).`);
  if (p.channels.includes("x") && !textFor("x").trim() && !p.mediaUrl) problems.push("X needs text or media.");
  if (p.channels.includes("instagram") && !p.mediaUrl) problems.push("Instagram needs an image or video.");
  if (p.channels.includes("tiktok") && p.mediaType !== "video") problems.push("TikTok needs a video.");
  p.channels.forEach(c => { if (!accounts[c]) problems.push(`${NAMES[c]} isn't connected yet.`); });
  const hasLink = /https?:\/\/|www\./i.test(textFor("x"));

  const upload = async (f: File) => {
    const uid = getAuthInstance().currentUser?.uid;
    if (!uid) return;
    const kind = f.type.startsWith("video/") ? "video" : f.type.startsWith("image/") ? "image" : null;
    if (!kind) { setMsg({ tone: "error", text: "Pick an image or video file." }); return; }
    setProgress(0); setMsg(null);
    const r = sref(getStorageInstance(), `marketing/${uid}/${Date.now()}_${f.name.replace(/[^\w.-]/g, "_")}`);
    const task = uploadBytesResumable(r, f, { contentType: f.type });
    task.on("state_changed",
      s => setProgress(Math.round((s.bytesTransferred / s.totalBytes) * 100)),
      e => { setProgress(null); setMsg({ tone: "error", text: `Upload failed: ${e.message}. Make sure the storage rules update is deployed (see Setup).` }); },
      async () => { const url = await getDownloadURL(task.snapshot.ref); setP(x => ({ ...x, mediaUrl: url, mediaType: kind })); setProgress(null); });
  };

  const save = async (status: "draft" | "scheduled"): Promise<string | null> => {
    if (status === "scheduled" && !p.scheduledAt) { setMsg({ tone: "warn", text: "Pick a time first." }); return null; }
    setBusy("save"); setMsg(null);
    try {
      const r = await api({ body: { action: "savePost", post: { ...p, status } } });
      setP(x => ({ ...x, id: r.id, status }));
      setMsg({ tone: "ok", text: status === "scheduled" ? `Scheduled for ${when(p.scheduledAt)}.` : "Draft saved." });
      return r.id;
    } catch (e: any) { setMsg({ tone: "error", text: e.message }); return null; } finally { setBusy(""); }
  };
  const publish = async () => {
    const cost = p.channels.includes("x") ? (hasLink ? " X charges about $0.20 for a post with a link." : " X charges about $0.015 per post.") : "";
    if (!window.confirm(`Publish now to ${p.channels.map(c => NAMES[c]).join(", ")}?${cost}`)) return;
    const id = await save("draft");
    if (!id) return;
    setBusy("pub");
    try {
      const r = await api({ body: { action: "publishPost", id } });
      setP(r.post);
      const errs = Object.entries(r.post.results || {}).filter(([, v]: any) => v.status === "failed").map(([k, v]: any) => `${NAMES[k as P]}: ${v.error}`);
      setMsg(errs.length ? { tone: "error", text: errs.join(" · ") } : { tone: "ok", text: r.post.status === "processing" ? "Uploaded. The platform is still processing the video; the scheduler will finish it." : "Published." });
    } catch (e: any) { setMsg({ tone: "error", text: e.message }); } finally { setBusy(""); }
  };
  const del = async () => {
    if (!p.id || !window.confirm("Delete this post from the queue? (Anything already published stays on the platform.)")) return;
    try { await api({ body: { action: "deletePost", id: p.id } }); onClose(); } catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  };

  const curText = tab === "all" ? p.text : (p.textByChannel?.[tab] ?? "");
  const setText = (v: string) => tab === "all" ? setP({ ...p, text: v }) : setP({ ...p, textByChannel: { ...(p.textByChannel || {}), [tab]: v } });

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
        <Btn onClick={onClose}>&larr; Post queue</Btn><Pill s={p.status} />
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)", gap: 16, alignItems: "start" }} className="mk-split">
        <Card>
          {!locked && <AiDraft kind="post" channels={p.channels} onDraft={d => setP(x => ({ ...x, text: d.text || x.text, textByChannel: { x: d.x || "", instagram: d.instagram || "", tiktok: d.tiktok || "" } }))} />}
          <Field label="Post to">
            <div style={{ display: "flex", gap: 16, fontSize: 14 }}>
              {ALL.map(c => (
                <label key={c} style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={p.channels.includes(c)} disabled={locked} onChange={() => setP({ ...p, channels: p.channels.includes(c) ? p.channels.filter(x => x !== c) : [...p.channels, c] })} />
                  {NAMES[c]}
                </label>
              ))}
            </div>
          </Field>
          <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
            {(["all", ...p.channels] as ("all" | P)[]).map(t => (
              <button key={t} type="button" onClick={() => setTab(t)} style={{ padding: "5px 10px", borderRadius: 6, border: 0, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", background: tab === t ? C.navy : "#F3F4F6", color: tab === t ? "#fff" : C.sub }}>
                {t === "all" ? "Main text" : `${NAMES[t]} version`}
              </button>
            ))}
          </div>
          <textarea style={{ ...inputStyle, minHeight: 150, lineHeight: 1.5 }} value={curText} disabled={locked} onChange={e => setText(e.target.value)}
            placeholder={tab === "all" ? "Write the post. Channels without their own version use this." : `Optional ${NAMES[tab as P]}-specific text. Leave empty to use the main text.`} />
          <div style={{ fontSize: 12, color: xLen > 280 ? C.red : C.faint, margin: "4px 0 12px", display: "flex", justifyContent: "space-between" }}>
            <span>{p.channels.includes("x") ? `X: ${xLen}/280` : ""}{p.channels.includes("x") && hasLink ? " · contains a link (X charges more for link posts)" : ""}</span>
          </div>

          <Field label="Media" hint="Upload an image or video, or paste a public URL (for example a video in scoreom.com/videos). Instagram and TikTok fetch it from this URL.">
            <div style={{ display: "flex", gap: 8 }}>
              <input style={inputStyle} value={p.mediaUrl || ""} disabled={locked} placeholder="https://..." onChange={e => {
                const v = e.target.value.trim();
                setP({ ...p, mediaUrl: v, mediaType: v ? (/\.(mp4|mov|m4v|webm)(\?|$)/i.test(v) ? "video" : p.mediaType || "image") : null });
              }} />
              <input ref={file} type="file" accept="image/*,video/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
              <Btn onClick={() => file.current?.click()} disabled={locked || progress !== null}>{progress !== null ? `${progress}%` : "Upload"}</Btn>
            </div>
            {p.mediaUrl && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, fontSize: 13 }}>
                <select style={{ ...inputStyle, width: 110 }} value={p.mediaType || "image"} disabled={locked} onChange={e => setP({ ...p, mediaType: e.target.value as any })}>
                  <option value="image">Image</option><option value="video">Video</option>
                </select>
                {!locked && <Btn kind="danger" onClick={() => setP({ ...p, mediaUrl: "", mediaType: null })}>Remove</Btn>}
              </div>
            )}
          </Field>

          {p.channels.includes("tiktok") && (
            <Field label="TikTok visibility" hint="Until TikTok audits the app, only private (Only me) posts are allowed. After the audit, pick Everyone.">
              <select style={inputStyle} value={p.tiktokPrivacy || ""} disabled={locked} onChange={e => setP({ ...p, tiktokPrivacy: e.target.value || null })}>
                <option value="">Best available (Everyone if allowed)</option>
                <option value="PUBLIC_TO_EVERYONE">Everyone</option>
                <option value="MUTUAL_FOLLOW_FRIENDS">Friends</option>
                <option value="FOLLOWER_OF_CREATOR">Followers</option>
                <option value="SELF_ONLY">Only me</option>
              </select>
            </Field>
          )}

          {problems.length > 0 && !locked && <Notice tone="warn">{problems.map(x => <div key={x}>{x}</div>)}</Notice>}

          {!locked && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <Field label="Post at (your time)" style={{ marginBottom: 0 }}>
                <input type="datetime-local" style={{ ...inputStyle, width: 220 }} value={toLocalInput(p.scheduledAt)} onChange={e => setP({ ...p, scheduledAt: fromLocalInput(e.target.value) })} />
              </Field>
              <Btn kind="dark" onClick={() => save("scheduled")} disabled={!!busy || problems.length > 0}>Schedule</Btn>
              <Btn onClick={() => save("draft")} disabled={!!busy}>{busy === "save" ? "Saving..." : "Save draft"}</Btn>
              <Btn kind="primary" onClick={publish} disabled={!!busy || problems.length > 0}>{busy === "pub" ? "Publishing..." : "Publish now"}</Btn>
              {p.id && <Btn kind="danger" onClick={del}>Delete</Btn>}
            </div>
          )}
        </Card>

        <div style={{ display: "grid", gap: 12 }}>
          {p.channels.map(c => (
            <div key={c} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", fontSize: 12, fontWeight: 800, color: C.sub, borderBottom: `1px solid ${C.line}`, display: "flex", justifyContent: "space-between" }}>
                <span>{NAMES[c]} preview</span><span style={{ fontWeight: 600 }}>{accounts[c]?.username ? `@${accounts[c]!.username}` : ""}</span>
              </div>
              {p.mediaUrl && (p.mediaType === "video"
                ? <video src={p.mediaUrl} controls muted playsInline style={{ width: "100%", maxHeight: c === "x" ? 240 : 360, background: "#000", display: "block" }} />
                : <img src={p.mediaUrl} alt="" style={{ width: "100%", maxHeight: 320, objectFit: "cover", display: "block" }} />)}
              <div style={{ padding: 12, fontSize: 14, color: C.ink, whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{textFor(c) || <span style={{ color: C.faint }}>(no text)</span>}</div>
              {p.results?.[c] && (
                <div style={{ padding: "8px 12px", borderTop: `1px solid ${C.line}`, fontSize: 12, color: p.results[c]!.status === "failed" ? C.red : C.limeDark }}>
                  {p.results[c]!.status}{p.results[c]!.url && <> · <a href={p.results[c]!.url!} target="_blank" rel="noreferrer">open</a></>}{p.results[c]!.error && <div>{p.results[c]!.error}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
