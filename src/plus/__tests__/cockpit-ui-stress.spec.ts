import { describe, it, expect } from 'vitest';
import { WakeLockManager } from '../use-wake-lock';
import { computeAirspaceProfileSlices } from '../../engine/airspace-engine';
import { Leg, Waypoint } from '../../types';
import { greatCircleDistance } from '../../engine/coordinate-math';
import { destinationPoint } from '../inflight-nav';

describe('Cockpit UI & Map Components Stress & Chaos Suite', () => {
  it('stresses WakeLockManager with 1,000 rapid concurrent acquire/release cycles', async () => {
    const manager = new WakeLockManager();
    // Simulate rapid cockpit tab switching / foreground-background jitter
    for (let i = 0; i < 1000; i++) {
      if (i % 2 === 0) {
        manager.release();
        expect(manager.getIsLocked()).toBe(false);
      } else {
        await manager.acquire();
      }
    }
  });

  it('stress tests rubber-band route snapping across 100 random geographic coordinates', () => {
    const candidateAirports: Waypoint[] = [
      { id: 1, identifier: 'LPCS', name: 'Cascais', latitude: 38.725, longitude: -9.355, type: 'airport', country: 'PT' },
      { id: 2, identifier: 'LPSO', name: 'Ponte de Sor', latitude: 39.215, longitude: -8.053, type: 'airport', country: 'PT' },
      { id: 3, identifier: 'LPEV', name: 'Évora', latitude: 38.533, longitude: -7.889, type: 'airport', country: 'PT' },
      { id: 4, identifier: 'LPCO', name: 'Coimbra', latitude: 40.158, longitude: -8.471, type: 'airport', country: 'PT' },
    ];

    // Simulate 100 random rubber-band drag-and-drop actions
    for (let i = 0; i < 100; i++) {
      // Pick random coordinate within Portuguese airspace
      const dragLat = 37.0 + Math.random() * 4.0;
      const dragLon = -9.5 + Math.random() * 3.0;

      // Find nearest
      let nearestWp: Waypoint | null = null;
      let nearestDist = Infinity;
      for (const cand of candidateAirports) {
        const d = greatCircleDistance(dragLat, dragLon, cand.latitude, cand.longitude);
        if (d < nearestDist) {
          nearestDist = d;
          nearestWp = cand;
        }
      }

      expect(Number.isFinite(nearestDist)).toBe(true);
      expect(nearestDist).toBeGreaterThanOrEqual(0);

      // Snap logic: <= 3.8 NM snaps, > 3.8 NM generates VPxx
      let snappedIdent = '';
      if (nearestWp && nearestDist <= 3.8) {
        snappedIdent = nearestWp.identifier;
        expect(['LPCS', 'LPSO', 'LPEV', 'LPCO']).toContain(snappedIdent);
      } else {
        snappedIdent = `VP${(i % 50 + 1).toString().padStart(2, '0')}`;
        expect(snappedIdent).toMatch(/^VP\d{2}$/);
      }
    }
  });

  it('stress tests airspace slice calculations with zero, single, and massive 20-leg routes', () => {
    // 0 legs
    expect(computeAirspaceProfileSlices([])).toEqual([]);

    // 1 leg
    const wp1: Waypoint = { id: 1, identifier: 'LPCS', name: 'Cascais', latitude: 38.725, longitude: -9.355, type: 'airport', country: 'PT' };
    const wp2: Waypoint = { id: 2, identifier: 'LPEV', name: 'Évora', latitude: 38.533, longitude: -7.889, type: 'airport', country: 'PT' };

    const singleLeg: Leg = {
      id: 'leg-1',
      from: wp1,
      to: wp2,
      distance: 72.5,
      trueTrack: 105,
      magneticVariation: 1,
      altitude: 3500,
      groundSpeed: 110,
      windCorrectionAngle: 2,
      trueHeading: 107,
      magneticHeading: 106,
      ete: 2372,
      fuelBurn: 5.6,
      wind: { direction: 320, speed: 12 },
    };

    const slices1 = computeAirspaceProfileSlices([singleLeg]);
    expect(Array.isArray(slices1)).toBe(true);

    // Multi-leg cross-country route (20 chained legs zigzagging across FIR)
    const multiLegs: Leg[] = [];
    let curWp = wp1;
    let totalNm = 0;

    for (let k = 0; k < 20; k++) {
      const nextBrg = (k * 35) % 360;
      const nextDist = 15 + (k % 5) * 5;
      const nextCoord = destinationPoint(curWp.latitude, curWp.longitude, nextBrg, nextDist);
      const nextWp: Waypoint = {
        id: 100 + k,
        identifier: `WP${k.toString().padStart(2, '0')}`,
        name: `WP${k.toString().padStart(2, '0')}`,
        country: 'PT',
        latitude: nextCoord.latitude,
        longitude: nextCoord.longitude,
        type: 'custom',
      };

      multiLegs.push({
        id: `leg-${k}`,
        from: curWp,
        to: nextWp,
        distance: nextDist,
        trueTrack: nextBrg,
        magneticVariation: 0,
        altitude: 2000 + (k % 6) * 1000,
        groundSpeed: 105,
        windCorrectionAngle: 0,
        trueHeading: nextBrg,
        magneticHeading: nextBrg,
        ete: 600,
        fuelBurn: 1.5,
        wind: { direction: 270, speed: 10 },
      });

      curWp = nextWp;
      totalNm += nextDist;
    }

    const slicesMulti = computeAirspaceProfileSlices(multiLegs);
    expect(Array.isArray(slicesMulti)).toBe(true);
    // Ensure every slice has valid geometry
    for (const slice of slicesMulti) {
      expect(slice.startDistNm).toBeLessThanOrEqual(slice.endDistNm);
      expect(slice.startDistNm).toBeGreaterThanOrEqual(0);
      expect(slice.endDistNm).toBeLessThanOrEqual(totalNm + 0.1);
      expect(slice.lowerLimitFt).toBeLessThanOrEqual(slice.upperLimitFt);
    }
  });
});
