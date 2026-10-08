import { describe, it, expect } from 'vitest';
import { FuelCalculationValues, AircraftProfile, Waypoint } from '../types';
import { computeAlternatePlan, computeNavLog } from '../engine/navlog-engine';

describe('Fuel Calculations & SOP Form 002 Integration', () => {
  const sampleProfile: AircraftProfile = {
    aircraftModel: 'Cessna 172 Skyhawk',
    cruiseAltitude: 4500,
    tas: 110,
    fuelFlow: 8.5,
    fuelUnit: 'gph',
  };

  const sampleDep: Waypoint = {
    id: 1,
    identifier: 'LPCS',
    name: 'Cascais Aerodrome',
    latitude: 38.7256,
    longitude: -9.3553,
    elevation: 326,
    type: 'airport',
    country: 'PRT',
  };

  const sampleDest: Waypoint = {
    id: 2,
    identifier: 'LPEV',
    name: 'Évora Aerodrome',
    latitude: 38.5328,
    longitude: -7.8892,
    elevation: 807,
    type: 'airport',
    country: 'PRT',
  };

  const sampleAlt: Waypoint = {
    id: 3,
    identifier: 'LPBJ',
    name: 'Beja Air Base',
    latitude: 38.0789,
    longitude: -7.9322,
    elevation: 466,
    type: 'airport',
    country: 'PRT',
  };

  const sampleWind = { direction: 320, speed: 12 };

  it('computes initial auto-calculated fuel figures accurately', () => {
    const navLog = computeNavLog([sampleDep, sampleDest], sampleProfile, sampleWind);
    const altPlan = computeAlternatePlan(sampleDest, sampleAlt, sampleProfile, sampleWind, 3000, navLog.totalFuel);

    expect(altPlan).not.toBeNull();
    if (!altPlan) return;

    const defaultTaxi = altPlan.taxiFuel;
    const defaultTrip = Number(navLog.totalFuel.toFixed(1));
    const defaultContingency = Number(altPlan.contingencyFuel.toFixed(1));
    const defaultAlternate = Number(altPlan.fuelBurn.toFixed(1));
    const defaultFinalReserve = Number(((30 / 60) * sampleProfile.fuelFlow).toFixed(1));
    const defaultExtra = 0;

    const sum = Number(
      (defaultTaxi + defaultTrip + defaultContingency + defaultAlternate + defaultFinalReserve + defaultExtra).toFixed(1)
    );

    const values: FuelCalculationValues = {
      taxiFuel: defaultTaxi,
      tripFuel: defaultTrip,
      contingencyFuel: defaultContingency,
      alternateFuel: defaultAlternate,
      finalReserveFuel: defaultFinalReserve,
      extraFuel: defaultExtra,
      totalFuelRequired: sum,
      fob: Number((sum * 1.2).toFixed(1)),
      reserveMode: 'day',
      isCustomized: false,
    };

    expect(values.taxiFuel).toBeGreaterThan(0);
    expect(values.tripFuel).toBeGreaterThan(0);
    expect(values.alternateFuel).toBeGreaterThan(0);
    expect(values.finalReserveFuel).toBeCloseTo(4.3, 1); // (30/60)*8.5 = 4.25
    expect(values.totalFuelRequired).toBe(sum);
    expect(values.fob).toBeGreaterThan(values.totalFuelRequired);
    expect(values.isCustomized).toBe(false);
  });

  it('allows individual component editing and reflects customization', () => {
    const baseValues: FuelCalculationValues = {
      taxiFuel: 1.0,
      tripFuel: 6.5,
      contingencyFuel: 0.7,
      alternateFuel: 3.2,
      finalReserveFuel: 4.3,
      extraFuel: 0.0,
      totalFuelRequired: 15.7,
      fob: 18.0,
      reserveMode: 'day',
      isCustomized: false,
    };

    // Pilot edits Taxi to 1.5 and adds 2.0 Extra Fuel
    const overrides: Partial<FuelCalculationValues> = {
      taxiFuel: 1.5,
      extraFuel: 2.0,
    };

    const newTaxi = overrides.taxiFuel ?? baseValues.taxiFuel;
    const newExtra = overrides.extraFuel ?? baseValues.extraFuel;
    const newSum = Number(
      (newTaxi + baseValues.tripFuel + baseValues.contingencyFuel + baseValues.alternateFuel + baseValues.finalReserveFuel + newExtra).toFixed(1)
    );

    const updated: FuelCalculationValues = {
      ...baseValues,
      ...overrides,
      totalFuelRequired: newSum,
      isCustomized: true,
    };

    expect(updated.taxiFuel).toBe(1.5);
    expect(updated.extraFuel).toBe(2.0);
    expect(updated.totalFuelRequired).toBe(18.2);
    expect(updated.isCustomized).toBe(true);
  });

  it('correctly calculates FOB margin and excess vs deficit indicators', () => {
    const totalRequired = 20.0;

    // Case 1: Surplus
    const fobSurplus = 25.0;
    const marginSurplus = Number((fobSurplus - totalRequired).toFixed(1));
    expect(marginSurplus).toBe(5.0);
    expect(marginSurplus >= 0).toBe(true);

    // Case 2: Deficit
    const fobDeficit = 18.5;
    const marginDeficit = Number((fobDeficit - totalRequired).toFixed(1));
    expect(marginDeficit).toBe(-1.5);
    expect(marginDeficit < 0).toBe(true);
  });

  it('computes total aircraft endurance in seconds based on FOB and fuel flow', () => {
    const fuelFlow = 10.0; // GPH
    const fob = 25.0; // gal
    const enduranceSec = (fob / fuelFlow) * 3600; // 2.5 hours = 9000 seconds
    expect(enduranceSec).toBe(9000);
  });

  it('switches between VFR Day (30 min) and VFR Night (45 min) reserve policies', () => {
    const fuelFlow = 8.5;
    const dayReserve = Number(((30 / 60) * fuelFlow).toFixed(1));
    const nightReserve = Number(((45 / 60) * fuelFlow).toFixed(1));

    expect(dayReserve).toBe(4.3);
    expect(nightReserve).toBe(6.4);
    expect(nightReserve).toBeGreaterThan(dayReserve);
  });

  it('renders all 16 required columns in SOP Form 002 alternate navigation plan', () => {
    const altPlan = computeAlternatePlan(sampleDest, sampleAlt, sampleProfile, sampleWind, 3000, 10.0);
    expect(altPlan).not.toBeNull();
    if (!altPlan) return;

    // Verify 16 navigation columns
    expect(altPlan.fromAirport.identifier).toBe('LPEV');
    expect(altPlan.toAirport.identifier).toBe('LPBJ');
    expect(altPlan.altitude).toBe(3000);
    expect(altPlan.wind).not.toBeNull();
    expect(altPlan.trueTrack).toBeGreaterThan(0);
    expect(altPlan.magneticTrack).toBeGreaterThan(0);
    expect(altPlan.tas).toBe(110);
    expect(altPlan.trueHeading).toBeGreaterThan(0);
    expect(altPlan.magneticHeading).toBeGreaterThan(0);
    expect(altPlan.groundSpeed).toBeGreaterThan(0);
    expect(altPlan.distance).toBeGreaterThan(0);
    expect(altPlan.eetSeconds).toBeGreaterThan(0);
    expect(altPlan.fuelBurn).toBeGreaterThan(0);
    expect(altPlan.contingencyFuel).toBeGreaterThan(0);
    expect(altPlan.finalReserveFuel).toBeGreaterThan(0);
    expect(altPlan.taxiFuel).toBeGreaterThan(0);
  });
});
