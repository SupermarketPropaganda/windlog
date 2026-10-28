/**
 * Traffic Service & ADS-B / FLARM Target Manager
 *
 * Coordinates real-time traffic reception via GDL-90 byte streams (WebSocket / UDP),
 * evaluates proximity threats relative to Ownship, prunes stale targets,
 * and provides simulated traffic targets for offline / cockpit testing.
 */

import { greatCircleDistance, initialBearing } from '../engine/coordinate-math';
import {
  Gdl90StreamDecoder,
  Gdl90TrafficReport,
  encodeGdl90TrafficReport,
} from './gdl90-parser';
import { destinationPoint } from './inflight-nav';

export interface TrafficTarget {
  icaoAddress: string;
  callsign: string;
  latitude: number;
  longitude: number;
  altitudeFt: number | null;
  groundSpeedKt: number;
  trackDeg: number;
  verticalSpeedFpm: number;
  emitterCategory: number;
  lastSeenTimestamp: number;
  isOwnship: boolean;

  // Relative to Ownship (dynamically evaluated)
  distanceNm: number;
  bearingDeg: number;
  relativeAltFt: number | null; // targetAlt - ownshipAlt
  isThreat: boolean;            // true if within 3 NM and +/- 1000 ft
  isCaution: boolean;           // true if within 5 NM and +/- 2000 ft
  timeToCpaSec?: number;        // Estimated time to closest point of approach
}

export type TrafficListener = (targets: TrafficTarget[]) => void;
export type TrafficAlertListener = (threat: TrafficTarget) => void;

const STALE_TARGET_TIMEOUT_MS = 15000; // 15 seconds

export class TrafficService {
  private decoder = new Gdl90StreamDecoder();
  private rawTargets = new Map<string, Gdl90TrafficReport & { lastSeen: number }>();
  private listeners: Set<TrafficListener> = new Set();
  private alertListeners: Set<TrafficAlertListener> = new Set();

  private ownshipLat: number = 38.725;
  private ownshipLon: number = -9.355;
  private ownshipAltFt: number = 3500;
  private ownshipGsKt: number = 105;
  private ownshipTrackDeg: number = 62;

  private ws: WebSocket | null = null;
  private wsConnected = false;
  private wsUrl: string = 'ws://192.168.10.1:4000/traffic';

  private simTimer: any = null;
  private pruneTimer: any = null;

  constructor() {
    this.startPruningTimer();
  }

  public setOwnship(lat: number, lon: number, altFt: number, gsKt: number, trackDeg: number): void {
    if (Number.isFinite(lat)) this.ownshipLat = lat;
    if (Number.isFinite(lon)) this.ownshipLon = lon;
    if (Number.isFinite(altFt)) this.ownshipAltFt = altFt;
    if (Number.isFinite(gsKt)) this.ownshipGsKt = gsKt;
    if (Number.isFinite(trackDeg)) this.ownshipTrackDeg = trackDeg;
    this.notifyListeners();
  }

  public subscribe(listener: TrafficListener): () => void {
    this.listeners.add(listener);
    listener(this.getTargets());
    return () => this.listeners.delete(listener);
  }

  public onThreatAlert(listener: TrafficAlertListener): () => void {
    this.alertListeners.add(listener);
    return () => this.alertListeners.delete(listener);
  }

  /**
   * Ingests raw binary bytes from a GDL-90 datastream (WebSocket, serial, or file).
   */
  public ingestBytes(data: Uint8Array): void {
    if (!data || data.length === 0) return;
    const messages = this.decoder.pushBytes(data);
    let updated = false;
    for (const msg of messages) {
      if (msg.msgId === 20) {
        if (!msg.icaoAddress || !Number.isFinite(msg.latitude) || !Number.isFinite(msg.longitude)) {
          continue;
        }
        this.rawTargets.set(msg.icaoAddress, {
          ...msg,
          lastSeen: Date.now(),
        });
        updated = true;
      }
    }
    if (updated) {
      this.notifyListeners();
    }
  }

  /**
   * Ingests an individual parsed Traffic Report directly.
   */
  public ingestReport(report: Gdl90TrafficReport): void {
    if (!report || !report.icaoAddress || !Number.isFinite(report.latitude) || !Number.isFinite(report.longitude)) {
      return;
    }
    this.rawTargets.set(report.icaoAddress, {
      ...report,
      lastSeen: Date.now(),
    });
    this.notifyListeners();
  }

  /**
   * Evaluates and returns all active traffic targets sorted by distance.
   */
  public getTargets(): TrafficTarget[] {
    const now = Date.now();
    const result: TrafficTarget[] = [];

    for (const [icao, raw] of this.rawTargets.entries()) {
      if (now - raw.lastSeen > STALE_TARGET_TIMEOUT_MS) {
        continue;
      }

      if (!Number.isFinite(raw.latitude) || !Number.isFinite(raw.longitude)) {
        continue;
      }

      const distNm = greatCircleDistance(this.ownshipLat, this.ownshipLon, raw.latitude, raw.longitude);
      const bearing = Math.round(initialBearing(this.ownshipLat, this.ownshipLon, raw.latitude, raw.longitude));
      const relAlt = raw.altitudeFt !== null && Number.isFinite(raw.altitudeFt)
        ? Math.round(raw.altitudeFt - this.ownshipAltFt)
        : null;

      const isThreat = distNm <= 3.0 && relAlt !== null && Math.abs(relAlt) <= 1000;
      const isCaution = distNm <= 6.0 && relAlt !== null && Math.abs(relAlt) <= 2000;

      // Approximate Time to Closest Point of Approach (CPA)
      let timeToCpaSec: number | undefined;
      if (distNm < 10 && raw.groundSpeedKt > 20) {
        // High-precision vector closing speed
        const ownRad = (this.ownshipTrackDeg * Math.PI) / 180;
        const tgtRad = (raw.trackDeg * Math.PI) / 180;
        const vOwnN = this.ownshipGsKt * Math.cos(ownRad);
        const vOwnE = this.ownshipGsKt * Math.sin(ownRad);
        const vTgtN = raw.groundSpeedKt * Math.cos(tgtRad);
        const vTgtE = raw.groundSpeedKt * Math.sin(tgtRad);

        const vRelN = vTgtN - vOwnN;
        const vRelE = vTgtE - vOwnE;

        const bearingRad = (bearing * Math.PI) / 180;
        const posN = distNm * Math.cos(bearingRad);
        const posE = distNm * Math.sin(bearingRad);

        const dot = posN * vRelN + posE * vRelE;
        const relSpeedSq = vRelN * vRelN + vRelE * vRelE;

        if (dot < 0 && relSpeedSq > 100) {
          timeToCpaSec = Math.max(0, Math.round((-dot / relSpeedSq) * 3600));
        } else if (distNm <= 0.05) {
          timeToCpaSec = 0;
        } else {
          const closingSpeedKt = Math.max(30, this.ownshipGsKt + raw.groundSpeedKt * 0.7);
          timeToCpaSec = Math.round((distNm / closingSpeedKt) * 3600);
        }
      } else if (distNm <= 0.05) {
        timeToCpaSec = 0;
      }

      const target: TrafficTarget = {
        icaoAddress: icao,
        callsign: raw.callsign || icao,
        latitude: raw.latitude,
        longitude: raw.longitude,
        altitudeFt: raw.altitudeFt,
        groundSpeedKt: raw.groundSpeedKt,
        trackDeg: raw.trackDeg,
        verticalSpeedFpm: raw.verticalSpeedFpm,
        emitterCategory: raw.emitterCategory,
        lastSeenTimestamp: raw.lastSeen,
        isOwnship: raw.isOwnship,
        distanceNm: Number.isFinite(distNm) ? distNm : 9999,
        bearingDeg: Number.isFinite(bearing) ? bearing : 0,
        relativeAltFt: relAlt,
        isThreat,
        isCaution,
        timeToCpaSec,
      };

      if (isThreat) {
        for (const alertListener of this.alertListeners) {
          try {
            alertListener(target);
          } catch {}
        }
      }

      result.push(target);
    }

    // Sort by distance (closest first)
    return result.sort((a, b) => a.distanceNm - b.distanceNm);
  }

  private notifyListeners(): void {
    if (this.listeners.size === 0 && this.alertListeners.size === 0) {
      return;
    }
    const targets = this.getTargets();
    for (const l of this.listeners) {
      try {
        l(targets);
      } catch {}
    }
  }

  public pruneStaleTargets(now: number = Date.now()): number {
    let pruned = 0;
    for (const [icao, raw] of this.rawTargets.entries()) {
      if (now - raw.lastSeen > STALE_TARGET_TIMEOUT_MS) {
        this.rawTargets.delete(icao);
        pruned++;
      }
    }
    if (pruned > 0) {
      this.notifyListeners();
    }
    return pruned;
  }

  public getRawTargetCount(): number {
    return this.rawTargets.size;
  }

  public clearTargets(): void {
    this.rawTargets.clear();
    this.notifyListeners();
  }

  private startPruningTimer(): void {
    if (this.pruneTimer) return;
    this.pruneTimer = setInterval(() => {
      this.pruneStaleTargets();
    }, 3000);
  }

  /**
   * Connects to a GDL-90 WebSocket stream (e.g. Stratux or SafeSky Gateway).
   */
  public connectWebSocket(url: string = this.wsUrl): void {
    this.disconnectWebSocket();
    this.wsUrl = url;

    try {
      this.ws = new WebSocket(url);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        this.wsConnected = true;
      };

      this.ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          this.ingestBytes(new Uint8Array(event.data));
        }
      };

      this.ws.onerror = () => {
        this.wsConnected = false;
      };

      this.ws.onclose = () => {
        this.wsConnected = false;
      };
    } catch {
      this.wsConnected = false;
    }
  }

  public disconnectWebSocket(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.wsConnected = false;
  }

  public isConnected(): boolean {
    return this.wsConnected;
  }

  /**
   * Starts a dynamic test traffic simulation generating realistic nearby GA aircraft.
   */
  public startSimulation(): void {
    if (this.simTimer) return;

    // Seed 3 realistic nearby targets around ownship
    const targets = [
      {
        icao: '4951A1',
        callsign: 'CS-DXB',
        bearingOffset: 25,
        distNm: 2.4,
        altOffset: 600,
        speed: 110,
        track: (this.ownshipTrackDeg + 170) % 360,
        vs: -250,
      },
      {
        icao: '4951B2',
        callsign: 'TAP742',
        bearingOffset: 340,
        distNm: 5.8,
        altOffset: 2200,
        speed: 185,
        track: (this.ownshipTrackDeg + 45) % 360,
        vs: 800,
      },
      {
        icao: '4951C3',
        callsign: 'D-EFFF',
        bearingOffset: 110,
        distNm: 1.8,
        altOffset: -400,
        speed: 95,
        track: (this.ownshipTrackDeg + 210) % 360,
        vs: 0,
      },
    ];

    const runSimTick = () => {
      for (const t of targets) {
        // Advance position based on track & speed
        t.distNm = Math.max(0.5, t.distNm + (t.speed > 100 ? -0.02 : 0.01));
        const pos = destinationPoint(
          this.ownshipLat,
          this.ownshipLon,
          (this.ownshipTrackDeg + t.bearingOffset) % 360,
          t.distNm
        );

        const frame = encodeGdl90TrafficReport({
          isOwnship: false,
          trafficAlert: t.distNm < 2.5 && Math.abs(t.altOffset) < 1000,
          icaoAddress: t.icao,
          callsign: t.callsign,
          latitude: pos.latitude,
          longitude: pos.longitude,
          altitudeFt: Math.round(this.ownshipAltFt + t.altOffset),
          groundSpeedKt: t.speed,
          trackDeg: t.track,
          verticalSpeedFpm: t.vs,
        });

        this.ingestBytes(frame);
      }
    };

    runSimTick();
    this.simTimer = setInterval(runSimTick, 2000);
  }

  public stopSimulation(): void {
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
    this.rawTargets.clear();
    this.notifyListeners();
  }

  public isSimulating(): boolean {
    return this.simTimer !== null;
  }

  public destroy(): void {
    this.disconnectWebSocket();
    this.stopSimulation();
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
    this.listeners.clear();
    this.alertListeners.clear();
  }
}
