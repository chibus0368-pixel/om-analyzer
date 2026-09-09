"use client";

/**
 * ProductDemo — full-bleed "see the tool run" band.
 *
 * Structure borrowed from trutec.ai (mono uppercase eyebrows, faint grid
 * texture, one big rounded product frame, numbered chapter markers) but
 * rendered in the DealSignals black + lime palette so it reads as ours.
 *
 * Ships safely with no video file present: <video> onError falls back to the
 * poster still, so this section looks finished before the recording exists.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const LIME = "#84CC16";

const VIDEO_SRC = "/videos/dealsignals-demo.mp4";
const POSTER_SRC = "/videos/demo-poster.jpg";

/** Chapter markers. `at` = seconds into the recording. Retime these once the
 *  real cut is in place; they are the only thing tied to the edit. */
const CHAPTERS = [
  { n: "01", label: "Drop the OM", at: 0 },
  { n: "02", label: "AI extraction", at: 8 },
  { n: "03", label: "Score & verdict", at: 22 },
  { n: "04", label: "Rent roll + share", at: 38 },
];

const MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';

function Eyebrow({ children, dim = false }: { children: React.ReactNode; dim?: boolean }) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 11.5,
        letterSpacing: 2,
        textTransform: "uppercase",
        color: dim ? "rgba(255,255,255,0.38)" : LIME,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export default function ProductDemo() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sectionRef = useRef<HTMLDivElement | null>(null);

  const [failed, setFailed] = useState(false);
  const [isSmall, setIsSmall] = useState(false);
  // On phones we do not ship the video until the user taps — the poster is
  // 100KB, the recording is not. Desktop autoplays muted like TruTec does.
  const [activated, setActivated] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const sync = () => setIsSmall(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Pause when the band scrolls out of view. Keeps a looping video off the
  // main thread for the rest of the page.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        const v = videoRef.current;
        if (!v) return;
        if (entry.isIntersecting) void v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.25 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [activated, isSmall]);

  // Highlight the chapter the playhead is currently inside.
  const onTimeUpdate = useCallback(() => {
    const t = videoRef.current?.currentTime ?? 0;
    let i = 0;
    for (let c = 0; c < CHAPTERS.length; c++) if (t >= CHAPTERS[c].at) i = c;
    setActive(i);
  }, []);

  const seek = useCallback((i: number) => {
    setActive(i);
    setActivated(true);
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = CHAPTERS[i].at;
    void v.play().catch(() => {});
  }, []);

  const showVideo = !failed && (!isSmall || activated);

  return (
    <section
      ref={sectionRef}
      id="demo"
      className="ds-section-pad"
      style={{
        position: "relative",
        overflow: "hidden",
        padding: "88px 32px 80px",
        background: "#0b0b12",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        scrollMarginTop: 80,
      }}
    >
      {/* Faint grid texture */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.028) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.028) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, #000 40%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, #000 40%, transparent 100%)",
        }}
      />
      {/* Lime glow behind the frame */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: "22%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 1000,
          height: 460,
          borderRadius: "50%",
          background: "rgba(132,204,22,0.07)",
          filter: "blur(150px)",
          pointerEvents: "none",
        }}
      />

      <div style={{ maxWidth: 1180, margin: "0 auto", position: "relative", zIndex: 1 }}>
        {/* Split eyebrow row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 16,
            paddingBottom: 14,
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            marginBottom: 28,
          }}
        >
          <Eyebrow>See it run</Eyebrow>
          <Eyebrow dim>Real OM · Unedited</Eyebrow>
        </div>

        <div style={{ maxWidth: 720, marginBottom: 34 }}>
          <h2
            style={{
              fontSize: 42,
              fontWeight: 800,
              color: "#fff",
              margin: 0,
              letterSpacing: -0.8,
              lineHeight: 1.06,
            }}
            className="ds-demo-h2"
          >
            Watch an OM become a <span style={{ color: LIME }}>verdict</span>.
          </h2>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.6,
              color: "rgba(255,255,255,0.6)",
              margin: "14px 0 0",
              maxWidth: 600,
            }}
          >
            No setup, no template, no model to build. Drop in the broker&apos;s PDF and
            watch DealSignals pull the financials, score the deal, and hand back a
            shareable page before you have finished reading page one.
          </p>
        </div>

        {/* Product frame */}
        <div
          style={{
            position: "relative",
            borderRadius: 16,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "#07070b",
            boxShadow:
              "0 6px 16px rgba(0,0,0,0.4), 0 30px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(132,204,22,0.06)",
            aspectRatio: "16 / 10",
          }}
        >
          {showVideo ? (
            <video
              ref={videoRef}
              src={VIDEO_SRC}
              poster={POSTER_SRC}
              autoPlay
              muted
              loop
              playsInline
              preload={isSmall ? "auto" : "metadata"}
              onError={() => setFailed(true)}
              onTimeUpdate={onTimeUpdate}
              style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <>
              <img
                src={POSTER_SRC}
                alt="DealSignals analyzing an offering memorandum"
                loading="lazy"
                decoding="async"
                style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
              />
              {/* Tap-to-play affordance on phones; hidden once the video errors
                  out entirely (no file yet) so we never advertise a dead play button. */}
              {isSmall && !failed && (
                <button
                  type="button"
                  onClick={() => setActivated(true)}
                  aria-label="Play the DealSignals demo"
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "grid",
                    placeItems: "center",
                    border: "none",
                    background: "rgba(0,0,0,0.35)",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: "50%",
                      background: LIME,
                      display: "grid",
                      placeItems: "center",
                      boxShadow: "0 8px 30px rgba(132,204,22,0.4)",
                    }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="#0b0b12" aria-hidden>
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                </button>
              )}
            </>
          )}
        </div>

        {/* Chapter markers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 1,
            marginTop: 1,
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderTop: "none",
            borderRadius: "0 0 12px 12px",
            overflow: "hidden",
          }}
          className="ds-demo-chapters"
        >
          {CHAPTERS.map((c, i) => {
            const on = showVideo && i === active;
            return (
              <button
                key={c.n}
                type="button"
                onClick={() => seek(i)}
                style={{
                  appearance: "none",
                  border: "none",
                  textAlign: "left",
                  padding: "16px 18px",
                  background: on ? "rgba(132,204,22,0.07)" : "#0b0b12",
                  cursor: "pointer",
                  transition: "background 0.2s ease",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    letterSpacing: 1.6,
                    color: on ? LIME : "rgba(255,255,255,0.3)",
                  }}
                >
                  {c.n}
                </span>
                <span
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: on ? "#fff" : "rgba(255,255,255,0.62)",
                  }}
                >
                  {c.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* CTA row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginTop: 30,
            flexWrap: "wrap",
          }}
        >
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 22px",
              borderRadius: 8,
              background: LIME,
              color: "#0b0b12",
              fontSize: 14.5,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Run it on your own OM
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </a>
          <a
            href="#examples"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "12px 22px",
              borderRadius: 8,
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.16)",
              color: "rgba(255,255,255,0.82)",
              fontSize: 14.5,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            See example outputs
          </a>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 720px) {
          :global(.ds-demo-h2) {
            font-size: 30px !important;
          }
          :global(.ds-demo-chapters) {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </section>
  );
}
