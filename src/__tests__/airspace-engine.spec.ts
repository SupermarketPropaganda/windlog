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
});
