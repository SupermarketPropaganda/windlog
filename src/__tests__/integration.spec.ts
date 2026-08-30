import { describe, it, expect } from 'vitest';
import { parseRouteString } from '../utils/route-parser';
import { computeNavLog } from '../engine/navlog-engine';
import { Waypoint, AircraftProfile, Wind } from '../types';

const mockWaypoints: Record<string, Waypoint> = {
  LPCS: {
    id: 1,
    identifier: 'LPCS',
    name: 'Cascais Airport',
    type: 'airport',
    latitude: 38.725,
    longitude: -9.355,
    elevation: 325,
    country: 'PT',
    isCustom: false,
  },
  COIMB: {
    id: 2,
    identifier: 'COIMB',
    name: 'COIMBRA',
    type: 'vrp',
    latitude: 40.2033,
    longitude: -8.4103,
    country: 'PT',
    isCustom: false,
  },
  LPPT: {
    id: 3,
    identifier: 'LPPT',
    name: 'Lisbon Airport',
    type: 'airport',
    latitude: 38.7813,
    longitude: -9.1359,
    elevation: 374,
    country: 'PT',
    isCustom: false,
  },
  CROCA: {
    id: 4,
    identifier: 'CROCA',
    name: 'CABO DA ROCA',
    type: 'vrp',
    latitude: 38.7803,
    longitude: -9.4986,
    country: 'PT',
    isCustom: false,
  },
};

const defaultProfile: AircraftProfile = {
  cruiseAltitude: 4500,
  tas: 105,
  fuelFlow: 8.5,
  fuelUnit: 'gph',
};

describe('Integration & Flight Log Pipeline Tests', () => {
  it('processes multi-leg route with explicit altitudes', () => {
    const routeInput = 'LPCS COIMB/4500 LPCS/3500';
    const tokens = parseRouteString(routeInput);
    expect(tokens).toHaveLength(3);

    const resolved = tokens
      .map(t => mockWaypoints[t.identifier])
      .filter((w): w is Waypoint => Boolean(w));
    expect(resolved).toHaveLength(3);

    const legAlts = [
      tokens[1].altitudeOverride || defaultProfile.cruiseAltitude,
      tokens[2].altitudeOverride || defaultProfile.cruiseAltitude,
    ];

    const wind: Wind = { direction: 320, speed: 15 };
    const navlog = computeNavLog(resolved, defaultProfile, wind, legAlts);

    expect(navlog.legs).toHaveLength(2);
    expect(navlog.totalDistance).toBeGreaterThan(150); // LPCS -> COIMB -> LPCS is ~190nm
    expect(navlog.totalEte).toBeGreaterThan(0);
    expect(navlog.legs[0].altitude).toBe(4500);
    expect(navlog.legs[1].altitude).toBe(3500);
  });

  it('processes circular routes cleanly: LPCS COIMB LPPT LPCS', () => {
    const routeInput = 'LPCS COIMB LPPT LPCS';
    const tokens = parseRouteString(routeInput);
    const resolved = tokens
      .map(t => mockWaypoints[t.identifier])
      .filter((w): w is Waypoint => Boolean(w));

    const navlog = computeNavLog(resolved, defaultProfile, null);
    expect(navlog.legs).toHaveLength(3);
    expect(navlog.legs[0].from.identifier).toBe('LPCS');
    expect(navlog.legs[0].to.identifier).toBe('COIMB');
    expect(navlog.legs[1].from.identifier).toBe('COIMB');
    expect(navlog.legs[1].to.identifier).toBe('LPPT');
    expect(navlog.legs[2].from.identifier).toBe('LPPT');
    expect(navlog.legs[2].to.identifier).toBe('LPCS');
    expect(navlog.totalDistance).toBeGreaterThan(100);
  });

  it('handles zero-distance consecutive waypoints: LPCS LPCS', () => {
    const routeInput = 'LPCS LPCS';
    const tokens = parseRouteString(routeInput);
    const resolved = tokens
      .map(t => mockWaypoints[t.identifier])
      .filter((w): w is Waypoint => Boolean(w));

    const navlog = computeNavLog(resolved, defaultProfile, null);
    expect(navlog.legs).toHaveLength(1);
    expect(navlog.legs[0].distance).toBe(0);
    expect(navlog.legs[0].ete).toBe(0);
    expect(navlog.totalDistance).toBe(0);
    expect(navlog.totalEte).toBe(0);
  });

  it('handles extreme headwind exceeding TAS gracefully', () => {
    const resolved = [mockWaypoints.LPCS, mockWaypoints.COIMB];
    const extremeWind: Wind = { direction: 0, speed: 120 }; // Wind > TAS (105kts)
    const navlog = computeNavLog(resolved, defaultProfile, extremeWind);

    expect(navlog.legs).toHaveLength(1);
    // Ground speed should be clamped to 0 or valid minimum, not negative or crashing
    expect(navlog.legs[0].groundSpeed).toBeGreaterThanOrEqual(0);
    expect(isFinite(navlog.legs[0].groundSpeed)).toBe(true);
  });

  it('handles extreme crosswind exceeding TAS gracefully', () => {
    const resolved = [mockWaypoints.LPCS, mockWaypoints.COIMB];
    const galeCrosswind: Wind = { direction: 90, speed: 120 }; // 120kt direct crosswind
    const navlog = computeNavLog(resolved, defaultProfile, galeCrosswind);

    expect(navlog.legs).toHaveLength(1);
    expect(navlog.legs[0].groundSpeed).toBe(0);
    expect(Math.abs(navlog.legs[0].windCorrectionAngle)).toBeLessThanOrEqual(90);
  });
});
