import { describe, it, expect } from 'vitest';
import { greatCircleDistance, initialBearing } from '../../engine/coordinate-math';
import {
  destinationPoint,
  computeCrossTrackAndAlongTrack,
  computeTrackVectorPoints,
  computeAltitudeCaptureArc,
  checkAutoLegSequencing,
  evaluateLookAheadAlerts,
  computeInFlightNavSolution,
  exportBreadcrumbsToGpx,
} from '../inflight-nav';
import { OwnshipTelemetry, BreadcrumbPoint } from '../types-plus';
import { NavLogSummary, Waypoint } from '../../types';

const LPCS: Waypoint = {
  id: 1,
  identifier: 'LPCS',
  name: 'Cascais Aerodrome',
  type: 'airport',
  latitude: 38.725,
  longitude: -9.355,
  elevation: 325,
  country: 'PT',
};

const LPSO: Waypoint = {
  id: 2,
  identifier: 'LPSO',
  name: 'Ponte de Sor Aerodrome',
  type: 'airport',
  latitude: 39.2116,
  longitude: -8.0575,
  elevation: 390,
  country: 'PT',
};

const LPEV: Waypoint = {
  id: 3,
  identifier: 'LPEV',
  name: 'Evora Aerodrome',
  type: 'airport',
  latitude: 38.5336,
  longitude: -7.8894,
  elevation: 807,
  country: 'PT',
};

const sampleNavLog: NavLogSummary = {
  legs: [
    {
      id: 'leg-0',
      from: LPCS,
      to: LPSO,
      altitude: 4500,
      trueTrack: 62,
      distance: 67.2,
      windCorrectionAngle: 0,
      trueHeading: 62,
      magneticVariation: -2,
      magneticHeading: 64,
      groundSpeed: 110,
      ete: 2196,
      fuelBurn: 5.2,
    },
    {
      id: 'leg-1',
      from: LPSO,
      to: LPEV,
      altitude: 3500,
      trueTrack: 169,
      distance: 41.4,
      windCorrectionAngle: 0,
      trueHeading: 169,
      magneticVariation: -2,
      magneticHeading: 171,
      groundSpeed: 110,
      ete: 1355,
      fuelBurn: 3.2,
    },
  ],
  totalDistance: 108.6,
  totalEte: 3551,
  totalFuel: 8.4,
  vfrDayReserveFuel: 4.3,
  vfrNightReserveFuel: 6.4,
  minFuelRequiredDay: 12.7,
  minFuelRequiredNight: 14.8,
};

function makeOwnship(overrides: Partial<OwnshipTelemetry> = {}): OwnshipTelemetry {
  return {
    timestamp: 1730000000000,
    latitude: 38.9,
    longitude: -8.8,
    rawGpsAltitudeFt: 3500,
    altimeterOffsetFt: 0,
    altitudeMslFt: 3500,
    groundSpeedKt: 110,
    trueTrackDeg: 62,
    magneticTrackDeg: 64,
    magneticVariationDeg: -2,
    verticalSpeedFpm: 500,
    horizontalAccuracyM: 8,
    verticalAccuracyM: 12,
    gpsQuality: 'HIGH',
    source: 'manual-test',
    flightPhase: 'AIRBORNE',
    ...overrides,
  };
}

describe('GustLog Plus — In-Flight Navigation Engine', () => {
  it('computes forward destination point accurately along a true bearing', () => {
    const startLat = 38.725;
    const startLon = -9.355;
    // Move 60 NM due North (000°T) -> ~1 degree of latitude
    const pt = destinationPoint(startLat, startLon, 0, 60);
    expect(pt.latitude).toBeCloseTo(39.725, 2);
    expect(pt.longitude).toBeCloseTo(-9.355, 3);
  });

  it('computes spherical Cross-Track Error (XTE) and Along-Track Distance (ATD)', () => {
    // Leg from (38.0, -9.0) due North to (39.0, -9.0)
    // Place aircraft slightly East (right of course) at (38.5, -8.9)
    const { crossTrackErrorNm, alongTrackDistanceNm, desiredTrackTrueDeg } =
      computeCrossTrackAndAlongTrack(38.0, -9.0, 39.0, -9.0, 38.5, -8.9);

    expect(desiredTrackTrueDeg).toBeCloseTo(0, 0);
    expect(alongTrackDistanceNm).toBeCloseTo(30, 0);
    // Right of course -> positive XTE
    expect(crossTrackErrorNm).toBeGreaterThan(3.5);
    expect(crossTrackErrorNm).toBeLessThan(5.5);
  });

  it('projects Track Vector ticks with predicted altitudes at +1m, +2m, +3m, and +5m', () => {
    const ticks = computeTrackVectorPoints(38.9, -8.8, 62, 120, 3000, 500, 5);
    expect(ticks).toHaveLength(4); // 1m, 2m, 3m, 5m
    expect(ticks[0].minutesAhead).toBe(1);
    expect(ticks[0].distanceNm).toBeCloseTo(2, 2);
    expect(ticks[0].predictedAltFt).toBe(3500);

    expect(ticks[3].minutesAhead).toBe(5);
    expect(ticks[3].distanceNm).toBeCloseTo(10, 2);
    expect(ticks[3].predictedAltFt).toBe(5500);
  });

  it('computes the ForeFlight-style Green Banana Altitude Capture Arc when climbing to target altitude', () => {
    // At 2,500 ft climbing at +500 fpm toward 4,500 ft (2,000 ft needed = 4 min at 120 kt = 8 NM ahead)
    const arc = computeAltitudeCaptureArc(38.9, -8.8, 62, 120, 2500, 4500, 500);
    expect(arc).not.toBeNull();
    expect(arc!.targetAltitudeFt).toBe(4500);
    expect(arc!.timeToCaptureSec).toBeCloseTo(240, 0);
    expect(arc!.distanceAheadNm).toBeCloseTo(8, 1);
    expect(arc!.arcCoords.length).toBeGreaterThan(5);

    // If vertical speed is moving away from target altitude, no arc should be rendered
    expect(computeAltitudeCaptureArc(38.9, -8.8, 62, 120, 2500, 4500, -400)).toBeNull();
  });

  it('triggers automatic leg sequencing when entering waypoint capture cylinder (0.85 NM)', () => {
    const shouldSeq = checkAutoLegSequencing(
      sampleNavLog.legs[0],
      true,
      66.8,
      0.1,
      0.4 // 0.4 NM from LPSO (< 0.85 NM threshold)
    );
    expect(shouldSeq).toBe(true);
  });

  it('computes complete In-Flight Nav Solution including Next Points and Direct-To (DCT) override', () => {
    const ownship = makeOwnship();
    const waypoints = [LPCS, LPSO, LPEV];

    const normalSolution = computeInFlightNavSolution({
      ownship,
      navLog: sampleNavLog,
      waypoints,
      activeLegIndex: 0,
      directToState: null,
      terrainProfile: null,
      lookAheadMinutes: 5,
      fuelRemainingGalOrL: 24,
      fuelFlowPerHour: 8.5,
    });

    expect(normalSolution.nextWaypoint?.identifier).toBe('LPSO');
    expect(normalSolution.nextPoints).toHaveLength(2);
    expect(normalSolution.nextPoints[0].waypoint.identifier).toBe('LPSO');
    expect(normalSolution.nextPoints[1].waypoint.identifier).toBe('LPEV');

    // Activate Direct-To LPEV
    const dctSolution = computeInFlightNavSolution({
      ownship,
      navLog: sampleNavLog,
      waypoints,
      activeLegIndex: 0,
      directToState: {
        targetWaypoint: LPEV,
        originLat: ownship.latitude,
        originLon: ownship.longitude,
        originAltFt: ownship.altitudeMslFt ?? 3500,
        activatedAt: Date.now(),
        targetWaypointRouteIndex: 2,
      },
      terrainProfile: null,
      lookAheadMinutes: 5,
    });

    expect(dctSolution.isDirectToActive).toBe(true);
    expect(dctSolution.nextWaypoint?.identifier).toBe('LPEV');
    expect(dctSolution.directToTarget?.identifier).toBe('LPEV');
  });

  it('generates visual-only Look-Ahead Alerts for terrain proximity and degraded GPS', () => {
    const lowOwnship = makeOwnship({
      altitudeMslFt: 550, // Over terrain (nearest waypoint elevation 325-390 ft -> ~160-225 ft AGL)
      groundSpeedKt: 100,
      gpsQuality: 'DEGRADED',
      source: 'gps',
      horizontalAccuracyM: 85,
    });

    const alerts = evaluateLookAheadAlerts(
      lowOwnship,
      [LPCS, LPSO, LPEV],
      25,
      null
    );
    expect(alerts.some((a) => a.category === 'GPS_INTEGRITY')).toBe(true);
    expect(alerts.some((a) => a.category === 'TERRAIN')).toBe(true);
  });

  it('exports recorded breadcrumbs to valid GPX 1.1 XML format', () => {
    const trail: BreadcrumbPoint[] = [
      {
        latitude: 38.725,
        longitude: -9.355,
        altitudeFt: 1200,
        groundSpeedKt: 95,
        trackDeg: 62,
        timestamp: 1730000000000,
      },
      {
        latitude: 38.75,
        longitude: -9.31,
        altitudeFt: 1800,
        groundSpeedKt: 105,
        trackDeg: 63,
        timestamp: 1730000060000,
      },
    ];

    const gpx = exportBreadcrumbsToGpx(trail, 'LPCS - LPEV');
    expect(gpx).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(gpx).toContain('<gpx version="1.1" creator="GustLog Plus EFB"');
    expect(gpx).toContain('<trkpt lat="38.725000" lon="-9.355000">');
    expect(gpx).toContain('<ele>365.8</ele>');
  });

  it('computes perpendicular closestPointOnCourse and interceptHeadingMagDeg when off-track', () => {
    const waypoints = [LPCS, LPSO, LPEV];
    const brg = initialBearing(LPCS.latitude, LPCS.longitude, LPSO.latitude, LPSO.longitude);
    const alongPt = destinationPoint(LPCS.latitude, LPCS.longitude, brg, 15);
    const offTrackRightPt = destinationPoint(
      alongPt.latitude,
      alongPt.longitude,
      (brg + 90) % 360,
      1.8
    );

    const offTrackOwnship = makeOwnship({
      latitude: offTrackRightPt.latitude,
      longitude: offTrackRightPt.longitude,
      trueTrackDeg: Math.round(brg),
    });

    const sol = computeInFlightNavSolution({
      ownship: offTrackOwnship,
      navLog: sampleNavLog,
      waypoints,
      activeLegIndex: 0,
      directToState: null,
      terrainProfile: null,
      lookAheadMinutes: 5,
    });

    expect(sol.crossTrackErrorNm).toBeGreaterThan(1.5);
    expect(sol.closestPointOnCourse).not.toBeNull();
    expect(sol.interceptHeadingMagDeg).not.toBeNull();
    // Closest point on course should be approximately 1.8 NM from off-track aircraft
    const distBackToCourse = greatCircleDistance(
      offTrackOwnship.latitude,
      offTrackOwnship.longitude,
      sol.closestPointOnCourse![0],
      sol.closestPointOnCourse![1]
    );
    expect(distBackToCourse).toBeCloseTo(1.8, 1);
  });

  it('computes wind- and AGL-adjusted 36-ray Best-Glide Advisor Range Polygon', () => {
    const ownshipAt4500Ft = makeOwnship({
      altitudeMslFt: 4500,
    });
    const sol = computeInFlightNavSolution({
      ownship: ownshipAt4500Ft,
      navLog: sampleNavLog,
      waypoints: [LPCS, LPSO, LPEV],
      activeLegIndex: 0,
      directToState: null,
      terrainProfile: null,
      lookAheadMinutes: 5,
    });

    expect(sol.glideRangePolygon.length).toBeGreaterThanOrEqual(36);
    expect(sol.avgGlideDistanceNm).toBeGreaterThan(2);
  });
});
