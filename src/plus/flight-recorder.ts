/**
 * Automatic Flight Phase & OOOI (Out/Off/On/In) State Machine
 *
 * Automatically detects flight phases and timestamps for official pilot logbook:
 * - OUT (Off-Block): Taxi commencement (GS > 4 kt)
 * - OFF (Airborne): Takeoff rotation & climb (GS > 45 kt)
 * - ON (Touchdown): Landing rollout (GS < 30 kt)
 * - IN (On-Block): Parking & engine shutdown (GS < 2 kt)
 */

import { OwnshipTelemetry } from './types-plus';

export type OOOIPhase =
  | 'PREFLIGHT'
  | 'OFF_BLOCK'
  | 'TAXI'
  | 'AIRBORNE'
  | 'TOUCHDOWN'
  | 'ON_BLOCK';

export interface OOOITimestamps {
  out: number | null; // Off-block (epoch ms)
  off: number | null; // Takeoff airborne (epoch ms)
  on: number | null;  // Touchdown landing (epoch ms)
  in: number | null;  // On-block parked (epoch ms)
}

export interface FlightRecorderState {
  phase: OOOIPhase;
  timestamps: OOOITimestamps;
  flightDurationSec: number;
  blockDurationSec: number;
  maxAltitudeFt: number;
  maxGroundSpeedKt: number;
  distanceFlownNm: number;
  touchAndGoCount?: number;
}

export class FlightRecorder {
  private phase: OOOIPhase = 'PREFLIGHT';
  private timestamps: OOOITimestamps = {
    out: null,
    off: null,
    on: null,
    in: null,
  };

  private prevLat: number | null = null;
  private prevLon: number | null = null;
  private distanceFlownNm: number = 0;
  private maxAltFt: number = 0;
  private maxGsKt: number = 0;

  private taxiStartCandidateTime: number | null = null;
  private airborneCandidateTime: number | null = null;
  private touchdownCandidateTime: number | null = null;
  private parkCandidateTime: number | null = null;

  private groundElevationFt: number | null = null;
  private touchAndGoCount: number = 0;

  public processTelemetry(ownship: OwnshipTelemetry): FlightRecorderState {
    const now = Number.isFinite(ownship.timestamp) && ownship.timestamp > 0 ? ownship.timestamp : Date.now();
    const rawGs = Number.isFinite(ownship.groundSpeedKt) ? ownship.groundSpeedKt : 0;
    const speed = Math.abs(rawGs); // handles reverse taxiing and negative speeds safely
    const alt = Number.isFinite(ownship.altitudeMslFt)
      ? (ownship.altitudeMslFt as number)
      : Number.isFinite(ownship.rawGpsAltitudeFt)
      ? (ownship.rawGpsAltitudeFt as number)
      : 0;

    if (alt > this.maxAltFt) this.maxAltFt = alt;
    if (speed > this.maxGsKt) this.maxGsKt = speed;

    // Capture ground elevation during ground phases while parked or taxiing at ground speeds
    if (this.phase === 'PREFLIGHT' || ((this.phase === 'TAXI' || this.phase === 'OFF_BLOCK') && speed <= 25)) {
      if (alt > 0 || this.groundElevationFt === null) {
        this.groundElevationFt = alt;
      }
    }

    // Telemetry Coordinate Integrity & Distance Accumulation
    const validCoords =
      Number.isFinite(ownship.latitude) &&
      Number.isFinite(ownship.longitude) &&
      ownship.latitude >= -90 &&
      ownship.latitude <= 90 &&
      ownship.longitude >= -180 &&
      ownship.longitude <= 180;

    if (validCoords) {
      if (this.phase === 'AIRBORNE' && this.prevLat !== null && this.prevLon !== null) {
        const d = this.calcApproxDistanceNm(this.prevLat, this.prevLon, ownship.latitude, ownship.longitude);
        if (Number.isFinite(d) && d >= 0) {
          this.distanceFlownNm += d;
        }
      }
      this.prevLat = ownship.latitude;
      this.prevLon = ownship.longitude;
    }

    // Phase Transitions
    switch (this.phase) {
      case 'PREFLIGHT':
        if (speed >= 4) {
          if (!this.taxiStartCandidateTime) this.taxiStartCandidateTime = now;
          if (now - this.taxiStartCandidateTime >= 4000) {
            this.phase = 'OFF_BLOCK';
            this.timestamps.out = this.taxiStartCandidateTime;
            this.phase = 'TAXI';
          }
        } else {
          this.taxiStartCandidateTime = null;
        }
        break;

      case 'TAXI':
      case 'OFF_BLOCK':
        if (speed >= 45) {
          if (!this.airborneCandidateTime) this.airborneCandidateTime = now;
          if (now - this.airborneCandidateTime >= 3000) {
            this.phase = 'AIRBORNE';
            this.timestamps.off = this.airborneCandidateTime;
          }
        } else {
          this.airborneCandidateTime = null;
        }
        break;

      case 'AIRBORNE': {
        // Guard against false touchdown during helicopter hovering or high-altitude wind shear:
        // Aircraft must either be near departure/ground elevation OR telemetry explicitly indicates landed.
        const isHighAirborne = this.groundElevationFt !== null && alt > this.groundElevationFt + 150;
        const qualifiesForTouchdown = speed <= 30 && (!isHighAirborne || ownship.flightPhase === 'LANDED');

        if (qualifiesForTouchdown) {
          if (!this.touchdownCandidateTime) this.touchdownCandidateTime = now;
          if (now - this.touchdownCandidateTime >= 5000) {
            this.phase = 'TOUCHDOWN';
            this.timestamps.on = this.touchdownCandidateTime;
          }
        } else {
          this.touchdownCandidateTime = null;
        }
        break;
      }

      case 'TOUCHDOWN':
        if (speed >= 45) {
          // Touch-and-Go or Balked Landing / Go-Around from rollout
          if (!this.airborneCandidateTime) this.airborneCandidateTime = now;
          if (now - this.airborneCandidateTime >= 3000) {
            this.phase = 'AIRBORNE';
            this.timestamps.on = null; // resets until final full-stop landing
            this.touchdownCandidateTime = null;
            this.parkCandidateTime = null;
            this.airborneCandidateTime = null;
            this.touchAndGoCount++;
          }
        } else if (speed <= 2) {
          if (!this.parkCandidateTime) this.parkCandidateTime = now;
          if (now - this.parkCandidateTime >= 10000) {
            this.phase = 'ON_BLOCK';
            this.timestamps.in = this.parkCandidateTime;
          }
        } else {
          this.parkCandidateTime = null;
          this.airborneCandidateTime = null;
        }
        break;

      case 'ON_BLOCK':
        // Finished flight
        break;
    }

    return this.getState(now);
  }

  public abortFlight(now: number = Date.now()): void {
    if (this.phase === 'TAXI' || this.phase === 'OFF_BLOCK' || this.phase === 'PREFLIGHT') {
      this.phase = 'ON_BLOCK';
      if (!this.timestamps.out) this.timestamps.out = now;
      this.timestamps.in = now;
    }
  }

  public forceSetPhase(phase: OOOIPhase): void {
    const now = Date.now();
    this.phase = phase;
    if (phase === 'OFF_BLOCK' && !this.timestamps.out) this.timestamps.out = now;
    if (phase === 'AIRBORNE' && !this.timestamps.off) this.timestamps.off = now;
    if (phase === 'TOUCHDOWN' && !this.timestamps.on) this.timestamps.on = now;
    if (phase === 'ON_BLOCK' && !this.timestamps.in) this.timestamps.in = now;
  }

  public getState(now: number = Date.now()): FlightRecorderState {
    let flightSec = 0;
    if (this.timestamps.off) {
      const end = this.timestamps.on || now;
      flightSec = Math.max(0, Math.round((end - this.timestamps.off) / 1000));
    }

    let blockSec = 0;
    if (this.timestamps.out) {
      const end = this.timestamps.in || now;
      blockSec = Math.max(0, Math.round((end - this.timestamps.out) / 1000));
    }

    return {
      phase: this.phase,
      timestamps: { ...this.timestamps },
      flightDurationSec: flightSec,
      blockDurationSec: blockSec,
      maxAltitudeFt: this.maxAltFt,
      maxGroundSpeedKt: this.maxGsKt,
      distanceFlownNm: Math.round(this.distanceFlownNm * 10) / 10,
      touchAndGoCount: this.touchAndGoCount,
    };
  }

  public reset(): void {
    this.phase = 'PREFLIGHT';
    this.timestamps = { out: null, off: null, on: null, in: null };
    this.distanceFlownNm = 0;
    this.maxAltFt = 0;
    this.maxGsKt = 0;
    this.prevLat = null;
    this.prevLon = null;
    this.taxiStartCandidateTime = null;
    this.airborneCandidateTime = null;
    this.touchdownCandidateTime = null;
    this.parkCandidateTime = null;
    this.groundElevationFt = null;
    this.touchAndGoCount = 0;
  }

  private calcApproxDistanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLat = (lat2 - lat1) * 60;
    const dLon = (lon2 - lon1) * 60 * Math.cos(((lat1 + lat2) * Math.PI) / 360);
    const dist = Math.sqrt(dLat * dLat + dLon * dLon);
    return Number.isFinite(dist) ? dist : 0;
  }
}
