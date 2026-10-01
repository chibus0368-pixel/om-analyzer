"use client";

import { useEffect, useState, type ReactNode } from "react";
import { api, Btn, C, Card, Notice, Pill, when } from "./ui";

interface Status {
  resendKey: boolean; from: string; domain: { name?: string; status?: string; error?: string; restrictedKey?: boolean; seen?: string[] } | null;
  cronSecret: boolean; openai: boolean; siteUrl: string; suppressions: number; lastRun: any;
}

function Row({ ok, label, children }: { ok: boolean | "warn"; label: string; children?: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "10px 0", borderTop: `1px solid ${C.line}`, alignItems: "flex-start" }}>
      <div style={{ width: 22, height: 22, borderRadius: 99, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800,
        background: ok === true ? "#DCFCE7" : ok === "warn" ? "#FEF3C7" : "#FEE2E2", color: ok === true ? "#15803d" : ok === "warn" ? "#B45309" : "#DC2626" }}>
        {ok === true ? "✓" : "!"}
      </div>
      <div style={{ flex: 1, fontSize: 13, color: C.sub, lineHeight: 1.5 }}><div style={{ fontWeight: 700, color: C.ink, fontSize: 14 }}>{label}</div>{children}</div>
    </div>
  );
}

const code = { background: "#F3F4F6", padding: "1px 6px", borderRadius: 4, fontSize: 12, fontFamily: "ui-monospace, Menlo, monospace" };

export default function Overview({ redirectBase }: { redirectBase: string }) {
  const [s, setS] = useState<Status | null>(null);
  const [err, setErr] = useState("");
  const [run, setRun] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api({ view: "overview" }).then(r => setS(r.status)).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);

  const runNow = async () => {
    setBusy(true);
    try { setRun(await api({ body: { action: "runNow" } })); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const domainOk = s?.domain?.status === "verified";
  const last = run || s?.lastRun;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {err && <Notice tone="error">{err}</Notice>}
      <Card title="Scheduler" right={<Btn kind="primary" onClick={runNow} disabled={busy}>{busy ? "Running..." : "Run now"}</Btn>}>
        <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.6 }}>
          Every 15 minutes the scheduler sends due broadcasts and drip emails and publishes due social posts. "Run now" does the same pass immediately.
        </div>
        {last && (
          <div style={{ marginTop: 10, fontSize: 13, color: C.ink, display: "flex", gap: 14, flexWrap: "wrap" }}>
            <span>Last run: <b>{when(last.finished || last.started)}</b> ({last.trigger})</span>
            <span>Contacts: <b>{last.contacts ?? "--"}</b></span>
            <span>Broadcasts sent: <b>{last.broadcasts?.length ?? 0}</b></span>
            <span>Drip emails: <b>{(last.drips || []).reduce((a: number, d: any) => a + (d.sent || 0), 0)}</b></span>
            <span>Social posts: <b>{last.social?.length ?? 0}</b></span>
            {(last.emailError || last.socialError) && <span style={{ color: C.red }}>{last.emailError || last.socialError}</span>}
          </div>
        )}
      </Card>

      <Card title="Setup checklist">
        {!s ? <div style={{ color: C.faint, fontSize: 13 }}>Checking...</div> : (
          <div>
            <Row ok={s.resendKey} label="Resend API key">{s.resendKey ? "Set." : <>Add <code style={code}>RESEND_API_KEY</code> in Vercel.</>}</Row>
            <Row ok={domainOk ? true : "warn"} label={`Sending domain: ${s.domain?.name || "scoreom.com"}`}>
              {domainOk ? <>Verified. Marketing email sends from <code style={code}>{s.from}</code>.</> : s.domain?.restrictedKey ? <>
                Can't read domain status: <code style={code}>RESEND_API_KEY</code> is a sending-only key, so Resend won't list domains for it. Sending is not affected. Check the domain in the Resend dashboard, or use a Full access key if you want this row to show it. Sends from <code style={code}>{s.from}</code>.
              </> : <>
                Status: <Pill s="warn">{s.domain?.status || "unknown"}</Pill>{s.domain?.error ? <> ({s.domain.error})</> : null}{s.domain?.seen?.length ? <> Domains on this key's Resend account: {s.domain.seen.join(", ")}.</> : <>.</>} In Resend, go to Domains, add <b>scoreom.com</b>, then add the DNS records it shows (DKIM, SPF and MX on a <code style={code}>send</code> subdomain) in GoDaddy, plus a DMARC record: TXT <code style={code}>_dmarc</code> = <code style={code}>v=DMARC1; p=none;</code>. Click Verify in Resend once they're in.
              </>}
            </Row>
            <Row ok={s.cronSecret} label="Scheduler (every 15 min)">
              {s.cronSecret ? <>CRON_SECRET is set. Make sure the same value is saved as the GitHub repo secret <code style={code}>CRON_SECRET</code> (Settings, Secrets and variables, Actions) so the 15-minute workflow can call the scheduler.</>
                : <>Add <code style={code}>CRON_SECRET</code> (any long random string) in Vercel and the same value as a GitHub Actions secret.</>}
            </Row>
            <Row ok={s.openai ? true : "warn"} label="AI drafting">{s.openai ? "OpenAI key found. Draft buttons work." : <>Optional. Add <code style={code}>OPENAI_API_KEY</code> to use Draft with AI.</>}</Row>
            <Row ok={"warn"} label="Media uploads for social">
              Uploads go to Firebase Storage under <code style={code}>marketing/</code>. Deploy the updated storage rules once: <code style={code}>firebase deploy --only storage</code> from the repo folder.
            </Row>
            <Row ok={s.suppressions >= 0} label="Unsubscribes">
              {s.suppressions} address{s.suppressions === 1 ? "" : "es"} suppressed. Every marketing email has an unsubscribe link and a one-click List-Unsubscribe header, and suppressed addresses are skipped automatically.
            </Row>
          </div>
        )}
      </Card>

      <Card title="Social app setup">
        <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.65 }}>
          <p style={{ margin: "0 0 10px" }}>Each platform needs a developer app. Add these redirect URLs exactly, then put the keys in Vercel and redeploy.</p>
          <p style={{ margin: "0 0 4px" }}><b style={{ color: C.ink }}>X</b> (developer.x.com): create a project and app, turn on OAuth 2.0 as a Web App with Read and write, callback <code style={code}>{redirectBase}/x</code>. Keys: <code style={code}>X_CLIENT_ID</code>, <code style={code}>X_CLIENT_SECRET</code>. X bills per post (about $0.015 each, about $0.20 with a link).</p>
          <p style={{ margin: "0 0 4px" }}><b style={{ color: C.ink }}>Instagram</b> (developers.facebook.com): create a Business app, add the Instagram product with "API setup with Instagram login", redirect <code style={code}>{redirectBase}/instagram</code>. Keys: <code style={code}>INSTAGRAM_APP_ID</code>, <code style={code}>INSTAGRAM_APP_SECRET</code>. The Instagram account must be a Professional (Business or Creator) account. While the app is in development mode, add your Instagram account as a tester.</p>
          <p style={{ margin: 0 }}><b style={{ color: C.ink }}>TikTok</b> (developers.tiktok.com): create an app with Login Kit and Content Posting API (Direct Post), redirect <code style={code}>{redirectBase}/tiktok</code>, scopes <code style={code}>user.info.basic</code> and <code style={code}>video.publish</code>. Keys: <code style={code}>TIKTOK_CLIENT_KEY</code>, <code style={code}>TIKTOK_CLIENT_SECRET</code>. Posts stay private until TikTok approves the app audit.</p>
        </div>
      </Card>
    </div>
  );
}
