import { describe, it, expect } from 'vitest';
import { computeNavLog } from '../engine/navlog-engine';
import { AircraftProfile, Waypoint } from '../types';
import { encodeRouteToUrl, parseRouteUrlHash } from '../utils/url-route';
import { AIRCRAFT_PRESETS } from '../components/AircraftBar';

const mockWaypoints: Waypoint[] = [
  {
    id: 1,
    identifier: 'LPCS',
    name: 'Cascais',
    type: 'airport',
    latitude: 38.725,
    longitude: -9.355,
    elevation: 326,
    country: 'PT',
  },
  {
    id: 2,
    identifier: 'COIMB',
    name: 'Coimbra',
    type: 'vrp',
    latitude: 40.2033,
    longitude: -8.4103,
    country: 'PT',
  },
  {
    id: 3,
    identifier: 'LPCS',
    name: 'Cascais',
    type: 'airport',
    latitude: 38.725,
    longitude: -9.355,
    elevation: 326,
    country: 'PT',
  },
];

describe('New Flight Features & Fuel Planning Tests', () => {
  describe('1. Fuel Burn & VFR Reserve Math', () => {
    it('computes accurate leg fuel burn and total trip fuel for C172 (8.5 GPH)', () => {
      const profile: AircraftProfile = {
        aircraftModel: 'c172',
        tas: 100, // 100 kts TAS
        cruiseAltitude: 4500,
        fuelFlow: 8.5, // 8.5 GPH
        fuelUnit: 'gph',
      };

      // 2 legs of ~97nm each at 100kts (approx ~0.97h each leg = ~1.94h total)
      const navlog = computeNavLog(mockWaypoints, profile, null);

      expect(navlog.legs.length).toBe(2);
      expect(navlog.totalFuel).toBeGreaterThan(15);
      expect(navlog.totalFuel).toBeLessThan(18);

      // Legal VFR Reserves
      // Day reserve: 30 min = 0.5 * 8.5 = 4.25 gal
      expect(navlog.vfrDayReserveFuel).toBeCloseTo(4.25, 2);
      // Night reserve: 45 min = 0.75 * 8.5 = 6.375 gal
      expect(navlog.vfrNightReserveFuel).toBeCloseTo(6.375, 2);

      // Minimum Fuel on Board
      expect(navlog.minFuelRequiredDay).toBeCloseTo(navlog.totalFuel + 4.25, 2);
      expect(navlog.minFuelRequiredNight).toBeCloseTo(navlog.totalFuel + 6.375, 2);
    });

    it('computes accurate fuel in Liters per Hour (L/h) for Rotax 912', () => {
      const profile: AircraftProfile = {
        aircraftModel: 'rotax',
        tas: 90,
        cruiseAltitude: 2500,
        fuelFlow: 15.0, // 15 L/h
        fuelUnit: 'lph',
      };

      const navlog = computeNavLog(mockWaypoints, profile, null);

      expect(navlog.vfrDayReserveFuel).toBeCloseTo(7.5, 2); // 0.5 * 15 = 7.5 L
      expect(navlog.vfrNightReserveFuel).toBeCloseTo(11.25, 2); // 0.75 * 15 = 11.25 L
      expect(navlog.minFuelRequiredDay).toBeGreaterThan(navlog.totalFuel);
    });

    it('handles 0 GPH gracefully without NaN or division by zero', () => {
      const profile: AircraftProfile = {
        aircraftModel: 'glider',
        tas: 60,
        cruiseAltitude: 3000,
        fuelFlow: 0,
        fuelUnit: 'gph',
      };

      const navlog = computeNavLog(mockWaypoints, profile, null);
      expect(navlog.totalFuel).toBe(0);
      expect(navlog.vfrDayReserveFuel).toBe(0);
      expect(navlog.minFuelRequiredDay).toBe(0);
    });
  });

  describe('2. Aircraft Presets Integrity', () => {
    it('verifies standard general aviation presets exist and have positive performance values', () => {
      expect(AIRCRAFT_PRESETS.length).toBeGreaterThanOrEqual(4);

      const c172 = AIRCRAFT_PRESETS.find((p) => p.id === 'c172');
      expect(c172).toBeDefined();
      expect(c172?.tas).toBe(105);
      expect(c172?.fuelFlow).toBe(8.5);

      const pa28 = AIRCRAFT_PRESETS.find((p) => p.id === 'pa28');
      expect(pa28).toBeDefined();
      expect(pa28?.tas).toBe(115);
      expect(pa28?.fuelFlow).toBe(9.0);

      const da40 = AIRCRAFT_PRESETS.find((p) => p.id === 'da40');
      expect(da40).toBeDefined();
      expect(da40?.tas).toBe(130);
      expect(da40?.fuelFlow).toBe(6.5);

      const rotax = AIRCRAFT_PRESETS.find((p) => p.id === 'rotax');
      expect(rotax).toBeDefined();
      expect(rotax?.tas).toBe(90);
      expect(rotax?.fuelFlow).toBe(15.0);
    });
  });

  describe('3. URL Route Serialization & Deserialization', () => {
    it('encodes and decodes multi-leg routes and aircraft parameters correctly', () => {
      const originalRoute = 'LPCS/4500 COIMB/3500 LPCS';
      const profile: AircraftProfile = {
        aircraftModel: 'pa28',
        cruiseAltitude: 5500,
        tas: 120,
        fuelFlow: 9.5,
        fuelUnit: 'gph',
      };

      const url = encodeRouteToUrl(originalRoute, profile);
      expect(url).toContain('route=LPCS%2F4500+COIMB%2F3500+LPCS');
      expect(url).toContain('tas=120');
      expect(url).toContain('alt=5500');
      expect(url).toContain('fuel=9.5');
      const hash = url.split('#')[1];
      const decoded = parseRouteUrlHash(hash);
      expect(decoded).not.toBeNull();
      expect(decoded?.route).toBe(originalRoute);
      expect(decoded?.profile?.tas).toBe(120);
      expect(decoded?.profile?.cruiseAltitude).toBe(5500);
      expect(decoded?.profile?.fuelFlow).toBe(9.5);
      expect(decoded?.profile?.aircraftModel).toBe('pa28');
    });

    it('encodes zero fuelFlow (gliders) in URL correctly without omission', () => {
      const profile: AircraftProfile = {
        aircraftModel: 'glider',
        cruiseAltitude: 3000,
        tas: 60,
        fuelFlow: 0,
        fuelUnit: 'gph',
      };

      const url = encodeRouteToUrl('LPCS COIMB', profile);
      expect(url).toContain('fuel=0');
      const hash = url.split('#')[1];
      const decoded = parseRouteUrlHash(hash);
      expect(decoded?.profile?.fuelFlow).toBe(0);
    });
  });
});
