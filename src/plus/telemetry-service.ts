import { Geolocation } from '@capacitor/geolocation';
import { greatCircleDistance, initialBearing } from '../engine/coordinate-math';
import { magneticDeclination } from '../engine/wmm2025';
import { isNativePlatform } from '../utils/platform';
import { normalizeDegrees } from './inflight-nav';
import {
  FlightPhase,
  GpsSignalQuality,
  OwnshipTelemetry,
} from './types-plus';

export type TelemetryCallback = (telemetry: OwnshipTelemetry) => void;
export type TelemetryErrorCallback = (message: string) => void;

const MPS_TO_KNOTS = 1.94384449;
const METERS_TO_FEET = 3.2808399;

export function classifyGpsAccuracy(accuracyMeters: number): GpsSignalQuality {
  if (!Number.isFinite(accuracyMeters) || accuracyMeters <= 0) return 'MARGINAL';
  if (accuracyMeters <= 30) return 'HIGH';
  if (accuracyMeters <= 100) return 'MARGINAL';
  return 'DEGRADED';
}

/**
 * Circular vector EMA smoothing for compass/track angles across the 359° ↔ 001° North boundary.
 */
function smoothAngleCircular(prevDeg: number, rawDeg: number, alpha: number = 0.65): number {
  if (!Number.isFinite(rawDeg)) return normalizeDegrees(prevDeg);
  if (!Number.isFinite(prevDeg)) return normalizeDegrees(rawDeg);
  const prevRad = (prevDeg * Math.PI) / 180;
  const rawRad = (rawDeg * Math.PI) / 180;
  const sinBlend = alpha * Math.sin(rawRad) + (1 - alpha) * Math.sin(prevRad);
  const cosBlend = alpha * Math.cos(rawRad) + (1 - alpha) * Math.cos(prevRad);
  if (Math.abs(sinBlend) < 1e-9 && Math.abs(cosBlend) < 1e-9) {
    return normalizeDegrees(rawDeg);
  }
  const blendedDeg = (Math.atan2(sinBlend, cosBlend) * 180) / Math.PI;
  return normalizeDegrees(blendedDeg);
}

/**
 * 3-sample median filter to reject single-sample multipath GPS altitude spikes.
 */
function medianOfThree(values: number[]): number {
  const finiteVals = values.filter(Number.isFinite);
  if (finiteVals.length === 0) return 0;
  if (finiteVals.length < 3) return finiteVals[finiteVals.length - 1];
  const sorted = [...finiteVals.slice(-3)].sort((a, b) => a - b);
  return sorted[1];
}

export class FlightTelemetryController {
  private onUpdate: TelemetryCallback;
  private onError?: TelemetryErrorCallback;

  private watchIdWeb: number | null = null;
  private watchIdNative: string | null = null;
  private staleWatchdogTimer: ReturnType<typeof setInterval> | null = null;
  private simTimer: ReturnType<typeof setInterval> | null = null;
  private wakeLockSentinel: any = null;

  private altimeterOffsetFt: number = 0;
  private lastState: OwnshipTelemetry | null = null;
  private rawAltitudeHistoryFt: number[] = [];
  private isAirborneConfirmed: boolean = false;
  private isRunning: boolean = false;
  private lastVsCalcTimestampMs: number = 0;
  private lastVsCalcAltFt: number | null = null;

  constructor(onUpdate: TelemetryCallback, onError?: TelemetryErrorCallback) {
    this.onUpdate = onUpdate;
    this.onError = onError;
  }

  public getAltimeterOffsetFt(): number {
    return this.altimeterOffsetFt;
  }

  public setAltimeterOffsetFt(offsetFt: number): void {
    this.altimeterOffsetFt = Number.isFinite(offsetFt) ? Math.round(offsetFt) : 0;
    if (this.lastState) {
      const rawAlt = this.lastState.rawGpsAltitudeFt;
      const updated: OwnshipTelemetry = {
        ...this.lastState,
        altimeterOffsetFt: this.altimeterOffsetFt,
        altitudeMslFt:
          rawAlt !== null ? Math.round(rawAlt + this.altimeterOffsetFt) : null,
      };
      this.lastState = updated;
      this.onUpdate(updated);
    }
  }

  /**
   * Calibrates the GPS altitude offset so that displayed MSL altitude matches the cockpit barometric altimeter.
   */
  public syncToCockpitAltimeter(cockpitIndicatedAltFt: number): void {
    if (!this.lastState || this.lastState.rawGpsAltitudeFt === null) return;
    const offset = Math.round(cockpitIndicatedAltFt - this.lastState.rawGpsAltitudeFt);
    this.setAltimeterOffsetFt(offset);
  }

  /**
   * Starts Live Hardware GPS watching (Capacitor Native Geolocation on iOS/Android, Web Geolocation on Browser/PWA).
   */
  public async startLiveGps(): Promise<void> {
    this.stopAll();
    this.isRunning = true;
    await this.acquireWakeLock();

    if (isNativePlatform()) {
      try {
        await Geolocation.requestPermissions();
        const id = await Geolocation.watchPosition(
          {
            enableHighAccuracy: true,
            timeout: 8000,
            maximumAge: 1000,
          },
          (position, err) => {
            if (err) {
              this.handleGpsFailure(err.message || 'Native GPS watch error');
              return;
            }
            if (position) {
              this.processRawCoords(position.coords, position.timestamp || Date.now());
            }
          }
        );
        this.watchIdNative = id;
      } catch (e: any) {
        this.handleGpsFailure(e?.message || 'Unable to start native GPS');
      }
    } else if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      this.watchIdWeb = navigator.geolocation.watchPosition(
        (pos) => {
          this.processRawCoords(pos.coords, pos.timestamp || Date.now());
        },
        (err) => {
          this.handleGpsFailure(
            err.code === 1
              ? 'Location permission denied. Enable GPS/Location access for live moving map.'
              : `GPS signal unavailable (${err.message || 'timeout'})`
          );
        },
        {
          enableHighAccuracy: true,
          maximumAge: 1000,
          timeout: 8000,
        }
      );
    } else {
      this.handleGpsFailure('Geolocation API is not supported in this browser.');
    }

    // Watchdog timer to detect stale GPS fixes (> 8 seconds without update)
    this.staleWatchdogTimer = setInterval(() => {
      if (!this.isRunning || !this.lastState) return;
      if (this.lastState.source !== 'gps') return;

      const ageMs = Date.now() - this.lastState.timestamp;
      if (ageMs > 8500 && this.lastState.gpsQuality !== 'LOST') {
        const lostState: OwnshipTelemetry = {
          ...this.lastState,
          gpsQuality: 'LOST',
        };
        this.lastState = lostState;
        this.onUpdate(lostState);
      }
    }, 2500);
  }

  /**
   * Injects a manual or simulated ownship state (for cockpit rehearsal, map-click placement, or route step testing).
   */
  public setManualOwnship(params: {
    latitude: number;
    longitude: number;
    altitudeMslFt: number;
    groundSpeedKt: number;
    trueTrackDeg: number;
    verticalSpeedFpm?: number;
  }): OwnshipTelemetry {
    const {
      latitude,
      longitude,
      altitudeMslFt,
      groundSpeedKt,
      trueTrackDeg,
      verticalSpeedFpm = 0,
    } = params;

    const safeLat = Number.isFinite(latitude) ? Math.max(-90, Math.min(90, latitude)) : 0;
    const safeLon = Number.isFinite(longitude)
      ? ((((longitude + 180) % 360) + 360) % 360) - 180
      : 0;
    const safeAltFt = Number.isFinite(altitudeMslFt) ? altitudeMslFt : 0;
    const safeGsKt = Number.isFinite(groundSpeedKt) ? Math.max(0, groundSpeedKt) : 0;
    const normTrue = normalizeDegrees(trueTrackDeg);
    const magVar = magneticDeclination(safeLat, safeLon, safeAltFt);
    const safeMagVar = Number.isFinite(magVar) ? magVar : 0;
    const magTrack = normalizeDegrees(normTrue - safeMagVar);

    const flightPhase = this.determineFlightPhase(safeGsKt);
    const rawAlt = safeAltFt - this.altimeterOffsetFt;

    const state: OwnshipTelemetry = {
      timestamp: Date.now(),
      latitude: safeLat,
      longitude: safeLon,
      rawGpsAltitudeFt: Math.round(rawAlt),
      altimeterOffsetFt: this.altimeterOffsetFt,
      altitudeMslFt: Math.round(safeAltFt),
      groundSpeedKt: Math.round(safeGsKt),
      trueTrackDeg: normTrue,
      magneticTrackDeg: magTrack,
      magneticVariationDeg: safeMagVar,
      verticalSpeedFpm: Math.round(Number.isFinite(verticalSpeedFpm) ? verticalSpeedFpm : 0),
      horizontalAccuracyM: 4,
      verticalAccuracyM: 6,
      gpsQuality: 'HIGH',
      source: 'manual-test',
      flightPhase,
    };

    this.lastState = state;
    this.onUpdate(state);
    return state;
  }

  /**
   * Starts a continuous 1 Hz flight progression from current Manual/Test Ownship state
   * along its current track, groundspeed, and vertical speed.
   */
  public startContinuousTestFlight(speedMultiplier: number = 1): void {
    this.stopSimTimer();
    if (!this.lastState) return;

    this.simTimer = setInterval(() => {
      if (!this.lastState) return;
      const dtHours = (1 * speedMultiplier) / 3600;
      const dtMinutes = (1 * speedMultiplier) / 60;

      const distNm = this.lastState.groundSpeedKt * dtHours;
      const R = 3440.065;
      const delta = distNm / R;
      const theta = (this.lastState.trueTrackDeg * Math.PI) / 180;
      const phi1 = (this.lastState.latitude * Math.PI) / 180;
      const lam1 = (this.lastState.longitude * Math.PI) / 180;

      const sinPhi2 =
        Math.sin(phi1) * Math.cos(delta) +
        Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
      const phi2 = Math.asin(Math.max(-1, Math.min(1, sinPhi2)));
      const y = Math.sin(theta) * Math.sin(delta) * Math.cos(phi1);
      const x = Math.cos(delta) - Math.sin(phi1) * sinPhi2;
      const lam2 = lam1 + Math.atan2(y, x);

      const nextLat = (phi2 * 180) / Math.PI;
      const nextLon = (((((lam2 * 180) / Math.PI + 180) % 360) + 360) % 360) - 180;
      const prevAlt = this.lastState.altitudeMslFt ?? 3500;
      const nextAlt = Math.max(0, prevAlt + this.lastState.verticalSpeedFpm * dtMinutes);

      this.setManualOwnship({
        latitude: nextLat,
        longitude: nextLon,
        altitudeMslFt: nextAlt,
        groundSpeedKt: this.lastState.groundSpeedKt,
        trueTrackDeg: this.lastState.trueTrackDeg,
        verticalSpeedFpm: this.lastState.verticalSpeedFpm,
      });
    }, 1000);
  }

  public stopSimTimer(): void {
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
  }

  public stopAll(): void {
    this.isRunning = false;
    this.stopSimTimer();

    if (this.watchIdWeb !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchIdWeb);
      this.watchIdWeb = null;
    }

    if (this.watchIdNative !== null) {
      const id = this.watchIdNative;
      this.watchIdNative = null;
      Geolocation.clearWatch({ id }).catch(() => {});
    }

    if (this.staleWatchdogTimer) {
      clearInterval(this.staleWatchdogTimer);
      this.staleWatchdogTimer = null;
    }

    this.releaseWakeLock();
  }

  public processRawCoords(
    coords: {
      latitude: number;
      longitude: number;
      altitude: number | null;
      accuracy: number;
      altitudeAccuracy?: number | null;
      heading: number | null;
      speed: number | null;
    },
    timestampMs?: number
  ): OwnshipTelemetry | null {
    if (
      !coords ||
      !Number.isFinite(coords.latitude) ||
      !Number.isFinite(coords.longitude)
    ) {
      return null;
    }

    const prev = this.lastState;
    const nowMs =
      timestampMs !== undefined && Number.isFinite(timestampMs) && timestampMs > 0
        ? timestampMs
        : Date.now();
    const rawDt = prev ? (nowMs - prev.timestamp) / 1000 : 1;
    const dtSec = Number.isFinite(rawDt) ? Math.max(0.001, Math.min(60, rawDt)) : 1;

    const lat = Math.max(-90, Math.min(90, coords.latitude));
    const lon = ((((coords.longitude + 180) % 360) + 360) % 360) - 180;
    const distFromPrevNm = prev
      ? greatCircleDistance(prev.latitude, prev.longitude, lat, lon)
      : 0;
    const distFromPrevMeters = distFromPrevNm * 1852;

    // 1. Ground Speed (Knots) with EMA smoothing
    let rawGsKt = 0;
    if (coords.speed !== null && Number.isFinite(coords.speed) && coords.speed >= 0) {
      rawGsKt = coords.speed * MPS_TO_KNOTS;
    } else if (prev && distFromPrevMeters > 2 && dtSec <= 15) {
      rawGsKt = (distFromPrevNm / dtSec) * 3600;
    }
    const safeRawGs = Number.isFinite(rawGsKt) ? Math.max(0, rawGsKt) : 0;
    const smoothedGsKt =
      prev && prev.source === 'gps' && Number.isFinite(prev.groundSpeedKt)
        ? 0.65 * safeRawGs + 0.35 * prev.groundSpeedKt
        : safeRawGs;

    // 2. True Track (Degrees) with Circular Vector Smoothing across North (000°)
    let rawTrackDeg: number | null = null;
    if (
      coords.heading !== null &&
      Number.isFinite(coords.heading) &&
      coords.heading >= 0 &&
      smoothedGsKt >= 2.5
    ) {
      rawTrackDeg = normalizeDegrees(coords.heading);
    } else if (prev && distFromPrevMeters > 2) {
      rawTrackDeg = initialBearing(prev.latitude, prev.longitude, lat, lon);
    }

    const trueTrackDeg =
      rawTrackDeg !== null
        ? prev && prev.source === 'gps'
          ? smoothAngleCircular(prev.trueTrackDeg, rawTrackDeg, 0.65)
          : rawTrackDeg
        : prev?.trueTrackDeg ?? 0;

    // 3. Altitude (Feet MSL) with 3-Sample Median Spike Rejection & Windowed Vertical Speed (FPM)
    let rawGpsAltitudeFt: number | null = null;
    if (coords.altitude !== null && Number.isFinite(coords.altitude)) {
      const sampleFt = coords.altitude * METERS_TO_FEET;
      this.rawAltitudeHistoryFt.push(sampleFt);
      if (this.rawAltitudeHistoryFt.length > 5) {
        this.rawAltitudeHistoryFt.shift();
      }
      rawGpsAltitudeFt = medianOfThree(this.rawAltitudeHistoryFt);
    } else if (prev?.rawGpsAltitudeFt !== null && prev?.rawGpsAltitudeFt !== undefined) {
      rawGpsAltitudeFt = prev.rawGpsAltitudeFt;
    }

    const calibratedAltFt =
      rawGpsAltitudeFt !== null
        ? Math.round(rawGpsAltitudeFt + this.altimeterOffsetFt)
        : null;

    let verticalSpeedFpm = prev?.verticalSpeedFpm ?? 0;
    if (calibratedAltFt !== null) {
      if (this.lastVsCalcAltFt === null || this.lastVsCalcTimestampMs === 0) {
        this.lastVsCalcAltFt = calibratedAltFt;
        this.lastVsCalcTimestampMs = nowMs;
      } else {
        const vsDtSec = (nowMs - this.lastVsCalcTimestampMs) / 1000;
        if (vsDtSec >= 0.35 && vsDtSec <= 15) {
          const rawVsFpm = ((calibratedAltFt - this.lastVsCalcAltFt) / vsDtSec) * 60;
          if (Number.isFinite(rawVsFpm)) {
            const clampedRawVs = Math.max(-8000, Math.min(8000, rawVsFpm));
            verticalSpeedFpm = Math.round(0.35 * clampedRawVs + 0.65 * (prev?.verticalSpeedFpm ?? 0));
            if (Math.abs(verticalSpeedFpm) < 25) verticalSpeedFpm = 0;
          }
          this.lastVsCalcAltFt = calibratedAltFt;
          this.lastVsCalcTimestampMs = nowMs;
        } else if (vsDtSec > 15) {
          this.lastVsCalcAltFt = calibratedAltFt;
          this.lastVsCalcTimestampMs = nowMs;
        }
      }
    }

    // 4. WMM2025 Magnetic Variation & Magnetic Track
    const magVar = magneticDeclination(lat, lon, calibratedAltFt ?? 2000);
    const safeMagVar = Number.isFinite(magVar) ? magVar : 0;
    const magneticTrackDeg = normalizeDegrees(trueTrackDeg - safeMagVar);

    // 5. GPS Accuracy & Flight Phase
    const accuracyM = Number.isFinite(coords.accuracy) ? coords.accuracy : 50;
    const gpsQuality = classifyGpsAccuracy(accuracyM);
    const flightPhase = this.determineFlightPhase(smoothedGsKt);

    const nextState: OwnshipTelemetry = {
      timestamp: nowMs,
      latitude: lat,
      longitude: lon,
      rawGpsAltitudeFt: rawGpsAltitudeFt !== null ? Math.round(rawGpsAltitudeFt) : null,
      altimeterOffsetFt: this.altimeterOffsetFt,
      altitudeMslFt: calibratedAltFt,
      groundSpeedKt: Math.round(smoothedGsKt),
      trueTrackDeg: Math.round(trueTrackDeg),
      magneticTrackDeg: Math.round(magneticTrackDeg),
      magneticVariationDeg: safeMagVar,
      verticalSpeedFpm,
      horizontalAccuracyM: Math.round(accuracyM),
      verticalAccuracyM:
        coords.altitudeAccuracy !== null &&
        coords.altitudeAccuracy !== undefined &&
        Number.isFinite(coords.altitudeAccuracy)
          ? Math.round(coords.altitudeAccuracy)
          : null,
      gpsQuality,
      source: 'gps',
      flightPhase,
    };

    this.lastState = nextState;
    this.onUpdate(nextState);
    return nextState;
  }

  private determineFlightPhase(gsKt: number): FlightPhase {
    if (gsKt >= 38) {
      this.isAirborneConfirmed = true;
      return 'AIRBORNE';
    }
    if (this.isAirborneConfirmed && gsKt < 25) {
      return 'LANDED';
    }
    if (gsKt >= 3) {
      return 'TAXI';
    }
    return this.isAirborneConfirmed ? 'LANDED' : 'PREFLIGHT';
  }

  private handleGpsFailure(msg: string): void {
    if (this.onError) {
      this.onError(msg);
    }
    if (this.lastState) {
      const updated: OwnshipTelemetry = {
        ...this.lastState,
        gpsQuality: 'LOST',
      };
      this.lastState = updated;
      this.onUpdate(updated);
    }
  }

  private async acquireWakeLock(): Promise<void> {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        this.wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
      } catch {
        // Ignore if browser declines wakeLock in background tab
      }
    }
  }

  private releaseWakeLock(): void {
    if (this.wakeLockSentinel) {
      try {
        this.wakeLockSentinel.release();
      } catch {
        // Ignore
      }
      this.wakeLockSentinel = null;
    }
  }
}
