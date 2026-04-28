"use client";

/**
 * PropertyImageEditor
 *
 * Modal editor for the property hero image. Lets a user:
 *   1. Crop the current image to a locked 16:9 horizontal aspect ratio.
 *   2. Upload a new image file (PNG/JPEG/WEBP) to replace the source.
 *
 * On Apply, the cropped pixels are rendered through a <canvas>, exported as a
 * JPEG blob, uploaded to Firebase Storage at
 *   workspace/<uid>/<projectId>/<propertyId>/hero/<timestamp>.jpg
 * and the resulting download URL is persisted to the property's `heroImageUrl`
 * field via updateProperty(). The caller gets the new URL back through the
 * onSaved callback so it can update local state without a page reload.
 *
 * CORS: existing hero images can live on Google or Firebase hosts. Firebase's
 * download URLs are CORS-friendly, but Google's (Places photo, Street View,
 * static map) are not, which taints the canvas and blocks toBlob(). To work
 * around this we route non-Firebase URLs through /api/workspace/proxy-image,
 * which re-streams the bytes with Access-Control-Allow-Origin: *.
 *
 * Newly uploaded files are loaded via object URL, no proxy needed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { updateProperty } from "@/lib/workspace/firestore";

/* ---------------------------------------------------------------- *
 * Constants                                                        *
 * ---------------------------------------------------------------- */

// Locked crop aspect. 16:9 is the most universally recognized horizontal
// aspect; the hero container uses object-fit: cover so any minor mismatch
// with the display ratio is handled gracefully.
const ASPECT_W = 16;
const ASPECT_H = 9;
const ASPECT = ASPECT_W / ASPECT_H;

// Max edge of the exported JPEG. Keeps file size reasonable even if the user
// cropped a huge source photo. We downscale only, never upscale.
const MAX_OUTPUT_WIDTH = 1600;

// Any non-local URL is routed through the same-origin proxy route
// (/api/workspace/proxy-image). This keeps the <img> same-origin, which lets
// the canvas read pixels without taint and means we don't need the <img>
// element to set crossOrigin. crossOrigin="anonymous" is actively harmful on
// blob: URLs (there is no HTTP response for the browser to attach CORS
// headers to, so the image never finishes loading) and on hosts whose buckets
// don't return permissive CORS (default-config Firebase Storage,
// lh3.googleusercontent.com, etc.).

/* ---------------------------------------------------------------- *
 * Types                                                            *
 * ---------------------------------------------------------------- */

interface Props {
  propertyId: string;
  projectId: string;
  userId: string;
  currentImageUrl?: string;
  propertyName: string;
  /** Optional - when no currentImageUrl, the editor uses this address
   *  to fetch the same Places/Street-View fallback the dashboard cards
   *  use, so the modal never opens empty when an image is renderable. */
  address?: string;
  onClose: () => void;
  onSaved: (newUrl: string) => void;
}

interface Rect {
  x: number;       // css px relative to image element top-left
  y: number;
  width: number;
  height: number;
}

type DragMode =
  | { kind: "idle" }
  | { kind: "move"; startPointer: { x: number; y: number }; startRect: Rect }
  | { kind: "resize"; handle: Handle; startPointer: { x: number; y: number }; startRect: Rect };

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

/* ---------------------------------------------------------------- *
 * Helpers                                                          *
 * ---------------------------------------------------------------- */

function resolveLoadableSrc(rawUrl: string): string {
  // Same-origin sources load directly.
  if (rawUrl.startsWith("blob:") || rawUrl.startsWith("data:")) return rawUrl;
  if (rawUrl.startsWith("/")) return rawUrl;
  // Everything else goes through the proxy so the <img> stays same-origin.
  return `/api/workspace/proxy-image?url=${encodeURIComponent(rawUrl)}`;
}

/** Fit a 16:9 crop rect inside the image, centered and as large as possible. */
function defaultCropFor(imgW: number, imgH: number): Rect {
  if (imgW / imgH > ASPECT) {
    // Image is wider than 16:9. Height fills, width is derived.
    const h = imgH;
    const w = h * ASPECT;
    return { x: (imgW - w) / 2, y: 0, width: w, height: h };
  }
  // Image is narrower. Width fills, height is derived.
  const w = imgW;
  const h = w / ASPECT;
  return { x: 0, y: (imgH - h) / 2, width: w, height: h };
}

function clampRectInside(r: Rect, boundsW: number, boundsH: number): Rect {
  let { x, y, width, height } = r;
  width = Math.max(24, Math.min(width, boundsW));
  height = Math.max(24 / ASPECT, Math.min(height, boundsH));
  x = Math.max(0, Math.min(x, boundsW - width));
  y = Math.max(0, Math.min(y, boundsH - height));
  return { x, y, width, height };
}

/* ---------------------------------------------------------------- *
 * Component                                                        *
 * ---------------------------------------------------------------- */

export default function PropertyImageEditor({
  propertyId, projectId, userId,
  currentImageUrl, propertyName, address,
  onClose, onSaved,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The image the user is actively cropping. Starts as the current hero;
  // switches to an object URL when the user picks a new file.
  const [sourceUrl, setSourceUrl] = useState<string | undefined>(currentImageUrl);
  // Object URL created for a newly uploaded file - kept so we can revoke it.
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  // When an object URL is active, we also keep the underlying File so the
  // upload preserves the original pixels if the user applies without cropping
  // (not currently wired - kept in case we want "upload without crop" later).
  const [, setPendingFile] = useState<File | null>(null);

  // Natural dimensions of the loaded image (for cropping math in image coords).
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  // Displayed dimensions on screen (used by the pointer math).
  const [displayed, setDisplayed] = useState<{ w: number; h: number } | null>(null);
  // The crop rect in *displayed* css px, matching the <img> element box.
  const [crop, setCrop] = useState<Rect | null>(null);

  const [drag, setDrag] = useState<DragMode>({ kind: "idle" });
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // If the proxy path fails (host not allowed / upstream error / network),
  // we retry once with the raw URL so the user at least sees the image.
  // Cropping will then fail with a CORS canvas error — handled in handleSave.
  const [proxyFailed, setProxyFailed] = useState(false);

  // Resolve the url the <img> should actually load (direct vs proxied).
  const loadableSrc = useMemo(() => {
    if (!sourceUrl) return undefined;
    if (proxyFailed) return sourceUrl;
    return resolveLoadableSrc(sourceUrl);
  }, [sourceUrl, proxyFailed]);

  // If the property has no stored hero yet, hit the same fallback ladder
  // the dashboard cards use (/api/workspace/places-photo) so the editor
  // opens with the Places photo (or Street View / satellite) the user
  // has been seeing on cards. Without this the modal opens empty even
  // though something IS rendering elsewhere in the app.
  useEffect(() => {
    if (sourceUrl) return;             // already have something to crop
    if (!address || !address.trim()) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/workspace/places-photo?address=${encodeURIComponent(address)}&maxwidth=1200`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.url && typeof data.url === "string") {
          setSourceUrl(data.url);
        }
      } catch {
        // non-fatal; user can still upload a fresh image
      }
    })();
    return () => { cancelled = true; };
  // Only fire on initial mount when there's no current image - avoid
  // re-firing on every state change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- image load handler ---------------------------------------- */
  const handleImgLoad = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    // onLoad can fire before the element is in layout (cached images), in
    // which case getBoundingClientRect() returns zeros. Fall back to natural
    // dims so the default crop is still sensible; the resize effect will
    // re-measure once the element has a real box.
    const rect = img.getBoundingClientRect();
    const dw = rect.width || nw;
    const dh = rect.height || nh;
    setNatural({ w: nw, h: nh });
    setDisplayed({ w: dw, h: dh });
    setCrop(defaultCropFor(dw, dh));
    // Clear any stale error from a previous failed source.
    setError(null);
  }, []);

  /* ---- keep displayed dims in sync on resize --------------------- */
  useEffect(() => {
    function onResize() {
      const img = imgRef.current;
      if (!img || !natural) return;
      const dw = img.getBoundingClientRect().width;
      const dh = img.getBoundingClientRect().height;
      setDisplayed((prev) => {
        if (!prev || !crop) return { w: dw, h: dh };
        // Scale the existing crop to the new displayed size so it doesn't jump.
        const sx = dw / prev.w;
        const sy = dh / prev.h;
        setCrop({
          x: crop.x * sx,
          y: crop.y * sy,
          width: crop.width * sx,
          height: crop.height * sy,
        });
        return { w: dw, h: dh };
      });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [natural, crop]);

  /* ---- pointer handlers ------------------------------------------ */
  const onPointerMove = useCallback((ev: PointerEvent) => {
    if (drag.kind === "idle") return;
    if (!displayed || !crop) return;

    const dx = ev.clientX - drag.startPointer.x;
    const dy = ev.clientY - drag.startPointer.y;

    if (drag.kind === "move") {
      const next: Rect = {
        ...drag.startRect,
        x: drag.startRect.x + dx,
        y: drag.startRect.y + dy,
      };
      setCrop(clampRectInside(next, displayed.w, displayed.h));
      return;
    }

    // resize: drive by the dominant axis so the aspect stays locked.
    const r = drag.startRect;
    const h = drag.handle;

    // Candidate new edges in image-relative coords.
    let left = r.x;
    let top = r.y;
    let right = r.x + r.width;
    let bottom = r.y + r.height;

    // Move edges that correspond to the grabbed handle.
    if (h.includes("w")) left = r.x + dx;
    if (h.includes("e")) right = r.x + r.width + dx;
    if (h.includes("n")) top = r.y + dy;
    if (h.includes("s")) bottom = r.y + r.height + dy;

    // Enforce min size before aspect correction.
    const MIN = 40;
    if (right - left < MIN) {
      if (h.includes("w")) left = right - MIN; else right = left + MIN;
    }
    if (bottom - top < MIN / ASPECT) {
      if (h.includes("n")) top = bottom - MIN / ASPECT; else bottom = top + MIN / ASPECT;
    }

    let newW = right - left;
    let newH = bottom - top;

    // Aspect lock: pick the dimension that changed more, recompute the other.
    // Anchor on the fixed corner/edge so the user feels like they're pulling
    // from the handle they grabbed.
    if (h === "n" || h === "s") {
      // Vertical handle -> width follows height, center horizontally.
      newW = newH * ASPECT;
      const cx = r.x + r.width / 2;
      left = cx - newW / 2;
      right = cx + newW / 2;
    } else if (h === "e" || h === "w") {
      // Horizontal handle -> height follows width, center vertically.
      newH = newW / ASPECT;
      const cy = r.y + r.height / 2;
      top = cy - newH / 2;
      bottom = cy + newH / 2;
    } else {
      // Corner handle -> use the larger dominant change to drive aspect.
      const targetAspect = ASPECT;
      if (newW / newH > targetAspect) {
        // Too wide -> shrink width
        newW = newH * targetAspect;
        if (h.includes("w")) left = right - newW; else right = left + newW;
      } else {
        // Too tall -> shrink height
        newH = newW / targetAspect;
        if (h.includes("n")) top = bottom - newH; else bottom = top + newH;
      }
    }

    const candidate: Rect = { x: left, y: top, width: right - left, height: bottom - top };
    setCrop(clampRectInside(candidate, displayed.w, displayed.h));
  }, [drag, displayed, crop]);

  const onPointerUp = useCallback(() => {
    setDrag({ kind: "idle" });
  }, []);

  useEffect(() => {
    if (drag.kind === "idle") return;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [drag, onPointerMove, onPointerUp]);

  /* ---- file upload (replace source) ------------------------------ */
  const onFilePicked = useCallback((ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    console.debug("[PropertyImageEditor] onFilePicked:", { type: f?.type, name: f?.name, size: f?.size });
    if (!f) return;

    // Accept any browser-reported image/* MIME, and fall back to the file
    // extension when the browser hands us an empty or oddly-capitalized type
    // (Safari on iOS sometimes reports "" for HEIC, Windows can report types
    // like "image/pjpeg"). We also accept common extensions like HEIC/HEIF/AVIF
    // even though canvas may not decode them in every browser — if the browser
    // can't decode, the <img>.onError path below surfaces a clear message.
    const fileType = (f.type || "").toLowerCase();
    const fileName = (f.name || "").toLowerCase();
    const looksLikeImage =
      fileType.startsWith("image/") ||
      /\.(png|jpe?g|webp|gif|bmp|heic|heif|avif|tiff?)$/i.test(fileName);
    if (!looksLikeImage) {
      setError(
        `That file doesn't look like an image (type: ${f.type || "unknown"}${f.name ? `, name: ${f.name}` : ""}). Please choose a PNG, JPEG, or WEBP.`
      );
      // Clear the input so the user can re-pick.
      ev.target.value = "";
      return;
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    const url = URL.createObjectURL(f);
    console.debug("[PropertyImageEditor] new source blob URL:", url);
    setObjectUrl(url);
    setPendingFile(f);
    setSourceUrl(url);
    setProxyFailed(false);
    setNatural(null);
    setDisplayed(null);
    setCrop(null);
    setError(null);
    // reset the input so picking the same file twice still fires onchange
    ev.target.value = "";
  }, [objectUrl]);

  useEffect(() => {
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [objectUrl]);

  /* ---- apply / save ---------------------------------------------- */
  const handleApply = useCallback(async () => {
    if (!natural || !displayed || !crop || !imgRef.current) return;
    setSaving(true);
    setError(null);
    setProgress(0);

    try {
      // Convert displayed-coord crop rect into natural-pixel coords.
      const scaleX = natural.w / displayed.w;
      const scaleY = natural.h / displayed.h;
      const srcX = Math.round(crop.x * scaleX);
      const srcY = Math.round(crop.y * scaleY);
      const srcW = Math.round(crop.width * scaleX);
      const srcH = Math.round(crop.height * scaleY);

      // Output size: respect MAX_OUTPUT_WIDTH, downscale only.
      const outW = Math.min(srcW, MAX_OUTPUT_WIDTH);
      const outH = Math.round(outW / ASPECT);

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get 2D context");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(imgRef.current, srcX, srcY, srcW, srcH, 0, 0, outW, outH);

      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Canvas export failed"))),
          "image/jpeg",
          0.9
        );
      });

      const storedName = `${Date.now()}.jpg`;
      const storagePath = `workspace/${userId}/${projectId}/${propertyId}/hero/${storedName}`;
      const storageRef = ref(storage, storagePath);
      const task = uploadBytesResumable(storageRef, blob, { contentType: "image/jpeg" });

      const url: string = await new Promise((resolve, reject) => {
        task.on(
          "state_changed",
          (snap) => {
            const pct = snap.totalBytes ? (snap.bytesTransferred / snap.totalBytes) * 100 : 0;
            setProgress(pct);
          },
          reject,
          async () => {
            try {
              const dl = await getDownloadURL(task.snapshot.ref);
              resolve(dl);
            } catch (e) { reject(e); }
          }
        );
      });

      // Persist to Firestore. `updateProperty` signature accepts Partial<Property>,
      // and `heroImageUrl` is an optional string on Property.
      await updateProperty(propertyId, { heroImageUrl: url } as any);

      onSaved(url);
      onClose();
    } catch (e: any) {
      console.error("[PropertyImageEditor] save failed:", e);
      const msg = e?.message || String(e);
      if (/tainted|SecurityError/i.test(msg)) {
        setError("Couldn't read the image pixels (CORS). Try uploading a new image and cropping that instead.");
      } else {
        setError(`Save failed: ${msg}`);
      }
      setSaving(false);
    }
  }, [natural, displayed, crop, projectId, propertyId, userId, onSaved, onClose]);

  /* ---- lock body scroll while modal is open --------------------- */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  /* ---- render ---------------------------------------------------- */
  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit property image"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(15, 23, 42, 0.72)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, fontFamily: "inherit",
      }}
    >
      <div style={{
        width: "min(920px, 100%)", maxHeight: "92vh",
        background: "#ffffff", borderRadius: 14,
        boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "14px 18px", borderBottom: "1px solid #E5E7EB",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>
              Edit property image
            </div>
            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
              {propertyName} &middot; locked to 16:9 (horizontal)
            </div>
          </div>
          <button
            onClick={() => { if (!saving) onClose(); }}
            aria-label="Close"
            style={{
              width: 32, height: 32, borderRadius: 8, border: "none",
              background: "transparent", color: "#6B7280",
              cursor: saving ? "not-allowed" : "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{
          flex: 1, minHeight: 0, overflow: "auto",
          padding: 18, background: "#F8FAFC",
        }}>
          <div style={{
            display: "flex", gap: 10, flexWrap: "wrap",
            alignItems: "center", marginBottom: 14,
          }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={saving}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "8px 14px", borderRadius: 8,
                border: "1px solid #CBD5E1", background: "#ffffff",
                color: "#0F172A", fontSize: 12, fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Upload new image
            </button>
            <input
              ref={fileInputRef}
              type="file"
              // Broadened to image/* so iOS shows photo library picks that
              // report as "" or image/heic. We re-validate in onFilePicked.
              accept="image/*"
              onChange={onFilePicked}
              // Visually hidden but still clickable. We used display:none here
              // previously, which works in most browsers but has edge cases
              // around screen readers and a handful of mobile browsers that
              // skip onchange for detached-layout inputs. This keeps the input
              // in the layout tree without taking space.
              style={{
                position: "absolute",
                width: 1,
                height: 1,
                padding: 0,
                margin: -1,
                overflow: "hidden",
                clip: "rect(0,0,0,0)",
                border: 0,
              }}
            />
            <span style={{ fontSize: 11, color: "#64748B" }}>
              Drag the crop box to position. Drag the corner and edge handles to resize (ratio stays locked to 16:9).
            </span>
          </div>

          {/* Image + crop overlay */}
          <div
            ref={containerRef}
            style={{
              position: "relative", width: "100%",
              background: "#0F172A", borderRadius: 10,
              overflow: "hidden",
              display: "flex", alignItems: "center", justifyContent: "center",
              minHeight: 300,
            }}
          >
            {loadableSrc ? (
              <>
                <img
                  // Keying on the resolved source forces React to swap the
                  // element whenever the user uploads a new file. Without this,
                  // React reuses the existing <img> and only updates its src,
                  // which means onLoad won't re-fire reliably if the browser
                  // caches or collapses the load (seen with Safari on iOS after
                  // a second pick in the same session).
                  key={loadableSrc}
                  ref={imgRef}
                  src={loadableSrc}
                  alt="Source"
                  onLoad={handleImgLoad}
                  onError={(ev) => {
                    const failedSrc = (ev.currentTarget as HTMLImageElement).src;
                    console.warn("[PropertyImageEditor] source image failed to load:", failedSrc);
                    // If the proxy path failed and we have a non-local original, try
                    // loading it directly. This will taint the canvas for cross-origin
                    // hosts without permissive CORS, but handleApply surfaces a clear
                    // error in that case, which beats showing nothing at all.
                    if (!proxyFailed && sourceUrl && !sourceUrl.startsWith("blob:") && !sourceUrl.startsWith("data:") && !sourceUrl.startsWith("/")) {
                      setProxyFailed(true);
                      return;
                    }
                    // For blob: sources (newly uploaded file) the decode itself
                    // failed — most commonly HEIC/HEIF on Chrome or an
                    // unsupported codec. Tell the user what to do.
                    if (sourceUrl && sourceUrl.startsWith("blob:")) {
                      setError("Your browser couldn't decode that image. Try a JPEG, PNG, or WEBP (HEIC photos from iPhone aren't supported in Chrome).");
                    } else {
                      setError("Could not load the source image. Try uploading a new one.");
                    }
                  }}
                  draggable={false}
                  style={{
                    display: "block",
                    maxWidth: "100%",
                    maxHeight: "60vh",
                    userSelect: "none",
                    pointerEvents: "none",
                  }}
                />
                {crop && displayed && imgRef.current && (
                  <CropOverlay
                    crop={crop}
                    displayed={displayed}
                    containerEl={imgRef.current}
                    onMoveStart={(ev) => setDrag({
                      kind: "move",
                      startPointer: { x: ev.clientX, y: ev.clientY },
                      startRect: { ...crop },
                    })}
                    onResizeStart={(handle, ev) => setDrag({
                      kind: "resize",
                      handle,
                      startPointer: { x: ev.clientX, y: ev.clientY },
                      startRect: { ...crop },
                    })}
                  />
                )}
              </>
            ) : (
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                gap: 10, color: "#CBD5E1", padding: 40,
              }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" /></svg>
                <div style={{ fontSize: 12 }}>No image yet. Upload one to get started.</div>
              </div>
            )}
          </div>

          {error && (
            <div style={{
              marginTop: 12, padding: "8px 12px", borderRadius: 8,
              background: "#FEF2F2", border: "1px solid #FECACA",
              color: "#991B1B", fontSize: 12,
            }}>{error}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 18px", borderTop: "1px solid #E5E7EB",
          display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10,
          background: "#ffffff",
        }}>
          {saving && (
            <div style={{ marginRight: "auto", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 160, height: 6, background: "#E5E7EB", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${progress}%`, height: "100%", background: "#4D7C0F", transition: "width 0.2s" }} />
              </div>
              <span style={{ fontSize: 11, color: "#64748B" }}>
                Uploading... {Math.round(progress)}%
              </span>
            </div>
          )}
          <button
            onClick={() => { if (!saving) onClose(); }}
            disabled={saving}
            style={{
              padding: "8px 14px", borderRadius: 8,
              border: "1px solid #CBD5E1", background: "#ffffff",
              color: "#0F172A", fontSize: 12, fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit",
            }}
          >Cancel</button>
          <button
            onClick={handleApply}
            disabled={saving || !crop || !natural}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none",
              background: (saving || !crop || !natural) ? "#9CA3AF" : "#4D7C0F",
              color: "#ffffff", fontSize: 12, fontWeight: 700,
              cursor: (saving || !crop || !natural) ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {saving ? "Saving..." : "Save image"}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}

/* ---------------------------------------------------------------- *
 * Crop overlay (positioned absolutely over the <img>)              *
 * ---------------------------------------------------------------- */

function CropOverlay({
  crop, displayed, containerEl,
  onMoveStart, onResizeStart,
}: {
  crop: Rect;
  displayed: { w: number; h: number };
  containerEl: HTMLImageElement;
  onMoveStart: (ev: React.PointerEvent) => void;
  onResizeStart: (handle: Handle, ev: React.PointerEvent) => void;
}) {
  // Position the overlay on top of the <img> by reading its offset within
  // its parent flex box. The parent uses `display: flex; justify-content: center`
  // so the img may be horizontally centered inside a wider container; we
  // mirror that offset here instead of positioning relative to the container.
  const left = containerEl.offsetLeft;
  const top = containerEl.offsetTop;

  const handleStyle: React.CSSProperties = {
    position: "absolute", width: 12, height: 12, background: "#4D7C0F",
    border: "2px solid #ffffff", borderRadius: 2, boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
    touchAction: "none",
  };
  const edgeStyle: React.CSSProperties = {
    position: "absolute", background: "transparent",
    touchAction: "none",
  };

  const handles: Array<{ key: Handle; style: React.CSSProperties; cursor: string }> = [
    { key: "nw", style: { left: -6, top: -6 }, cursor: "nwse-resize" },
    { key: "ne", style: { right: -6, top: -6 }, cursor: "nesw-resize" },
    { key: "sw", style: { left: -6, bottom: -6 }, cursor: "nesw-resize" },
    { key: "se", style: { right: -6, bottom: -6 }, cursor: "nwse-resize" },
    { key: "n",  style: { left: "50%", top: -6, transform: "translateX(-50%)" }, cursor: "ns-resize" },
    { key: "s",  style: { left: "50%", bottom: -6, transform: "translateX(-50%)" }, cursor: "ns-resize" },
    { key: "w",  style: { left: -6, top: "50%", transform: "translateY(-50%)" }, cursor: "ew-resize" },
    { key: "e",  style: { right: -6, top: "50%", transform: "translateY(-50%)" }, cursor: "ew-resize" },
  ];

  return (
    <>
      {/* Dim the area outside the crop with 4 strips - cheaper than SVG mask. */}
      <div style={{
        position: "absolute", pointerEvents: "none",
        left, top, width: displayed.w, height: crop.y,
        background: "rgba(15, 23, 42, 0.55)",
      }} />
      <div style={{
        position: "absolute", pointerEvents: "none",
        left, top: top + crop.y + crop.height,
        width: displayed.w, height: displayed.h - (crop.y + crop.height),
        background: "rgba(15, 23, 42, 0.55)",
      }} />
      <div style={{
        position: "absolute", pointerEvents: "none",
        left, top: top + crop.y, width: crop.x, height: crop.height,
        background: "rgba(15, 23, 42, 0.55)",
      }} />
      <div style={{
        position: "absolute", pointerEvents: "none",
        left: left + crop.x + crop.width, top: top + crop.y,
        width: displayed.w - (crop.x + crop.width), height: crop.height,
        background: "rgba(15, 23, 42, 0.55)",
      }} />

      {/* Crop rect */}
      <div
        onPointerDown={(ev) => { (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId); onMoveStart(ev); }}
        style={{
          position: "absolute",
          left: left + crop.x, top: top + crop.y,
          width: crop.width, height: crop.height,
          border: "2px solid #4D7C0F",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.9) inset",
          cursor: "move", touchAction: "none",
          boxSizing: "border-box",
        }}
      >
        {/* Rule-of-thirds guides */}
        <div style={{ position: "absolute", left: "33.33%", top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.35)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", left: "66.66%", top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.35)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: "33.33%", left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.35)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: "66.66%", left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.35)", pointerEvents: "none" }} />

        {/* Aspect badge */}
        <div style={{
          position: "absolute", left: 6, top: 6,
          padding: "2px 6px", borderRadius: 4,
          background: "rgba(15, 23, 42, 0.7)", color: "#ffffff",
          fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
          pointerEvents: "none",
        }}>16:9</div>

        {/* Handles */}
        {handles.map(h => (
          <div
            key={h.key}
            onPointerDown={(ev) => {
              ev.stopPropagation();
              (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
              onResizeStart(h.key, ev);
            }}
            style={{ ...handleStyle, ...h.style, cursor: h.cursor }}
          />
        ))}
        {/* Invisible edge hitboxes for n/s/e/w (wider than the tiny squares) */}
        {(["n","s","e","w"] as Handle[]).map(e => {
          const boxStyle: React.CSSProperties = e === "n" ? { left: 12, right: 12, top: -4, height: 8, cursor: "ns-resize" }
            : e === "s" ? { left: 12, right: 12, bottom: -4, height: 8, cursor: "ns-resize" }
            : e === "w" ? { top: 12, bottom: 12, left: -4, width: 8, cursor: "ew-resize" }
            :             { top: 12, bottom: 12, right: -4, width: 8, cursor: "ew-resize" };
          return (
            <div key={`edge-${e}`}
              onPointerDown={(ev) => {
                ev.stopPropagation();
                (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
                onResizeStart(e, ev);
              }}
              style={{ ...edgeStyle, ...boxStyle }} />
          );
        })}
      </div>
    </>
  );
}
