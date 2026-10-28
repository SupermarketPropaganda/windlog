import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FuelMonitor } from '../fuel-monitor';
import { FlightRecorder } from '../flight-recorder';
import { LogbookService, PilotLogbookEntry } from '../logbook-service';
import { OwnshipTelemetry, FlightPhase } from '../types-plus';

describe('Flight Operations & Logbook Endurance Testing Suite', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    LogbookService.clearAll();
  });

  afterEach(() => {
    vi.useRealTimers();
    LogbookService.clearAll();
  });

  const createTelemetry = (
    gs: number,
    alt: number,
    timestamp: number,
    lat: number = 38.725,
    lon: number = -9.355,
    flightPhase: FlightPhase = 'AIRBORNE'
  ): OwnshipTelemetry => ({
    timestamp,
    latitude: lat,
    longitude: lon,
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
    flightPhase,
  });

  // Helper to cleanly progress flight phases
  const runTaxi = (recorder: FlightRecorder, alt: number, lat: number, lon: number, startEpoch: number): number => {
    let t = startEpoch;
    // Initial stationary preflight
    recorder.processTelemetry(createTelemetry(0, alt, t, lat, lon, 'PREFLIGHT'));
    t += 1000;
    // Begin taxi (gs = 12 kt)
    recorder.processTelemetry(createTelemetry(12, alt, t, lat, lon, 'TAXI'));
    t += 5000;
    // Sustained taxi >= 4s -> transitions to TAXI
    recorder.processTelemetry(createTelemetry(14, alt, t, lat, lon, 'TAXI'));
    return t;
  };

  const runTakeoff = (recorder: FlightRecorder, alt: number, lat: number, lon: number, startEpoch: number): number => {
    let t = startEpoch;
    // Start takeoff roll: gs = 65 kt
    t += 1000;
    recorder.processTelemetry(createTelemetry(65, alt + 10, t, lat, lon, 'AIRBORNE'));
    // Sustained takeoff >= 3s -> transitions to AIRBORNE
    t += 4000;
    recorder.processTelemetry(createTelemetry(75, alt + 500, t, lat, lon, 'AIRBORNE'));
    return t;
  };

  const runLanding = (recorder: FlightRecorder, alt: number, lat: number, lon: number, startEpoch: number): number => {
    let t = startEpoch;
    // Touchdown rollout: gs = 22 kt
    t += 1000;
    recorder.processTelemetry(createTelemetry(22, alt, t, lat, lon, 'LANDED'));
    // Sustained rollout >= 5s -> transitions to TOUCHDOWN
    t += 6000;
    recorder.processTelemetry(createTelemetry(18, alt, t, lat, lon, 'LANDED'));
    return t;
  };

  const runParking = (recorder: FlightRecorder, alt: number, lat: number, lon: number, startEpoch: number): number => {
    let t = startEpoch;
    // Parking stand arrival: gs = 0 kt
    t += 2000;
    recorder.processTelemetry(createTelemetry(0, alt, t, lat, lon, 'PREFLIGHT'));
    // Sustained stop >= 10s -> transitions to ON_BLOCK
    t += 12000;
    recorder.processTelemetry(createTelemetry(0, alt, t, lat, lon, 'PREFLIGHT'));
    return t;
  };

  // =========================================================================
  // 1. 50-Flight High-Tempo Operational Day
  // =========================================================================
  describe('1. 50-Flight High-Tempo Commercial Flight School Day', () => {
    it('simulates 50 consecutive flight sorties throughout a 14-hour operational day', () => {
      const recorder = new FlightRecorder();
      let simEpochMs = 1700000000000; // Start at 07:00 UTC
      const airports = [
        { icao: 'LPCS', lat: 38.725, lon: -9.355, alt: 326 },
        { icao: 'LPEV', lat: 38.532, lon: -7.893, alt: 787 },
        { icao: 'LPSO', lat: 39.294, lon: -8.687, alt: 49 },
        { icao: 'LPBJ', lat: 38.078, lon: -7.932, alt: 636 },
        { icao: 'LPCO', lat: 40.158, lon: -8.470, alt: 574 },
      ];

      for (let sortie = 1; sortie <= 50; sortie++) {
        recorder.reset();
        const origin = airports[(sortie - 1) % airports.length];
        const dest = airports[sortie % airports.length];
        const isCircuitFlight = sortie % 3 === 0;

        // A. Taxi out
        simEpochMs = runTaxi(recorder, origin.alt, origin.lat, origin.lon, simEpochMs);
        expect(recorder.getState(simEpochMs).phase).toBe('TAXI');
        expect(recorder.getState(simEpochMs).timestamps.out).toBeGreaterThan(0);

        // B. Takeoff
        simEpochMs = runTakeoff(recorder, origin.alt, origin.lat, origin.lon, simEpochMs);
        expect(recorder.getState(simEpochMs).phase).toBe('AIRBORNE');
        expect(recorder.getState(simEpochMs).timestamps.off).toBeGreaterThan(0);

        // C. Airborne Flight Sortie: Circuits with Touch-and-Goes OR Cross-Country Navigation
        if (isCircuitFlight) {
          // Practice 2 touch-and-goes in the pattern
          for (let tag = 1; tag <= 2; tag++) {
            // Pattern flight
            simEpochMs += 20000;
            recorder.processTelemetry(createTelemetry(80, origin.alt + 1000, simEpochMs, origin.lat, origin.lon, 'AIRBORNE'));

            // Touchdown on runway
            simEpochMs = runLanding(recorder, origin.alt, origin.lat, origin.lon, simEpochMs);
            expect(recorder.getState(simEpochMs).phase).toBe('TOUCHDOWN');

            // Apply full power & take off again (touch-and-go >= 45 kt for >= 3s)
            simEpochMs += 1000;
            recorder.processTelemetry(createTelemetry(65, origin.alt + 50, simEpochMs, origin.lat, origin.lon, 'AIRBORNE'));
            simEpochMs += 4000;
            recorder.processTelemetry(createTelemetry(75, origin.alt + 300, simEpochMs, origin.lat, origin.lon, 'AIRBORNE'));
            expect(recorder.getState(simEpochMs).phase).toBe('AIRBORNE');
          }
        } else {
          // Cross-country transit leg: progressive waypoints accumulating mileage
          for (let s = 1; s <= 10; s++) {
            simEpochMs += 10000;
            const progress = s / 10;
            const curLat = origin.lat + (dest.lat - origin.lat) * progress;
            const curLon = origin.lon + (dest.lon - origin.lon) * progress;
            recorder.processTelemetry(createTelemetry(110, 3500, simEpochMs, curLat, curLon, 'AIRBORNE'));
          }
        }

        // D. Final Landing Rollout
        simEpochMs = runLanding(recorder, dest.alt, dest.lat, dest.lon, simEpochMs);
        const landedState = recorder.getState(simEpochMs);
        expect(landedState.phase).toBe('TOUCHDOWN');
        expect(landedState.timestamps.on).toBeGreaterThan(0);

        // E. Taxi to Stand & Shutdown
        simEpochMs = runParking(recorder, dest.alt, dest.lat, dest.lon, simEpochMs);
        const finalState = recorder.getState(simEpochMs);
        expect(finalState.phase).toBe('ON_BLOCK');
        expect(finalState.timestamps.in).toBeGreaterThan(0);
        expect(finalState.flightDurationSec).toBeGreaterThan(0);
        expect(finalState.blockDurationSec).toBeGreaterThanOrEqual(finalState.flightDurationSec);

        // F. Save official sortie record to LogbookService
        LogbookService.saveEntry({
          date: new Date(finalState.timestamps.out!).toISOString().slice(0, 10),
          aircraftModel: sortie % 2 === 0 ? 'C172S' : 'PA28-181',
          tailNumber: `CS-D${String.fromCharCode(65 + (sortie % 26))}${sortie % 10}`,
          departureIcao: origin.icao,
          destinationIcao: isCircuitFlight ? origin.icao : dest.icao,
          routeString: isCircuitFlight ? `${origin.icao} CIRCUITS` : `${origin.icao} DCT ${dest.icao}`,
          outTimestamp: finalState.timestamps.out,
          offTimestamp: finalState.timestamps.off,
          onTimestamp: finalState.timestamps.on,
          inTimestamp: finalState.timestamps.in,
          flightTimeMinutes: Math.round(finalState.flightDurationSec / 60),
          blockTimeMinutes: Math.round(finalState.blockDurationSec / 60),
          distanceFlownNm: finalState.distanceFlownNm,
          landingsDay: isCircuitFlight ? 3 : 1,
          landingsNight: 0,
          notes: `Sortie #${sortie} completed smoothly.`,
        });

        // 10 minutes apron turn-around time between student sorties
        simEpochMs += 10 * 60 * 1000;
      }

      // Verify logbook accumulated all 50 sorties with 100% data integrity
      const entries = LogbookService.getEntries();
      expect(entries.length).toBe(50);

      const metrics = LogbookService.getMetrics();
      expect(metrics.totalFlights).toBe(50);
      expect(metrics.totalFlightHours).toBeGreaterThan(0);
      expect(metrics.totalBlockHours).toBeGreaterThanOrEqual(metrics.totalFlightHours);
      expect(metrics.totalLandings).toBeGreaterThanOrEqual(50);
    });
  });

  // =========================================================================
  // 2. Edge-Case OOOI Flight Transitions
  // =========================================================================
  describe('2. Edge-Case OOOI Flight Transitions', () => {
    it('handles Rejected Takeoff (RTO): accelerates to 40 kt then stops without false AIRBORNE', () => {
      const recorder = new FlightRecorder();
      let now = 1700000000000;

      // Taxi out
      now = runTaxi(recorder, 350, 38.725, -9.355, now);
      expect(recorder.getState(now).phase).toBe('TAXI');
      const outTime = recorder.getState(now).timestamps.out;
      expect(outTime).toBeGreaterThan(0);

      // Line up and begin takeoff roll, accelerating up to 40 kt (< 45 kt threshold)
      for (let speed = 15; speed <= 40; speed += 5) {
        now += 1000;
        const state = recorder.processTelemetry(createTelemetry(speed, 350, now));
        expect(state.phase).toBe('TAXI');
        expect(state.timestamps.off).toBeNull();
      }

      // ABORT! Brakes applied, speed drops to 0 kt
      for (let s = 0; s < 10; s++) {
        now += 1000;
        const state = recorder.processTelemetry(createTelemetry(0, 350, now));
        expect(state.phase).toBe('TAXI');
        expect(state.timestamps.off).toBeNull(); // Never triggered airborne!
      }

      // Aborted flight returns to stand and shuts down
      recorder.abortFlight(now);
      const abortedState = recorder.getState(now);
      expect(abortedState.phase).toBe('ON_BLOCK');
      expect(abortedState.timestamps.out).toBe(outTime);
      expect(abortedState.timestamps.off).toBeNull();
      expect(abortedState.timestamps.in).toBe(now);
      expect(abortedState.flightDurationSec).toBe(0);
      expect(abortedState.blockDurationSec).toBeGreaterThan(0);
    });

    it('handles Touch-and-Go & Balked Landing Go-Around dynamically (TOUCHDOWN -> AIRBORNE)', () => {
      const recorder = new FlightRecorder();
      let now = 1700000000000;

      // Taxi & Takeoff
      now = runTaxi(recorder, 300, 38.725, -9.355, now);
      now = runTakeoff(recorder, 300, 38.725, -9.355, now);
      expect(recorder.getState(now).phase).toBe('AIRBORNE');

      // Approach & Touchdown on runway
      now += 60000;
      now = runLanding(recorder, 300, 38.725, -9.355, now);
      expect(recorder.getState(now).phase).toBe('TOUCHDOWN');
      expect(recorder.getState(now).timestamps.on).toBeGreaterThan(0);

      // GO-AROUND / TOUCH-AND-GO! Pilot pushes full throttle, accelerates to 65 kt for >= 3s
      now += 1000;
      recorder.processTelemetry(createTelemetry(65, 350, now, 38.725, -9.355, 'AIRBORNE'));
      now += 4000;
      recorder.processTelemetry(createTelemetry(75, 600, now, 38.725, -9.355, 'AIRBORNE'));

      // Transitions dynamically back to AIRBORNE!
      const airborneAgain = recorder.getState(now);
      expect(airborneAgain.phase).toBe('AIRBORNE');
      expect(airborneAgain.touchAndGoCount).toBe(1);

      // Final landing 5 minutes later
      now += 300000;
      now = runLanding(recorder, 300, 38.725, -9.355, now);
      expect(recorder.getState(now).phase).toBe('TOUCHDOWN');

      // Taxi to stand & park
      now = runParking(recorder, 300, 38.725, -9.355, now);
      const finished = recorder.getState(now);
      expect(finished.phase).toBe('ON_BLOCK');
      expect(finished.timestamps.in).toBeGreaterThan(0);
      expect(finished.touchAndGoCount).toBe(1);
    });

    it('protects helicopter hover in mid-air (0 kt GS at 800 ft MSL) from false TOUCHDOWN', () => {
      const recorder = new FlightRecorder();
      let now = 1700000000000;

      // Departure from helipad at 200 ft MSL
      now = runTaxi(recorder, 200, 38.725, -9.355, now);
      now = runTakeoff(recorder, 200, 38.725, -9.355, now);
      expect(recorder.getState(now).phase).toBe('AIRBORNE');

      // Helicopter climbs to 800 ft MSL and establishes stationary hover (GS = 0 kt for 30 seconds)
      for (let s = 0; s < 30; s++) {
        now += 1000;
        const state = recorder.processTelemetry(createTelemetry(0, 800, now, 38.725, -9.355, 'AIRBORNE'));
        expect(state.phase).toBe('AIRBORNE'); // Hovering at altitude must NEVER trigger TOUCHDOWN!
        expect(state.timestamps.on).toBeNull();
      }

      // Helicopter departs hover, cruises, then finally lands back at 200 ft MSL
      now += 10000;
      recorder.processTelemetry(createTelemetry(70, 700, now));
      now += 10000;
      now = runLanding(recorder, 200, 38.725, -9.355, now);
      expect(recorder.getState(now).phase).toBe('TOUCHDOWN');
    });

    it('handles reverse taxiing (negative GS) correctly without numeric anomalies', () => {
      const recorder = new FlightRecorder();
      let now = 1700000000000;

      // Powerback / pushback at -6 kt for 5 seconds
      recorder.processTelemetry(createTelemetry(-6, 350, now));
      now += 5000;
      recorder.processTelemetry(createTelemetry(-6, 350, now));

      const taxiState = recorder.getState(now);
      expect(taxiState.phase).toBe('TAXI');
      expect(taxiState.timestamps.out).toBeGreaterThan(0);
      expect(taxiState.maxGroundSpeedKt).toBe(6);
    });

    it('filters extreme wind shears aloft (instant drop to 22 kt at 4,500 ft)', () => {
      const recorder = new FlightRecorder();
      let now = 1700000000000;

      // Takeoff and climb to cruise at 4,500 ft
      now = runTaxi(recorder, 350, 38.725, -9.355, now);
      now = runTakeoff(recorder, 350, 38.725, -9.355, now);
      now += 20000;
      recorder.processTelemetry(createTelemetry(115, 4500, now));
      expect(recorder.getState(now).phase).toBe('AIRBORNE');

      // Extreme wind shear downdraft: GS drops to 22 kt for 3 seconds aloft
      for (let s = 0; s < 3; s++) {
        now += 1000;
        const state = recorder.processTelemetry(createTelemetry(22, 4500, now, 38.725, -9.355, 'AIRBORNE'));
        expect(state.phase).toBe('AIRBORNE'); // Does not trigger touchdown
      }

      // Wind recovers to 110 kt
      now += 1000;
      const recoveredState = recorder.processTelemetry(createTelemetry(110, 4500, now));
      expect(recoveredState.phase).toBe('AIRBORNE');
      expect(recoveredState.timestamps.on).toBeNull();
    });

    it('recovers seamlessly from mid-flight GPS telemetry dropouts (NaN coords, speeds, timestamps)', () => {
      const recorder = new FlightRecorder();
      let now = 1700000000000;

      // Taxi and Takeoff
      now = runTaxi(recorder, 350, 38.0, -9.0, now);
      now = runTakeoff(recorder, 350, 38.0, -9.0, now);
      expect(recorder.getState(now).phase).toBe('AIRBORNE');

      // Normal flight leg 1: fly 1 degree north (~60 NM)
      now += 10000;
      recorder.processTelemetry(createTelemetry(100, 3000, now, 39.0, -9.0));
      const distBeforeDropout = recorder.getState(now).distanceFlownNm;
      expect(distBeforeDropout).toBeGreaterThan(50);

      // GPS DROPOUT: Corrupt packets with NaN coordinates, NaN ground speed, NaN altitude
      const corruptTelemetry: OwnshipTelemetry = {
        timestamp: NaN as unknown as number,
        latitude: NaN,
        longitude: NaN,
        rawGpsAltitudeFt: null,
        altimeterOffsetFt: 0,
        altitudeMslFt: NaN,
        groundSpeedKt: NaN,
        trueTrackDeg: 0,
        magneticTrackDeg: 0,
        magneticVariationDeg: 0,
        verticalSpeedFpm: 0,
        horizontalAccuracyM: 999,
        verticalAccuracyM: null,
        gpsQuality: 'LOST',
        source: 'manual-test',
        flightPhase: 'AIRBORNE',
      };

      for (let i = 0; i < 5; i++) {
        const state = recorder.processTelemetry(corruptTelemetry);
        expect(Number.isFinite(state.distanceFlownNm)).toBe(true);
        expect(Number.isFinite(state.maxAltitudeFt)).toBe(true);
        expect(Number.isFinite(state.maxGroundSpeedKt)).toBe(true);
        expect(state.phase).toBe('AIRBORNE');
      }

      // GPS Signal Recovers at 40.0, -9.0 (~60 NM further north)
      now += 60000;
      const resumedState = recorder.processTelemetry(createTelemetry(100, 3000, now, 40.0, -9.0));
      expect(resumedState.distanceFlownNm).toBeGreaterThan(distBeforeDropout + 50);
      expect(Number.isFinite(resumedState.distanceFlownNm)).toBe(true);
    });
  });

  // =========================================================================
  // 3. Extreme Fuel Stress & Non-Stop Endurance
  // =========================================================================
  describe('3. Extreme Fuel Stress & Endurance Testing', () => {
    it('endures a 24-hour non-stop ferry flight (86,400s) with 48 periodic tank switches', () => {
      const monitor = new FuelMonitor({
        initialFob: 250, // 250 gallons total ferry fuel
        fuelFlowRate: 10, // 10 GPH burn
        fuelUnit: 'gph',
        reservePolicyMinutes: 45, // 7.5 gal reserve
        tankSwitchIntervalMinutes: 30, // Switch every 30 mins
      });

      // 24 hours = 48 intervals of 30 minutes (1,800 seconds each)
      for (let interval = 1; interval <= 48; interval++) {
        // Advance timer and airborne seconds by 30 minutes
        vi.advanceTimersByTime(30 * 60 * 1000);
        monitor.tick(1800);

        const stateDue = monitor.getState();
        expect(stateDue.isSwitchDue).toBe(true);

        // Pilot switches fuel tank
        const ev = monitor.switchTank();
        expect(ev.fromTank).not.toBe(ev.toTank);

        const stateAfterSwitch = monitor.getState();
        expect(stateAfterSwitch.isSwitchDue).toBe(false);
      }

      const finalState = monitor.getState();
      // 24 hours * 10 GPH = 240 gallons burned. 250 - 240 = 10 gallons FOB remaining.
      expect(finalState.fuelBurned).toBe(240);
      expect(finalState.currentFob).toBe(10);
      expect(finalState.timeToEmptySec).toBe(3600); // 1 hour endurance left
      expect(finalState.isBelowReserve).toBe(false); // 10 gal > 7.5 gal reserve
      expect(finalState.switchHistory.length).toBe(48);

      // Burn 30 more minutes (5 gallons) -> 5 gal remaining, penetrates 7.5 gal reserve!
      monitor.tick(1800);
      const reserveState = monitor.getState();
      expect(reserveState.currentFob).toBe(5);
      expect(reserveState.isBelowReserve).toBe(true);
    });

    it('performs 1,000 rapid consecutive fuel tank switches in milliseconds without memory degradation', () => {
      const monitor = new FuelMonitor({
        initialFob: 50,
        fuelFlowRate: 8,
        tankSwitchIntervalMinutes: 30,
      });

      const initialTank = monitor.getState().activeTank; // LEFT

      // Perform 1,000 rapid switches
      for (let i = 0; i < 1000; i++) {
        monitor.switchTank();
      }

      const state = monitor.getState();
      expect(state.switchHistory.length).toBe(1000);
      // After 1,000 even switches (LEFT -> RIGHT -> LEFT ...), should be back on initialTank
      expect(state.activeTank).toBe(initialTank);
      expect(state.secondsUntilSwitch).toBe(1800);
      expect(state.isSwitchDue).toBe(false);
    });

    it('simulates extreme fuel burn flows: 0 GPH glider, 0.1 GPH ultralight, 5,000 GPH afterburner jet', () => {
      // A. Glider (0 GPH)
      const glider = new FuelMonitor({
        initialFob: 0,
        fuelFlowRate: 0,
      });
      glider.tick(7200); // 2 hours aloft
      const gliderState = glider.getState();
      expect(gliderState.fuelBurned).toBe(0);
      expect(gliderState.currentFob).toBe(0);
      expect(gliderState.timeToEmptySec).toBe(999999);
      expect(gliderState.isBelowReserve).toBe(false);

      // B. Ultralight (0.1 GPH)
      const ultralight = new FuelMonitor({
        initialFob: 5.0,
        fuelFlowRate: 0.1,
      });
      ultralight.tick(36000); // 10 hours aloft
      const ultraState = ultralight.getState();
      expect(ultraState.fuelBurned).toBe(1.0);
      expect(ultraState.currentFob).toBe(4.0);

      // C. Afterburner Jet (5,000 GPH)
      const jet = new FuelMonitor({
        initialFob: 2500,
        fuelFlowRate: 5000,
        reservePolicyMinutes: 20,
      });
      // 30 minutes in afterburner (1,800s) -> burns all 2,500 gal
      jet.tick(1800);
      const jetState = jet.getState();
      expect(jetState.currentFob).toBe(0);
      expect(jetState.timeToEmptySec).toBe(0);
      expect(jetState.isBelowReserve).toBe(true);

      // Burn another 15 minutes past empty -> FOB must stay strictly 0 (never negative)
      jet.tick(900);
      const jetDryState = jet.getState();
      expect(jetDryState.currentFob).toBe(0);
      expect(jetDryState.fuelBurned).toBe(3750);
    });

    it('enforces boundary guards against negative FOB inputs and invalid configs', () => {
      const monitor = new FuelMonitor({
        initialFob: -10,
        fuelFlowRate: -5,
        reservePolicyMinutes: -30,
        tankSwitchIntervalMinutes: -15,
      });

      const state = monitor.getState();
      expect(state.initialFob).toBe(0);
      expect(state.fuelFlowRate).toBe(0);
      expect(state.currentFob).toBe(0);

      // tick with negative and NaN seconds
      monitor.tick(-50);
      monitor.tick(NaN);
      expect(monitor.getState().fuelBurned).toBe(0);
    });
  });

  // =========================================================================
  // 4. Logbook Storage & Export Stress
  // =========================================================================
  describe('4. Logbook Storage & RFC-4180 Export Fuzzing Stress', () => {
    it('accumulates and aggregates 500+ flights in logbook memory', () => {
      const aircraft = ['C172S', 'PA28', 'DA40', 'SR22', 'BE58'];
      const routes = ['LPCS LPEV', 'LPEV LPSO', 'LPSO LPBJ', 'LPBJ LPCO', 'LPCO LPCS'];

      for (let i = 1; i <= 500; i++) {
        LogbookService.saveEntry({
          date: '2026-10-25',
          aircraftModel: aircraft[i % aircraft.length],
          tailNumber: `CS-D${String.fromCharCode(65 + (i % 26))}${i % 100}`,
          departureIcao: 'LPCS',
          destinationIcao: 'LPEV',
          routeString: routes[i % routes.length],
          outTimestamp: 1700000000000 + i * 3600000,
          offTimestamp: 1700000600000 + i * 3600000,
          onTimestamp: 1700003600000 + i * 3600000,
          inTimestamp: 1700004200000 + i * 3600000,
          flightTimeMinutes: 50,
          blockTimeMinutes: 70,
          distanceFlownNm: 75.5,
          landingsDay: 1,
          landingsNight: 0,
          notes: `Routine training flight #${i}`,
        });
      }

      const entries = LogbookService.getEntries();
      expect(entries.length).toBe(500);

      const metrics = LogbookService.getMetrics();
      expect(metrics.totalFlights).toBe(500);
      expect(metrics.totalFlightHours).toBeCloseTo((500 * 50) / 60, 1);
      expect(metrics.totalBlockHours).toBeCloseTo((500 * 70) / 60, 1);
      expect(metrics.totalDistanceNm).toBeCloseTo(500 * 75.5, 1);
      expect(metrics.totalLandings).toBe(500);
    });

    it('survives CSV export fuzzing with quotes, commas, newlines, null timestamps, and Unicode registrations', () => {
      // Fuzz records with difficult RFC-4180 edge cases
      const fuzzedEntries: Array<Omit<PilotLogbookEntry, 'id'>> = [
        {
          date: '2026-10-25',
          aircraftModel: 'Cessna 172 "Skyhawk" Special',
          tailNumber: 'CS-D€B', // Unicode Euro symbol
          departureIcao: 'LPCS, Portugal', // Comma in location
          destinationIcao: 'LPEV',
          routeString: 'LPCS "VFR 1" LPEV',
          outTimestamp: 1700000000000,
          offTimestamp: 1700000600000,
          onTimestamp: 1700003600000,
          inTimestamp: 1700004200000,
          flightTimeMinutes: 50,
          blockTimeMinutes: 70,
          distanceFlownNm: 75.4,
          landingsDay: 1,
          landingsNight: 0,
          notes: 'First line\nSecond line with "quotes" and, commas',
        },
        {
          date: '2026-10-26',
          aircraftModel: 'Robin DR400/180 "Régent"',
          tailNumber: 'D-ÉFGH', // Accented Unicode
          departureIcao: 'EDDF',
          destinationIcao: 'LFPG',
          routeString: 'EDDF DCT LFPG',
          outTimestamp: null, // Null timestamps
          offTimestamp: null,
          onTimestamp: null,
          inTimestamp: null,
          flightTimeMinutes: 0,
          blockTimeMinutes: 0,
          distanceFlownNm: 0,
          landingsDay: 0,
          landingsNight: 0,
          notes: 'Cancelled flight due to weather: METAR "OVC002 1/2SM FG"',
        },
        {
          date: '2026-10-27',
          aircraftModel: 'Pilatus PC-12/47E',
          tailNumber: 'JA01東京', // Japanese Unicode kanji
          departureIcao: 'RJTT',
          destinationIcao: 'RJAA',
          routeString: 'RJTT HME RJAA',
          outTimestamp: 1700000000000,
          offTimestamp: 1700000600000,
          onTimestamp: 1700003600000,
          inTimestamp: 1700004200000,
          flightTimeMinutes: 50,
          blockTimeMinutes: 70,
          distanceFlownNm: 45.2,
          landingsDay: 0,
          landingsNight: 1,
          notes: 'Night IFR flight into Tokyo Narita',
        },
      ];

      for (const entry of fuzzedEntries) {
        LogbookService.saveEntry(entry);
      }

      const csv = LogbookService.exportCsv();
      expect(csv).toContain('CS-D€B');
      expect(csv).toContain('D-ÉFGH');
      expect(csv).toContain('JA01東京');
      expect(csv).toContain('Cessna 172 ""Skyhawk"" Special');

      // Verify RFC-4180 parse back
      const parsedRows = LogbookService.parseCsv(csv);
      expect(parsedRows.length).toBe(4); // 1 header + 3 entries
      expect(parsedRows[0].length).toBe(16); // 16 columns

      // Row 1 (Pilatus, newest inserted)
      const row1 = parsedRows[1];
      expect(row1.length).toBe(16);
      expect(row1[1]).toBe('Pilatus PC-12/47E');
      expect(row1[2]).toBe('JA01東京');

      // Row 2 (Robin, middle inserted)
      const row2 = parsedRows[2];
      expect(row2.length).toBe(16);
      expect(row2[1]).toBe('Robin DR400/180 "Régent"');
      expect(row2[2]).toBe('D-ÉFGH');
      expect(row2[6]).toBe(''); // Out (UTC) null
      expect(row2[7]).toBe(''); // Off (UTC) null
      expect(row2[15]).toBe('Cancelled flight due to weather: METAR "OVC002 1/2SM FG"');

      // Row 3 (Cessna, first inserted)
      const row3 = parsedRows[3];
      expect(row3.length).toBe(16);
      expect(row3[1]).toBe('Cessna 172 "Skyhawk" Special');
      expect(row3[2]).toBe('CS-D€B');
      expect(row3[3]).toBe('LPCS, Portugal');
      expect(row3[15]).toBe('First line\nSecond line with "quotes" and, commas');
    });

    it('verifies 500-flight CSV export complies with RFC-4180 and parses back losslessly', () => {
      for (let i = 1; i <= 500; i++) {
        LogbookService.saveEntry({
          date: '2026-10-25',
          aircraftModel: `Type-${i} "Model"`,
          tailNumber: `N${i}€X`,
          departureIcao: `ICAO${i % 100}`,
          destinationIcao: `DEST${i % 100}`,
          routeString: `WPT1, WPT2 "AIRWAY" WPT3`,
          outTimestamp: 1700000000000 + i * 1000,
          offTimestamp: 1700000600000 + i * 1000,
          onTimestamp: 1700003600000 + i * 1000,
          inTimestamp: 1700004200000 + i * 1000,
          flightTimeMinutes: 50,
          blockTimeMinutes: 70,
          distanceFlownNm: 100.5,
          landingsDay: 1,
          landingsNight: 0,
          notes: `Flight line 1\nFlight line 2 for #${i}`,
        });
      }

      const csv = LogbookService.exportCsv();
      const rows = LogbookService.parseCsv(csv);

      // Verify header + 500 rows = 501 rows
      expect(rows.length).toBe(501);

      // Verify every single row has exactly 16 columns
      for (let r = 0; r < rows.length; r++) {
        expect(rows[r].length).toBe(16);
      }

      // Verify round-trip lossless fidelity on first and last data rows
      expect(rows[1][1]).toBe('Type-500 "Model"');
      expect(rows[1][2]).toBe('N500€X');
      expect(rows[1][5]).toBe('WPT1, WPT2 "AIRWAY" WPT3');
      expect(rows[1][15]).toBe('Flight line 1\nFlight line 2 for #500');

      expect(rows[500][1]).toBe('Type-1 "Model"');
      expect(rows[500][2]).toBe('N1€X');
      expect(rows[500][15]).toBe('Flight line 1\nFlight line 2 for #1');
    });
  });
});
