import { destinationPoint } from '../inflight-nav';

export interface TrafficCircuitGeometry {
  airportIcao: string;
  airportName: string;
  runwayDesignator: string;
  runwayHeadingMag: number;
  patternDirection: 'LEFT' | 'RIGHT';
  patternAltMslFt: number;
  patternAltAglFt: number;
  // Waypoints for circuit polygon: Threshold -> Departure -> Upwind -> Crosswind -> Downwind Midpoint -> Downwind End -> Base -> Final -> Threshold
  circuitCoordinates: [number, number][]; // [lat, lon][]
  downwindMidpoint: [number, number];
  entryVectorCoordinates: [number, number][]; // [entryStart, downwindMidpoint]
  downwindHeadingMag: number;
  baseHeadingMag: number;
  finalHeadingMag: number;
}

/**
 * Computes standard ICAO/FAA VFR traffic circuit geometry for a specified runway.
 *
 * Pattern components:
 * - Upwind leg: Extends ~1.0 NM past departure threshold.
 * - Crosswind leg: Turns 90° into pattern, extends 1.0 NM lateral offset.
 * - Downwind leg: Parallel to runway, 1.0 NM offset, 1,000 FT AGL.
 * - Base leg: Turns 90° towards final.
 * - Final leg: 1.5 NM aligned with runway centerline.
 * - 45° Downwind Entry Vector: FAA/ICAO standard 45° entry into midfield downwind.
 */
export function computeTrafficCircuitPattern(
  airportLat: number,
  airportLon: number,
  runwayHeadingMag: number,
  runwayDesignator: string,
  fieldElevFt: number,
  patternDirection: 'LEFT' | 'RIGHT' = 'LEFT',
  runwayLengthMeters: number = 1500,
  patternAltAglFt: number = 1000
): TrafficCircuitGeometry {
  const runwayHeading = ((runwayHeadingMag % 360) + 360) % 360;
  const reciprocalHeading = (runwayHeading + 180) % 360;
  const patternAltMslFt = Math.round(fieldElevFt + patternAltAglFt);

  // Turn sign: Left turn is -90°, Right turn is +90°
  const turnSign = patternDirection === 'LEFT' ? -1 : 1;
  const crosswindHeading = (runwayHeading + turnSign * 90 + 360) % 360;
  const downwindHeading = reciprocalHeading;
  const baseHeading = (downwindHeading + turnSign * 90 + 360) % 360;
  const finalHeading = runwayHeading;

  // Distances in NM
  const halfRwyNm = Math.max(0.2, (runwayLengthMeters / 1852) / 2);
  const departureThreshold = destinationPoint(airportLat, airportLon, runwayHeading, halfRwyNm);
  const landingThreshold = destinationPoint(airportLat, airportLon, reciprocalHeading, halfRwyNm);

  // Crosswind offset: 1.0 NM from runway centerline
  const lateralOffsetNm = 1.0;
  // Upwind extends ~1.0 NM past departure threshold
  const upwindExtensionNm = 1.0;
  const upwindEnd = destinationPoint(
    departureThreshold.latitude,
    departureThreshold.longitude,
    runwayHeading,
    upwindExtensionNm
  );

  // Crosswind turn point: 1.0 NM out from upwind end along crosswind heading
  const crosswindEnd = destinationPoint(
    upwindEnd.latitude,
    upwindEnd.longitude,
    crosswindHeading,
    lateralOffsetNm
  );

  // Downwind midpoint: parallel to runway center, offset by lateralOffsetNm
  const downwindMid = destinationPoint(
    airportLat,
    airportLon,
    crosswindHeading,
    lateralOffsetNm
  );

  // Downwind end (base turn point): ~1.2 NM past landing threshold
  const downwindEnd = destinationPoint(
    landingThreshold.latitude,
    landingThreshold.longitude,
    crosswindHeading,
    lateralOffsetNm
  );
  const baseTurnPoint = destinationPoint(
    downwindEnd.latitude,
    downwindEnd.longitude,
    downwindHeading,
    1.2
  );

  // Base-to-final turn point: 1.5 NM out on extended centerline
  const finalInterceptPoint = destinationPoint(
    landingThreshold.latitude,
    landingThreshold.longitude,
    reciprocalHeading,
    1.5
  );

  // 45° entry vector: points to downwindMid from the outside
  // Entry angle is 45° relative to downwind track (from outside pattern)
  const entryBearing = (downwindHeading + turnSign * 45 + 360) % 360;
  const entryStart = destinationPoint(
    downwindMid.latitude,
    downwindMid.longitude,
    (entryBearing + 180) % 360,
    1.8
  );

  const circuitCoordinates: [number, number][] = [
    [landingThreshold.latitude, landingThreshold.longitude],
    [departureThreshold.latitude, departureThreshold.longitude],
    [upwindEnd.latitude, upwindEnd.longitude],
    [crosswindEnd.latitude, crosswindEnd.longitude],
    [downwindMid.latitude, downwindMid.longitude],
    [baseTurnPoint.latitude, baseTurnPoint.longitude],
    [finalInterceptPoint.latitude, finalInterceptPoint.longitude],
    [landingThreshold.latitude, landingThreshold.longitude],
  ];

  return {
    airportIcao: '',
    airportName: '',
    runwayDesignator,
    runwayHeadingMag: runwayHeading,
    patternDirection,
    patternAltMslFt,
    patternAltAglFt,
    circuitCoordinates,
    downwindMidpoint: [downwindMid.latitude, downwindMid.longitude],
    entryVectorCoordinates: [
      [entryStart.latitude, entryStart.longitude],
      [downwindMid.latitude, downwindMid.longitude],
    ],
    downwindHeadingMag: downwindHeading,
    baseHeadingMag: baseHeading,
    finalHeadingMag: finalHeading,
  };
}
