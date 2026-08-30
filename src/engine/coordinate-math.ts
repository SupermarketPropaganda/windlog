export function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Calculates the great circle distance between two points in nautical miles.
 * Uses the Haversine formula with safe floating point clamping [0, 1] to prevent NaN at antipodal points.
 */
export function greatCircleDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3440.065; // Earth radius in nautical miles
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  // Clamp 'a' to [0, 1] to prevent floating point inaccuracy producing NaN at antipodal coordinates
  const clampedA = Math.max(0, Math.min(1, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));

  return R * c;
}

/**
 * Calculates the initial true bearing (forward azimuth) from point 1 to point 2.
 * Returns bearing in degrees [0, 360).
 */
export function initialBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (lat1 === lat2 && lon1 === lon2) return 0;

  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const dLambda = toRadians(lon2 - lon1);

  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);

  const theta = Math.atan2(y, x);
  return (toDegrees(theta) + 360) % 360;
}

/**
 * Computes the exact great-circle midpoint (or fraction f) between two coordinates,
 * handling anti-meridian crossings (180° / -180°) and polar routes accurately.
 * @param lat1 Latitude of point 1 in degrees
 * @param lon1 Longitude of point 1 in degrees
 * @param lat2 Latitude of point 2 in degrees
 * @param lon2 Longitude of point 2 in degrees
 * @param f Fraction along great circle (0 = point 1, 0.5 = midpoint, 1 = point 2)
 */
export function intermediatePoint(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  f: number = 0.5
): { latitude: number; longitude: number } {
  const phi1 = toRadians(lat1);
  const lambda1 = toRadians(lon1);
  const phi2 = toRadians(lat2);
  const lambda2 = toRadians(lon2);

  const d = greatCircleDistance(lat1, lon1, lat2, lon2) / 3440.065; // angular distance in radians
  if (d === 0 || Math.abs(d) < 1e-10) {
    return { latitude: lat1, longitude: lon1 };
  }

  const a = Math.sin((1 - f) * d) / Math.sin(d);
  const b = Math.sin(f * d) / Math.sin(d);

  const x = a * Math.cos(phi1) * Math.cos(lambda1) + b * Math.cos(phi2) * Math.cos(lambda2);
  const y = a * Math.cos(phi1) * Math.sin(lambda1) + b * Math.cos(phi2) * Math.sin(lambda2);
  const z = a * Math.sin(phi1) + b * Math.sin(phi2);

  const phi3 = Math.atan2(z, Math.sqrt(x * x + y * y));
  const lambda3 = Math.atan2(y, x);

  return {
    latitude: toDegrees(phi3),
    longitude: toDegrees(lambda3),
  };
}
