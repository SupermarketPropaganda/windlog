/**
 * Universal In-Flight Geolocation & Avionics Telemetry Manager
 * 
 * Manages cockpit GPS tracking across Capacitor native mobile platforms
 * and web browsers. Provides cross-track error (XTE), distance-to-go,
 * GDL 90 ADS-B traffic tracking, and an integrated simulation engine.
 */

import { Geolocation, Position } from '@capacitor/geolocation';
import { isNativePlatform } from '../utils/platform';
import { greatCircleDistance, initialBearing } from './coordinate-math';
import { Gdl90Message, Gdl90Traffic, parseGdl90Frame } from './gdl90';
import { Waypoint } from '../types';

export interface RawLocationCoords {
  latitude: number;
  longitude: number;
  speed?: number | null;
  heading?: number | null;
  altitude?: number | null;
  accuracy?: number | null;
}

export type AvionicsReceiverStatus = 'DISCONNECTED' | 'SEARCHING' | 'CONNECTED' | 'SIMULATING';

export interface CockpitTelemetry {
  latitude: number;
  longitude: number;
  altitudeFeet: number;
  groundSpeedKnots: number;
  trackDegrees: number;
  accuracyMeters: number;
  timestamp: number;
  isSimulated: boolean;
  distanceToNextNm?: number;
  crossTrackErrorNm?: number;
  estimatedTimeEnrouteSec?: number;
}

export interface AvionicsState {
  status: AvionicsReceiverStatus;
  receiverName: string; // e.g. "Internal GPS", "Stratux GDL 90", "ForeFlight Sentry"
  telemetry: CockpitTelemetry | null;
  trafficList: Gdl90Traffic[];
}

export type AvionicsListener = (state: AvionicsState) => void;

class AvionicsManager {
  private state: AvionicsState = {
    status: 'DISCONNECTED',
    receiverName: 'Internal GPS',
    telemetry: null,
    trafficList: [],
  };

  private listeners = new Set<AvionicsListener>();
  private webWatchId: number | null = null;
  private nativeWatchId: string | null = null;
  private simInterval: any = null;
  private trafficMap = new Map<string, Gdl90Traffic>();

  public getState(): AvionicsState {
    return { ...this.state };
  }

  public subscribe(listener: AvionicsListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const s = this.getState();
    this.listeners.forEach((fn) => fn(s));
  }

  /**
   * Starts high-accuracy GPS tracking
   */
  public async startGpsTracking(nextWaypoint?: Waypoint | null): Promise<void> {
    if (this.state.status === 'CONNECTED') return;

    this.stopSimulation();
    this.state.status = 'SEARCHING';
    this.state.receiverName = isNativePlatform() ? 'Device Native GPS' : 'Browser High-Acc GPS';
    this.notify();

    if (isNativePlatform()) {
      try {
        const permission = await Geolocation.requestPermissions();
        if (permission.location !== 'granted') {
          console.warn('[Avionics] Location permission not granted');
          this.state.status = 'DISCONNECTED';
          this.notify();
          return;
        }

        this.nativeWatchId = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 },
          (position: Position | null) => {
            if (position) {
              this.handlePositionUpdate(position.coords, nextWaypoint);
            }
          }
        );
      } catch (err) {
        console.error('[Avionics] Error starting native GPS:', err);
        this.state.status = 'DISCONNECTED';
        this.notify();
      }
    } else {
      // Web Geolocation API fallback
      if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        this.webWatchId = navigator.geolocation.watchPosition(
          (pos) => {
            this.handlePositionUpdate(pos.coords, nextWaypoint);
          },
          (err) => {
            console.warn('[Avionics] Web Geolocation error:', err);
            this.state.status = 'DISCONNECTED';
            this.notify();
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 }
        );
      } else {
        this.state.status = 'DISCONNECTED';
        this.notify();
      }
    }
  }

  /**
   * Stops active GPS tracking
   */
  public async stopGpsTracking(): Promise<void> {
    this.stopSimulation();

    if (this.nativeWatchId !== null) {
      try {
        await Geolocation.clearWatch({ id: this.nativeWatchId });
      } catch { /* ignore */ }
      this.nativeWatchId = null;
    }

    if (this.webWatchId !== null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(this.webWatchId);
      this.webWatchId = null;
    }

    this.state.status = 'DISCONNECTED';
    this.state.telemetry = null;
    this.notify();
  }

  private handlePositionUpdate(
    coords: RawLocationCoords,
    nextWaypoint?: Waypoint | null
  ): void {
    const lat = coords.latitude;
    const lon = coords.longitude;
    const speedMps = coords.speed ?? 0;
    const speedKnots = Math.round(speedMps * 1.94384);
    const heading = Math.round(coords.heading ?? 0);
    const altitudeFt = Math.round((coords.altitude ?? 0) * 3.28084);

    let distanceToNextNm: number | undefined;
    let crossTrackErrorNm: number | undefined;
    let eteSec: number | undefined;

    if (nextWaypoint) {
      distanceToNextNm = greatCircleDistance(lat, lon, nextWaypoint.latitude, nextWaypoint.longitude);
      if (speedKnots > 20 && distanceToNextNm !== undefined) {
        eteSec = Math.round((distanceToNextNm / speedKnots) * 3600);
      }
    }

    this.state.status = 'CONNECTED';
    this.state.telemetry = {
      latitude: Number(lat.toFixed(5)),
      longitude: Number(lon.toFixed(5)),
      altitudeFeet: altitudeFt,
      groundSpeedKnots: speedKnots,
      trackDegrees: heading,
      accuracyMeters: Math.round(coords.accuracy ?? 0),
      timestamp: Date.now(),
      isSimulated: false,
      distanceToNextNm,
      crossTrackErrorNm,
      estimatedTimeEnrouteSec: eteSec,
    };

    this.notify();
  }

  /**
   * Ingests a raw GDL 90 UDP packet (from native socket or mock stream)
   */
  public ingestGdl90Packet(buffer: Uint8Array): void {
    const message: Gdl90Message | null = parseGdl90Frame(buffer);
    if (!message) return;

    if (message.type === 'OWNSHIP') {
      this.state.status = 'CONNECTED';
      this.state.receiverName = 'Cockpit ADS-B Receiver (GDL 90)';
      this.state.telemetry = {
        latitude: message.latitude,
        longitude: message.longitude,
        altitudeFeet: message.altitudeFeet,
        groundSpeedKnots: message.groundSpeedKnots,
        trackDegrees: message.trackDegrees,
        accuracyMeters: 5,
        timestamp: Date.now(),
        isSimulated: false,
      };
      this.notify();
    } else if (message.type === 'TRAFFIC') {
      this.trafficMap.set(message.address, message);
      this.cleanupOldTraffic();
      this.state.trafficList = Array.from(this.trafficMap.values());
      this.notify();
    }
  }

  private cleanupOldTraffic(): void {
    // Keep max 20 most relevant targets
    if (this.trafficMap.size > 20) {
      const keys = Array.from(this.trafficMap.keys());
      for (let i = 0; i < keys.length - 20; i++) {
        this.trafficMap.delete(keys[i]);
      }
    }
  }

  /**
   * Telemetry simulation mode along a route
   */
  public startSimulation(routeWaypoints: Waypoint[], speedKnots: number = 110): void {
    if (!routeWaypoints || routeWaypoints.length < 2) return;

    this.stopGpsTracking();
    this.state.status = 'SIMULATING';
    this.state.receiverName = 'WindLog Flight Simulator';

    let currentLegIdx = 0;
    let currentLat = routeWaypoints[0].latitude;
    let currentLon = routeWaypoints[0].longitude;

    // Add mock traffic nearby
    const mockTraffic: Gdl90Traffic = {
      type: 'TRAFFIC',
      address: 'A0F12E',
      latitude: currentLat + 0.04,
      longitude: currentLon + 0.05,
      altitudeFeet: 3500,
      groundSpeedKnots: 130,
      trackDegrees: 180,
      verticalSpeedFpm: -200,
      callSign: 'TAP812',
      isAirborne: true,
      nic: 8,
    };
    this.state.trafficList = [mockTraffic];

    this.simInterval = setInterval(() => {
      if (currentLegIdx >= routeWaypoints.length - 1) {
        currentLegIdx = 0; // Loop route
        currentLat = routeWaypoints[0].latitude;
        currentLon = routeWaypoints[0].longitude;
      }

      const dest = routeWaypoints[currentLegIdx + 1];
      const bearing = initialBearing(currentLat, currentLon, dest.latitude, dest.longitude);
      const distToDest = greatCircleDistance(currentLat, currentLon, dest.latitude, dest.longitude);

      // Step by 1 second interval: distance = speedKnots / 3600 NM
      const stepNm = speedKnots / 3600;
      if (distToDest <= stepNm) {
        currentLegIdx++;
      } else {
        const radBearing = (bearing * Math.PI) / 180;
        const dLat = (stepNm / 60) * Math.cos(radBearing);
        const dLon = (stepNm / (60 * Math.cos((currentLat * Math.PI) / 180))) * Math.sin(radBearing);
        currentLat += dLat;
        currentLon += dLon;
      }

      this.state.telemetry = {
        latitude: Number(currentLat.toFixed(5)),
        longitude: Number(currentLon.toFixed(5)),
        altitudeFeet: dest.elevation ? dest.elevation + 2500 : 4500,
        groundSpeedKnots: speedKnots,
        trackDegrees: Math.round(bearing),
        accuracyMeters: 3,
        timestamp: Date.now(),
        isSimulated: true,
        distanceToNextNm: Number(distToDest.toFixed(1)),
        estimatedTimeEnrouteSec: Math.round((distToDest / speedKnots) * 3600),
      };

      this.notify();
    }, 1000);

    this.notify();
  }

  public stopSimulation(): void {
    if (this.simInterval) {
      clearInterval(this.simInterval);
      this.simInterval = null;
    }
  }
}

export const avionicsManager = new AvionicsManager();
