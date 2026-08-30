import { WMM2025_COEFFS } from './wmm2025_coeffs';

const globe = {
  a: 6378.137, // WGS84 semi-major axis (km)
  b: 6356.7523142, // WGS84 semi-minor axis (km)
  r0: 6371.2, // Reference radius (km)
};

const deg2rad = (deg: number) => deg * 0.017453292519943295;
const rad2deg = (rad: number) => rad * 57.29577951308232;

// Matrices for WMM2025 coefficients
const gnmWmm2025: number[][] = Array(13).fill(0).map(() => Array(13).fill(0));
const hnmWmm2025: number[][] = Array(13).fill(0).map(() => Array(13).fill(0));
const gtnmWmm2025: number[][] = Array(13).fill(0).map(() => Array(13).fill(0));
const htnmWmm2025: number[][] = Array(13).fill(0).map(() => Array(13).fill(0));

// Preload 2025 coefficients
for (const row of WMM2025_COEFFS) {
  const n = row[0];
  const m = row[1];
  if (n <= 12 && m <= 12) {
    gnmWmm2025[n][m] = row[2];
    hnmWmm2025[n][m] = row[3];
    gtnmWmm2025[n][m] = row[4];
    htnmWmm2025[n][m] = row[5];
  }
}

// Precompute Schmidt quasi-normalisation recurrence root factors
const root: number[] = Array(13).fill(0);
const roots: number[][][] = Array(13).fill(0).map(() => Array(13).fill(0).map(() => [0, 0]));

for (let n = 2; n <= 12; n++) {
  root[n] = Math.sqrt((2.0 * n - 1) / (2.0 * n));
}

for (let m = 0; m <= 12; m++) {
  const mm = m * m;
  for (let n = Math.max(m + 1, 2); n <= 12; n++) {
    roots[m][n][0] = Math.sqrt((n - 1) * (n - 1) - mm);
    roots[m][n][1] = 1.0 / Math.sqrt(n * n - mm);
  }
}

/**
 * Computes exact continuous decimal year according to NOAA standards (e.g. 2026.15),
 * accurately accounting for leap years without boundary discontinuities.
 */
function getDecimalYear(date: Date): number {
  const year = date.getUTCFullYear();
  const startOfYear = Date.UTC(year, 0, 1);
  const startOfNextYear = Date.UTC(year + 1, 0, 1);
  const yearLength = startOfNextYear - startOfYear;
  const progress = date.getTime() - startOfYear;
  return year + progress / yearLength;
}

/**
 * Calculates the exact magnetic declination (variation) in degrees
 * using the official World Magnetic Model 2025 (WMM2025).
 * 
 * Positive = East (+E)
 * Negative = West (-W)
 * 
 * @param latitude Latitude in decimal degrees (-90 to +90)
 * @param longitude Longitude in decimal degrees (-180 to +180)
 * @param altitudeFeet Altitude in feet MSL (defaults to 0)
 * @param date Target date (defaults to current date)
 * @returns Magnetic declination in degrees (+ East, - West)
 */
export function magneticDeclination(
  latitude: number,
  longitude: number,
  altitudeFeet: number = 0,
  date: Date = new Date()
): number {
  const clampedLat = Math.max(-89.999, Math.min(89.999, latitude));
  const altitudeKm = altitudeFeet * 0.0003048;

  const cosLat = Math.cos(deg2rad(clampedLat));
  const sinLat = Math.sin(deg2rad(clampedLat));

  const sr = Math.sqrt(
    Math.pow(globe.a, 2) * Math.pow(cosLat, 2) +
    Math.pow(globe.b, 2) * Math.pow(sinLat, 2)
  );

  const theta = Math.atan2(
    cosLat * (altitudeKm * sr + Math.pow(globe.a, 2)),
    sinLat * (altitudeKm * sr + Math.pow(globe.b, 2))
  );

  const r = Math.sqrt(
    Math.pow(altitudeKm, 2) +
    2 * altitudeKm * sr +
    (Math.pow(globe.a, 4) - (Math.pow(globe.a, 4) - Math.pow(globe.b, 4)) * Math.pow(sinLat, 2)) /
    (Math.pow(globe.a, 2) - (Math.pow(globe.a, 2) - Math.pow(globe.b, 2)) * Math.pow(sinLat, 2))
  );

  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const invS = 1 / (s + (s === 0 ? 1e-8 : 0));

  const P: number[][] = Array(13).fill(0).map(() => Array(13).fill(0));
  const DP: number[][] = Array(13).fill(0).map(() => Array(13).fill(0));

  P[0][0] = 1;
  P[1][1] = s;
  P[1][0] = c;
  DP[1][0] = -s;
  DP[1][1] = c;

  for (let n = 2; n <= 12; n++) {
    P[n][n] = P[n - 1][n - 1] * s * root[n];
    DP[n][n] = (DP[n - 1][n - 1] * s + P[n - 1][n - 1] * c) * root[n];
  }

  for (let m = 0; m <= 12; m++) {
    for (let n = Math.max(m + 1, 2); n <= 12; n++) {
      P[n][m] = (P[n - 1][m] * c * (2 * n - 1) - P[n - 2][m] * roots[m][n][0]) * roots[m][n][1];
      DP[n][m] = ((DP[n - 1][m] * c - P[n - 1][m] * s) * (2 * n - 1) - DP[n - 2][m] * roots[m][n][0]) * roots[m][n][1];
    }
  }

  // Exact continuous decimal year offset from 2025.0
  const decYear = getDecimalYear(date);
  const julianYears = decYear - 2025.0;

  const gnm: number[][] = Array(13).fill(0).map(() => Array(13).fill(0));
  const hnm: number[][] = Array(13).fill(0).map(() => Array(13).fill(0));

  for (let n = 1; n <= 12; n++) {
    for (let m = 0; m <= 12; m++) {
      gnm[n][m] = gnmWmm2025[n][m] + julianYears * gtnmWmm2025[n][m];
      hnm[n][m] = hnmWmm2025[n][m] + julianYears * htnmWmm2025[n][m];
    }
  }

  const sm: number[] = Array(13).fill(0);
  const cm: number[] = Array(13).fill(0);

  for (let m = 0; m <= 12; m++) {
    sm[m] = Math.sin(m * deg2rad(longitude));
    cm[m] = Math.cos(m * deg2rad(longitude));
  }

  let BR = 0.0;
  let BTheta = 0.0;
  let BPhi = 0.0;
  const fn0 = globe.r0 / r;
  let fn = Math.pow(fn0, 2);

  for (let n = 1; n <= 12; n++) {
    let c1n = 0;
    let c2n = 0;
    let c3n = 0;
    for (let m = 0; m <= n; m++) {
      const tmp = gnm[n][m] * cm[m] + hnm[n][m] * sm[m];
      c1n += tmp * P[n][m];
      c2n += tmp * DP[n][m];
      c3n += m * (gnm[n][m] * sm[m] - hnm[n][m] * cm[m]) * P[n][m];
    }
    fn *= fn0;
    BR += (n + 1) * c1n * fn;
    BTheta -= c2n * fn;
    BPhi += c3n * fn * invS;
  }

  const psi = theta - (Math.PI / 2 - deg2rad(clampedLat));
  const sinPsi = Math.sin(psi);
  const cosPsi = Math.cos(psi);
  const X = -BTheta * cosPsi - BR * sinPsi;
  const Y = BPhi;

  return X !== 0 || Y !== 0 ? rad2deg(Math.atan2(Y, X)) : 0;
}
