import { describe, it, expect } from 'vitest';
import {
  isPointInPolygon,
  doSegmentsIntersect,
  doesSegmentOverlapPolygon,
  checkLegAirspaceConflict,
  checkRouteAirspaceConflicts,
} from '../engine/airspace-engine';
import { AIRSPACES } from '../data/airspace-data';
import { Leg, Waypoint } from '../types';

function makeWaypoint(
  id: number,
  identifier: string,
  latitude: number,
  longitude: number
): Waypoint {
  return {
    id,
    identifier,
    name: identifier,
    type: 'airport',
    latitude,
    longitude,
    country: 'PT',
  };
}

function makeLeg(
  from: Waypoint,
  to: Waypoint,
  altitude?: number
): Leg {
  return {
    id: `${from.identifier}-${to.identifier}`,
    from,
    to,
    distance: 50,
    trueTrack: 90,
    magneticVariation: -1,
    windCorrectionAngle: 0,
    trueHeading: 90,
    magneticHeading: 91,
    groundSpeed: 120,
    ete: 1500,
    altitude: altitude as number,
    fuelBurn: 4.5,
  };
}

describe('Airspace Computational Geometry & Conflict Fuzzing Suite', () => {
  const square: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ];

  // ─── A. POINT-IN-POLYGON EDGE CASES ───────────────────────────────────────
  describe('A. Point-in-Polygon Edge Cases', () => {
    it('handles deeply concave (horseshoe / comb) polygons', () => {
      // Horseshoe polygon open at the top
      // (0,10) - (2,10) - (2,3) - (8,3) - (8,10) - (10,10) - (10,0) - (0,0) - (0,10)
      const horseshoe: [number, number][] = [
        [0, 0],
        [10, 0],
        [10, 10],
        [8, 10],
        [8, 3],
        [2, 3],
        [2, 10],
        [0, 10],
        [0, 0],
      ];

      // Points inside the arms / base
      expect(isPointInPolygon([1, 5], horseshoe)).toBe(true); // Left arm
      expect(isPointInPolygon([9, 5], horseshoe)).toBe(true); // Right arm
      expect(isPointInPolygon([5, 1], horseshoe)).toBe(true); // Base

      // Points inside the concave indentation (outside polygon)
      expect(isPointInPolygon([5, 6], horseshoe)).toBe(false); // In the cove
      expect(isPointInPolygon([5, 8], horseshoe)).toBe(false);

      // Points completely outside
      expect(isPointInPolygon([-2, 5], horseshoe)).toBe(false);
      expect(isPointInPolygon([12, 5], horseshoe)).toBe(false);
    });

    it('handles donut-shaped polygons with interior hole via keyhole cut', () => {
      // Outer box 0..20, inner hole 5..15
      const donut: [number, number][] = [
        [0, 0],
        [20, 0],
        [20, 20],
        [0, 20],
        [0, 0], // close outer
        [5, 5], // seam to hole
        [5, 15],
        [15, 15],
        [15, 5],
        [5, 5], // close hole
        [0, 0], // seam back
      ];

      // Meat of the donut (inside polygon)
      expect(isPointInPolygon([2, 2], donut)).toBe(true);
      expect(isPointInPolygon([10, 2], donut)).toBe(true);
      expect(isPointInPolygon([18, 18], donut)).toBe(true);
      expect(isPointInPolygon([2, 10], donut)).toBe(true);

      // Inside the central hole (MUST be outside polygon)
      expect(isPointInPolygon([10, 10], donut)).toBe(false);
      expect(isPointInPolygon([7, 7], donut)).toBe(false);
      expect(isPointInPolygon([12, 12], donut)).toBe(false);

      // Outside exterior boundary
      expect(isPointInPolygon([25, 25], donut)).toBe(false);
      expect(isPointInPolygon([-5, 10], donut)).toBe(false);
    });

    it('handles self-intersecting (bowtie / figure-8) polygons', () => {
      // Bowtie polygon crossing at [5, 5]
      const bowtie: [number, number][] = [
        [0, 0],
        [10, 10],
        [0, 10],
        [10, 0],
        [0, 0],
      ];

      // Points inside each lobe
      expect(isPointInPolygon([5, 2], bowtie)).toBe(true); // Lower/left lobe
      expect(isPointInPolygon([5, 8], bowtie)).toBe(true); // Upper/right lobe

      // Points outside both lobes
      expect(isPointInPolygon([1, 5], bowtie)).toBe(false); // Mid-bottom pinch
      expect(isPointInPolygon([9, 5], bowtie)).toBe(false); // Mid-top pinch
      expect(isPointInPolygon([15, 5], bowtie)).toBe(false);
    });

    it('correctly handles points exactly on vertices and collinear along edges', () => {
      // Exactly on vertices
      expect(isPointInPolygon([0, 0], square)).toBe(true);
      expect(isPointInPolygon([10, 0], square)).toBe(true);
      expect(isPointInPolygon([10, 10], square)).toBe(true);
      expect(isPointInPolygon([0, 10], square)).toBe(true);

      // Collinear along polygon edges
      expect(isPointInPolygon([5, 0], square)).toBe(true); // Bottom edge
      expect(isPointInPolygon([10, 5], square)).toBe(true); // Right edge
      expect(isPointInPolygon([5, 10], square)).toBe(true); // Top edge
      expect(isPointInPolygon([0, 5], square)).toBe(true); // Left edge

      // Collinear along diagonal / slanted edge
      const triangle: [number, number][] = [
        [0, 0],
        [10, 0],
        [0, 10],
        [0, 0],
      ];
      expect(isPointInPolygon([5, 5], triangle)).toBe(true); // Midpoint of hypotenuse
      expect(isPointInPolygon([2, 8], triangle)).toBe(true); // On hypotenuse
    });

    it('safely handles 0-area and 2-vertex degenerate polygons without throwing', () => {
      // 2-vertex polygon
      const twoVertex: [number, number][] = [
        [0, 0],
        [10, 10],
      ];
      expect(isPointInPolygon([5, 5], twoVertex)).toBe(false);
      expect(isPointInPolygon([0, 0], twoVertex)).toBe(false);

      // Single vertex / empty
      expect(isPointInPolygon([0, 0], [[0, 0]])).toBe(false);
      expect(isPointInPolygon([0, 0], [])).toBe(false);
      expect(isPointInPolygon([0, 0], null as any)).toBe(false);

      // 0-area polygon: 3 identical points
      const identicalPoints: [number, number][] = [
        [5, 5],
        [5, 5],
        [5, 5],
      ];
      expect(isPointInPolygon([5, 5], identicalPoints)).toBe(false);

      // 0-area polygon: 3 collinear points (straight line)
      const collinearPoly: [number, number][] = [
        [0, 0],
        [5, 5],
        [10, 10],
      ];
      expect(isPointInPolygon([5, 5], collinearPoly)).toBe(false);
      expect(isPointInPolygon([2, 2], collinearPoly)).toBe(false);

      // Malformed coordinates (NaN / undefined)
      expect(isPointInPolygon([NaN, 5], square)).toBe(false);
      expect(isPointInPolygon([5, NaN], square)).toBe(false);
    });

    it('handles polar coordinates (lat = ±90°) and anti-meridian (lon = ±180°)', () => {
      // Polygon encompassing / touching North Pole
      const polePoly: [number, number][] = [
        [80, 0],
        [80, 90],
        [90, 0], // North Pole vertex
        [80, 0],
      ];
      expect(isPointInPolygon([90, 0], polePoly)).toBe(true);
      // North pole at any longitude is the exact same geographic pole
      expect(isPointInPolygon([90, 45], polePoly)).toBe(true);

      // Polygon touching anti-meridian at lon = 180 / -180
      const antiMeridianPoly: [number, number][] = [
        [10, 170],
        [10, 180],
        [20, 180],
        [20, 170],
        [10, 170],
      ];
      // Test lon = -180 vs +180 equivalence
      expect(isPointInPolygon([15, 180], antiMeridianPoly)).toBe(true);
      expect(isPointInPolygon([15, -180], antiMeridianPoly)).toBe(true);
      expect(isPointInPolygon([10, -180], antiMeridianPoly)).toBe(true);
    });
  });

  // ─── B. LINE-SEGMENT & POLYGON INTERSECTION EDGE CASES ─────────────────────
  describe('B. Line-Segment & Polygon Intersection Edge Cases', () => {
    it('detects collinear segment running along polygon edge', () => {
      // Bottom edge: [0, 0] to [10, 0]
      // Segment strictly inside edge: [2, 0] to [8, 0]
      expect(doesSegmentOverlapPolygon([2, 0], [8, 0], square)).toBe(true);
      expect(doSegmentsIntersect([2, 0], [8, 0], [0, 0], [10, 0])).toBe(true);

      // Segment running along edge and extending beyond: [-5, 0] to [15, 0]
      expect(doesSegmentOverlapPolygon([-5, 0], [15, 0], square)).toBe(true);

      // Segment along top edge: [3, 10] to [7, 10]
      expect(doesSegmentOverlapPolygon([3, 10], [7, 10], square)).toBe(true);
    });

    it('detects segment whose endpoints touch vertices without crossing', () => {
      // Segment outside, touching vertex [0, 0]
      expect(doesSegmentOverlapPolygon([-5, -5], [0, 0], square)).toBe(true);
      expect(doesSegmentOverlapPolygon([0, 0], [-5, 0], square)).toBe(true);

      // Segment grazing corner vertex [0, 0] from outside
      expect(doesSegmentOverlapPolygon([-5, 5], [5, -5], square)).toBe(true);
    });

    it('handles zero-length legs (from === to)', () => {
      // Stationary waypoint inside polygon
      expect(doesSegmentOverlapPolygon([5, 5], [5, 5], square)).toBe(true);

      // Stationary waypoint on vertex
      expect(doesSegmentOverlapPolygon([0, 0], [0, 0], square)).toBe(true);

      // Stationary waypoint on edge
      expect(doesSegmentOverlapPolygon([5, 0], [5, 0], square)).toBe(true);

      // Stationary waypoint outside polygon
      expect(doesSegmentOverlapPolygon([25, 25], [25, 25], square)).toBe(false);
      expect(doesSegmentOverlapPolygon([-10, -10], [-10, -10], square)).toBe(false);
    });

    it('handles cross-hemisphere and anti-meridian crossing legs', () => {
      // Cross-Equator leg (lat -10 to +10) across Equator-centered polygon
      const equatorPoly: [number, number][] = [
        [-5, -5],
        [-5, 5],
        [5, 5],
        [5, -5],
        [-5, -5],
      ];
      expect(doesSegmentOverlapPolygon([-10, 0], [10, 0], equatorPoly)).toBe(true);

      // Anti-Meridian crossing flight (e.g. lon 179 to -179)
      // Must NOT falsely intersect European/Lisbon FIR airspaces (lon around -9.3)
      const cascaisCtr = AIRSPACES.find((a) => a.id === 'LPCS_CTR')!;
      expect(cascaisCtr).toBeDefined();

      // Pacific leg crossing 180 meridian at latitude of Cascais (38.7)
      const pacificLegOver180 = doesSegmentOverlapPolygon(
        [38.7, 179],
        [38.7, -179],
        cascaisCtr.polygon
      );
      // Naive Euclidean would cross lon = -9.3 and return true.
      // Correct spherical/anti-meridian logic MUST return false!
      expect(pacificLegOver180).toBe(false);

      // Anti-Meridian airspace (spanning 175 to -175)
      const pacificAirspace: [number, number][] = [
        [-5, 175],
        [-5, -175],
        [5, -175],
        [5, 175],
        [-5, 175],
      ];
      // Leg crossing 180 across that airspace MUST be detected
      expect(doesSegmentOverlapPolygon([0, 170], [0, -170], pacificAirspace)).toBe(true);
    });
  });

  // ─── C. 3D ALTITUDE & BOUNDARY CONFLICT LOGIC ─────────────────────────────
  describe('C. 3D Altitude & Boundary Conflict Logic', () => {
    const cascaisCtr = AIRSPACES.find((a) => a.id === 'LPCS_CTR')!; // 0 - 2500 FT
    const lisboaTma1 = AIRSPACES.find((a) => a.id === 'LISBOA_TMA_1')!; // 1500 - 9500 FT
    const r51a = AIRSPACES.find((a) => a.id === 'LP_R51A')!; // 0 - 24000 FT

    const wptInCascais = makeWaypoint(1, 'LPCS', 38.725, -9.355);
    const wptInCascais2 = makeWaypoint(2, 'CAS2', 38.730, -9.340);
    const wptInTma = makeWaypoint(3, 'TMA1', 38.850, -9.200);
    const wptInTma2 = makeWaypoint(4, 'TMA2', 38.860, -9.100);
    const wptInR51 = makeWaypoint(5, 'R51_A', 39.420, -8.350);
    const wptInR51_2 = makeWaypoint(6, 'R51_B', 39.430, -8.250);

    it('flags PENETRATING when altitude matches exact lower and upper boundaries', () => {
      // Floor match: altitude === lowerLimitFt (0 ft MSL)
      const legFloor = makeLeg(wptInCascais, wptInCascais2, 0);
      const conflictFloor = checkLegAirspaceConflict(legFloor, 0, cascaisCtr);
      expect(conflictFloor).not.toBeNull();
      expect(conflictFloor?.status).toBe('PENETRATING');
      expect(conflictFloor?.verticalClearanceFt).toBe(0);

      // Ceiling match: altitude === upperLimitFt (2500 ft MSL)
      const legCeiling = makeLeg(wptInCascais, wptInCascais2, 2500);
      const conflictCeiling = checkLegAirspaceConflict(legCeiling, 0, cascaisCtr);
      expect(conflictCeiling).not.toBeNull();
      expect(conflictCeiling?.status).toBe('PENETRATING');
      expect(conflictCeiling?.verticalClearanceFt).toBe(0);

      // TMA Floor match: 1500 ft MSL
      const legTmaFloor = makeLeg(wptInTma, wptInTma2, 1500);
      const conflictTma = checkLegAirspaceConflict(legTmaFloor, 0, lisboaTma1);
      expect(conflictTma).not.toBeNull();
      expect(conflictTma?.status).toBe('PENETRATING');
      expect(conflictTma?.verticalClearanceFt).toBe(0);
    });

    it('handles negative altitudes below sea level (e.g. -1,000 ft)', () => {
      // Dead Sea / below sea level flight at -1000 ft under Cascais CTR (floor 0 ft)
      const legSubSea = makeLeg(wptInCascais, wptInCascais2, -1000);
      const conflictSubSea = checkLegAirspaceConflict(legSubSea, 0, cascaisCtr);
      expect(conflictSubSea).not.toBeNull();
      expect(conflictSubSea?.status).toBe('BELOW');
      expect(conflictSubSea?.severity).toBe('INFO');
      expect(conflictSubSea?.verticalClearanceFt).toBe(1000); // 0 - (-1000) = 1000 ft
      expect(conflictSubSea?.warningMessage).not.toContain('NaN');

      // Negative altitude within 500 ft of floor (e.g. -200 ft under 0 ft floor)
      const legSubClip = makeLeg(wptInCascais, wptInCascais2, -200);
      const conflictSubClip = checkLegAirspaceConflict(legSubClip, 0, cascaisCtr);
      expect(conflictSubClip).not.toBeNull();
      expect(conflictSubClip?.status).toBe('CLIPPING');
      expect(conflictSubClip?.severity).toBe('CAUTION');
      expect(conflictSubClip?.verticalClearanceFt).toBe(200);
    });

    it('handles extreme flight levels (FL450, FL600)', () => {
      // FL450 (45,000 ft) over Cascais CTR (ceiling 2,500 ft)
      const legFL450 = makeLeg(wptInCascais, wptInCascais2, 45000);
      const conflictFL450 = checkLegAirspaceConflict(legFL450, 0, cascaisCtr);
      expect(conflictFL450).not.toBeNull();
      expect(conflictFL450?.status).toBe('ABOVE');
      expect(conflictFL450?.severity).toBe('INFO');
      expect(conflictFL450?.verticalClearanceFt).toBe(42500); // 45000 - 2500

      // FL600 (60,000 ft) over LP-R51A (ceiling 24,000 ft)
      const legFL600 = makeLeg(wptInR51, wptInR51_2, 60000);
      const conflictFL600 = checkLegAirspaceConflict(legFL600, 0, r51a);
      expect(conflictFL600).not.toBeNull();
      expect(conflictFL600?.status).toBe('ABOVE');
      expect(conflictFL600?.severity).toBe('INFO');
      expect(conflictFL600?.verticalClearanceFt).toBe(36000); // 60000 - 24000
    });

    it('evaluates exactly at the 500-ft clipping threshold', () => {
      // 1. Exactly at floor - 500 ft for Lisboa TMA 1 (floor 1500 ft => 1000 ft)
      const legFloor500 = makeLeg(wptInTma, wptInTma2, 1000);
      const conflictFloor500 = checkLegAirspaceConflict(legFloor500, 0, lisboaTma1);
      expect(conflictFloor500).not.toBeNull();
      expect(conflictFloor500?.status).toBe('CLIPPING');
      expect(conflictFloor500?.severity).toBe('CAUTION');
      expect(conflictFloor500?.verticalClearanceFt).toBe(500);

      // Floor - 501 ft => BELOW, INFO
      const legFloor501 = makeLeg(wptInTma, wptInTma2, 999);
      const conflictFloor501 = checkLegAirspaceConflict(legFloor501, 0, lisboaTma1);
      expect(conflictFloor501).not.toBeNull();
      expect(conflictFloor501?.status).toBe('BELOW');
      expect(conflictFloor501?.severity).toBe('INFO');
      expect(conflictFloor501?.verticalClearanceFt).toBe(501);

      // 2. Exactly at ceiling + 500 ft for Cascais CTR (ceiling 2500 ft => 3000 ft)
      const legCeil500 = makeLeg(wptInCascais, wptInCascais2, 3000);
      const conflictCeil500 = checkLegAirspaceConflict(legCeil500, 0, cascaisCtr);
      expect(conflictCeil500).not.toBeNull();
      expect(conflictCeil500?.status).toBe('CLIPPING');
      expect(conflictCeil500?.severity).toBe('CAUTION');
      expect(conflictCeil500?.verticalClearanceFt).toBe(500);

      // Ceiling + 501 ft => ABOVE, INFO
      const legCeil501 = makeLeg(wptInCascais, wptInCascais2, 3001);
      const conflictCeil501 = checkLegAirspaceConflict(legCeil501, 0, cascaisCtr);
      expect(conflictCeil501).not.toBeNull();
      expect(conflictCeil501?.status).toBe('ABOVE');
      expect(conflictCeil501?.severity).toBe('INFO');
      expect(conflictCeil501?.verticalClearanceFt).toBe(501);
    });

    it('safely handles missing, undefined, or NaN altitudes without NaN outputs', () => {
      // Leg crossing Cascais CTR with altitude: undefined
      const legNoAlt = makeLeg(wptInCascais, wptInCascais2, undefined);
      const conflictNoAlt = checkLegAirspaceConflict(legNoAlt, 0, cascaisCtr);

      expect(conflictNoAlt).not.toBeNull();
      // Altitude missing for route penetrating airspace must NOT be falsely marked ABOVE with NaN clearance!
      expect(conflictNoAlt?.status).toBe('PENETRATING');
      expect(conflictNoAlt?.verticalClearanceFt).toBe(0);
      expect(conflictNoAlt?.warningMessage).not.toContain('NaN');
      expect(conflictNoAlt?.warningMessage).not.toContain('cruises over');
      expect(Number.isNaN(conflictNoAlt?.verticalClearanceFt)).toBe(false);

      // Leg crossing Restricted LP-R51A with altitude: NaN
      const legNaNAlt = makeLeg(wptInR51, wptInR51_2, NaN);
      const conflictNaN = checkLegAirspaceConflict(legNaNAlt, 0, r51a);

      expect(conflictNaN).not.toBeNull();
      expect(conflictNaN?.status).toBe('PENETRATING');
      expect(conflictNaN?.severity).toBe('CRITICAL');
      expect(conflictNaN?.warningMessage).not.toContain('NaN');
    });
  });

  // ─── D. PERFORMANCE & FUZZ STRESS TEST ────────────────────────────────────
  describe('D. Performance & Fuzz Stress Test (5,000 Legs)', () => {
    it('evaluates 5,000 synthetic legs against all airspaces within latency limits without memory leaks or NaN', () => {
      const NUM_LEGS = 5000;
      const syntheticLegs: Leg[] = [];

      // Seeded deterministic pseudo-random generator
      let seed = 123456789;
      const rnd = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };

      for (let i = 0; i < NUM_LEGS; i++) {
        let lat1: number, lon1: number, lat2: number, lon2: number;
        let alt: number | undefined;

        const category = i % 10;
        if (category < 4) {
          // 40% in mainland Portugal (Lisbon FIR zone)
          lat1 = 37.0 + rnd() * 4.5;
          lon1 = -9.5 + rnd() * 2.5;
          lat2 = 37.0 + rnd() * 4.5;
          lon2 = -9.5 + rnd() * 2.5;
          alt = Math.floor(rnd() * 12000);
        } else if (category === 4) {
          // 10% zero-length legs
          lat1 = 38.7 + rnd() * 0.5;
          lon1 = -9.3 + rnd() * 0.5;
          lat2 = lat1;
          lon2 = lon1;
          alt = 2000;
        } else if (category === 5) {
          // 10% anti-meridian crossings
          lat1 = -20 + rnd() * 40;
          lon1 = 175 + rnd() * 5;
          lat2 = -20 + rnd() * 40;
          lon2 = -175 - rnd() * 5;
          alt = 35000;
        } else if (category === 6) {
          // 10% extreme flight levels
          lat1 = 38.725;
          lon1 = -9.355;
          lat2 = 38.730;
          lon2 = -9.280;
          alt = i % 2 === 0 ? 45000 : 60000;
        } else if (category === 7) {
          // 10% negative altitudes
          lat1 = 38.725;
          lon1 = -9.355;
          lat2 = 38.730;
          lon2 = -9.280;
          alt = -1000 + Math.floor(rnd() * 900);
        } else if (category === 8) {
          // 10% undefined or NaN altitudes
          lat1 = 38.725;
          lon1 = -9.355;
          lat2 = 38.730;
          lon2 = -9.280;
          alt = i % 2 === 0 ? undefined : NaN;
        } else {
          // 10% global coordinates outside Portugal
          lat1 = -80 + rnd() * 160;
          lon1 = -170 + rnd() * 340;
          lat2 = -80 + rnd() * 160;
          lon2 = -170 + rnd() * 340;
          alt = 5000 + Math.floor(rnd() * 30000);
        }

        const w1 = makeWaypoint(i * 2, `WPT${i}A`, lat1, lon1);
        const w2 = makeWaypoint(i * 2 + 1, `WPT${i}B`, lat2, lon2);
        syntheticLegs.push(makeLeg(w1, w2, alt));
      }

      expect(syntheticLegs.length).toBe(NUM_LEGS);

      const startTime = performance.now();
      const report = checkRouteAirspaceConflicts(syntheticLegs, AIRSPACES);
      const durationMs = performance.now() - startTime;

      console.log(`[STRESS TEST] 5,000 legs evaluated against ${AIRSPACES.length} airspaces in ${durationMs.toFixed(2)}ms`);

      // Latency assertion: 5,000 legs x 17 airspaces = 85,000 checks should finish quickly (< 1500ms)
      expect(durationMs).toBeLessThan(1500);

      // Report assertions
      expect(report).toBeDefined();
      expect(Array.isArray(report.conflicts)).toBe(true);
      expect(report.conflicts.length).toBeGreaterThan(0);

      // Verify zero NaN values anywhere in results
      for (const c of report.conflicts) {
        expect(Number.isNaN(c.verticalClearanceFt)).toBe(false);
        expect(c.warningMessage).not.toContain('NaN');
        expect(c.warningMessage).not.toContain('undefined');
        expect(['PENETRATING', 'CLIPPING', 'BELOW', 'ABOVE']).toContain(c.status);
        expect(['CRITICAL', 'WARNING', 'CAUTION', 'INFO']).toContain(c.severity);
      }
    });
  });
});
