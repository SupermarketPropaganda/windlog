import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FlightRecorder } from '../flight-recorder';
import { LogbookService } from '../logbook-service';
import { OwnshipTelemetry } from '../types-plus';

describe('FlightRecorder OOOI State Machine & Logbook Service', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    LogbookService.clearAll();
  });

  afterEach(() => {
    vi.useRealTimers();
    LogbookService.clearAll();
  });

  const createTelemetry = (gs: number, alt: number, timestamp: number): OwnshipTelemetry => ({
    timestamp,
    latitude: 38.725,
    longitude: -9.355,
    rawGpsAltitudeFt: alt,
    altimeterOffsetFt: 0,
    altitudeMslFt: alt,
    groundSpeedKt: gs,
    trueTrackDeg: 60,
    magneticTrackDeg: 60,
    magneticVariationDeg: 0,
    verticalSpeedFpm: 0,
    horizontalAccuracyM: 5,
    verticalAccuracyM: 8,
    gpsQuality: 'HIGH',
    source: 'manual-test',
    flightPhase: 'AIRBORNE',
  });

  it('progresses through OOOI flight phases: PREFLIGHT -> TAXI -> AIRBORNE -> TOUCHDOWN -> ON_BLOCK', () => {
    const recorder = new FlightRecorder();
    let now = 1700000000000;

    // 1. Initial Preflight
    let state = recorder.processTelemetry(createTelemetry(0, 350, now));
    expect(state.phase).toBe('PREFLIGHT');

    // 2. Start taxi (GS = 12 kt for 5 seconds)
    now += 1000;
    recorder.processTelemetry(createTelemetry(12, 350, now));
    now += 5000;
    state = recorder.processTelemetry(createTelemetry(14, 350, now));
    expect(state.phase).toBe('TAXI');
    expect(state.timestamps.out).toBeGreaterThan(0);

    // 3. Takeoff run (GS = 65 kt for 4 seconds)
    now += 1000;
    recorder.processTelemetry(createTelemetry(65, 450, now));
    now += 4000;
    state = recorder.processTelemetry(createTelemetry(75, 1200, now));
    expect(state.phase).toBe('AIRBORNE');
    expect(state.timestamps.off).toBeGreaterThan(0);

    // 4. Cruise and landing rollout (GS drops to 22 kt)
    now += 60000; // 1 min cruise
    recorder.processTelemetry(createTelemetry(105, 3500, now));
    now += 10000;
    recorder.processTelemetry(createTelemetry(22, 360, now));
    now += 6000;
    state = recorder.processTelemetry(createTelemetry(18, 360, now));
    expect(state.phase).toBe('TOUCHDOWN');
    expect(state.timestamps.on).toBeGreaterThan(0);

    // 5. Park and shut down (GS = 0 kt for 12 seconds)
    now += 2000;
    recorder.processTelemetry(createTelemetry(0, 350, now));
    now += 12000;
    state = recorder.processTelemetry(createTelemetry(0, 350, now));
    expect(state.phase).toBe('ON_BLOCK');
    expect(state.timestamps.in).toBeGreaterThan(0);
    expect(state.flightDurationSec).toBeGreaterThan(0);
    expect(state.blockDurationSec).toBeGreaterThan(state.flightDurationSec);
  });

  it('saves and exports official pilot logbook records to CSV', () => {
    const saved = LogbookService.saveEntry({
      date: '2026-10-25',
      aircraftModel: 'C172S',
      tailNumber: 'CS-DXB',
      departureIcao: 'LPCS',
      destinationIcao: 'LPEV',
      routeString: 'LPCS LPSO LPEV',
      outTimestamp: 1700000000000,
      offTimestamp: 1700000600000,
      onTimestamp: 1700003600000,
      inTimestamp: 1700004200000,
      flightTimeMinutes: 50,
      blockTimeMinutes: 70,
      distanceFlownNm: 75.4,
      landingsDay: 1,
      landingsNight: 0,
      notes: 'Smooth VFR flight',
    });

    expect(saved.id).toBeDefined();

    const entries = LogbookService.getEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].departureIcao).toBe('LPCS');
    expect(entries[0].destinationIcao).toBe('LPEV');

    const csv = LogbookService.exportCsv();
    expect(csv).toContain('LPCS');
    expect(csv).toContain('LPEV');
    expect(csv).toContain('C172S');
    expect(csv).toContain('CS-DXB');
  });
});
