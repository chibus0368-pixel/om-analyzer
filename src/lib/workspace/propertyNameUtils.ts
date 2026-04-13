/**
 * Smart property name utilities.
 *
 * Solves:
 * - Double names: "Walgreens NNN - 1234 Main St" when address is already shown below
 * - Redundant address repetition in titles
 * - Overly long names that are just address + address
 * - Generic names that could be made shorter/cleaner
 */

/* ── Common address patterns ─────────────────────────────── */
const ADDRESS_RE =
  /\d{1,6}\s+(?:[NSEW]\.?\s+)?(?:\w+\s+){0,3}(?:st(?:reet)?|ave(?:nue)?|blvd|boulevard|dr(?:ive)?|rd|road|ln|lane|way|ct|court|cir(?:cle)?|pl(?:ace)?|pkwy|parkway|hwy|highway|pike|trail|tr)\b/i;

const CITY_STATE_ZIP_RE =
  /,?\s*[A-Z][a-z]+(?:\s[A-Z][a-z]+)*,?\s*[A-Z]{2}\s*\d{0,5}/;

const EM_DASH_SEP = /\s*[-–-]\s*/;

/**
 * Build a smart, short property name from parsed data.
 *
 * Strategy:
 * 1. If parsedName already contains the address, strip it out
 * 2. Never append address/city to the name - those go in separate fields
 * 3. If the parsed name IS just an address, try to make it a short label
 * 4. Deduplicate repeated segments
 */
export function buildSmartPropertyName(
  parsedName: string | null | undefined,
  parsedAddress: string | null | undefined,
  parsedCity: string | null | undefined,
  parsedState: string | null | undefined,
  fallbackName?: string,
): string {
  if (!parsedName || parsedName === "Unknown Property") {
    return fallbackName || "Untitled Property";
  }

  let name = parsedName.trim();

  // 1. If name has an em-dash separator (previous format), take only the first part
  if (EM_DASH_SEP.test(name)) {
    const parts = name.split(EM_DASH_SEP);
    const firstPart = parts[0].trim();
    // Only use first part if it's meaningful (not just a number or very short)
    if (firstPart.length > 2) {
      name = firstPart;
    }
  }

  // 2. Strip trailing address if the name ends with a street address
  name = stripTrailingAddress(name);

  // 3. Strip trailing city, state, zip
  name = stripTrailingCityState(name, parsedCity, parsedState);

  // 4. Remove duplicate words/segments
  name = deduplicateSegments(name);

  // 5. Clean up separators and whitespace
  name = name
    .replace(/[,\-–-|/]+\s*$/, "")   // trailing separators
    .replace(/^\s*[,\-–-|/]+/, "")   // leading separators
    .replace(/\s+/g, " ")
    .trim();

  // 6. If after cleaning the name is empty or too short, use fallback
  if (name.length < 3) {
    // Try to build from address + city as a compact label
    if (parsedAddress && parsedAddress !== "Unknown Address") {
      const shortAddr = shortenAddress(parsedAddress);
      if (parsedCity && parsedCity !== "Unknown City") {
        return `${shortAddr}, ${parsedCity}`;
      }
      return shortAddr;
    }
    return fallbackName || parsedName.trim();
  }

  return name;
}

/**
 * Clean an existing (already-stored) property name for display.
 *
 * Use this on the UI side to shorten names that were stored in the old
 * "Name - Address" format without needing to re-save to Firestore.
 */
export function cleanDisplayName(
  propertyName: string | null | undefined,
  address?: string | null,
  city?: string | null,
  state?: string | null,
): string {
  if (!propertyName) {
    // Fall back to short street address if we have one
    if (address) {
      const short = extractShortStreetAddress(address);
      if (short) return short;
    }
    return "Untitled Property";
  }

  let name = String(propertyName).trim();

  // 1. Split on em-dash - take the first meaningful part
  if (EM_DASH_SEP.test(name)) {
    const parts = name.split(EM_DASH_SEP);
    const firstPart = parts[0].trim();
    const secondPart = parts.slice(1).join(" ").trim();

    // Check if first part is the "real" name (not just an address number)
    if (firstPart.length > 2 && !/^\d+$/.test(firstPart)) {
      name = firstPart;
    } else if (secondPart.length > 2) {
      // If first part is just a number, second part might be better
      name = secondPart;
    }
  }

  // 2. If the name contains the full address, strip it
  if (address && address.length > 5) {
    const addrLower = address.toLowerCase().trim();
    const nameLower = name.toLowerCase();
    if (nameLower.includes(addrLower)) {
      name = name.replace(new RegExp(escapeRegex(address), "i"), "").trim();
    }
    // Also try the street number + name portion
    const streetMatch = address.match(/^(\d+\s+[\w\s]+?)(?:,|\s+(?:Suite|Ste|Unit|#))/i);
    if (streetMatch && nameLower.includes(streetMatch[1].toLowerCase())) {
      // Only strip if there's other content in the name
      const stripped = name.replace(new RegExp(escapeRegex(streetMatch[1]), "i"), "").trim();
      if (stripped.length > 2) name = stripped;
    }
  }

  // 3. Strip trailing city/state if name ends with it
  name = stripTrailingCityState(name, city, state);

  // 4. Strip trailing address patterns
  name = stripTrailingAddress(name);

  // 5. Deduplicate
  name = deduplicateSegments(name);

  // 6. Final cleanup
  name = name
    .replace(/[,\-–-|/]+\s*$/, "")
    .replace(/^\s*[,\-–-|/]+/, "")
    .replace(/\s+/g, " ")
    .trim();

  // 7. Fallback - if we stripped too much, return original first segment
  if (name.length < 3) {
    const firstSegment = propertyName.split(EM_DASH_SEP)[0].trim();
    return firstSegment || propertyName;
  }

  return name;
}

/* ── Internal helpers ────────────────────────────────────── */

function stripTrailingAddress(name: string): string {
  // Remove trailing street address pattern
  const match = name.match(ADDRESS_RE);
  if (match) {
    const idx = name.indexOf(match[0]);
    const before = name.slice(0, idx).trim();
    // Only strip if there's meaningful content before the address
    if (before.length > 2) {
      return before;
    }
  }
  return name;
}

function stripTrailingCityState(
  name: string,
  city?: string | null,
  state?: string | null,
): string {
  // Remove trailing "City, ST" or "City, ST 12345"
  if (city && city !== "Unknown City") {
    const cityPattern = new RegExp(
      `[,\\s\\-–-]*${escapeRegex(city)}[,\\s]*(?:${state || "[A-Z]{2}"})?[\\s]*\\d{0,5}\\s*$`,
      "i",
    );
    const stripped = name.replace(cityPattern, "").trim();
    if (stripped.length > 2) return stripped;
  }

  // Generic city-state-zip at end
  const genericCSZ = name.match(CITY_STATE_ZIP_RE);
  if (genericCSZ) {
    const idx = name.indexOf(genericCSZ[0]);
    const before = name.slice(0, idx).trim();
    if (before.length > 2) return before;
  }

  return name;
}

function deduplicateSegments(name: string): string {
  // Split into words, check for repeated consecutive segments
  const words = name.split(/\s+/);
  if (words.length < 4) return name;

  // Check for the name being "X Y Z X Y Z" style duplication
  const half = Math.floor(words.length / 2);
  for (let len = half; len >= 2; len--) {
    const first = words.slice(0, len).join(" ").toLowerCase();
    const second = words.slice(len, len * 2).join(" ").toLowerCase();
    if (first === second) {
      return words.slice(0, len).join(" ");
    }
  }

  return name;
}

/**
 * Extract a short street address suitable for use as a property name.
 *
 * Examples:
 *   "136 Commercial Avenue, Suite 200, Garden City, NY 11530" → "136 Commercial Ave"
 *   "1234 North Main Street" → "1234 N Main St"
 *   "4567 West Sunset Boulevard #5" → "4567 W Sunset Blvd"
 *
 * Strategy: take only the street-number + street-name portion (drop anything
 * after the first comma), strip suite/unit, abbreviate directions + street
 * types. Returns empty string if no recognizable street portion found.
 */
export function extractShortStreetAddress(
  address: string | null | undefined,
): string {
  if (!address) return "";
  let a = address.trim();
  if (!a || a.toLowerCase() === "unknown address") return "";

  // Drop everything after first comma (city/state/zip)
  const commaIdx = a.indexOf(",");
  if (commaIdx > 0) a = a.slice(0, commaIdx).trim();

  // Strip suite/unit/# that may appear without a comma
  a = a.replace(/\s+(?:Suite|Ste|Unit|#|Apt|Apartment)\s*\S+.*$/i, "").trim();

  // Must start with a street number
  if (!/^\d/.test(a)) {
    // Try to find the street number portion within the string
    const m = a.match(/\d{1,6}\s+(?:[NSEW]\.?\s+)?[\w\s]+?(?:St(?:reet)?|Ave(?:nue)?|Blvd|Boulevard|Dr(?:ive)?|Rd|Road|Ln|Lane|Way|Ct|Court|Cir(?:cle)?|Pl(?:ace)?|Pkwy|Parkway|Hwy|Highway|Pike|Trail|Tr)\b/i);
    if (m) a = m[0];
    else return "";
  }

  // Abbreviate directions + street types
  a = shortenAddress(a);

  // Collapse whitespace
  a = a.replace(/\s+/g, " ").trim();

  // Sanity: must contain at least a number + a word
  if (!/^\d+\s+\S/.test(a)) return "";
  return a;
}

export function shortenAddress(address: string): string {
  // "1234 North Main Street, Suite 100" → "1234 N Main St"
  return address
    .replace(/\bNorth\b/gi, "N")
    .replace(/\bSouth\b/gi, "S")
    .replace(/\bEast\b/gi, "E")
    .replace(/\bWest\b/gi, "W")
    .replace(/\bStreet\b/gi, "St")
    .replace(/\bAvenue\b/gi, "Ave")
    .replace(/\bBoulevard\b/gi, "Blvd")
    .replace(/\bDrive\b/gi, "Dr")
    .replace(/\bRoad\b/gi, "Rd")
    .replace(/\bLane\b/gi, "Ln")
    .replace(/\bParkway\b/gi, "Pkwy")
    .replace(/\bHighway\b/gi, "Hwy")
    .replace(/,?\s*(?:Suite|Ste|Unit|#)\s*\S+/gi, "")
    .trim();
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
