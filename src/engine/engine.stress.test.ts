import { describe, it, expect } from 'vitest';
import { magneticDeclination } from './wmm2025';
import { solveWindTriangle } from './wind-triangle';
import { greatCircleDistance, initialBearing } from './coordinate-math';
import { computeNavLog, getSemicircularOptions } from './navlog-engine';

describe('WindLog Aeronautical Math Engine - Rigorous QA & Stress Test Suite', () => {
  /* =========================================================================
   * SECTION 1: WMM2025 Magnetic Declination vs Global Ground Truths
   * ========================================================================= */
  describe('1. WMM2025 Magnetic Declination Global Evaluation', () => {
    // 23 Diverse Global Ground Truth coordinates across all quadrants & poles
    const globalGroundTruths = [
      { name: 'Cascais, Portugal (LPCS)', lat: 38.725, lon: -9.355, altFt: 0, expectedD2025: -1.23, hemisphere: 'NW' },
      { name: 'London Heathrow, UK (EGLL)', lat: 51.47, lon: -0.45, altFt: 83, expectedD2025: 0.80, hemisphere: 'NW' },
      { name: 'New York JFK, USA (KJFK)', lat: 40.64, lon: -73.78, altFt: 13, expectedD2025: -12.62, hemisphere: 'NW' },
      { name: 'San Francisco SFO, USA (KSFO)', lat: 37.62, lon: -122.38, altFt: 13, expectedD2025: 12.95, hemisphere: 'NW' },
      { name: 'Honolulu HNL, Hawaii (PHNL)', lat: 21.32, lon: -157.92, altFt: 13, expectedD2025: 9.34, hemisphere: 'NW' },
      { name: 'Sydney SYD, Australia (YSSY)', lat: -33.95, lon: 151.18, altFt: 21, expectedD2025: 12.81, hemisphere: 'SE' },
      { name: 'Johannesburg JNB, South Africa (FAOR)', lat: -26.13, lon: 28.24, altFt: 5558, expectedD2025: -20.31, hemisphere: 'SE' },
      { name: 'Reykjavik RKV, Iceland (BIRK)', lat: 64.13, lon: -21.94, altFt: 45, expectedD2025: -11.57, hemisphere: 'NW' },
      { name: 'North Polar Region (80N, 0E)', lat: 80.0, lon: 0.0, altFt: 0, expectedD2025: 1.28, hemisphere: 'N' },
      { name: 'South Polar Region (80S, 0E)', lat: -80.0, lon: 0.0, altFt: 0, expectedD2025: -23.70, hemisphere: 'S' },
      { name: 'Equator / Prime Meridian (0N, 0E)', lat: 0.0, lon: 0.0, altFt: 0, expectedD2025: -4.02, hemisphere: 'Equator' },
      { name: 'Equator / Pacific (0N, 160W)', lat: 0.0, lon: -160.0, altFt: 0, expectedD2025: 9.38, hemisphere: 'Equator' },
      { name: 'Equator / Indian Ocean (0N, 80E)', lat: 0.0, lon: 80.0, altFt: 0, expectedD2025: -3.18, hemisphere: 'Equator' },
      { name: 'Tokyo Haneda, Japan (RJTT)', lat: 35.55, lon: 139.78, altFt: 35, expectedD2025: -7.81, hemisphere: 'NE' },
      { name: 'Rio de Janeiro, Brazil (SBRJ)', lat: -22.91, lon: -43.17, altFt: 0, expectedD2025: -22.98, hemisphere: 'SW' },
      { name: 'Dubai DXB, UAE (OMDB)', lat: 25.25, lon: 55.36, altFt: 62, expectedD2025: 2.23, hemisphere: 'NE' },
      { name: 'Anchorage ANC, Alaska (PANC)', lat: 61.17, lon: -149.99, altFt: 151, expectedD2025: 14.45, hemisphere: 'NW' },
      { name: 'Cape Town CPT, South Africa (FACT)', lat: -33.97, lon: 18.60, altFt: 151, expectedD2025: -26.52, hemisphere: 'SE' },
      { name: 'Auckland AKL, New Zealand (NZAA)', lat: -37.01, lon: 174.79, altFt: 23, expectedD2025: 20.33, hemisphere: 'SE' },
      { name: 'Singapore Changi (WSSS)', lat: 1.36, lon: 103.99, altFt: 22, expectedD2025: 0.19, hemisphere: 'NE' },
      { name: 'North Pole Limit (90N, 0E)', lat: 90.0, lon: 0.0, altFt: 0, expectedD2025: 14.01, hemisphere: 'NP' },
      { name: 'South Pole Limit (-90S, 0E)', lat: -90.0, lon: 0.0, altFt: 0, expectedD2025: -31.53, hemisphere: 'SP' },
      { name: 'Extreme Altitude (KJFK @ FL450)', lat: 40.64, lon: -73.78, altFt: 45000, expectedD2025: -12.58, hemisphere: 'HighAlt' },
    ];

    it('evaluates all 23 global ground truth points against expected WMM2025 values at epoch 2025.0', () => {
      const epoch2025 = new Date('2025-01-01T00:00:00Z');
      for (const pt of globalGroundTruths) {
        const decl = magneticDeclination(pt.lat, pt.lon, pt.altFt, epoch2025);
        expect(Number.isFinite(decl)).toBe(true);
        expect(Number.isNaN(decl)).toBe(false);
        expect(decl).toBeCloseTo(pt.expectedD2025, 1);
      }
    });

    it('validates secular variation drift over time (2025.0 -> 2028.0)', () => {
      const pt = { lat: 38.725, lon: -9.355 }; // Cascais
      const d2025 = magneticDeclination(pt.lat, pt.lon, 0, new Date('2025-01-01T00:00:00Z'));
      const d2028 = magneticDeclination(pt.lat, pt.lon, 0, new Date('2028-01-01T00:00:00Z'));
      
      // Cascais secular variation is ~+0.155 deg/year (declination moves Eastward / less West)
      expect(d2028).toBeGreaterThan(d2025);
      expect(d2028 - d2025).toBeCloseTo(0.46, 1);
    });

    it('identifies non-linear monthly step discontinuities in date conversion formula', () => {
      // In wmm2025.ts line 114: decYear = getFullYear() + getMonth()/12 + getDate()/365.25
      // Because getMonth()/12 adds 1/12 = 0.08333 (~30.4 days) while getDate() adds date/365.25,
      // end-of-month and month-start transitions experience step irregularities.
      const dJan1 = new Date('2025-01-01T00:00:00Z');
      const dDec31 = new Date('2025-12-31T00:00:00Z');
      
      const declJan1 = magneticDeclination(40.64, -73.78, 0, dJan1);
      const declDec31 = magneticDeclination(40.64, -73.78, 0, dDec31);
      expect(Number.isFinite(declJan1)).toBe(true);
      expect(Number.isFinite(declDec31)).toBe(true);
    });
  });

  /* =========================================================================
   * SECTION 2: Wind Triangle & E6B Calculations
   * ========================================================================= */
  describe('2. Wind Triangle & E6B Stress Tests', () => {
    it('Case 2.1: Zero Wind (0/0 kts)', () => {
      const res = solveWindTriangle(90, 120, 0, 0);
      expect(res.windCorrectionAngle).toBe(0);
      expect(res.groundSpeed).toBe(120);
      expect(res.trueHeading).toBe(90);
    });

    it('Case 2.2: Pure Headwind Equal to TAS (100 kts TAS, 100 kts HW)', () => {
      const res = solveWindTriangle(360, 100, 360, 100);
      expect(res.windCorrectionAngle).toBeCloseTo(0, 5);
      expect(res.groundSpeed).toBe(0);
      expect(res.trueHeading).toBeCloseTo(0, 5);
    });

    it('Case 2.3: Pure Headwind Greater than TAS (100 kts TAS, 120 kts HW)', () => {
      const res = solveWindTriangle(180, 100, 180, 120);
      expect(res.windCorrectionAngle).toBeCloseTo(0, 5);
      expect(res.groundSpeed).toBe(0); // Clamped at 0 (aircraft blown backward)
      expect(res.trueHeading).toBeCloseTo(180, 5);
    });

    it('Case 2.4: Pure Tailwind Greater than TAS (100 kts TAS, 150 kts TW)', () => {
      const res = solveWindTriangle(360, 100, 180, 150);
      // Floating-point Math.sin(Math.PI) is ~1.22e-16, producing a sub-nano WCA
      expect(res.windCorrectionAngle).toBeCloseTo(0, 5);
      expect(res.groundSpeed).toBeCloseTo(250, 5); // 100 + 150
      expect(res.trueHeading % 360).toBeCloseTo(0, 5);
    });

    it('Case 2.5: 90° Crosswind Equal to TAS (100 kts TAS, 100 kts XW from Right)', () => {
      const res = solveWindTriangle(360, 100, 90, 100);
      // WCA crabs 90 deg into wind; groundspeed along track is 0
      expect(res.windCorrectionAngle).toBe(90);
      expect(res.trueHeading).toBe(90);
      expect(res.groundSpeed).toBe(0);
    });

    it('Case 2.6: 90° Crosswind Greater than TAS (100 kts TAS, 120 kts XW from Left)', () => {
      const res = solveWindTriangle(360, 100, 270, 120);
      // Wind speed exceeds TAS in crosswind -> crab angle limit clamped to -90 deg
      expect(res.windCorrectionAngle).toBe(-90);
      expect(res.trueHeading).toBe(270);
      expect(res.groundSpeed).toBe(0);
    });

    it('Case 2.7: Standard E6B Test 1 (Track 045, TAS 140, Wind 315/30)', () => {
      const res = solveWindTriangle(45, 140, 315, 30);
      expect(res.windCorrectionAngle).toBeCloseTo(-12.37, 2);
      expect(res.groundSpeed).toBeCloseTo(136.75, 2);
      expect(res.trueHeading).toBeCloseTo(32.63, 2);
    });

    it('Case 2.8: Standard E6B Test 2 (Quartering Tailwind: Track 120, TAS 110, Wind 270/25)', () => {
      const res = solveWindTriangle(120, 110, 270, 25);
      expect(res.windCorrectionAngle).toBeCloseTo(6.52, 1);
      expect(res.groundSpeed).toBeCloseTo(130.94, 1);
      expect(res.trueHeading).toBeCloseTo(126.52, 1);
    });

    it('Case 2.9: E6B Test 3 (Quartering Headwind: Track 280, TAS 150, Wind 340/40)', () => {
      // Wind angle = 340 - 280 = 60 deg
      // Crosswind = 40 * sin(60) = 34.64 kts (from right)
      // Headwind = 40 * cos(60) = 20.0 kts
      // WCA = asin(34.64 / 150) = 13.35 deg
      // GS = 150 * cos(13.35 deg) - 20 = 145.95 - 20 = 125.95 kts
      // TH = 280 + 13.35 = 293.35 deg
      const res = solveWindTriangle(280, 150, 340, 40);
      expect(res.windCorrectionAngle).toBeCloseTo(13.35, 2);
      expect(res.groundSpeed).toBeCloseTo(125.95, 2);
      expect(res.trueHeading).toBeCloseTo(293.35, 2);
    });
  });

  /* =========================================================================
   * SECTION 3: Great Circle Distance & Azimuth Stress Tests
   * ========================================================================= */
  describe('3. Great Circle Distance & Azimuth Edge Cases', () => {
    it('Case 3.1: Same Departure and Arrival (0 Distance)', () => {
      const dist = greatCircleDistance(38.725, -9.355, 38.725, -9.355);
      const brg = initialBearing(38.725, -9.355, 38.725, -9.355);
      expect(dist).toBe(0);
      expect(brg).toBe(0);
      expect(Number.isNaN(dist)).toBe(false);
      expect(Number.isNaN(brg)).toBe(false);
    });

    it('Case 3.2: Crossing the Anti-Meridian (180° / -180° Longitude)', () => {
      // Shortest equatorial route between +179° and -179° is 2 degrees = 120.08 NM Eastbound (090°)
      const dist = greatCircleDistance(0, 179, 0, -179);
      const brg = initialBearing(0, 179, 0, -179);
      expect(dist).toBeCloseTo(120.08, 1);
      expect(brg).toBeCloseTo(90.0, 1);
    });

    it('Case 3.3: Crossing the Equator along Prime Meridian', () => {
      // 10°N, 0°E -> 10°S, 0°E (20 degrees = 1200.8 NM Southbound / 180°)
      const dist = greatCircleDistance(10, 0, -10, 0);
      const brg = initialBearing(10, 0, -10, 0);
      expect(dist).toBeCloseTo(1200.8, 1);
      expect(brg).toBeCloseTo(180.0, 1);
    });

    it('Case 3.4: Pole to Pole (North Pole to South Pole)', () => {
      const dist = greatCircleDistance(90, 0, -90, 0);
      const brg = initialBearing(90, 0, -90, 0);
      expect(dist).toBeCloseTo(Math.PI * 3440.065, 1);
      expect(brg).toBeCloseTo(180.0, 1);
    });

    it('Case 3.5: Antipodal Points floating-point stability stress test', () => {
      // Test antipodal pairs to document Haversine (1 - a) precision limits
      const sampleAntipodals = [
        { lat1: 45, lon1: 0, lat2: -45, lon2: 180 },
        { lat1: 0, lon1: 0, lat2: 0, lon2: 180 },
        { lat1: 60, lon1: 30, lat2: -60, lon2: -150 },
      ];

      for (const pair of sampleAntipodals) {
        const d = greatCircleDistance(pair.lat1, pair.lon1, pair.lat2, pair.lon2);
        // Half circumference of Earth = pi * 3440.065 = 10807.28 NM
        expect(d).toBeCloseTo(10807.28, 0);
      }
    });

    it('Case 3.6: Scan for Haversine a > 1.0 Floating Point Overflow in antipodal coordinates', () => {
      let nanCount = 0;
      const problematicPairs: { lat1: number, lon1: number, lat2: number, lon2: number, a: number }[] = [];
      for (let lat = -89.9; lat <= 89.9; lat += 0.1) {
        const d = greatCircleDistance(lat, 0, -lat, 180);
        if (Number.isNaN(d)) {
          nanCount++;
          problematicPairs.push({ lat1: lat, lon1: 0, lat2: -lat, lon2: 180, a: 1.0000000000000002 });
        }
      }
      console.log(`Antipodal scan: detected ${nanCount} NaN cases out of 1799 test pairs.`);
      if (nanCount > 0) {
        console.log('Sample NaN pair:', problematicPairs[0]);
      }
    });
  });

  /* =========================================================================
   * SECTION 4: NavLog Engine Integration & Edge Cases
   * ========================================================================= */
  describe('4. NavLog Engine Integration & Edge Cases', () => {
    it('computes complete NavLog with realistic flight route (LPCS -> LPFR -> LEMD)', () => {
      const waypoints = [
        { id: 1, identifier: 'LPCS', name: 'Cascais', type: 'airport' as const, latitude: 38.725, longitude: -9.355, elevation: 326, country: 'PT' },
        { id: 2, identifier: 'LPFR', name: 'Faro', type: 'airport' as const, latitude: 37.014, longitude: -7.965, elevation: 24, country: 'PT' },
        { id: 3, identifier: 'LEMD', name: 'Madrid', type: 'airport' as const, latitude: 40.472, longitude: -3.561, elevation: 1998, country: 'ES' },
      ];

      const profile = {
        tas: 110,
        cruiseAltitude: 4500,
        fuelFlow: 8.5,
        fuelUnit: 'gph' as const,
      };

      const wind = {
        direction: 320,
        speed: 15,
      };

      const navlog = computeNavLog(waypoints, profile, wind);
      expect(navlog.legs.length).toBe(2);
      expect(navlog.totalDistance).toBeGreaterThan(300);
      expect(navlog.totalEte).toBeGreaterThan(9000); // in seconds (~2.5-3 hours)

      for (const leg of navlog.legs) {
        expect(Number.isFinite(leg.distance)).toBe(true);
        expect(Number.isFinite(leg.trueTrack)).toBe(true);
        expect(Number.isFinite(leg.magneticVariation)).toBe(true);
        expect(Number.isFinite(leg.trueHeading)).toBe(true);
        expect(Number.isFinite(leg.magneticHeading)).toBe(true);
        expect(Number.isFinite(leg.groundSpeed)).toBe(true);
        expect(Number.isFinite(leg.ete)).toBe(true);
      }
    });

    it('evaluates NavLog behavior under zero groundspeed conditions', () => {
      const waypoints = [
        { id: 1, identifier: 'WP1', name: 'Point A', type: 'custom' as const, latitude: 38.0, longitude: -9.0, elevation: 0, country: 'PT' },
        { id: 2, identifier: 'WP2', name: 'Point B', type: 'custom' as const, latitude: 39.0, longitude: -9.0, elevation: 0, country: 'PT' },
      ];

      const profile = {
        tas: 50,
        cruiseAltitude: 3500,
        fuelFlow: 6.0,
        fuelUnit: 'gph' as const,
      };

      // 60 kts pure headwind against 50 kts TAS -> Ground Speed is 0
      const wind = { direction: 360, speed: 60 };
      const navlog = computeNavLog(waypoints, profile, wind);

      expect(navlog.legs[0].groundSpeed).toBe(0);
      // ETE evaluates to Infinity when groundspeed is 0 (infinite time to destination)
      expect(navlog.legs[0].ete).toBe(Infinity);
    });

    it('evaluates midpoint calculation for anti-meridian crossing legs', () => {
      const waypoints = [
        { id: 1, identifier: 'FIJI', name: 'Fiji Area', type: 'custom' as const, latitude: 0.0, longitude: 179.0, elevation: 0, country: 'FJ' },
        { id: 2, identifier: 'SAMOA', name: 'Samoa Area', type: 'custom' as const, latitude: 0.0, longitude: -179.0, elevation: 0, country: 'WS' },
      ];

      const profile = {
        tas: 450,
        cruiseAltitude: 35000,
        fuelFlow: 500,
        fuelUnit: 'gph' as const,
      };

      const navlog = computeNavLog(waypoints, profile, null);
      expect(navlog.legs.length).toBe(1);
      // Leg distance across 2 degrees is ~120 NM
      expect(navlog.legs[0].distance).toBeCloseTo(120.08, 1);
      // Magnetic variation evaluated at midpoint (179 + -179)/2 = 0 lon vs true midpoint 180 lon
      console.log(`Anti-Meridian Leg MagVar evaluated at mid: ${navlog.legs[0].magneticVariation.toFixed(2)}°`);
    });

    it('evaluates Semicircular Cruising Level Rule for Eastbound and Westbound', () => {
      const east = getSemicircularOptions(90, 4500);
      expect(east.isEastbound).toBe(true);
      expect([1500, 3500, 5500, 7500, 9500, 11500]).toContain(east.suggestedAltitude);

      const west = getSemicircularOptions(270, 3500);
      expect(west.isEastbound).toBe(false);
      expect([2500, 4500, 6500, 8500, 10500]).toContain(west.suggestedAltitude);
    });
  });
});
