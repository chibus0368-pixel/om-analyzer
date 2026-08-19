"use client";

/**
 * PropertyHeroImage
 *
 * Single render-time component that picks the best available image for a
 * property and falls back through a cascade. Order:
 *
 *   1. heroImageUrl (extracted from PDF or previously saved)
 *   2. Google Places photo (via /api/workspace/places-photo)
 *   3. Google Street View static image (if API key present)
 *   4. Satellite static map
 *   5. Placeholder pin with address text
 *
 * Places photos are usually nicer than Street View for commercial buildings
 * (leasing flyers, brokerage hero shots) and are key-less public URLs on
 * lh3.googleusercontent.com, so they're safe to render anywhere and cache.
 *
 * Optionally persists the Places URL back to Firestore (`heroImageUrl`) so
 * the next render skips the round-trip. Opt in via `persistPropertyId`.
 */
import { useEffect, useState } from "react";
import Image from "next/image";

interface Props {
  heroImageUrl?: string;
  address: string;              // full address string used for Places lookup
  location?: string;            // "City, ST" for placeholder caption
  propertyName: string;
  style?: React.CSSProperties;
  placeholderEmoji?: string;
  /** If provided, successful Places lookups get saved to this property. */
  persistPropertyId?: string;
  className?: string;
  /**
   * Above-the-fold cards (first row) should load eagerly; everything else
   * should lazy-load. Grids of 10-20+ cards pulling full-resolution
   * originals from Firebase Storage all at once is what makes the
   * DealBoard grid slow to paint on mobile connections.
   */
  priority?: boolean;
}

// Firebase Storage hero uploads go through Next's image optimizer (resized +
// re-encoded + lazy-loaded) so the grid doesn't pull full-resolution
// originals for a 160px-tall thumbnail. Other hosts (Places photos, Street
// View, satellite) aren't in next.config's remotePatterns, so they stay as
// plain <img> but still get native lazy loading.
const NEXT_IMAGE_HOSTS = ["firebasestorage.googleapis.com"];
function canUseNextImage(url?: string): boolean {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return NEXT_IMAGE_HOSTS.some(h => hostname.includes(h));
  } catch {
    return false;
  }
}

export default function PropertyHeroImage({
  heroImageUrl,
  address,
  location,
  propertyName,
  style,
  placeholderEmoji = "📍",
  persistPropertyId,
  className,
  priority = false,
}: Props) {
  const [heroError, setHeroError] = useState(false);
  const [placesUrl, setPlacesUrl] = useState<string | null>(null);
  const [placesTried, setPlacesTried] = useState(false);
  const [streetViewError, setStreetViewError] = useState(false);
  const [satelliteError, setSatelliteError] = useState(false);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const encodedAddress = encodeURIComponent(address || "");
  const mapLink = address ? `https://www.google.com/maps/search/${encodedAddress}` : "#";
  const hasGoogleApi = !!apiKey && !!address;

  // Try Places photo when the stored hero is missing or errored.
  useEffect(() => {
    if (placesTried) return;
    if (heroImageUrl && !heroError) return;
    if (!address) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/workspace/places-photo?address=${encodedAddress}&maxwidth=1200`);
        if (!res.ok) {
          setPlacesTried(true);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        if (data?.url) {
          setPlacesUrl(data.url);
          // Persist to Firestore so future renders skip the API round-trip.
          if (persistPropertyId) {
            try {
              const { updateProperty } = await import("@/lib/workspace/firestore");
              await updateProperty(persistPropertyId, { heroImageUrl: data.url } as any);
            } catch (persistErr) {
              // Non-fatal: the image still renders even if the write fails.
              console.warn("[PropertyHeroImage] Could not persist Places URL:", persistErr);
            }
          }
        }
      } catch {
        // swallow; fall through to Street View / satellite / placeholder
      } finally {
        if (!cancelled) setPlacesTried(true);
      }
    })();
    return () => { cancelled = true; };
  }, [heroImageUrl, heroError, address, encodedAddress, persistPropertyId, placesTried]);

  const baseStyle: React.CSSProperties = {
    width: "100%", height: "100%", objectFit: "cover", display: "block",
  };

  // 1. Stored hero
  if (heroImageUrl && !heroError) {
    if (canUseNextImage(heroImageUrl)) {
      return (
        <Image
          src={heroImageUrl}
          alt={propertyName}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 320px"
          quality={70}
          priority={priority}
          {...(!priority ? { loading: "lazy" as const } : {})}
          className={className}
          style={{ objectFit: "cover", ...style }}
          onError={() => setHeroError(true)}
        />
      );
    }
    return (
      <img
        src={heroImageUrl}
        alt={propertyName}
        className={className}
        loading={priority ? "eager" : "lazy"}
        style={{ ...baseStyle, ...style }}
        onError={() => setHeroError(true)}
      />
    );
  }

  // 2. Places photo (once resolved)
  if (placesUrl) {
    return (
      <img
        src={placesUrl}
        alt={propertyName}
        className={className}
        loading={priority ? "eager" : "lazy"}
        style={{ ...baseStyle, ...style }}
        onError={() => setPlacesUrl(null)}
      />
    );
  }

  // 3. Street View
  if (hasGoogleApi && !streetViewError) {
    return (
      <a href={mapLink} target="_blank" rel="noopener noreferrer" className={className} style={{ display: "block", width: "100%", height: "100%" }}>
        <img
          src={`https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${encodedAddress}&key=${apiKey}`}
          alt={`Street view of ${propertyName}`}
          loading={priority ? "eager" : "lazy"}
          style={{ ...baseStyle, ...style }}
          onError={() => setStreetViewError(true)}
        />
      </a>
    );
  }

  // 4. Satellite
  if (hasGoogleApi && !satelliteError) {
    return (
      <a href={mapLink} target="_blank" rel="noopener noreferrer" className={className} style={{ display: "block", width: "100%", height: "100%" }}>
        <img
          src={`https://maps.googleapis.com/maps/api/staticmap?center=${encodedAddress}&zoom=18&size=600x400&maptype=satellite&key=${apiKey}`}
          alt={`Satellite view of ${propertyName}`}
          loading={priority ? "eager" : "lazy"}
          style={{ ...baseStyle, ...style }}
          onError={() => setSatelliteError(true)}
        />
      </a>
    );
  }

  // 5. Placeholder
  return (
    <div className={className} style={{
      width: "100%", height: "100%", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 6, color: "#888",
      background: "linear-gradient(135deg, #F3F4F6, #E5E7EB)", ...style,
    }}>
      <span style={{ fontSize: 40, opacity: 0.45 }}>{placeholderEmoji}</span>
      {location && <span style={{ fontSize: 11, fontWeight: 500 }}>{location}</span>}
    </div>
  );
}
