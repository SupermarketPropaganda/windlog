import { describe, it, expect } from 'vitest';
import {
  inspectRouteCorridorTiles,
  inspectBatteryStatus,
  inspectStorageStatus,
  runPreflightPackAudit,
} from '../engine/preflight-pack';
import { Waypoint } from '../../types';
import { OwnshipTelemetry } from '../types-plus';

describe('Pre-Flight Offline Pack & Health Monitor Engine', () => {
  const sampleWaypoints: Waypoint[] = [
    {
      id: 1,
      identifier: 'LPCS',
      name: 'Cascais Tires Airport',
      type: 'airport',
      country: 'PT',
      latitude: 38.7255,
      longitude: -9.3552,
      elevation: 325,
    },
    {
      id: 2,
      identifier: 'SRA',
      name: 'Sintra NDB',
      type: 'ndb',
      country: 'PT',
      latitude: 38.8317,
      longitude: -9.3392,
    },
    {
      id: 3,
      identifier: 'LPPT',
      name: 'Lisbon Portela Airport',
      type: 'airport',
      country: 'PT',
      latitude: 38.7742,
      longitude: -9.1342,
      elevation: 374,
    },
  ];

  const baseTelemetry: OwnshipTelemetry = {
    timestamp: Date.now(),
    latitude: 38.7255,
    longitude: -9.3552,
    rawGpsAltitudeFt: 3500,
    altimeterOffsetFt: 0,
    altitudeMslFt: 3500,
    groundSpeedKt: 110,
    trueTrackDeg: 65,
    magneticTrackDeg: 66,
    magneticVariationDeg: -1,
    verticalSpeedFpm: 0,
    horizontalAccuracyM: 4.5,
    verticalAccuracyM: 6.0,
    gpsQuality: 'HIGH',
    source: 'gps',
    flightPhase: 'AIRBORNE',
  };

  it('inspectRouteCorridorTiles handles empty waypoints gracefully', async () => {
    const result = await inspectRouteCorridorTiles([]);
    expect(result.totalTiles).toBe(0);
    expect(result.cachedTiles).toBe(0);
    expect(result.missingTiles).toBe(0);
    expect(result.percentCached).toBe(100);
  });

  it('inspectRouteCorridorTiles calculates required tiles for active route corridor', async () => {
    const result = await inspectRouteCorridorTiles(sampleWaypoints, 'street', 20, 7, 9);
    expect(result.totalTiles).toBeGreaterThan(0);
    expect(result.missingTiles).toBeGreaterThanOrEqual(0);
    expect(result.percentCached).toBeGreaterThanOrEqual(0);
    expect(result.percentCached).toBeLessThanOrEqual(100);
  });

  it('inspectBatteryStatus returns fallback structure when API unavailable', async () => {
    const battery = await inspectBatteryStatus();
    expect(battery).toBeDefined();
    expect(typeof battery.supported).toBe('boolean');
  });

  it('inspectStorageStatus returns valid storage object', async () => {
    const storage = await inspectStorageStatus();
    expect(storage).toBeDefined();
    expect(typeof storage.usedBytes).toBe('number');
    expect(typeof storage.quotaBytes).toBe('number');
  });

  it('runPreflightPackAudit generates full checklist items across all categories', async () => {
    const report = await runPreflightPackAudit({
      waypoints: sampleWaypoints,
      ownship: baseTelemetry,
      isWakeLocked: true,
      mapLayer: 'street',
    });

    expect(report).toBeDefined();
    expect(['READY', 'CAUTION', 'NOT_READY']).toContain(report.overallStatus);
    expect(report.checks.length).toBeGreaterThanOrEqual(4);

    const categories = report.checks.map((c) => c.category);
    expect(categories).toContain('DATABASE');
    expect(categories).toContain('CHARTS');
    expect(categories).toContain('GPS');
    expect(categories).toContain('POWER');

    // With GPS accuracy = 4.5m and source = 'gps', GPS check must pass
    const gpsCheck = report.checks.find((c) => c.category === 'GPS');
    expect(gpsCheck).toBeDefined();
    expect(gpsCheck!.status).toBe('PASS');
    expect(gpsCheck!.detail).toContain('±4.5m');

    // With isWakeLocked = true, power check must pass
    const wakeCheck = report.checks.find((c) => c.id === 'screen-lock');
    expect(wakeCheck).toBeDefined();
    expect(wakeCheck!.status).toBe('PASS');
  });

  it('flags warning when running on simulated/manual GPS instead of hardware GNSS', async () => {
    const simTelemetry: OwnshipTelemetry = {
      ...baseTelemetry,
      source: 'manual-test',
      gpsQuality: 'MARGINAL',
      horizontalAccuracyM: 5,
    };

    const report = await runPreflightPackAudit({
      waypoints: sampleWaypoints,
      ownship: simTelemetry,
      isWakeLocked: true,
      mapLayer: 'street',
    });

    const gpsCheck = report.checks.find((c) => c.category === 'GPS');
    expect(gpsCheck).toBeDefined();
    expect(gpsCheck!.status).toBe('WARN');
    expect(gpsCheck!.detail).toContain('manual simulation');
    expect(report.overallStatus).toBe('CAUTION');
  });

  it('flags warning when screen wake-lock is inactive', async () => {
    const report = await runPreflightPackAudit({
      waypoints: sampleWaypoints,
      ownship: baseTelemetry,
      isWakeLocked: false,
      mapLayer: 'street',
    });

    const wakeCheck = report.checks.find((c) => c.id === 'screen-lock');
    expect(wakeCheck).toBeDefined();
    expect(wakeCheck!.status).toBe('WARN');
    expect(wakeCheck!.actionLabel).toBe('Enable Wake-Lock');
  });
});
