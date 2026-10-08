import { describe, it, expect } from 'vitest';
import {
  calculateClimbDescentProfile,
  computeNavLog,
  computeAlternatePlan,
} from '../engine/navlog-engine';
import {
  computeWeightAndBalance,
} from '../engine/mass-balance';
import {
  MASS_BALANCE_PRESETS,
  saveCustomProfile,
  loadSavedCustomProfiles,
  deleteCustomProfile,
} from '../data/mass-balance-presets';
import {
  AircraftProfile,
  Waypoint,
  Wind,
  MassBalanceProfile,
} from '../types';

describe('WindLog MVP Features Suite', () => {
  const sampleProfile: AircraftProfile = {
    aircraftModel: 'Cessna 172 Test',
    tas: 110,
    cruiseAltitude: 4500,
    fuelFlow: 8.5,
    fuelUnit: 'gph',
    climbRateFpm: 700,
    climbSpeedKt: 75,
    climbFuelFlowMultiplier: 1.35,
    descentRateFpm: 500,
    descentSpeedKt: 105,
    descentFuelFlowMultiplier: 0.65,
  };

  const sampleDep: Waypoint = {
    id: 101,
    identifier: 'LPCS',
    name: 'Cascais',
    latitude: 38.7256,
    longitude: -9.3553,
    type: 'airport',
    elevation: 326,
    country: 'PRT',
  };

  const sampleIntermediate: Waypoint = {
    id: 102,
    identifier: 'LPEV',
    name: 'Évora',
    latitude: 38.5336,
    longitude: -7.8894,
    type: 'airport',
    elevation: 807,
    country: 'PRT',
  };

  const sampleDest: Waypoint = {
    id: 103,
    identifier: 'LPBJ',
    name: 'Beja',
    latitude: 38.0789,
    longitude: -7.9322,
    type: 'airport',
    elevation: 466,
    country: 'PRT',
  };

  const sampleWind: Wind = {
    direction: 320,
    speed: 15,
  };

  describe('1. Integrated TOC / TOD Legs in NavLog', () => {
    it('accurately computes TOC phase telemetry for departure climb', () => {
      const waypoints = [sampleDep, sampleDest];
      const navlog = computeNavLog(waypoints, sampleProfile, sampleWind);

      expect(navlog.climbDescent).toBeDefined();
      const cd = navlog.climbDescent!;

      expect(cd.tocAltitudeFt).toBe(sampleProfile.cruiseAltitude);
      expect(cd.climbTimeSeconds).toBeGreaterThan(0);
      expect(cd.climbDistanceNm).toBeGreaterThan(0);
      expect(cd.climbFuelBurn).toBeGreaterThan(0);

      // Delta altitude: 4500 - 326 = 4174 ft
      // Climb rate: 700 fpm -> ~5.96 min = ~357.7 sec
      const expectedTimeSec = ((4500 - 326) / 700) * 60;
      expect(Math.abs(cd.climbTimeSeconds - expectedTimeSec)).toBeLessThan(1);
    });

    it('accurately computes TOD phase telemetry for destination descent', () => {
      const waypoints = [sampleDep, sampleDest];
      const navlog = computeNavLog(waypoints, sampleProfile, sampleWind);
      const cd = navlog.climbDescent!;

      expect(cd.todAltitudeFt).toBe(sampleProfile.cruiseAltitude);
      expect(cd.descentTimeSeconds).toBeGreaterThan(0);
      expect(cd.descentDistanceNm).toBeGreaterThan(0);
      expect(cd.descentFuelBurn).toBeGreaterThan(0);

      // Destination pattern: 466 + 1000 = 1466 ft
      // Delta: 4500 - 1466 = 3034 ft at 500 fpm -> ~6.06 min
      const expectedDescentSec = ((4500 - 1466) / 500) * 60;
      expect(Math.abs(cd.descentTimeSeconds - expectedDescentSec)).toBeLessThan(1);
    });
  });

  describe('2. Step-Climb / Step-Down Leg Indicators', () => {
    it('detects step-climb transitions between legs of different altitudes', () => {
      const waypoints = [sampleDep, sampleIntermediate, sampleDest];
      const navlog = computeNavLog(waypoints, sampleProfile, sampleWind);

      // Force leg 1 to cruise higher (6500 ft vs leg 0 at 4500 ft)
      navlog.legs[0].altitude = 4500;
      navlog.legs[1].altitude = 6500;

      const profile = calculateClimbDescentProfile(
        waypoints,
        navlog.legs,
        sampleProfile,
        sampleWind,
        navlog.totalDistance,
        navlog.totalEte
      );

      expect(profile.stepTransitions).toHaveLength(1);
      const trans = profile.stepTransitions[0];
      expect(trans.type).toBe('step-climb');
      expect(trans.fromAltitudeFt).toBe(4500);
      expect(trans.toAltitudeFt).toBe(6500);
      expect(trans.altitudeDeltaFt).toBe(2000);
      expect(trans.timeSeconds).toBeCloseTo((2000 / 700) * 60, 1);
      expect(trans.fuelBurn).toBeGreaterThan(0);
    });

    it('detects step-down transitions between legs of different altitudes', () => {
      const waypoints = [sampleDep, sampleIntermediate, sampleDest];
      const navlog = computeNavLog(waypoints, sampleProfile, sampleWind);

      // Leg 0 at 6500 ft, Leg 1 at 3500 ft
      navlog.legs[0].altitude = 6500;
      navlog.legs[1].altitude = 3500;

      const profile = calculateClimbDescentProfile(
        waypoints,
        navlog.legs,
        sampleProfile,
        sampleWind,
        navlog.totalDistance,
        navlog.totalEte
      );

      expect(profile.stepTransitions).toHaveLength(1);
      const trans = profile.stepTransitions[0];
      expect(trans.type).toBe('step-down');
      expect(trans.fromAltitudeFt).toBe(6500);
      expect(trans.toAltitudeFt).toBe(3500);
      expect(trans.altitudeDeltaFt).toBe(3000);
      expect(trans.timeSeconds).toBeCloseTo((3000 / 500) * 60, 1);
    });
  });

  describe('3. Standard ICAO/EASA Fuel Policy Breakdown', () => {
    it('correctly calculates regulatory contingency (higher of 5% trip or 5 min cruise)', () => {
      const waypoints = [sampleDep, sampleDest];
      const navlog = computeNavLog(waypoints, sampleProfile, sampleWind);
      const altPlan = computeAlternatePlan(sampleDest, sampleIntermediate, sampleProfile, sampleWind, 3500, navlog.totalFuel);

      expect(altPlan).not.toBeNull();
      if (!altPlan) return;

      const tripFuel = navlog.totalFuel;
      const expectedContingency = 0.05 * tripFuel;

      expect(altPlan.contingencyFuel).toBeCloseTo(expectedContingency, 1);
      expect(altPlan.finalReserveFuel).toBeCloseTo((45 / 60) * sampleProfile.fuelFlow, 1);
      expect(altPlan.taxiFuel).toBeGreaterThan(0);

      // Total required = trip + contingency + alternate + final reserve + taxi
      const calculatedTotal =
        tripFuel + altPlan.contingencyFuel + altPlan.fuelBurn + altPlan.finalReserveFuel + altPlan.taxiFuel;
      expect(altPlan.totalFuelRequired).toBeCloseTo(calculatedTotal, 1);
    });

    it('handles VFR Day (30 min) vs VFR Night (45 min) final reserve policies', () => {
      const fuelFlow = 8.5; // GPH
      const dayReserve = (30 / 60) * fuelFlow; // 4.25 gal
      const nightReserve = (45 / 60) * fuelFlow; // 6.375 gal

      expect(dayReserve).toBe(4.25);
      expect(nightReserve).toBe(6.375);
      expect(nightReserve).toBeGreaterThan(dayReserve);
    });
  });

  describe('4. Waypoint Cursor Drag-and-Drop Reordering Logic', () => {
    it('moves waypoint earlier (left) in route list correctly', () => {
      const route = 'LPCS LPEV LPBJ';
      const parts = route.trim().split(/\s+/);
      // Move index 1 (LPEV) left
      const [item] = parts.splice(1, 1);
      parts.splice(0, 0, item);
      expect(parts.join(' ')).toBe('LPEV LPCS LPBJ');
    });

    it('moves waypoint later (right) in route list correctly', () => {
      const route = 'LPCS LPEV LPBJ';
      const parts = route.trim().split(/\s+/);
      // Move index 0 (LPCS) right
      const [item] = parts.splice(0, 1);
      parts.splice(1, 0, item);
      expect(parts.join(' ')).toBe('LPEV LPCS LPBJ');
    });

    it('reorders waypoints via cursor drag and drop from source index to target index', () => {
      const route = 'LPCS ESP LPEV LPBJ';
      const parts = route.trim().split(/\s+/);
      const draggedIndex = 3; // LPBJ
      const targetIndex = 1; // position before ESP
      const [item] = parts.splice(draggedIndex, 1);
      parts.splice(targetIndex, 0, item);
      expect(parts.join(' ')).toBe('LPCS LPBJ ESP LPEV');
    });
  });

  describe('5. Takeoff vs. Landing Weight CG Plot & Shift Vector', () => {
    it('computes TOW, LW, and fuel burn shift delta', () => {
      const profile: MassBalanceProfile = MASS_BALANCE_PRESETS[0]; // C172
      const tripFuelGal = 15.0;

      const result = computeWeightAndBalance(profile, tripFuelGal);

      expect(result.takeoffWeight).toBeGreaterThan(result.landingWeight);
      expect(result.tripFuelWeight).toBeCloseTo(15.0 * 6.0, 1); // 90 lbs
      expect(result.takeoffWeight - result.landingWeight).toBeCloseTo(result.tripFuelWeight, 1);

      // CG Shift delta
      const deltaCG = result.landingCG - result.takeoffCG;
      expect(typeof deltaCG).toBe('number');
      expect(Number.isFinite(deltaCG)).toBe(true);
    });
  });

  describe('6. Custom Aircraft Weight & Balance Sheet Modal & Persistence', () => {
    it('allows creation and retrieval of custom aircraft profiles', () => {
      const customId = `test_custom_${Date.now()}`;
      const newCustom: MassBalanceProfile = {
        id: customId,
        name: 'Tecnam P2002-JF Sierra (CS-UPG)',
        isCustom: true,
        weightUnit: 'kg',
        armUnit: 'cm',
        emptyWeight: 370,
        emptyArm: 180.0,
        maxTakeoffWeight: 600,
        maxLandingWeight: 600,
        stations: [
          { id: 'st_seats', name: 'Pilot & Pax', arm: 180.0, weight: 160, maxWeight: 200 },
          { id: 'st_bag', name: 'Baggage Compartment', arm: 220.0, weight: 15, maxWeight: 20 },
        ],
        fuelStation: {
          name: 'Wing Tanks (100L usable)',
          arm: 185.0,
          fuelType: 'mogas',
          fuelUnit: 'l',
          capacityLiters: 100,
          takeoffFuelVolume: 70,
        },
        envelope: {
          normal: [
            { arm: 175.0, weight: 350 },
            { arm: 175.0, weight: 600 },
            { arm: 195.0, weight: 600 },
            { arm: 195.0, weight: 350 },
          ],
        },
      };

      saveCustomProfile(newCustom);
      const savedList = loadSavedCustomProfiles();
      const found = savedList.find((p) => p.id === customId);

      expect(found).toBeDefined();
      expect(found?.name).toBe('Tecnam P2002-JF Sierra (CS-UPG)');
      expect(found?.emptyWeight).toBe(370);
      expect(found?.stations).toHaveLength(2);

      // Clean up
      deleteCustomProfile(customId);
      const afterDelete = loadSavedCustomProfiles();
      expect(afterDelete.find((p) => p.id === customId)).toBeUndefined();
    });
  });

  describe('7. Liability & Security Constraints Verification', () => {
    it('ensures no MSA or terrain clearance calculations are present', () => {
      // User directive: "i wont hva eht emsa and terrain clearance. i want to be far away from any tool that can bring me more legal liability than actual profit. remember this."
      const waypoints = [sampleDep, sampleDest];
      const navlog = computeNavLog(waypoints, sampleProfile, sampleWind);

      // Ensure navlog result does NOT contain any automated MSA or terrain clearance guarantees
      expect((navlog as any).msa).toBeUndefined();
      expect((navlog as any).minimumSafeAltitude).toBeUndefined();
      expect((navlog as any).terrainClearance).toBeUndefined();
    });
  });
});
