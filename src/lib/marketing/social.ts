import { getAdminDb } from "@/lib/firebase-admin";
import { COLL, SITE_URL, sleep } from "./server";

/**
 * Auto-posting to X, Instagram and TikTok using each platform's official API.
 * Tokens live in Firestore (marketing_social_accounts/{platform}); that
 * collection has no client rules, so only the Admin SDK can read it.
 */

export type Platform = "x" | "instagram" | "tiktok";
export const PLATFORMS: Platform[] = ["x", "instagram", "tiktok"];

export interface SocialAccount {
  platform: Platform;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  userId?: string | null;
  username?: string | null;
  connectedAt?: string;
  meta?: Record<string, any>;
}

export interface ChannelResult {
  status: "published" | "processing" | "failed";
  id?: string | null;
  url?: string | null;
  error?: string | null;
  pending?: Record<string, any> | null;
  at?: string;
}

export interface SocialPost {
  id?: string;
  text: string;
  textByChannel?: Partial<Record<Platform, string>>;
  mediaUrl?: string | null;
  /** Several images: an Instagram carousel (up to 10) or up to 4 images on X. */
  mediaUrls?: string[] | null;
  mediaType?: "image" | "video" | null;
  channels: Platform[];
  tiktokPrivacy?: string | null;
  status: "draft" | "scheduled" | "publishing" | "processing" | "published" | "partial" | "failed";
  scheduledAt?: string | null;
  results?: Partial<Record<Platform, ChannelResult>>;
  createdAt?: string;
  updatedAt?: string;
}

export const IG_VERSION = process.env.INSTAGRAM_GRAPH_VERSION || "v23.0";

export function redirectUri(p: Platform): string {
  return `${SITE_URL}/api/marketing/social/callback/${p}`;
}

export function platformConfigured(p: Platform): boolean {
  if (p === "x") return !!(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET);
  if (p === "instagram") return !!(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET);
  return !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);
}

// ─────────────────────────── OAuth ───────────────────────────

export function authorizeUrl(p: Platform, state: string, challenge: string): string {
  const ru = encodeURIComponent(redirectUri(p));
  if (p === "x") {
    const scope = encodeURIComponent("tweet.read tweet.write users.read media.write offline.access");
    return `https://x.com/i/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(process.env.X_CLIENT_ID || "")}&redirect_uri=${ru}&scope=${scope}&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;
  }
  if (p === "instagram") {
    const scope = encodeURIComponent("instagram_business_basic,instagram_business_content_publish");
    return `https://www.instagram.com/oauth/authorize?client_id=${encodeURIComponent(process.env.INSTAGRAM_APP_ID || "")}&redirect_uri=${ru}&response_type=code&scope=${scope}&state=${state}`;
  }
  const scope = encodeURIComponent("user.info.basic,video.publish");
  return `https://www.tiktok.com/v2/auth/authorize/?client_key=${encodeURIComponent(process.env.TIKTOK_CLIENT_KEY || "")}&response_type=code&scope=${scope}&redirect_uri=${ru}&state=${state}`;
}

function basic(id: string, secret: string) {
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

async function jsonOrThrow(res: Response, label: string) {
  const text = await res.text();
  let data: any; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.error_description || data?.error?.message || data?.detail || data?.title || data?.error?.code || data?.message || text.slice(0, 300);
    throw new Error(`${label}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
  }
  return data;
}

export async function exchangeCode(p: Platform, code: string, verifier: string): Promise<SocialAccount> {
  const now = Date.now();
  if (p === "x") {
    const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri(p), code_verifier: verifier, client_id: process.env.X_CLIENT_ID || "" });
    const tok = await jsonOrThrow(await fetch("https://api.x.com/2/oauth2/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basic(process.env.X_CLIENT_ID!, process.env.X_CLIENT_SECRET!) }, body,
    }), "X token");
    const me = await jsonOrThrow(await fetch("https://api.x.com/2/users/me", { headers: { Authorization: `Bearer ${tok.access_token}` } }), "X profile");
    return { platform: p, accessToken: tok.access_token, refreshToken: tok.refresh_token || null, expiresAt: new Date(now + (tok.expires_in || 7200) * 1000).toISOString(), userId: me.data?.id, username: me.data?.username };
  }
  if (p === "instagram") {
    const form = new URLSearchParams({ client_id: process.env.INSTAGRAM_APP_ID!, client_secret: process.env.INSTAGRAM_APP_SECRET!, grant_type: "authorization_code", redirect_uri: redirectUri(p), code });
    const short = await jsonOrThrow(await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: form }), "Instagram token");
    const s = short.data?.[0] || short;
    const long = await jsonOrThrow(await fetch(`https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(process.env.INSTAGRAM_APP_SECRET!)}&access_token=${encodeURIComponent(s.access_token)}`), "Instagram long-lived token");
    const me = await jsonOrThrow(await fetch(`https://graph.instagram.com/${IG_VERSION}/me?fields=user_id,username&access_token=${encodeURIComponent(long.access_token)}`), "Instagram profile");
    return { platform: p, accessToken: long.access_token, refreshToken: null, expiresAt: new Date(now + (long.expires_in || 5184000) * 1000).toISOString(), userId: String(me.user_id || s.user_id), username: me.username };
  }
  const form = new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY!, client_secret: process.env.TIKTOK_CLIENT_SECRET!, code, grant_type: "authorization_code", redirect_uri: redirectUri(p) });
  const tok = await jsonOrThrow(await fetch("https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form }), "TikTok token");
  if (tok.error && tok.error !== "ok") throw new Error(`TikTok token: ${tok.error_description || tok.error}`);
  let username: string | null = null;
  try {
    const info = await tiktokCreatorInfo(tok.access_token);
    username = info.creator_username || null;
  } catch { /* scope may still be pending review */ }
  return { platform: p, accessToken: tok.access_token, refreshToken: tok.refresh_token, expiresAt: new Date(now + (tok.expires_in || 86400) * 1000).toISOString(), userId: tok.open_id, username, meta: { refreshExpiresAt: new Date(now + (tok.refresh_expires_in || 0) * 1000).toISOString() } };
}

/** Load an account and refresh its token if it expires within 10 minutes. */
export async function getAccount(p: Platform): Promise<SocialAccount | null> {
  const db = getAdminDb();
  const ref = db.collection(COLL.accounts).doc(p);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const acc = snap.data() as SocialAccount;
  const exp = acc.expiresAt ? new Date(acc.expiresAt).getTime() : Infinity;
  const soon = p === "instagram" ? 7 * 86400000 : 10 * 60000;
  if (exp - Date.now() > soon) return acc;
  const now = Date.now();
  let patch: Partial<SocialAccount> = {};
  if (p === "x" && acc.refreshToken) {
    const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: acc.refreshToken, client_id: process.env.X_CLIENT_ID || "" });
    const tok = await jsonOrThrow(await fetch("https://api.x.com/2/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basic(process.env.X_CLIENT_ID!, process.env.X_CLIENT_SECRET!) }, body }), "X refresh");
    patch = { accessToken: tok.access_token, refreshToken: tok.refresh_token || acc.refreshToken, expiresAt: new Date(now + (tok.expires_in || 7200) * 1000).toISOString() };
  } else if (p === "instagram") {
    const tok = await jsonOrThrow(await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(acc.accessToken)}`), "Instagram refresh");
    patch = { accessToken: tok.access_token, expiresAt: new Date(now + (tok.expires_in || 5184000) * 1000).toISOString() };
  } else if (p === "tiktok" && acc.refreshToken) {
    const form = new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY!, client_secret: process.env.TIKTOK_CLIENT_SECRET!, grant_type: "refresh_token", refresh_token: acc.refreshToken });
    const tok = await jsonOrThrow(await fetch("https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form }), "TikTok refresh");
    patch = { accessToken: tok.access_token, refreshToken: tok.refresh_token || acc.refreshToken, expiresAt: new Date(now + (tok.expires_in || 86400) * 1000).toISOString() };
  } else {
    return acc;
  }
  await ref.update(patch);
  return { ...acc, ...patch };
}

// ─────────────────────────── Media ───────────────────────────

async function fetchMedia(url: string): Promise<{ buf: Buffer; type: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download media (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, type: res.headers.get("content-type")?.split(";")[0] || "application/octet-stream" };
}

// ─────────────────────────── X ───────────────────────────

async function xUploadMedia(token: string, url: string, kind: "image" | "video"): Promise<string> {
  const { buf, type } = await fetchMedia(url);
  const auth = { Authorization: `Bearer ${token}` };
  if (kind === "image") {
    const fd = new FormData();
    fd.append("media", new Blob([new Uint8Array(buf)], { type: type.startsWith("image/") ? type : "image/jpeg" }), "image");
    fd.append("media_category", "tweet_image");
    const r = await jsonOrThrow(await fetch("https://api.x.com/2/media/upload", { method: "POST", headers: auth, body: fd }), "X image upload");
    return r.data?.id || r.media_id_string;
  }
  const init = await jsonOrThrow(await fetch("https://api.x.com/2/media/upload/initialize", {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ media_type: "video/mp4", total_bytes: buf.length, media_category: "tweet_video" }),
  }), "X video init");
  const id: string = init.data?.id || init.media_id_string;
  const CH = 4 * 1024 * 1024;
  for (let i = 0, seg = 0; i < buf.length; i += CH, seg++) {
    const fd = new FormData();
    fd.append("segment_index", String(seg));
    fd.append("media", new Blob([new Uint8Array(buf.subarray(i, i + CH))], { type: "application/octet-stream" }), "chunk");
    const r = await fetch(`https://api.x.com/2/media/upload/${id}/append`, { method: "POST", headers: auth, body: fd });
    if (!r.ok) throw new Error(`X video append: ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
  let fin = await jsonOrThrow(await fetch(`https://api.x.com/2/media/upload/${id}/finalize`, { method: "POST", headers: auth }), "X video finalize");
  let info = fin.data?.processing_info || fin.processing_info;
  for (let tries = 0; info && info.state !== "succeeded" && tries < 30; tries++) {
    if (info.state === "failed") throw new Error(`X video processing failed: ${info.error?.message || ""}`);
    await sleep(Math.min((info.check_after_secs || 3) * 1000, 8000));
    fin = await jsonOrThrow(await fetch(`https://api.x.com/2/media/upload?command=STATUS&media_id=${id}`, { headers: auth }), "X video status");
    info = fin.data?.processing_info || fin.processing_info;
  }
  return id;
}

async function publishX(post: SocialPost, acc: SocialAccount): Promise<ChannelResult> {
  const text = (post.textByChannel?.x || post.text || "").trim();
  const body: any = { text };
  const many = (post.mediaUrls || []).filter(Boolean);
  if (many.length > 1) {
    const ids: string[] = [];
    for (const u of many.slice(0, 4)) ids.push(await xUploadMedia(acc.accessToken, u, "image"));
    body.media = { media_ids: ids };
  } else if (post.mediaUrl && post.mediaType) body.media = { media_ids: [await xUploadMedia(acc.accessToken, post.mediaUrl, post.mediaType)] };
  const r = await jsonOrThrow(await fetch("https://api.x.com/2/tweets", {
    method: "POST", headers: { Authorization: `Bearer ${acc.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  }), "X post");
  const id = r.data?.id;
  return { status: "published", id, url: acc.username ? `https://x.com/${acc.username}/status/${id}` : `https://x.com/i/web/status/${id}` };
}

// ─────────────────────────── Instagram ───────────────────────────

async function igFinish(acc: SocialAccount, containerId: string): Promise<ChannelResult> {
  const base = `https://graph.instagram.com/${IG_VERSION}`;
  const t = encodeURIComponent(acc.accessToken);
  const st = await jsonOrThrow(await fetch(`${base}/${containerId}?fields=status_code,status&access_token=${t}`), "Instagram status");
  if (st.status_code === "ERROR" || st.status_code === "EXPIRED") return { status: "failed", error: `Instagram processing ${st.status_code}: ${st.status || ""}` };
  if (st.status_code !== "FINISHED") return { status: "processing", pending: { containerId } };
  const pub = await jsonOrThrow(await fetch(`${base}/${acc.userId}/media_publish`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: containerId, access_token: acc.accessToken }),
  }), "Instagram publish");
  let url: string | null = null;
  try { url = (await jsonOrThrow(await fetch(`${base}/${pub.id}?fields=permalink&access_token=${t}`), "Instagram permalink")).permalink; } catch { /* optional */ }
  return { status: "published", id: pub.id, url };
}

async function publishInstagramCarousel(post: SocialPost, acc: SocialAccount, urls: string[]): Promise<ChannelResult> {
  const base = `https://graph.instagram.com/${IG_VERSION}`;
  const children: string[] = [];
  for (const u of urls) {
    const c = await jsonOrThrow(await fetch(`${base}/${acc.userId}/media`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ image_url: u, is_carousel_item: "true", access_token: acc.accessToken }),
    }), "Instagram carousel item");
    children.push(c.id);
  }
  const parent = await jsonOrThrow(await fetch(`${base}/${acc.userId}/media`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ media_type: "CAROUSEL", children: children.join(","), caption: (post.textByChannel?.instagram || post.text || "").trim(), access_token: acc.accessToken }),
  }), "Instagram carousel");
  for (let i = 0; i < 6; i++) {
    const r = await igFinish(acc, parent.id);
    if (r.status !== "processing") return r;
    await sleep(4000);
  }
  return { status: "processing", pending: { containerId: parent.id } };
}

async function publishInstagram(post: SocialPost, acc: SocialAccount): Promise<ChannelResult> {
  const slides = (post.mediaUrls || []).filter(Boolean);
  if (slides.length > 1) return publishInstagramCarousel(post, acc, slides.slice(0, 10));
  if (!post.mediaUrl || !post.mediaType) return { status: "failed", error: "Instagram needs an image or video" };
  const base = `https://graph.instagram.com/${IG_VERSION}`;
  const params = new URLSearchParams({ caption: (post.textByChannel?.instagram || post.text || "").trim(), access_token: acc.accessToken });
  if (post.mediaType === "image") params.set("image_url", post.mediaUrl);
  else { params.set("media_type", "REELS"); params.set("video_url", post.mediaUrl); params.set("share_to_feed", "true"); }
  const c = await jsonOrThrow(await fetch(`${base}/${acc.userId}/media`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params }), "Instagram container");
  for (let i = 0; i < (post.mediaType === "video" ? 12 : 4); i++) {
    const r = await igFinish(acc, c.id);
    if (r.status !== "processing") return r;
    await sleep(5000);
  }
  return { status: "processing", pending: { containerId: c.id } };
}

// ─────────────────────────── TikTok ───────────────────────────

export async function tiktokCreatorInfo(token: string): Promise<any> {
  const r = await jsonOrThrow(await fetch("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" }, body: "{}",
  }), "TikTok creator info");
  if (r.error?.code && r.error.code !== "ok") throw new Error(`TikTok creator info: ${r.error.message || r.error.code}`);
  return r.data || {};
}

async function tiktokStatus(acc: SocialAccount, publishId: string): Promise<ChannelResult> {
  const r = await jsonOrThrow(await fetch("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
    method: "POST", headers: { Authorization: `Bearer ${acc.accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ publish_id: publishId }),
  }), "TikTok status");
  const s = r.data?.status;
  if (s === "PUBLISH_COMPLETE") {
    const pid = r.data?.publicaly_available_post_id?.[0];
    return { status: "published", id: pid ? String(pid) : publishId, url: pid && acc.username ? `https://www.tiktok.com/@${acc.username}/video/${pid}` : null };
  }
  if (s === "FAILED") return { status: "failed", error: `TikTok: ${r.data?.fail_reason || "failed"}` };
  return { status: "processing", pending: { publishId } };
}

async function publishTikTok(post: SocialPost, acc: SocialAccount): Promise<ChannelResult> {
  if (!post.mediaUrl || post.mediaType !== "video") return { status: "failed", error: "TikTok needs a video" };
  const info = await tiktokCreatorInfo(acc.accessToken);
  const options: string[] = info.privacy_level_options || ["SELF_ONLY"];
  const privacy = post.tiktokPrivacy && options.includes(post.tiktokPrivacy) ? post.tiktokPrivacy
    : options.includes("PUBLIC_TO_EVERYONE") ? "PUBLIC_TO_EVERYONE" : options[0];
  const { buf } = await fetchMedia(post.mediaUrl);
  const MAX_SINGLE = 64 * 1024 * 1024;
  const chunk = buf.length <= MAX_SINGLE ? buf.length : 10 * 1024 * 1024;
  const count = buf.length <= MAX_SINGLE ? 1 : Math.floor(buf.length / chunk);
  const init = await jsonOrThrow(await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    method: "POST", headers: { Authorization: `Bearer ${acc.accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({
      post_info: { title: (post.textByChannel?.tiktok || post.text || "").slice(0, 2200), privacy_level: privacy, disable_duet: false, disable_comment: false, disable_stitch: false },
      source_info: { source: "FILE_UPLOAD", video_size: buf.length, chunk_size: chunk, total_chunk_count: count },
    }),
  }), "TikTok init");
  if (init.error?.code && init.error.code !== "ok") throw new Error(`TikTok init: ${init.error.message || init.error.code}`);
  const { publish_id, upload_url } = init.data;
  for (let i = 0; i < count; i++) {
    const start = i * chunk;
    const end = i === count - 1 ? buf.length : start + chunk; // last chunk takes the remainder
    const r = await fetch(upload_url, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4", "Content-Length": String(end - start), "Content-Range": `bytes ${start}-${end - 1}/${buf.length}` },
      body: new Uint8Array(buf.subarray(start, end)),
    });
    if (!r.ok && r.status !== 206) throw new Error(`TikTok upload chunk ${i}: ${r.status}`);
  }
  await sleep(4000);
  const st = await tiktokStatus(acc, publish_id);
  return privacy === "SELF_ONLY" && st.status !== "failed"
    ? { ...st, error: "Posted as private (SELF_ONLY). TikTok keeps posts private until the app passes its audit." }
    : st;
}

// ─────────────────────────── Orchestration ───────────────────────────

export async function publishChannel(p: Platform, post: SocialPost): Promise<ChannelResult> {
  const at = new Date().toISOString();
  try {
    const acc = await getAccount(p);
    if (!acc) return { status: "failed", error: `${p} is not connected`, at };
    const prev = post.results?.[p];
    if (prev?.status === "processing" && prev.pending) {
      if (p === "instagram") return { ...(await igFinish(acc, prev.pending.containerId)), at };
      if (p === "tiktok") return { ...(await tiktokStatus(acc, prev.pending.publishId)), at };
    }
    const r = p === "x" ? await publishX(post, acc) : p === "instagram" ? await publishInstagram(post, acc) : await publishTikTok(post, acc);
    return { ...r, at };
  } catch (e: any) {
    return { status: "failed", error: e?.message || String(e), at };
  }
}

export async function publishPost(id: string): Promise<SocialPost> {
  const db = getAdminDb();
  const ref = db.collection(COLL.social).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Post not found");
  const post = { id, ...(snap.data() as SocialPost) };
  await ref.update({ status: "publishing", updatedAt: new Date().toISOString() });
  const results = { ...(post.results || {}) } as Record<Platform, ChannelResult>;
  for (const p of post.channels) {
    if (results[p]?.status === "published") continue;
    results[p] = await publishChannel(p, post);
  }
  const vals = post.channels.map(p => results[p]?.status);
  const status: SocialPost["status"] = vals.every(v => v === "published") ? "published"
    : vals.some(v => v === "processing") ? "processing"
    : vals.some(v => v === "published") ? "partial" : "failed";
  await ref.update({ results, status, updatedAt: new Date().toISOString() });
  return { ...post, results, status };
}

export async function processSocialQueue() {
  const db = getAdminDb();
  const nowIso = new Date().toISOString();
  const [sched, proc] = await Promise.all([
    db.collection(COLL.social).where("status", "==", "scheduled").get(),
    db.collection(COLL.social).where("status", "==", "processing").get(),
  ]);
  const due = [...sched.docs.filter(d => (d.data().scheduledAt || "") <= nowIso), ...proc.docs];
  const out: any[] = [];
  for (const d of due) {
    try { const r = await publishPost(d.id); out.push({ id: d.id, status: r.status }); }
    catch (e: any) { out.push({ id: d.id, error: e?.message }); }
  }
  return out;
}
