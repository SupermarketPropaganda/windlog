import { describe, it, expect } from 'vitest';
import {
  computeRunwayWindComponents,
  normalizeAngle360,
  normalizeAngle180,
} from '../engine/runway-wind';

describe('Runway Wind & Crosswind Trigonometry Engine', () => {
  describe('1. Angle Normalization', () => {
    it('normalizes degrees to 0-360 range', () => {
      expect(normalizeAngle360(0)).toBe(360);
      expect(normalizeAngle360(360)).toBe(360);
      expect(normalizeAngle360(370)).toBe(10);
      expect(normalizeAngle360(-10)).toBe(350);
    });

    it('normalizes relative angle to -180 to +180 range', () => {
      expect(normalizeAngle180(0)).toBe(0);
      expect(normalizeAngle180(190)).toBe(-170);
      expect(normalizeAngle180(-190)).toBe(170);
      expect(normalizeAngle180(45)).toBe(45);
    });
  });

  describe('2. Direct Headwinds & Tailwinds', () => {
    it('computes 100% headwind on aligned runway', () => {
      // RWY 27 (270°), Wind 270° @ 20kt
      const res = computeRunwayWindComponents(270, 270, 20);
      expect(res.headwind).toBeCloseTo(20.0, 1);
      expect(res.crosswind).toBeCloseTo(0.0, 1);
      expect(res.crosswindSide).toBe('direct');
      expect(res.reciprocalHeadwind).toBeCloseTo(-20.0, 1); // Tailwind on opposite runway 09
    });

    it('computes 100% tailwind on opposite runway', () => {
      // RWY 09 (090°), Wind 270° @ 15kt
      const res = computeRunwayWindComponents(90, 270, 15);
      expect(res.headwind).toBeCloseTo(-15.0, 1);
      expect(res.crosswind).toBeCloseTo(0.0, 1);
      expect(res.reciprocalHeadwind).toBeCloseTo(15.0, 1);
    });
  });

  describe('3. Pure 90° Crosswinds (Left & Right)', () => {
    it('computes 90° crosswind from the RIGHT', () => {
      // RWY 36 (360°), Wind 090° @ 15kt
      const res = computeRunwayWindComponents(360, 90, 15);
      expect(res.headwind).toBeCloseTo(0.0, 1);
      expect(res.crosswind).toBeCloseTo(15.0, 1);
      expect(res.crosswindSide).toBe('right');
    });

    it('computes 90° crosswind from the LEFT', () => {
      // RWY 36 (360°), Wind 270° @ 15kt
      const res = computeRunwayWindComponents(360, 270, 15);
      expect(res.headwind).toBeCloseTo(0.0, 1);
      expect(res.crosswind).toBeCloseTo(15.0, 1);
      expect(res.crosswindSide).toBe('left');
    });
  });

  describe('4. Quartering Wind (45°)', () => {
    it('computes equal headwind and crosswind components at 45°', () => {
      // RWY 36 (360°), Wind 045° @ 20kt
      // 20 * cos(45°) = 14.14 kt, 20 * sin(45°) = 14.14 kt
      const res = computeRunwayWindComponents(360, 45, 20);
      expect(res.headwind).toBeCloseTo(14.1, 1);
      expect(res.crosswind).toBeCloseTo(14.1, 1);
      expect(res.crosswindSide).toBe('right');
    });
  });

  describe('5. Gust & Max Demonstrated Crosswind Warnings', () => {
    it('evaluates gust components and crosswind threshold alerts', () => {
      // RWY 27 (270°), Wind 300° @ 15G25kt, Max Demo 15kt
      // angle diff = 30°, sin(30°) = 0.5
      // crosswind = 7.5 kt, gust crosswind = 12.5 kt
      const res = computeRunwayWindComponents(270, 300, 15, 25, 15);
      expect(res.crosswind).toBeCloseTo(7.5, 1);
      expect(res.gustCrosswind).toBeCloseTo(12.5, 1);
      // 12.5 kt is > 70% of 15 kt -> caution
      expect(res.crosswindStatus).toBe('caution');
    });

    it('triggers exceeded status when crosswind exceeds max demonstrated', () => {
      // RWY 36 (360°), Wind 090° @ 18kt, Max Demo 15kt
      const res = computeRunwayWindComponents(360, 90, 18, undefined, 15);
      expect(res.crosswind).toBeCloseTo(18.0, 1);
      expect(res.crosswindStatus).toBe('exceeded');
    });
  });
});
