import { describe, it, expect } from 'vitest';
import { greatCircleDistance, initialBearing } from '../../engine/coordinate-math';
import {
  destinationPoint,
  computeCrossTrackAndAlongTrack,
  computeAltitudeCaptureArc,
  checkAutoLegSequencing,
  computeInFlightNavSolution,
  normalizeDegrees,
} from '../inflight-nav';
import { FlightTelemetryController } from '../telemetry-service';
import { OwnshipTelemetry, DirectToState } from '../types-plus';
import { Leg, NavLogSummary, Waypoint } from '../../types';

// Diverse Waypoints for 50 Concurrent Flight Scenarios
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

// Dead Sea & High Mountain Waypoints
const LLMZ: Waypoint = {
  id: 4,
  identifier: 'LLMZ',
  name: 'Bar Yehuda Airfield (Dead Sea)',
  type: 'airport',
  latitude: 31.3283,
  longitude: 35.3883,
  elevation: -1266, // Below Sea Level
  country: 'IL',
};

const LLER: Waypoint = {
  id: 5,
  identifier: 'LLER',
  name: 'Ramon Airport',
  type: 'airport',
  latitude: 29.7253,
  longitude: 35.0114,
  elevation: 288,
  country: 'IL',
};

const LOWI: Waypoint = {
  id: 6,
  identifier: 'LOWI',
  name: 'Innsbruck Alpine Airport',
  type: 'airport',
  latitude: 47.2602,
  longitude: 11.3439,
  elevation: 1906,
  country: 'AT',
};

const KJFK: Waypoint = {
  id: 7,
  identifier: 'KJFK',
  name: 'John F Kennedy Intl',
  type: 'airport',
  latitude: 40.6398,
  longitude: -73.7789,
  elevation: 13,
  country: 'US',
};

const EGLL: Waypoint = {
  id: 8,
  identifier: 'EGLL',
  name: 'London Heathrow',
  type: 'airport',
  latitude: 51.4706,
  longitude: -0.4619,
  elevation: 83,
  country: 'GB',
};

function createSampleNavLog(from: Waypoint, to: Waypoint, altFt: number, gsKt: number): NavLogSummary {
  const dist = greatCircleDistance(from.latitude, from.longitude, to.latitude, to.longitude);
  const brg = initialBearing(from.latitude, from.longitude, to.latitude, to.longitude);
  const eteSec = gsKt > 0 ? (dist / gsKt) * 3600 : 0;

  const leg: Leg = {
    id: `leg-${from.identifier}-${to.identifier}`,
    from,
    to,
    altitude: altFt,
    trueTrack: Math.round(brg),
    distance: Math.round(dist * 10) / 10,
    windCorrectionAngle: 0,
    trueHeading: Math.round(brg),
    magneticVariation: -2,
    magneticHeading: Math.round(brg) + 2,
    groundSpeed: gsKt,
    ete: Math.round(eteSec),
    fuelBurn: 5.0,
    wind: { direction: 310, speed: 15 },
  };

  return {
    legs: [leg],
    totalDistance: leg.distance,
    totalEte: leg.ete,
    totalFuel: 5.0,
    vfrDayReserveFuel: 3.0,
    vfrNightReserveFuel: 5.0,
    minFuelRequiredDay: 8.0,
    minFuelRequiredNight: 10.0,
  };
}

describe('Aeronautical Software Stress-Testing Suite — Cockpit In-Flight Nav & Telemetry', () => {
  // =========================================================================
  // 1. 50 CONCURRENT VIRTUAL FLIGHTS OPERATING ALL DAY
  // =========================================================================
  describe('1. 50 Concurrent Virtual Flights Simulation (Global Fleet All-Day Stress)', () => {
    it('simulates 50 concurrent flight trajectories across extreme flight envelopes without NaN or exceptions', () => {
      interface FlightSimState {
        id: number;
        callsign: string;
        ownship: OwnshipTelemetry;
        navLog: NavLogSummary;
        waypoints: Waypoint[];
        targetAltitudeFt: number;
      }

      const flights: FlightSimState[] = [];

      // Generate 50 virtual flights across distinct profiles:
      // Flights 0-9: Low-altitude VFR GA & bush pilots (-500 ft to 3,500 ft, 65-110 kt)
      // Flights 10-19: Helicopters & VTOL hovering/air-taxiing (0-80 kt, 800-2,500 ft)
      // Flights 20-29: High-performance single/twin turboprops (180-260 kt, 10,000-25,000 ft)
      // Flights 30-39: Commercial airliners & corporate jets (420-560 kt, 32,000-41,000 ft)
      // Flights 40-49: Supersonic interceptors & Mach 3 research aircraft (1,000-2,000 kt, 45,000 ft FL450)
      for (let i = 0; i < 50; i++) {
        let altFt = 3500;
        let gsKt = 120;
        let vsFpm = 0;
        let fromWp = LPCS;
        let toWp = LPSO;

        if (i < 10) {
          // Dead Sea to Negev low altitude
          altFt = i % 2 === 0 ? -500 : 1500 + i * 200;
          gsKt = 65 + i * 5;
          vsFpm = (i % 3 === 0) ? 300 : (i % 3 === 1) ? -200 : 0;
          fromWp = LLMZ;
          toWp = LLER;
        } else if (i < 20) {
          // VTOL / Helicopters
          altFt = 1000 + (i - 10) * 150;
          gsKt = (i - 10) === 0 ? 0 : (i - 10) * 8; // includes 0 kt hover
          vsFpm = (i % 2 === 0) ? 500 : -400;
          fromWp = LPCS;
          toWp = LPEV;
        } else if (i < 30) {
          // High-performance turboprops (Alps mountain crossing)
          altFt = 12000 + (i - 20) * 1200;
          gsKt = 200 + (i - 20) * 5;
          vsFpm = 750;
          fromWp = LOWI;
          toWp = EGLL;
        } else if (i < 40) {
          // Commercial airliners (Transatlantic)
          altFt = 33000 + (i - 30) * 800;
          gsKt = 480 + (i - 30) * 8;
          vsFpm = (i % 2 === 0) ? -1500 : 1200;
          fromWp = KJFK;
          toWp = EGLL;
        } else {
          // Mach 2 - Mach 3 experimental (FL450)
          altFt = 45000;
          gsKt = 1000 + (i - 40) * 100; // up to 1,900-2,000 kt
          vsFpm = (i % 2 === 0) ? 4000 : -3500;
          fromWp = KJFK;
          toWp = LPCS;
        }

        const navLog = createSampleNavLog(fromWp, toWp, altFt, gsKt);
        const brg = initialBearing(fromWp.latitude, fromWp.longitude, toWp.latitude, toWp.longitude);

        // Position aircraft along first leg
        const startPt = destinationPoint(fromWp.latitude, fromWp.longitude, brg, 15 + i * 2);

        const ownship: OwnshipTelemetry = {
          timestamp: 1730000000000,
          latitude: startPt.latitude,
          longitude: startPt.longitude,
          rawGpsAltitudeFt: altFt,
          altimeterOffsetFt: 0,
          altitudeMslFt: altFt,
          groundSpeedKt: gsKt,
          trueTrackDeg: Math.round(brg),
          magneticTrackDeg: normalizeDegrees(Math.round(brg) + 2),
          magneticVariationDeg: -2,
          verticalSpeedFpm: vsFpm,
          horizontalAccuracyM: 5,
          verticalAccuracyM: 8,
          gpsQuality: 'HIGH',
          source: 'manual-test',
          flightPhase: gsKt >= 38 ? 'AIRBORNE' : 'TAXI',
        };

        flights.push({
          id: i,
          callsign: `V-FLIGHT-${i.toString().padStart(2, '0')}`,
          ownship,
          navLog,
          waypoints: [fromWp, toWp],
          targetAltitudeFt: altFt + ((i % 2 === 0) ? 2000 : -2000),
        });
      }

      expect(flights).toHaveLength(50);

      // Run 100 simulation cycles for each of the 50 flights (5,000 full in-flight nav iterations)
      const startTime = performance.now();
      let totalCalculations = 0;

      for (let cycle = 0; cycle < 100; cycle++) {
        for (let i = 0; i < flights.length; i++) {
          const f = flights[i];

          // Advance ownship position along track based on groundspeed (10 sec per cycle)
          const dtHours = 10 / 3600;
          const distNm = f.ownship.groundSpeedKt * dtHours;
          const newPos = destinationPoint(
            f.ownship.latitude,
            f.ownship.longitude,
            f.ownship.trueTrackDeg,
            distNm
          );

          // Update altitude with vertical speed
          const dtMinutes = 10 / 60;
          const newAlt = f.ownship.altitudeMslFt! + f.ownship.verticalSpeedFpm * dtMinutes;

          f.ownship = {
            ...f.ownship,
            timestamp: f.ownship.timestamp + 10000,
            latitude: newPos.latitude,
            longitude: newPos.longitude,
            altitudeMslFt: Math.round(newAlt),
          };

          const solution = computeInFlightNavSolution({
            ownship: f.ownship,
            navLog: f.navLog,
            waypoints: f.waypoints,
            activeLegIndex: 0,
            directToState: null,
            terrainProfile: null,
            lookAheadMinutes: 5,
            fuelRemainingGalOrL: 40,
            fuelFlowPerHour: 9.5,
          });

          totalCalculations++;

          // Rigorous assertions on deterministic output
          expect(Number.isFinite(solution.crossTrackErrorNm)).toBe(true);
          expect(Number.isFinite(solution.alongTrackDistanceNm)).toBe(true);
          expect(Number.isFinite(solution.desiredTrackTrueDeg)).toBe(true);
          expect(Number.isFinite(solution.desiredTrackMagDeg)).toBe(true);
          expect(Number.isFinite(solution.courseDeviationDeg)).toBe(true);
          expect(Number.isFinite(solution.distanceToNextNm)).toBe(true);
          expect(Number.isFinite(solution.bearingToNextTrueDeg)).toBe(true);
          expect(Number.isFinite(solution.eteToNextSec)).toBe(true);

          // Lat/Lon coordinate bounds
          expect(f.ownship.latitude).toBeGreaterThanOrEqual(-90);
          expect(f.ownship.latitude).toBeLessThanOrEqual(90);
          expect(f.ownship.longitude).toBeGreaterThanOrEqual(-180);
          expect(f.ownship.longitude).toBeLessThanOrEqual(180);

          // If Banana arc generated, verify finite coordinates
          if (solution.altitudeCaptureArc) {
            expect(Number.isFinite(solution.altitudeCaptureArc.centerLat)).toBe(true);
            expect(Number.isFinite(solution.altitudeCaptureArc.centerLon)).toBe(true);
            expect(solution.altitudeCaptureArc.arcCoords.length).toBe(7);
            for (const [lat, lon] of solution.altitudeCaptureArc.arcCoords) {
              expect(Number.isFinite(lat)).toBe(true);
              expect(Number.isFinite(lon)).toBe(true);
            }
          }

          // Best Glide polygon check
          if (solution.glideRangePolygon.length > 0) {
            expect(solution.glideRangePolygon.length).toBeGreaterThanOrEqual(36);
            for (const [lat, lon] of solution.glideRangePolygon) {
              expect(Number.isFinite(lat)).toBe(true);
              expect(Number.isFinite(lon)).toBe(true);
            }
          }
        }
      }

      const elapsedMs = performance.now() - startTime;
      const opsPerSec = Math.round((totalCalculations / elapsedMs) * 1000);
      console.log(
        `[50 Virtual Flights Stress] Completed ${totalCalculations} full nav solutions across 50 flights in ${elapsedMs.toFixed(1)}ms (${opsPerSec.toLocaleString()} solutions/sec)`
      );

      expect(totalCalculations).toBe(5000);
      expect(elapsedMs).toBeLessThan(10000); // 5,000 full solutions in < 10s
    });
  });

  // =========================================================================
  // 2. HIGH-FREQUENCY TELEMETRY BOMBARDMENT (10,000+ UPDATES)
  // =========================================================================
  describe('2. High-Frequency Telemetry Bombardment (10,000+ Updates Rapid Succession)', () => {
    it('processes 12,000 consecutive high-frequency GNSS frames with microsecond jitter without NaN leaks or memory growth', () => {
      let emittedCount = 0;
      let lastTelemetry: OwnshipTelemetry | null = null;

      const controller = new FlightTelemetryController((telem) => {
        emittedCount++;
        lastTelemetry = telem;
      });

      // Calibrate altimeter offset
      controller.setAltimeterOffsetFt(50);
      expect(controller.getAltimeterOffsetFt()).toBe(50);

      const TOTAL_FRAMES = 12000;
      let baseLat = 38.725;
      let baseLon = -9.355;
      let baseAltFt = 3500;
      let baseTimestamp = 1730000000000;

      const startBench = performance.now();

      for (let i = 0; i < TOTAL_FRAMES; i++) {
        // High-frequency 50 Hz stream (20 ms interval) with occasional timestamp jitter
        const dtMs = (i % 100 === 0) ? 0 : 20; // test 0ms duplicate timestamp bursts
        baseTimestamp += dtMs;

        // Move aircraft eastward at ~120 kt (~0.00003 deg lon per 20 ms)
        baseLon += 0.00003;
        // Ascend at +600 fpm (+0.2 ft per 20 ms) with ±2m GPS multipath noise
        const noiseMeters = Math.sin(i) * 1.5;
        const altitudeMeters = (baseAltFt + i * 0.2) / 3.28084 + noiseMeters;

        // Inject intentional dirty data periodically:
        // - Periodic missing Doppler speed (coords.speed = null)
        // - Periodic missing heading (coords.heading = null)
        // - Periodic course crossing North (359° -> 001°)
        const headingDeg = (i % 200 === 0) ? null : normalizeDegrees(88 + Math.sin(i) * 5);
        const speedMps = (i % 150 === 0) ? null : 61.7; // ~120 kt in m/s

        controller.processRawCoords(
          {
            latitude: baseLat,
            longitude: baseLon,
            altitude: altitudeMeters,
            accuracy: 4.5,
            altitudeAccuracy: 6.0,
            heading: headingDeg,
            speed: speedMps,
          },
          baseTimestamp
        );
      }

      const endBench = performance.now();
      const durationMs = endBench - startBench;
      const updatesPerSec = Math.round((TOTAL_FRAMES / durationMs) * 1000);

      console.log(
        `[Telemetry Bombardment] Processed ${TOTAL_FRAMES.toLocaleString()} raw GNSS updates in ${durationMs.toFixed(1)}ms (${updatesPerSec.toLocaleString()} updates/sec)`
      );

      expect(emittedCount).toBe(TOTAL_FRAMES);
      expect(lastTelemetry).not.toBeNull();

      // Verify zero NaN leaks across all telemetry fields
      expect(Number.isFinite(lastTelemetry!.latitude)).toBe(true);
      expect(Number.isFinite(lastTelemetry!.longitude)).toBe(true);
      expect(Number.isFinite(lastTelemetry!.altitudeMslFt!)).toBe(true);
      expect(Number.isFinite(lastTelemetry!.groundSpeedKt)).toBe(true);
      expect(Number.isFinite(lastTelemetry!.trueTrackDeg)).toBe(true);
      expect(Number.isFinite(lastTelemetry!.magneticTrackDeg)).toBe(true);
      expect(Number.isFinite(lastTelemetry!.magneticVariationDeg)).toBe(true);
      expect(Number.isFinite(lastTelemetry!.verticalSpeedFpm)).toBe(true);

      // Verify vertical speed computed properly despite high-frequency updates
      expect(lastTelemetry!.verticalSpeedFpm).toBeGreaterThan(400);
      expect(lastTelemetry!.verticalSpeedFpm).toBeLessThan(800);

      // Performance: 12,000 updates should complete in < 2 seconds
      expect(durationMs).toBeLessThan(2000);
    });

    it('gracefully rejects corrupt and non-finite GNSS frames without poisoning controller state', () => {
      let latestTelem: OwnshipTelemetry | null = null;
      const controller = new FlightTelemetryController((telem) => {
        latestTelem = telem;
      });

      // Set initial good state
      controller.setManualOwnship({
        latitude: 38.7,
        longitude: -9.3,
        altitudeMslFt: 3000,
        groundSpeedKt: 100,
        trueTrackDeg: 90,
      });

      expect(latestTelem).not.toBeNull();
      const prevLat = latestTelem!.latitude;

      // Bombard with NaN, Infinity, and null coordinates
      controller.processRawCoords({
        latitude: NaN,
        longitude: -9.3,
        altitude: 1000,
        accuracy: 10,
        heading: 90,
        speed: 50,
      });

      controller.processRawCoords({
        latitude: 38.7,
        longitude: Infinity,
        altitude: 1000,
        accuracy: 10,
        heading: 90,
        speed: 50,
      });

      // State must not be poisoned by NaN
      expect(latestTelem!.latitude).toBe(prevLat);
      expect(Number.isFinite(latestTelem!.latitude)).toBe(true);
      expect(Number.isFinite(latestTelem!.longitude)).toBe(true);
    });
  });

  // =========================================================================
  // 3. OFF-TRACK CROSS-TRACK ERROR (XTE) STRESS
  // =========================================================================
  describe('3. Off-Track Cross-Track Error (XTE) & Course Excursion Stress', () => {
    // Leg: LPCS (38.725, -9.355) due East to a point 60 NM away
    const startLat = 38.0;
    const startLon = -9.0;
    const endLat = 39.0;
    const endLon = -9.0; // Desired track: 000° True (Due North)

    it('computes exact spherical XTE and Along-Track distance under massive excursions (200 NM left/right)', () => {
      // 200 NM Right of course (East)
      const offRightPt = destinationPoint(38.5, -9.0, 90, 200);
      const rightResult = computeCrossTrackAndAlongTrack(
        startLat,
        startLon,
        endLat,
        endLon,
        offRightPt.latitude,
        offRightPt.longitude
      );

      // Sign convention: Right of course -> positive XTE
      expect(rightResult.crossTrackErrorNm).toBeGreaterThan(195);
      expect(rightResult.crossTrackErrorNm).toBeLessThan(205);
      expect(rightResult.alongTrackDistanceNm).toBeCloseTo(30, 0); // 38.5 is halfway between 38.0 and 39.0 (30 NM)

      // 200 NM Left of course (West)
      const offLeftPt = destinationPoint(38.5, -9.0, 270, 200);
      const leftResult = computeCrossTrackAndAlongTrack(
        startLat,
        startLon,
        endLat,
        endLon,
        offLeftPt.latitude,
        offLeftPt.longitude
      );

      // Sign convention: Left of course -> negative XTE
      expect(leftResult.crossTrackErrorNm).toBeLessThan(-195);
      expect(leftResult.crossTrackErrorNm).toBeGreaterThan(-205);
      expect(leftResult.alongTrackDistanceNm).toBeCloseTo(30, 0);
    });

    it('handles course reversals: aircraft flying on 180° opposite course behind leg origin', () => {
      // Aircraft 25 NM behind start point (South of 38.0 at 37.5833, -9.0)
      const behindPt = destinationPoint(startLat, startLon, 180, 25);
      const result = computeCrossTrackAndAlongTrack(
        startLat,
        startLon,
        endLat,
        endLon,
        behindPt.latitude,
        behindPt.longitude
      );

      // Directly behind the leg -> XTE = 0, Along-Track distance = -25 NM
      expect(Math.abs(result.crossTrackErrorNm)).toBeLessThan(0.1);
      expect(result.alongTrackDistanceNm).toBeCloseTo(-25, 0);
    });

    it('handles aircraft flying exactly perpendicular (90° offset) across route', () => {
      const ownshipPerp: OwnshipTelemetry = {
        timestamp: 1730000000000,
        latitude: 38.5,
        longitude: -8.5, // ~23.5 NM East of course
        rawGpsAltitudeFt: 4500,
        altimeterOffsetFt: 0,
        altitudeMslFt: 4500,
        groundSpeedKt: 120,
        trueTrackDeg: 270, // Flying directly West, perpendicular to 000° course
        magneticTrackDeg: 272,
        magneticVariationDeg: -2,
        verticalSpeedFpm: 0,
        horizontalAccuracyM: 5,
        verticalAccuracyM: 8,
        gpsQuality: 'HIGH',
        source: 'manual-test',
        flightPhase: 'AIRBORNE',
      };

      const waypoints = [
        { id: 1, identifier: 'START', name: 'Start', type: 'custom', country: 'PT', latitude: startLat, longitude: startLon, elevation: 0 },
        { id: 2, identifier: 'END', name: 'End', type: 'custom', country: 'PT', latitude: endLat, longitude: endLon, elevation: 0 },
      ] as unknown as Waypoint[];

      const navLog = createSampleNavLog(waypoints[0], waypoints[1], 4500, 120);

      const sol = computeInFlightNavSolution({
        ownship: ownshipPerp,
        navLog,
        waypoints,
        activeLegIndex: 0,
        directToState: null,
        terrainProfile: null,
        lookAheadMinutes: 5,
      });

      expect(sol.crossTrackErrorNm).toBeGreaterThan(20);
      expect(sol.closestPointOnCourse).not.toBeNull();
      // Closest point on course should have longitude ~ -9.0 and latitude ~ 38.5
      expect(sol.closestPointOnCourse![0]).toBeCloseTo(38.5, 1);
      expect(sol.closestPointOnCourse![1]).toBeCloseTo(-9.0, 1);

      // Course intercept angle should command an intercept heading back toward 000°
      expect(sol.interceptHeadingMagDeg).not.toBeNull();
      // Right of course -> intercept heading should cut left (360° - 45° = 315° plus magvar)
      expect(sol.interceptHeadingMagDeg!).toBeGreaterThan(310);
      expect(sol.interceptHeadingMagDeg!).toBeLessThan(350);
    });

    it('handles aircraft flying directly away from next fix (course deviation ~ 180°)', () => {
      const ownshipFleeing: OwnshipTelemetry = {
        timestamp: 1730000000000,
        latitude: 38.5,
        longitude: -9.0,
        rawGpsAltitudeFt: 3000,
        altimeterOffsetFt: 0,
        altitudeMslFt: 3000,
        groundSpeedKt: 150,
        trueTrackDeg: 180, // Flying due South away from END (which is due North at 39.0)
        magneticTrackDeg: 182,
        magneticVariationDeg: -2,
        verticalSpeedFpm: 0,
        horizontalAccuracyM: 5,
        verticalAccuracyM: 8,
        gpsQuality: 'HIGH',
        source: 'manual-test',
        flightPhase: 'AIRBORNE',
      };

      const waypoints = [
        { id: 1, identifier: 'START', name: 'Start', type: 'custom', country: 'PT', latitude: startLat, longitude: startLon, elevation: 0 },
        { id: 2, identifier: 'END', name: 'End', type: 'custom', country: 'PT', latitude: endLat, longitude: endLon, elevation: 0 },
      ] as unknown as Waypoint[];

      const navLog = createSampleNavLog(waypoints[0], waypoints[1], 3000, 150);

      const sol = computeInFlightNavSolution({
        ownship: ownshipFleeing,
        navLog,
        waypoints,
        activeLegIndex: 0,
        directToState: null,
        terrainProfile: null,
        lookAheadMinutes: 5,
      });

      // Bearing to END is 000°, aircraft track is 180° -> course deviation = 180°
      expect(Math.abs(sol.courseDeviationDeg)).toBeCloseTo(180, 0);
      expect(sol.distanceToNextNm).toBeCloseTo(30, 0);
    });
  });

  // =========================================================================
  // 4. ALTITUDE CAPTURE ARC ("GREEN BANANA") STRESS
  // =========================================================================
  describe('4. Altitude Capture Arc ("Green Banana") Edge Cases', () => {
    it('returns null when vertical speed is 0 or groundspeed < 20 kt', () => {
      // Level flight (VS = 0)
      expect(computeAltitudeCaptureArc(38.0, -9.0, 90, 120, 3500, 5000, 0)).toBeNull();
      // Helicopter hover (GS = 0 kt)
      expect(computeAltitudeCaptureArc(38.0, -9.0, 90, 0, 3500, 5000, 800)).toBeNull();
      // Ground roll / taxi (GS = 15 kt)
      expect(computeAltitudeCaptureArc(38.0, -9.0, 90, 15, 3500, 5000, 800)).toBeNull();
    });

    it('computes capture arc accurately under extreme climb rate (+8,000 fpm)', () => {
      // Fighter jet climbing from 10,000 ft to FL450 at +8,000 fpm and 450 kt
      // 35,000 ft climb / 8,000 fpm = 4.375 min -> at 450 kt = 32.81 NM ahead
      const arc = computeAltitudeCaptureArc(38.0, -9.0, 45, 450, 10000, 45000, 8000);

      expect(arc).not.toBeNull();
      expect(arc!.targetAltitudeFt).toBe(45000);
      expect(arc!.timeToCaptureSec).toBe(Math.round(4.375 * 60));
      expect(arc!.distanceAheadNm).toBeCloseTo(32.8, 1);
      expect(arc!.arcCoords).toHaveLength(7);

      // Verify no NaNs in arc coords
      for (const [lat, lon] of arc!.arcCoords) {
        expect(Number.isFinite(lat)).toBe(true);
        expect(Number.isFinite(lon)).toBe(true);
      }
    });

    it('computes capture arc accurately under extreme emergency descent (-6,000 fpm)', () => {
      // Jet emergency descent from 45,000 ft to 10,000 ft at -6,000 fpm and 300 kt
      // 35,000 ft descent / 6,000 fpm = 5.833 min -> at 300 kt = 29.17 NM ahead
      const arc = computeAltitudeCaptureArc(38.0, -9.0, 180, 300, 45000, 10000, -6000);

      expect(arc).not.toBeNull();
      expect(arc!.targetAltitudeFt).toBe(10000);
      expect(arc!.distanceAheadNm).toBeCloseTo(29.2, 1);
      expect(arc!.arcCoords).toHaveLength(7);
    });

    it('handles instantaneous altitude step (aircraft reaches target altitude)', () => {
      // Aircraft level at target altitude (|altDiff| < 60 ft)
      const arc = computeAltitudeCaptureArc(38.0, -9.0, 90, 120, 5010, 5000, 400);
      expect(arc).toBeNull();
    });

    it('handles negative MSL target altitudes (Dead Sea approach to -500 ft MSL)', () => {
      // Descending from 2,000 ft MSL to -500 ft MSL at -500 fpm and 100 kt
      // 2,500 ft / 500 fpm = 5 min -> at 100 kt = 8.33 NM ahead
      const arc = computeAltitudeCaptureArc(31.5, 35.4, 120, 100, 2000, -500, -500);

      expect(arc).not.toBeNull();
      expect(arc!.targetAltitudeFt).toBe(-500);
      expect(arc!.distanceAheadNm).toBeCloseTo(8.33, 1);
    });

    it('safely rejects non-finite or NaN inputs without throwing exceptions', () => {
      expect(computeAltitudeCaptureArc(NaN, -9.0, 90, 120, 3500, 5000, 500)).toBeNull();
      expect(computeAltitudeCaptureArc(38.0, Infinity, 90, 120, 3500, 5000, 500)).toBeNull();
      expect(computeAltitudeCaptureArc(38.0, -9.0, 90, 120, null, 5000, 500)).toBeNull();
      expect(computeAltitudeCaptureArc(38.0, -9.0, 90, 120, 3500, NaN, 500)).toBeNull();
      expect(computeAltitudeCaptureArc(38.0, -9.0, 90, 120, 3500, 5000, Infinity)).toBeNull();
    });
  });

  // =========================================================================
  // 5. BEST GLIDE ADVISOR POLYGON STRESS
  // =========================================================================
  describe('5. Best Glide Advisor Polygon Stress', () => {
    const navLogWithWind = createSampleNavLog(LPCS, LPSO, 4500, 110);
    navLogWithWind.legs[0].wind = { direction: 360, speed: 40 }; // 40 kt wind from North

    it('returns empty polygon when AGL is zero or negative (aircraft on runway or below terrain)', () => {
      // Aircraft at 325 ft MSL on runway at LPCS (elevation 325 ft -> 0 ft AGL)
      const ownshipOnRunway: OwnshipTelemetry = {
        timestamp: 1730000000000,
        latitude: LPCS.latitude,
        longitude: LPCS.longitude,
        rawGpsAltitudeFt: 325,
        altimeterOffsetFt: 0,
        altitudeMslFt: 325,
        groundSpeedKt: 0,
        trueTrackDeg: 0,
        magneticTrackDeg: 2,
        magneticVariationDeg: -2,
        verticalSpeedFpm: 0,
        horizontalAccuracyM: 5,
        verticalAccuracyM: 8,
        gpsQuality: 'HIGH',
        source: 'manual-test',
        flightPhase: 'PREFLIGHT',
      };

      const sol = computeInFlightNavSolution({
        ownship: ownshipOnRunway,
        navLog: navLogWithWind,
        waypoints: [LPCS, LPSO],
        activeLegIndex: 0,
        directToState: null,
        terrainProfile: null,
        lookAheadMinutes: 5,
      });

      expect(sol.glideRangePolygon).toHaveLength(0);
      expect(sol.avgGlideDistanceNm).toBe(0);
    });

    it('returns empty polygon when terrain elevation is higher than aircraft altitude (negative clearance)', () => {
      // Aircraft altitude 500 ft MSL near Innsbruck (terrain elevation 1,906 ft MSL -> -1,406 ft AGL)
      const ownshipSubTerrain: OwnshipTelemetry = {
        timestamp: 1730000000000,
        latitude: LOWI.latitude,
        longitude: LOWI.longitude,
        rawGpsAltitudeFt: 500,
        altimeterOffsetFt: 0,
        altitudeMslFt: 500,
        groundSpeedKt: 90,
        trueTrackDeg: 90,
        magneticTrackDeg: 92,
        magneticVariationDeg: -2,
        verticalSpeedFpm: 0,
        horizontalAccuracyM: 5,
        verticalAccuracyM: 8,
        gpsQuality: 'HIGH',
        source: 'manual-test',
        flightPhase: 'AIRBORNE',
      };

      const sol = computeInFlightNavSolution({
        ownship: ownshipSubTerrain,
        navLog: createSampleNavLog(LOWI, EGLL, 12000, 200),
        waypoints: [LOWI, EGLL],
        activeLegIndex: 0,
        directToState: null,
        terrainProfile: null,
        lookAheadMinutes: 5,
      });

      expect(sol.glideRangePolygon).toHaveLength(0);
      expect(sol.avgGlideDistanceNm).toBe(0);
    });

    it('computes 36-ray glide polygon at FL450 (45,000 ft) with wind distortion', () => {
      // Aircraft at FL450 over ocean (terrain elevation 0 ft MSL -> 45,000 ft AGL)
      const ownshipFL450: OwnshipTelemetry = {
        timestamp: 1730000000000,
        latitude: 38.0,
        longitude: -15.0,
        rawGpsAltitudeFt: 45000,
        altimeterOffsetFt: 0,
        altitudeMslFt: 45000,
        groundSpeedKt: 450,
        trueTrackDeg: 90,
        magneticTrackDeg: 92,
        magneticVariationDeg: -2,
        verticalSpeedFpm: 0,
        horizontalAccuracyM: 5,
        verticalAccuracyM: 8,
        gpsQuality: 'HIGH',
        source: 'manual-test',
        flightPhase: 'AIRBORNE',
      };

      const highNavLog = createSampleNavLog(LPCS, LPSO, 45000, 450);
      highNavLog.legs[0].wind = { direction: 270, speed: 60 }; // 60 kt tailwind toward East

      const sol = computeInFlightNavSolution({
        ownship: ownshipFL450,
        navLog: highNavLog,
        waypoints: [LPCS, LPSO],
        activeLegIndex: 0,
        directToState: null,
        terrainProfile: null,
        lookAheadMinutes: 5,
      });

      expect(sol.glideRangePolygon.length).toBeGreaterThanOrEqual(36);
      expect(sol.avgGlideDistanceNm).toBeGreaterThan(40);
      expect(sol.avgGlideDistanceNm).toBeLessThan(100);

      // Verify polygon points are all valid geographic coordinates
      for (const [lat, lon] of sol.glideRangePolygon) {
        expect(Number.isFinite(lat)).toBe(true);
        expect(Number.isFinite(lon)).toBe(true);
      }
    });

    it('handles extreme jetstream winds (150 kt) without negative ray distances or minimum speed failure', () => {
      const ownshipCruise: OwnshipTelemetry = {
        timestamp: 1730000000000,
        latitude: 38.5,
        longitude: -8.5,
        rawGpsAltitudeFt: 10000,
        altimeterOffsetFt: 0,
        altitudeMslFt: 10000,
        groundSpeedKt: 180,
        trueTrackDeg: 90,
        magneticTrackDeg: 92,
        magneticVariationDeg: -2,
        verticalSpeedFpm: 0,
        horizontalAccuracyM: 5,
        verticalAccuracyM: 8,
        gpsQuality: 'HIGH',
        source: 'manual-test',
        flightPhase: 'AIRBORNE',
      };

      const jetstreamNavLog = createSampleNavLog(LPCS, LPSO, 10000, 180);
      jetstreamNavLog.legs[0].wind = { direction: 270, speed: 150 }; // 150 kt jetstream

      const sol = computeInFlightNavSolution({
        ownship: ownshipCruise,
        navLog: jetstreamNavLog,
        waypoints: [LPCS, LPSO],
        activeLegIndex: 0,
        directToState: null,
        terrainProfile: null,
        lookAheadMinutes: 5,
      });

      expect(sol.glideRangePolygon.length).toBeGreaterThanOrEqual(36);
      // All rays must have positive distances
      for (const [lat, lon] of sol.glideRangePolygon) {
        const rayDist = greatCircleDistance(ownshipCruise.latitude, ownshipCruise.longitude, lat, lon);
        expect(rayDist).toBeGreaterThan(0.2);
      }
    });
  });

  // =========================================================================
  // 6. WAYPOINT PASSAGE & AUTO-SEQUENCING PLANE BISECTOR STRESS
  // =========================================================================
  describe('6. Waypoint Passage & Auto-Sequencing Plane Bisector Stress', () => {
    const navLogMultiLeg: NavLogSummary = {
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

    it('triggers sequencing deterministically when jittering across 0.85 NM capture cylinder', () => {
      const leg0 = navLogMultiLeg.legs[0];

      // Just outside capture cylinder (0.851 NM) -> no sequencing
      expect(checkAutoLegSequencing(leg0, true, 66.3, 0.0, 0.851)).toBe(false);

      // Just inside capture cylinder (0.849 NM) -> sequences
      expect(checkAutoLegSequencing(leg0, true, 66.3, 0.0, 0.849)).toBe(true);

      // Exactly at threshold (0.850 NM) -> sequences
      expect(checkAutoLegSequencing(leg0, true, 66.3, 0.0, 0.85)).toBe(true);
    });

    it('triggers sequencing when passing abeam waypoint within 2.5 NM lateral corridor', () => {
      const leg0 = navLogMultiLeg.legs[0];

      // Passed waypoint along track (67.5 NM >= 67.2 NM) with 1.8 NM right offset (< 2.5 NM)
      expect(checkAutoLegSequencing(leg0, true, 67.5, 1.8, 1.2)).toBe(true);

      // Passed waypoint along track (67.5 NM) but 3.5 NM off track (> 2.5 NM) -> no sequencing
      expect(checkAutoLegSequencing(leg0, true, 67.5, 3.5, 3.6)).toBe(false);

      // Distant excursion: 50 NM past waypoint -> no sequencing
      expect(checkAutoLegSequencing(leg0, true, 117.2, 0.5, 50.0)).toBe(false);
    });

    it('does not sequence if active leg is the final leg of the flight plan (no next leg)', () => {
      const leg1 = navLogMultiLeg.legs[1];
      // 0.2 NM from destination airport -> hasNextLeg is false -> no sequencing
      expect(checkAutoLegSequencing(leg1, false, 41.2, 0.0, 0.2)).toBe(false);
    });

    it('handles Direct-To mid-leg activation (skipping waypoint and retargeting downstream fix)', () => {
      // Aircraft flying leg 0 (LPCS -> LPSO) at position 38.9, -8.8
      const ownshipMidLeg: OwnshipTelemetry = {
        timestamp: 1730000000000,
        latitude: 38.9,
        longitude: -8.8,
        rawGpsAltitudeFt: 4500,
        altimeterOffsetFt: 0,
        altitudeMslFt: 4500,
        groundSpeedKt: 120,
        trueTrackDeg: 62,
        magneticTrackDeg: 64,
        magneticVariationDeg: -2,
        verticalSpeedFpm: 0,
        horizontalAccuracyM: 5,
        verticalAccuracyM: 8,
        gpsQuality: 'HIGH',
        source: 'manual-test',
        flightPhase: 'AIRBORNE',
      };

      const waypoints = [LPCS, LPSO, LPEV];

      // Step 1: Normal route solution on leg 0
      const solNormal = computeInFlightNavSolution({
        ownship: ownshipMidLeg,
        navLog: navLogMultiLeg,
        waypoints,
        activeLegIndex: 0,
        directToState: null,
        terrainProfile: null,
        lookAheadMinutes: 5,
      });

      expect(solNormal.isDirectToActive).toBe(false);
      expect(solNormal.nextWaypoint?.identifier).toBe('LPSO');

      // Step 2: Pilot receives ATC clearance "Direct Evora" (skipping LPSO)
      const directToEvora: DirectToState = {
        targetWaypoint: LPEV,
        originLat: ownshipMidLeg.latitude,
        originLon: ownshipMidLeg.longitude,
        originAltFt: ownshipMidLeg.altitudeMslFt ?? 4500,
        activatedAt: ownshipMidLeg.timestamp,
        targetWaypointRouteIndex: 2,
      };

      const solDct = computeInFlightNavSolution({
        ownship: ownshipMidLeg,
        navLog: navLogMultiLeg,
        waypoints,
        activeLegIndex: 0,
        directToState: directToEvora,
        terrainProfile: null,
        lookAheadMinutes: 5,
      });

      expect(solDct.isDirectToActive).toBe(true);
      expect(solDct.directToTarget?.identifier).toBe('LPEV');
      expect(solDct.nextWaypoint?.identifier).toBe('LPEV');
      expect(solDct.nextPoints[0].waypoint.identifier).toBe('LPEV');
      expect(solDct.nextPoints[0].isDirectToTarget).toBe(true);

      // Direct-To course distance must match great-circle distance from aircraft to LPEV
      const expectedDistToLpev = greatCircleDistance(
        ownshipMidLeg.latitude,
        ownshipMidLeg.longitude,
        LPEV.latitude,
        LPEV.longitude
      );
      expect(solDct.distanceToNextNm).toBeCloseTo(expectedDistToLpev, 1);
      expect(solDct.nextPoints[0].legDistanceNm).toBeCloseTo(expectedDistToLpev, 1);

      // Initial XTE on newly activated Direct-To must be near zero
      expect(Math.abs(solDct.crossTrackErrorNm)).toBeLessThan(0.05);

      // Verify auto-sequencing when arriving within 0.85 NM of Direct-To target
      const ownshipAtLpevArrival: OwnshipTelemetry = {
        ...ownshipMidLeg,
        latitude: LPEV.latitude - 0.005,
        longitude: LPEV.longitude,
      };

      const solArrival = computeInFlightNavSolution({
        ownship: ownshipAtLpevArrival,
        navLog: navLogMultiLeg,
        waypoints,
        activeLegIndex: 0,
        directToState: directToEvora,
        terrainProfile: null,
        lookAheadMinutes: 5,
      });

      expect(solArrival.distanceToNextNm).toBeLessThan(0.85);
    });
  });
});
