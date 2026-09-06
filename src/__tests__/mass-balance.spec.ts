import { describe, it, expect } from 'vitest';
import {
  computeWeightAndBalance,
  isPointInPolygon,
  getFuelWeight,
  convertWeight,
} from '../engine/mass-balance';
import { MASS_BALANCE_PRESETS } from '../data/mass-balance-presets';
import { MassBalanceProfile } from '../types';

describe('Mass & Balance Physics & Envelope Engine', () => {
  const c172Preset = MASS_BALANCE_PRESETS.find((p) => p.id === 'c172')!;
  const pa28Preset = MASS_BALANCE_PRESETS.find((p) => p.id === 'pa28')!;
  const p2002Preset = MASS_BALANCE_PRESETS.find((p) => p.id === 'p2002')!;

  describe('1. Fuel Weight & Unit Conversion', () => {
    it('converts avgas volume to exact weight in lbs and kg', () => {
      // 10 US gal of Avgas = 60.0 lbs
      const weightLbs = getFuelWeight(10, 'gal', 'lbs', 'avgas');
      expect(weightLbs).toBeCloseTo(60.0, 1);

      // 100 Liters of Avgas = 72.0 kg
      const weightKg = getFuelWeight(100, 'l', 'kg', 'avgas');
      expect(weightKg).toBeCloseTo(72.0, 1);

      // 100 Liters of Mogas = 71.0 kg
      const weightMogasKg = getFuelWeight(100, 'l', 'kg', 'mogas');
      expect(weightMogasKg).toBeCloseTo(71.0, 1);
    });

    it('converts weight between kg and lbs', () => {
      expect(convertWeight(100, 'kg', 'lbs')).toBeCloseTo(220.46, 1);
      expect(convertWeight(220.462, 'lbs', 'kg')).toBeCloseTo(100.0, 1);
    });
  });

  describe('2. Point-in-Polygon Envelope Containment', () => {
    const square = [
      { arm: 35.0, weight: 1500 },
      { arm: 35.0, weight: 2500 },
      { arm: 45.0, weight: 2500 },
      { arm: 45.0, weight: 1500 },
    ];

    it('correctly identifies interior points', () => {
      expect(isPointInPolygon({ arm: 40.0, weight: 2000 }, square)).toBe(true);
      expect(isPointInPolygon({ arm: 36.0, weight: 1600 }, square)).toBe(true);
    });

    it('correctly identifies boundary lines and vertex points as legal inside envelope', () => {
      // Top boundary (exact MTOW)
      expect(isPointInPolygon({ arm: 40.0, weight: 2500 }, square)).toBe(true);
      // Vertices
      expect(isPointInPolygon({ arm: 35.0, weight: 1500 }, square)).toBe(true);
      expect(isPointInPolygon({ arm: 35.0, weight: 2500 }, square)).toBe(true);
      expect(isPointInPolygon({ arm: 45.0, weight: 2500 }, square)).toBe(true);
      expect(isPointInPolygon({ arm: 45.0, weight: 1500 }, square)).toBe(true);
      // Right edge
      expect(isPointInPolygon({ arm: 45.0, weight: 2000 }, square)).toBe(true);
    });

    it('correctly rejects exterior points', () => {
      expect(isPointInPolygon({ arm: 30.0, weight: 2000 }, square)).toBe(false); // Too far forward
      expect(isPointInPolygon({ arm: 50.0, weight: 2000 }, square)).toBe(false); // Too far aft
      expect(isPointInPolygon({ arm: 40.0, weight: 2600 }, square)).toBe(false); // Overweight
      expect(isPointInPolygon({ arm: 40.0, weight: 1400 }, square)).toBe(false); // Underweight
    });
  });

  describe('3. Cessna 172S Loading Calculations', () => {
    it('computes standard loading within normal envelope', () => {
      const result = computeWeightAndBalance(c172Preset, 10); // 10 gal trip burn

      expect(result.zeroFuelWeight).toBeGreaterThan(1663);
      expect(result.takeoffWeight).toBeGreaterThan(result.zeroFuelWeight);
      expect(result.landingWeight).toBeLessThan(result.takeoffWeight);

      expect(result.isTOWInEnvelope).toBe(true);
      expect(result.isOverweightTOW).toBe(false);
      expect(result.weightMargin).toBeGreaterThan(0);
    });

    it('detects overweight takeoff condition when heavily loaded', () => {
      const heavyC172: MassBalanceProfile = JSON.parse(JSON.stringify(c172Preset));
      // Overload stations
      heavyC172.stations[0].weight = 400; // Pilot & Front Pax
      heavyC172.stations[1].weight = 400; // Rear Pax
      heavyC172.stations[2].weight = 120; // Baggage 1
      heavyC172.stations[3].weight = 50;  // Baggage 2
      heavyC172.fuelStation.takeoffFuelVolume = 53; // Full fuel (318 lbs)

      const result = computeWeightAndBalance(heavyC172);
      expect(result.takeoffWeight).toBeGreaterThan(2550);
      expect(result.isOverweightTOW).toBe(true);
      expect(result.warnings.some((w) => w.includes('exceeds MTOW'))).toBe(true);
    });
  });

  describe('4. Piper PA-28-181 Loading Calculations', () => {
    it('computes standard PA-28 loading within normal envelope', () => {
      const result = computeWeightAndBalance(pa28Preset, 8);
      expect(result.zeroFuelWeight).toBeGreaterThan(1630);
      expect(result.takeoffWeight).toBeGreaterThan(result.zeroFuelWeight);
      expect(result.isTOWInEnvelope).toBe(true);
      expect(result.isOverweightTOW).toBe(false);
    });
  });

  describe('5. Tecnam P2002-JF Sierra Loading Calculations', () => {
    it('computes metric weights and arms correctly', () => {
      const result = computeWeightAndBalance(p2002Preset, 15); // 15 L trip burn

      // BEW = 360 kg, Pilot = 150 kg, Bag = 10 kg, 70L Mogas = 49.7 kg
      // Expected TOW = 569.7 kg (MTOW is 600 kg)
      expect(result.takeoffWeight).toBeCloseTo(569.7, 1);
      expect(result.isTOWInEnvelope).toBe(true);
      expect(result.takeoffCG).toBeGreaterThan(1.78);
      expect(result.takeoffCG).toBeLessThan(1.95);
    });
  });
});
