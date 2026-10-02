import { describe, it, expect } from 'vitest';
import {
  computeNavLog,
  computeAlternatePlan,
  findNearestCandidateAlternates,
  getSemicircularOptions,
} from '../engine/navlog-engine';
import { AircraftProfile, Waypoint, Wind } from '../types';
import { getAllCandidateAlternates } from '../data/airport-runways';

const testProfile: AircraftProfile = {
  aircraftModel: 'Tecnam P2002-JF',
  cruiseAltitude: 4500,
  tas: 105,
  fuelFlow: 5.5,
  fuelUnit: 'gph',
  climbRateFpm: 700,
  climbSpeedKt: 75,
  climbFuelFlowMultiplier: 1.35,
  descentRateFpm: 500,
  descentSpeedKt: 100,
  descentFuelFlowMultiplier: 0.65,
  bestGlideRatio: 10,
  usableFuel: 26.0,
};

const depWp: Waypoint = {
  id: 1,
  identifier: 'LPCS',
  name: 'Cascais Aerodrome',
  latitude: 38.7256,
  longitude: -9.3553,
  elevation: 326,
  country: 'PT',
  type: 'airport',
};

const destWp: Waypoint = {
  id: 2,
  identifier: 'LPEV',
  name: 'Évora Aerodrome',
  latitude: 38.5322,
  longitude: -7.8897,
  elevation: 807,
  country: 'PT',
  type: 'airport',
};

const altWp: Waypoint = {
  id: 3,
  identifier: 'LPBJ',
  name: 'Beja Air Base / Civil Terminal',
  latitude: 38.0789,
  longitude: -7.9322,
  elevation: 597,
  country: 'PT',
  type: 'airport',
};

const calmWind: Wind = { direction: 0, speed: 0 };
const headwind: Wind = { direction: 90, speed: 15 };

describe('Climb & Descent Profile Calculations (TOC / TOD)', () => {
  it('calculates climb parameters and Top of Climb (TOC)', () => {
    const navLog = computeNavLog([depWp, destWp], testProfile, calmWind);
    expect(navLog).not.toBeNull();
    expect(navLog.climbDescent).toBeDefined();

    const cd = navLog.climbDescent!;
    // Altitude to gain = 4500 - 326 = 4174 ft
    // At 700 fpm: ~5.96 min = ~358 seconds
    expect(cd.climbTimeSeconds).toBeGreaterThan(300);
    expect(cd.climbTimeSeconds).toBeLessThan(420);

    // Distance at 75 kt: ~7.4 NM
    expect(cd.climbDistanceNm).toBeGreaterThan(6);
    expect(cd.climbDistanceNm).toBeLessThan(9);

    // Climb fuel at 5.5 * 1.35 = 7.425 gph: ~0.74 gal
    expect(cd.climbFuelBurn).toBeGreaterThan(0.5);
    expect(cd.climbFuelBurn).toBeLessThan(1.2);

    // TOC coordinate is placed along the route
    expect(cd.tocCoordinate).toBeDefined();
    expect(cd.tocCoordinate!.latitude).toBeGreaterThan(38.4);
    expect(cd.tocCoordinate!.latitude).toBeLessThan(38.8);
  });

  it('calculates descent parameters and Top of Descent (TOD)', () => {
    const navLog = computeNavLog([depWp, destWp], testProfile, calmWind);
    const cd = navLog.climbDescent!;

    // Altitude to lose from 4500 ft to traffic pattern (807 + 1000 = 1807 ft) = 2693 ft
    // At 500 fpm: 5.38 min = ~323 seconds
    expect(cd.descentTimeSeconds).toBeGreaterThan(300);
    expect(cd.descentTimeSeconds).toBeLessThan(360);

    // Distance at 100 kt: ~8.98 NM
    expect(cd.descentDistanceNm).toBeGreaterThan(8);
    expect(cd.descentDistanceNm).toBeLessThan(11);

    // Reduced descent fuel burn at 0.65x
    expect(cd.descentFuelBurn).toBeGreaterThan(0.3);
    expect(cd.descentFuelBurn).toBeLessThan(0.8);

    // TOD is positioned before destination
    expect(cd.todDistanceNm).toBeGreaterThan(cd.tocDistanceNm);
    expect(cd.todCoordinate).toBeDefined();
  });

  it('calculates step-climb and step-down transitions across route legs', () => {
    const midWp: Waypoint = {
      id: 4,
      identifier: 'MAXED',
      name: 'VFR Waypoint',
      latitude: 38.65,
      longitude: -8.5,
      country: 'PT',
      type: 'vrp',
    };

    // Override leg altitudes: leg 0 at 3500 ft, leg 1 at 5500 ft (step climb)
    const legOverrides = [3500, 5500];
    const navLog = computeNavLog([depWp, midWp, destWp], testProfile, calmWind, legOverrides);
    const cd = navLog.climbDescent!;

    expect(cd.stepTransitions.length).toBe(1);
    const trans = cd.stepTransitions[0];
    expect(trans.type).toBe('step-climb');
    expect(trans.fromAltitudeFt).toBe(3500);
    expect(trans.toAltitudeFt).toBe(5500);
    expect(trans.altitudeDeltaFt).toBe(2000);
    expect(trans.timeSeconds).toBeGreaterThan(150);
  });
});

describe('Alternate Aerodrome & Diversion Planning (SOP Form 002)', () => {
  it('computes diversion plan and wind triangle to alternate', () => {
    const plan = computeAlternatePlan(destWp, altWp, testProfile, headwind, 3500, 4.2);

    expect(plan.fromAirport.identifier).toBe('LPEV');
    expect(plan.toAirport.identifier).toBe('LPBJ');
    expect(plan.altitude).toBe(3500);

    // Track is roughly south (~180°)
    expect(plan.trueTrack).toBeGreaterThan(160);
    expect(plan.trueTrack).toBeLessThan(200);

    // Magnetic heading includes magnetic variation and wind correction
    expect(plan.magneticHeading).toBeGreaterThan(150);
    expect(plan.magneticHeading).toBeLessThan(210);

    // Distance LPEV to LPBJ is ~27 NM
    expect(plan.distance).toBeGreaterThan(24);
    expect(plan.distance).toBeLessThan(32);

    // Ground speed and EET
    expect(plan.groundSpeed).toBeGreaterThan(80);
    expect(plan.eetSeconds).toBeGreaterThan(600);
    expect(plan.eetSeconds).toBeLessThan(1800);

    // Diversion fuel
    expect(plan.fuelBurn).toBeGreaterThan(1.0);
    expect(plan.fuelBurn).toBeLessThan(3.0);
  });

  it('computes SOP Form 002 fuel requirement breakdown with legal reserves', () => {
    const tripFuel = 5.0; // 5.0 gal trip fuel
    const plan = computeAlternatePlan(destWp, altWp, testProfile, calmWind, 3500, tripFuel);

    // 5% Contingency
    expect(plan.contingencyFuel).toBeCloseTo(tripFuel * 0.05, 2);

    // 45m Final Reserve = 0.75h * 5.5 gph = 4.125 gal
    expect(plan.finalReserveFuel).toBeCloseTo(0.75 * 5.5, 2);

    // Taxi Fuel = 10 min taxi = (10/60) * 5.5 = ~0.92 gal
    expect(plan.taxiFuel).toBeGreaterThan(0.5);

    // Total required sum
    const expectedTotal =
      tripFuel +
      plan.contingencyFuel +
      plan.fuelBurn +
      plan.finalReserveFuel +
      plan.taxiFuel;
    expect(plan.totalFuelRequired).toBeCloseTo(expectedTotal, 2);
  });

  it('finds nearest candidate alternates sorted by distance', () => {
    const candidates = getAllCandidateAlternates();
    expect(candidates.length).toBeGreaterThan(10);

    const nearest = findNearestCandidateAlternates(destWp, candidates, 5);
    expect(nearest.length).toBe(5);

    // Must not include LPEV itself
    expect(nearest.some((a) => a.identifier === 'LPEV')).toBe(false);

    // LPBJ or LPMT should be among the closest to LPEV
    const icaos = nearest.map((n) => n.identifier);
    expect(icaos).toContain('LPBJ');
  });

  it('calculates semicircular cruising level recommendations', () => {
    // Eastbound (track 090) -> ODD + 500 (e.g. 1500, 3500, 5500, 7500...)
    const eastRule = getSemicircularOptions(90, 4000);
    expect(eastRule.isEastbound).toBe(true);
    expect(eastRule.ruleLabel).toContain('ODD');
    expect(eastRule.suggestedAltitude).toBe(3500);

    // Westbound (track 270) -> EVEN + 500 (e.g. 2500, 4500, 6500, 8500...)
    const westRule = getSemicircularOptions(270, 4000);
    expect(westRule.isEastbound).toBe(false);
    expect(westRule.ruleLabel).toContain('EVEN');
    expect(westRule.suggestedAltitude).toBe(4500);
  });
});
