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

describe('Airspace Geometry & Conflict Detection Engine', () => {
  const squarePoly: [number, number][] = [
    [0, 0],
    [0, 10],
    [10, 10],
    [10, 0],
    [0, 0],
  ];

  const makeWpt = (id: number, ident: string, lat: number, lon: number): Waypoint => ({
    id,
    identifier: ident,
    name: ident,
    type: 'airport',
    latitude: lat,
    longitude: lon,
    country: 'PT',
  });

  const makeLeg = (from: Waypoint, to: Waypoint, altitude: number): Leg => ({
    id: `${from.identifier}-${to.identifier}`,
    from,
    to,
    distance: 50,
    trueTrack: 90,
    magneticVariation: -1,
    windCorrectionAngle: 0,
    trueHeading: 90,
    magneticHeading: 91,
    groundSpeed: 100,
    ete: 1800,
    altitude,
    fuelBurn: 4.5,
  });

  describe('Point in Polygon (Ray Casting)', () => {
    it('correctly identifies interior, exterior, and boundary points', () => {
      // Interior point
      expect(isPointInPolygon([5, 5], squarePoly)).toBe(true);
      expect(isPointInPolygon([1, 1], squarePoly)).toBe(true);

      // Exterior point
      expect(isPointInPolygon([15, 5], squarePoly)).toBe(false);
      expect(isPointInPolygon([-1, 5], squarePoly)).toBe(false);
      expect(isPointInPolygon([5, 15], squarePoly)).toBe(false);

      // Vertex boundary
      expect(isPointInPolygon([0, 0], squarePoly)).toBe(true);
      expect(isPointInPolygon([10, 10], squarePoly)).toBe(true);
    });

    it('identifies real-world Lisbon FIR airspace points', () => {
      const cascaisCtr = AIRSPACES.find((a) => a.id === 'LPCS_CTR')!;
      expect(cascaisCtr).toBeDefined();

      // Cascais Airport (38.725, -9.355) is inside Cascais CTR
      expect(isPointInPolygon([38.725, -9.355], cascaisCtr.polygon)).toBe(true);

      // Porto (41.248, -8.681) is far outside Cascais CTR
      expect(isPointInPolygon([41.248, -8.681], cascaisCtr.polygon)).toBe(false);
    });
  });

  describe('Line Segment Intersection', () => {
    it('detects intersecting cross segments', () => {
      const p1: [number, number] = [0, 5];
      const p2: [number, number] = [10, 5];
      const q1: [number, number] = [5, 0];
      const q2: [number, number] = [5, 10];

      expect(doSegmentsIntersect(p1, p2, q1, q2)).toBe(true);
    });

    it('detects non-intersecting parallel segments', () => {
      const p1: [number, number] = [0, 0];
      const p2: [number, number] = [10, 0];
      const q1: [number, number] = [0, 5];
      const q2: [number, number] = [10, 5];

      expect(doSegmentsIntersect(p1, p2, q1, q2)).toBe(false);
    });

    it('detects when segment passes through polygon', () => {
      // Segment crosses through the square from left to right
      expect(doesSegmentOverlapPolygon([5, -2], [5, 12], squarePoly)).toBe(true);

      // Segment completely outside
      expect(doesSegmentOverlapPolygon([15, 0], [15, 10], squarePoly)).toBe(false);

      // Segment with one endpoint inside
      expect(doesSegmentOverlapPolygon([5, 5], [15, 5], squarePoly)).toBe(true);
    });
  });

  describe('Leg Airspace Conflict Detection', () => {
    it('flags PENETRATING when cruising altitude is inside CTR limits', () => {
      const cascaisCtr = AIRSPACES.find((a) => a.id === 'LPCS_CTR')!;
      const wptDep = makeWpt(1, 'LPCS', 38.725, -9.355);
      const wptArr = makeWpt(2, 'BALQV', 38.730, -9.280);

      // Flying inside Cascais CTR (SFC - 2,500 ft) at 1,500 ft MSL
      const legInside = makeLeg(wptDep, wptArr, 1500);
      const conflict = checkLegAirspaceConflict(legInside, 0, cascaisCtr);

      expect(conflict).not.toBeNull();
      expect(conflict?.status).toBe('PENETRATING');
      expect(conflict?.severity).toBe('WARNING');
      expect(conflict?.warningMessage).toContain('CASCAIS CTR');
      expect(conflict?.warningMessage).toContain('120.305 MHz');
    });

    it('flags ABOVE when flight clears above CTR ceiling', () => {
      const cascaisCtr = AIRSPACES.find((a) => a.id === 'LPCS_CTR')!;
      const wptDep = makeWpt(1, 'LPCS', 38.725, -9.355);
      const wptArr = makeWpt(2, 'BALQV', 38.730, -9.280);

      // Flying at 4,500 ft over Cascais CTR (ceiling 2,500 ft)
      const legAbove = makeLeg(wptDep, wptArr, 4500);
      const conflict = checkLegAirspaceConflict(legAbove, 0, cascaisCtr);

      expect(conflict).not.toBeNull();
      expect(conflict?.status).toBe('ABOVE');
      expect(conflict?.severity).toBe('INFO');
      expect(conflict?.verticalClearanceFt).toBe(2000); // 4500 - 2500 = 2000 ft
    });

    it('flags CLIPPING when flight is within 500 ft safety margin of ceiling', () => {
      const cascaisCtr = AIRSPACES.find((a) => a.id === 'LPCS_CTR')!;
      const wptDep = makeWpt(1, 'LPCS', 38.725, -9.355);
      const wptArr = makeWpt(2, 'BALQV', 38.730, -9.280);

      // Flying at 2,800 ft (300 ft above 2,500 ft ceiling)
      const legClip = makeLeg(wptDep, wptArr, 2800);
      const conflict = checkLegAirspaceConflict(legClip, 0, cascaisCtr);

      expect(conflict).not.toBeNull();
      expect(conflict?.status).toBe('CLIPPING');
      expect(conflict?.severity).toBe('CAUTION');
      expect(conflict?.verticalClearanceFt).toBe(300);
    });

    it('flags CRITICAL when flight penetrates Restricted Airspace (LP-R51A)', () => {
      const r51a = AIRSPACES.find((a) => a.id === 'LP_R51A')!;
      const wptFrom = makeWpt(1, 'ENT', 39.420, -8.350);
      const wptTo = makeWpt(2, 'EXT', 39.430, -8.250);

      // Flying through Santa Margarida Firing Area at 3,500 ft MSL
      const legRestricted = makeLeg(wptFrom, wptTo, 3500);
      const conflict = checkLegAirspaceConflict(legRestricted, 0, r51a);

      expect(conflict).not.toBeNull();
      expect(conflict?.status).toBe('PENETRATING');
      expect(conflict?.severity).toBe('CRITICAL');
      expect(conflict?.warningMessage).toContain('CRITICAL');
      expect(conflict?.warningMessage).toContain('LP-R51A');
    });

    it('returns empty conflict list for empty route', () => {
      const report = checkRouteAirspaceConflicts([]);
      expect(report.conflicts.length).toBe(0);
      expect(report.hasCriticalConflict).toBe(false);
      expect(report.hasWarningConflict).toBe(false);
    });
  });

  describe('Vertical Profile Airspace Slicing (AltitudeProfile Integration)', () => {
    it('computes exact distance intervals for route crossing Cascais CTR', async () => {
      const { computeAirspaceProfileSlices } = await import('../engine/airspace-engine');
      const wptDep = makeWpt(1, 'LPCS', 38.725, -9.355);
      const wptArr = makeWpt(2, 'COIMB', 40.160, -8.470);
      const leg = makeLeg(wptDep, wptArr, 1500);

      const slices = computeAirspaceProfileSlices([leg], AIRSPACES);
      expect(slices.length).toBeGreaterThan(0);

      // Verify Cascais CTR is sliced at beginning of flight
      const cascaisSlice = slices.find((s) => s.airspace.id === 'LPCS_CTR');
      expect(cascaisSlice).toBeDefined();
      expect(cascaisSlice?.startDistNm).toBe(0);
      expect(cascaisSlice?.endDistNm).toBeGreaterThan(0);
      expect(cascaisSlice?.status).toBe('PENETRATING');
    });

    it('returns empty slices for empty legs list', async () => {
      const { computeAirspaceProfileSlices } = await import('../engine/airspace-engine');
      const slices = computeAirspaceProfileSlices([]);
      expect(slices).toEqual([]);
    });
  });

  describe('Altitude Filtering & Pilot Clearance Advisories', () => {
    it('filters airspaces by operational cruise altitude', async () => {
      const { filterAirspacesByAltitude } = await import('../engine/airspace-engine');
      
      // Filter for low VFR cruise at 1,000 ft (buffer 500 ft -> airspaces between SFC and 1,500 ft)
      const lowSectors = filterAirspacesByAltitude(AIRSPACES, 1000, 500);
      
      // Cascais CTR (SFC to 2500) must be included
      expect(lowSectors.some((a) => a.id === 'LPCS_CTR')).toBe(true);
      
      // Lisboa TMA Sector 4 (4500' to FL245) must be excluded because floor 4500 > 1500
      expect(lowSectors.some((a) => a.id === 'LISBOA_TMA_4')).toBe(false);
    });

    it('generates actionable clearance advisory for CTR and Restricted airspace', async () => {
      const { getAirspaceClearanceAdvisory } = await import('../engine/airspace-engine');
      const cascaisCtr = AIRSPACES.find((a) => a.id === 'LPCS_CTR')!;
      const r51a = AIRSPACES.find((a) => a.id === 'LP_R51A')!;

      const ctrAdv = getAirspaceClearanceAdvisory(cascaisCtr, 1500);
      expect(ctrAdv.isClearanceRequired).toBe(true);
      expect(ctrAdv.frequency).toContain('120.305');
      expect(ctrAdv.actionTitle).toContain('CLEARANCE MANDATORY');

      const reAdv = getAirspaceClearanceAdvisory(r51a, 3500);
      expect(reAdv.isClearanceRequired).toBe(true);
      expect(reAdv.actionTitle).toContain('RESTRICTED AIRSPACE');
      expect(reAdv.actionDetail).toContain('NOTAM');
    });

    it('validates all airspaces in the expanded catalog have valid coordinates and non-zero area', () => {
      expect(AIRSPACES.length).toBeGreaterThanOrEqual(25);
      for (const as of AIRSPACES) {
        expect(as.polygon.length).toBeGreaterThanOrEqual(3);
        expect(as.lowerLimitFt).toBeGreaterThanOrEqual(0);
        expect(as.upperLimitFt).toBeGreaterThan(as.lowerLimitFt);
        expect(as.name).toBeTruthy();
        expect(as.id).toBeTruthy();
      }
    });
  });

  describe('Airspace Alert Action Bar & Conflict Details Components', () => {
    it('detects critical conflicts on route crossing LP-R42 Alcochete', async () => {
      const { checkRouteAirspaceConflicts } = await import('../engine/airspace-engine');
      const wpt1 = makeWpt(1, 'WPT1', 38.76, -8.95);
      const wpt2 = makeWpt(2, 'WPT2', 38.76, -8.60);
      const legs = [makeLeg(wpt1, wpt2, 4500)];

      const report = checkRouteAirspaceConflicts(legs, AIRSPACES);
      const active = report.conflicts.filter((c) => c.status === 'PENETRATING' || c.status === 'CLIPPING');
      expect(active.length).toBeGreaterThan(0);
      
      const r42 = active.find((c) => c.airspace.id === 'LP_R42');
      expect(r42).toBeDefined();
      expect(r42?.severity).toBe('CRITICAL');
      expect(r42?.status).toBe('PENETRATING');
    });

    it('reports clear of conflicts when cruising above LP-R42 ceiling at 15,000 ft', async () => {
      const { checkRouteAirspaceConflicts } = await import('../engine/airspace-engine');
      const wpt1 = makeWpt(1, 'WPT1', 38.76, -8.95);
      const wpt2 = makeWpt(2, 'WPT2', 38.76, -8.60);
      const legs = [makeLeg(wpt1, wpt2, 15000)];

      const report = checkRouteAirspaceConflicts(legs, AIRSPACES);
      // R42 upper limit is 14,000 ft, so at 15,000 ft it should be ABOVE, not PENETRATING
      const r42 = report.conflicts.find((c) => c.airspace.id === 'LP_R42');
      expect(r42?.status).toBe('ABOVE');
    });

    it('accurately filters airspaces that the route passes through or penetrates', () => {
      // Route: Cascais (LPCS) to Coimbra (LPCO) at 4,500 ft
      const lpcs = makeWpt(1, 'LPCS', 38.725, -9.355);
      const lpco = makeWpt(2, 'LPCO', 40.158, -8.470);
      const legs = [makeLeg(lpcs, lpco, 4500)];

      const routeFilter = (as: typeof AIRSPACES[0]) => {
        return legs.some((leg) => {
          const start: [number, number] = [leg.from.latitude, leg.from.longitude];
          const end: [number, number] = [leg.to.latitude, leg.to.longitude];
          const overlaps = doesSegmentOverlapPolygon(start, end, as.polygon);
          if (!overlaps) return false;
          if (!leg.altitude || leg.altitude <= 0) return true;
          if (isPointInPolygon(start, as.polygon) || isPointInPolygon(end, as.polygon)) {
            return as.lowerLimitFt <= leg.altitude + 500;
          }
          return leg.altitude >= as.lowerLimitFt - 500 && leg.altitude <= as.upperLimitFt + 500;
        });
      };

      const matched = AIRSPACES.filter(routeFilter);
      const matchedIds = matched.map((a) => a.id);

      // Cascais CTR (departure containment) must be matched
      expect(matchedIds).toContain('LPCS_CTR');
      // Coimbra ATZ (arrival containment) must be matched
      expect(matchedIds).toContain('LPCO_ATZ');

      // Faraway southern airspaces must NOT be matched
      expect(matchedIds).not.toContain('LPFR_CTR');
      expect(matchedIds).not.toContain('FARO_TMA');
      expect(matchedIds).not.toContain('LPBJ_CTR');
    });
  });
});
