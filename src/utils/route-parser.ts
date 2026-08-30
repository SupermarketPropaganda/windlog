export interface ParsedToken {
  raw: string;
  identifier: string;
  altitudeOverride?: number; // in feet MSL (e.g. 4500)
}

/**
 * Parses an altitude string like "4500", "4.5K", "4K", "FL045", "FL45", "4500FT", "A045", "45"
 * Returns altitude in feet MSL, or undefined if invalid.
 */
export function parseAltitudeString(str: string): number | undefined {
  if (!str) return undefined;
  const clean = str.trim().toUpperCase();

  // Match FL045 / FL45 / A045 / A45
  const flMatch = clean.match(/^(?:FL|A)(\d{2,3})$/);
  if (flMatch) {
    return parseInt(flMatch[1], 10) * 100;
  }

  // Match 4.5K / 4K / 35K / 4.5
  const kMatch = clean.match(/^(\d+(?:\.\d+)?)\s*(?:K|THOUSAND)$/);
  if (kMatch) {
    return Math.round(parseFloat(kMatch[1]) * 1000);
  }

  // Match 4500FT / 3500FT
  const ftMatch = clean.match(/^(\d{3,5})\s*FT$/);
  if (ftMatch) {
    const val = parseInt(ftMatch[1], 10);
    return val <= 99 ? val * 100 : val;
  }

  // Match decimal thousands e.g. 4.5
  if (/^\d+\.\d+$/.test(clean)) {
    const val = parseFloat(clean);
    if (val >= 0.5 && val <= 99.0) {
      return Math.round(val * 1000);
    }
  }

  // Match pure numeric e.g. 4500, 3500, 99999, or 2-digit flight level 45 / 35
  const numMatch = clean.match(/^(\d{2,5})$/);
  if (numMatch) {
    const val = parseInt(numMatch[1], 10);
    // 2-digit numbers (e.g. 45 -> 4500 ft / FL45)
    if (val >= 10 && val <= 99) {
      return val * 100;
    }
    // Standard altitude in feet (e.g. 500 to 99999)
    if (val >= 500 && val <= 99999) {
      return val;
    }
  }

  return undefined;
}

/**
 * Parses a flight route scratchpad input into structured tokens and altitudes.
 * Examples:
 *   "LPCS COIMB/4500 LPCS/3500" -> LPCS (default alt), COIMB (4500ft), LPCS (3500ft)
 *   "LPCS FL045 COIMB FL035 LPCS" -> LPCS (4500ft), COIMB (3500ft), LPCS
 *   "LPCS 4.5K COIMB 3.5K LPCS"
 *   "LPCS@4500 COIMB@3500 LPCS"
 */
export function parseRouteString(input: string): ParsedToken[] {
  const rawTokens = input.trim().split(/\s+/).filter(Boolean);
  const items: ParsedToken[] = [];

  for (let i = 0; i < rawTokens.length; i++) {
    const raw = rawTokens[i];

    // Check if token has an empty trailing delimiter like LPCS/ or LPCS@
    const trailingDelimiterMatch = raw.match(/^([A-Za-z0-9\-_]+)[/@]$/);
    if (trailingDelimiterMatch) {
      items.push({
        raw,
        identifier: trailingDelimiterMatch[1].toUpperCase(),
        altitudeOverride: undefined,
      });
      continue;
    }

    // Check if token is a standalone altitude tag like FL045, FL35, 4500FT, 4.5K, 3500
    const standaloneAlt = parseAltitudeString(raw);
    const isExplicitAltTag = /^(?:FL|A|\d+K|\d+FT|\d+\.\d+K?)/i.test(raw) ||
      (standaloneAlt !== undefined && /^\d{4,5}$/.test(raw));

    if (isExplicitAltTag && standaloneAlt !== undefined) {
      if (items.length > 0) {
        // Attach to the preceding waypoint
        items[items.length - 1].altitudeOverride = standaloneAlt;
        continue;
      }
    }

    // Check if token has an inline altitude delimiter like COIMB/4500 or COIMB@3500 or COIMB/FL045
    const inlineDelimiterMatch = raw.match(/^([A-Za-z0-9\-_]+)[/@](.+)$/);
    if (inlineDelimiterMatch) {
      const ident = inlineDelimiterMatch[1].toUpperCase();
      const altStr = inlineDelimiterMatch[2];
      const parsedAlt = parseAltitudeString(altStr);

      items.push({
        raw,
        identifier: ident,
        altitudeOverride: parsedAlt,
      });
      continue;
    }

    items.push({
      raw,
      identifier: raw.toUpperCase(),
      altitudeOverride: undefined,
    });
  }

  return items;
}
