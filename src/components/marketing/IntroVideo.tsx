"use client";

/**
 * Click-to-play intro video near the bottom of the homepage.
 *
 * Nothing but the poster image loads until the visitor clicks. The MP4s are
 * encoded with +faststart, so playback begins while the rest of the file is
 * still downloading (progressive streaming). Phones get the 720p file.
 */

import { useRef, useState } from "react";

const LIME = "#84CC16";

export function IntroVideo() {
  const [playing, setPlaying] = useState(false);
  const [src, setSrc] = useState<string>("");
  const ref = useRef<HTMLVideoElement | null>(null);

  const start = () => {
    const wide = typeof window !== "undefined" && window.innerWidth >= 900 && (window.devicePixelRatio || 1) * window.innerWidth >= 1200;
    setSrc(wide ? "/videos/scoreom-intro-v5-1080.mp4" : "/videos/scoreom-intro-v5-720.mp4");
    setPlaying(true);
    requestAnimationFrame(() => { ref.current?.play().catch(() => {}); });
  };

  return (
    <section id="intro-video" className="so-intro" style={{ scrollMarginTop: 90 }}>
      <div className="so-intro-head">
        <div className="so-pill-eyebrow"><span className="so-pill-dot" />Watch the walkthrough</div>
        <h2>ScoreOM in <span style={{ whiteSpace: "nowrap" }}><span className="ds-callout">80 seconds</span>.</span></h2>
        <p>Who it is for, what it does with the OMs you receive, and how the scores, DealBoards and sharing fit together.</p>
      </div>
      <div className="so-intro-frame">
        {playing ? (
          <video
            ref={ref}
            src={src}
            poster="/videos/scoreom-intro-v5-poster.webp"
            controls
            autoPlay
            playsInline
            preload="auto"
            aria-label="ScoreOM intro video"
          />
        ) : (
          <button type="button" className="so-intro-poster" onClick={start} aria-label="Play the ScoreOM intro video with sound">
            <img src="/videos/scoreom-intro-v5-poster.webp" alt="" loading="lazy" decoding="async" width={1600} height={900} />
            <span className="so-intro-shade" aria-hidden />
            <span className="so-intro-play" aria-hidden>
              <svg viewBox="0 0 24 24" width="34" height="34"><path d="M8 5.5v13l11-6.5z" fill="#0d0d14" /></svg>
            </span>
            <span className="so-intro-meta">
              <b>Screen deals faster</b>
              <span>1:20 &middot; sound on</span>
            </span>
          </button>
        )}
      </div>
      <style>{`
        .so-intro { max-width: 1160px; margin: 0 auto; padding: 40px 32px 110px; }
        .so-intro-head { text-align:center; max-width: 720px; margin: 0 auto 40px; }
        .so-intro-head h2 { font-family:'Plus Jakarta Sans',sans-serif; font-size: clamp(32px, 4.4vw, 52px); font-weight:800; letter-spacing:-0.03em; line-height:1.08; color:#fff; margin: 22px 0 18px; }
        .so-intro-head p { color:#9ca3af; font-size:17px; line-height:1.65; margin:0; }
        .so-intro-frame { position:relative; border-radius: 28px; overflow:hidden; aspect-ratio: 16 / 9; background:#0a0a10;
          border:1px solid rgba(255,255,255,0.1); box-shadow: 0 40px 100px rgba(0,0,0,0.55), 0 0 0 8px rgba(255,255,255,0.03), 0 0 120px rgba(132,204,22,0.10); }
        .so-intro-frame video { width:100%; height:100%; display:block; background:#000; }
        .so-intro-poster { all: unset; position:absolute; inset:0; cursor:pointer; display:block; }
        .so-intro-poster img { width:100%; height:100%; object-fit:cover; display:block; transition: transform .8s cubic-bezier(.2,.8,.2,1); }
        .so-intro-poster:hover img { transform: scale(1.025); }
        .so-intro-shade { position:absolute; inset:0; background: linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,0.65) 100%); }
        .so-intro-play { position:absolute; left:50%; top:50%; width:96px; height:96px; transform: translate(-50%,-50%); border-radius:50%;
          background:${LIME}; display:flex; align-items:center; justify-content:center; padding-left:6px; box-sizing:border-box;
          box-shadow: 0 0 0 10px rgba(132,204,22,0.22), 0 20px 50px rgba(0,0,0,0.5); transition: transform .25s ease; }
        .so-intro-play::before { content:""; position:absolute; inset:-10px; border-radius:50%; border:2px solid rgba(132,204,22,0.6); animation: soIntroPulse 2.4s ease-out infinite; }
        @keyframes soIntroPulse { from { transform: scale(1); opacity:.9; } to { transform: scale(1.5); opacity:0; } }
        .so-intro-poster:hover .so-intro-play, .so-intro-poster:focus-visible .so-intro-play { transform: translate(-50%,-50%) scale(1.07); }
        .so-intro-poster:focus-visible { outline: 3px solid ${LIME}; outline-offset: -3px; }
        .so-intro-meta { position:absolute; left:28px; bottom:24px; display:flex; flex-direction:column; gap:2px; font-family:'Plus Jakarta Sans',sans-serif; }
        .so-intro-meta b { color:#fff; font-size:20px; font-weight:800; }
        .so-intro-meta span { color:rgba(255,255,255,0.75); font-size:14px; }
        @media (max-width: 900px) {
          .so-intro { padding: 30px 16px 80px; }
          .so-intro-frame { border-radius: 18px; }
          .so-intro-play { width:68px; height:68px; }
          .so-intro-meta { left:16px; bottom:14px; } .so-intro-meta b { font-size:16px; }
        }
        @media (prefers-reduced-motion: reduce) { .so-intro-play::before { animation:none; } }
      `}</style>
    </section>
  );
}
