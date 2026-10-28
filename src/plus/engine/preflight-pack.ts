import { Waypoint } from '../../types';
import { getCachedDatabase } from '../../data/db-cache';
import {
  getTilesForRouteCorridor,
  getCachedTileBlob,
  downloadTilePack,
  TileCoord,
  TileDownloadProgress,
} from '../../data/tile-cache';
import { OwnshipTelemetry } from '../types-plus';

export type CheckStatus = 'PASS' | 'WARN' | 'FAIL' | 'CHECKING';

export interface PreflightCheckItem {
  id: string;
  category: 'DATABASE' | 'CHARTS' | 'GPS' | 'POWER' | 'STORAGE';
  title: string;
  status: CheckStatus;
  detail: string;
  actionLabel?: string;
  actionId?: string;
}

export interface RouteTilePackStatus {
  totalTiles: number;
  cachedTiles: number;
  missingTiles: number;
  percentCached: number;
  layer: string;
  tiles: TileCoord[];
}

export interface BatteryStatusInfo {
  supported: boolean;
  levelPercent: number | null;
  isCharging: boolean | null;
  chargingTimeSec: number | null;
  dischargingTimeSec: number | null;
}

export interface StorageStatusInfo {
  supported: boolean;
  usedBytes: number;
  quotaBytes: number;
  percentUsed: number;
}

export interface PreflightPackHealthReport {
  overallStatus: 'READY' | 'CAUTION' | 'NOT_READY';
  summaryMessage: string;
  databaseCached: boolean;
  databaseSizeBytes: number;
  tilePack: RouteTilePackStatus;
  gpsQuality: string;
  gpsAccuracyMeters: number | null;
  wakeLockActive: boolean;
  battery: BatteryStatusInfo;
  storage: StorageStatusInfo;
  checks: PreflightCheckItem[];
  timestamp: number;
}

/**
 * Inspects route corridor and counts how many tiles across zoom 7-11 are cached in IndexedDB.
 */
export async function inspectRouteCorridorTiles(
  waypoints: Waypoint[],
  layer: string = 'street',
  corridorNm: number = 20,
  minZoom: number = 7,
  maxZoom: number = 11
): Promise<RouteTilePackStatus> {
  if (!waypoints || waypoints.length === 0) {
    return {
      totalTiles: 0,
      cachedTiles: 0,
      missingTiles: 0,
      percentCached: 100,
      layer,
      tiles: [],
    };
  }

  const coords = waypoints.map((w) => ({ latitude: w.latitude, longitude: w.longitude }));
  const tiles = getTilesForRouteCorridor(coords, corridorNm, minZoom, maxZoom);
  const totalTiles = tiles.length;

  if (totalTiles === 0) {
    return {
      totalTiles: 0,
      cachedTiles: 0,
      missingTiles: 0,
      percentCached: 100,
      layer,
      tiles: [],
    };
  }

  // Sample or check presence in IndexedDB
  let cachedCount = 0;
  // Check in batches of 20 to avoid transaction congestion
  const BATCH = 25;
  for (let i = 0; i < tiles.length; i += BATCH) {
    const chunk = tiles.slice(i, i + BATCH);
    const results = await Promise.all(
      chunk.map(async (t) => {
        try {
          const blob = await getCachedTileBlob(layer, t.z, t.x, t.y);
          return blob !== null && blob.size > 0;
        } catch {
          return false;
        }
      })
    );
    cachedCount += results.filter(Boolean).length;
  }

  const missing = totalTiles - cachedCount;
  const percent = totalTiles > 0 ? Math.round((cachedCount / totalTiles) * 100) : 100;

  return {
    totalTiles,
    cachedTiles: cachedCount,
    missingTiles: missing,
    percentCached: percent,
    layer,
    tiles,
  };
}

/**
 * Checks battery status via Battery Status API if available.
 */
export async function inspectBatteryStatus(): Promise<BatteryStatusInfo> {
  try {
    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      const b: any = await (navigator as any).getBattery();
      return {
        supported: true,
        levelPercent: Math.round(b.level * 100),
        isCharging: Boolean(b.charging),
        chargingTimeSec: Number.isFinite(b.chargingTime) ? b.chargingTime : null,
        dischargingTimeSec: Number.isFinite(b.dischargingTime) ? b.dischargingTime : null,
      };
    }
  } catch {
    // Battery API blocked or unsupported
  }
  return {
    supported: false,
    levelPercent: null,
    isCharging: null,
    chargingTimeSec: null,
    dischargingTimeSec: null,
  };
}

/**
 * Checks storage quota via StorageManager API.
 */
export async function inspectStorageStatus(): Promise<StorageStatusInfo> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      const used = est.usage || 0;
      const quota = est.quota || 0;
      const pct = quota > 0 ? Math.round((used / quota) * 100) : 0;
      return {
        supported: true,
        usedBytes: used,
        quotaBytes: quota,
        percentUsed: pct,
      };
    }
  } catch {
    // ignore
  }
  return {
    supported: false,
    usedBytes: 0,
    quotaBytes: 0,
    percentUsed: 0,
  };
}

/**
 * Runs a comprehensive pre-flight check across all offline subsystems.
 */
export async function runPreflightPackAudit(params: {
  waypoints: Waypoint[];
  ownship: OwnshipTelemetry;
  isWakeLocked: boolean;
  mapLayer?: string;
}): Promise<PreflightPackHealthReport> {
  const { waypoints, ownship, isWakeLocked, mapLayer = 'street' } = params;

  // 1. Check Aeronautical SQLite Database
  let dbCached = false;
  let dbSize = 0;
  try {
    const rawDb = await getCachedDatabase();
    if (rawDb && rawDb.length > 1000) {
      dbCached = true;
      dbSize = rawDb.length;
    }
  } catch {
    dbCached = false;
  }

  // 2. Check Route Corridor Tile Pack
  const tilePack = await inspectRouteCorridorTiles(waypoints, mapLayer, 20, 7, 11);

  // 3. Check Battery
  const battery = await inspectBatteryStatus();

  // 4. Check Storage
  const storage = await inspectStorageStatus();

  // 5. Synthesize checklist items
  const checks: PreflightCheckItem[] = [];

  // Check 1: Database
  if (dbCached) {
    checks.push({
      id: 'db-cache',
      category: 'DATABASE',
      title: 'Aeronautical Database',
      status: 'PASS',
      detail: `Offline SQLite database cached (${(dbSize / (1024 * 1024)).toFixed(1)} MB). Waypoints, frequencies, and runways ready offline.`,
    });
  } else {
    checks.push({
      id: 'db-cache',
      category: 'DATABASE',
      title: 'Aeronautical Database',
      status: 'WARN',
      detail: 'SQLite database not yet cached in IndexedDB. Will fetch automatically on planner load.',
      actionLabel: 'Pre-Load DB',
      actionId: 'load-db',
    });
  }

  // Check 2: Charts / Tiles
  if (tilePack.totalTiles === 0) {
    checks.push({
      id: 'tile-corridor',
      category: 'CHARTS',
      title: 'Route Corridor Charts',
      status: 'PASS',
      detail: 'No active route loaded. Standalone map ready.',
    });
  } else if (tilePack.percentCached >= 95) {
    checks.push({
      id: 'tile-corridor',
      category: 'CHARTS',
      title: 'Route Corridor Charts',
      status: 'PASS',
      detail: `${tilePack.cachedTiles} / ${tilePack.totalTiles} corridor tiles cached (${tilePack.percentCached}% offline ready).`,
    });
  } else if (tilePack.percentCached >= 50) {
    checks.push({
      id: 'tile-corridor',
      category: 'CHARTS',
      title: 'Route Corridor Charts',
      status: 'WARN',
      detail: `${tilePack.missingTiles} corridor tiles missing (${tilePack.percentCached}% cached). May show blank tiles at higher zoom levels in flight.`,
      actionLabel: `Download Remaining (${tilePack.missingTiles})`,
      actionId: 'download-tiles',
    });
  } else {
    checks.push({
      id: 'tile-corridor',
      category: 'CHARTS',
      title: 'Route Corridor Charts',
      status: 'WARN',
      detail: `Route corridor not cached for offline flight (${tilePack.missingTiles} tiles needed across Zoom 7-11).`,
      actionLabel: `Pack Route (${tilePack.totalTiles} Tiles)`,
      actionId: 'download-tiles',
    });
  }

  // Check 3: GPS GNSS Fix
  const acc = ownship.horizontalAccuracyM;
  if (ownship.source === 'gps') {
    if (acc <= 15) {
      checks.push({
        id: 'gps-sensor',
        category: 'GPS',
        title: 'GNSS / GPS Hardware Fix',
        status: 'PASS',
        detail: `High-accuracy 3D fix active (±${acc}m horizontal accuracy, high confidence).`,
      });
    } else if (acc <= 45) {
      checks.push({
        id: 'gps-sensor',
        category: 'GPS',
        title: 'GNSS / GPS Hardware Fix',
        status: 'PASS',
        detail: `Acceptable GPS fix (±${acc}m accuracy). Signal confidence adequate.`,
      });
    } else {
      checks.push({
        id: 'gps-sensor',
        category: 'GPS',
        title: 'GNSS / GPS Hardware Fix',
        status: 'WARN',
        detail: `Degraded GPS accuracy (±${acc}m). Verify device clear view of sky.`,
      });
    }
  } else {
    checks.push({
      id: 'gps-sensor',
      category: 'GPS',
      title: 'GNSS / GPS Sensor',
      status: 'WARN',
      detail: 'Running in manual simulation test mode. Connect to live hardware GPS before takeoff.',
      actionLabel: 'Connect Live GPS',
      actionId: 'start-gps',
    });
  }

  // Check 4: Screen Wake-Lock
  if (isWakeLocked) {
    checks.push({
      id: 'screen-lock',
      category: 'POWER',
      title: 'Screen Wake-Lock',
      status: 'PASS',
      detail: 'Wake-Lock active. Display will remain on throughout flight.',
    });
  } else {
    checks.push({
      id: 'screen-lock',
      category: 'POWER',
      title: 'Screen Wake-Lock',
      status: 'WARN',
      detail: 'Wake-Lock inactive. Tablet may sleep if untouched during cruise.',
      actionLabel: 'Enable Wake-Lock',
      actionId: 'enable-wake',
    });
  }

  // Check 5: Battery
  if (battery.supported && battery.levelPercent !== null) {
    if (battery.isCharging) {
      checks.push({
        id: 'battery-power',
        category: 'POWER',
        title: 'Cockpit Power & Battery',
        status: 'PASS',
        detail: `Battery charging (${battery.levelPercent}%). Connected to cockpit USB / aircraft power.`,
      });
    } else if (battery.levelPercent >= 40) {
      checks.push({
        id: 'battery-power',
        category: 'POWER',
        title: 'Cockpit Power & Battery',
        status: 'PASS',
        detail: `Battery at ${battery.levelPercent}% (discharging). Adequate for typical VFR flight.`,
      });
    } else {
      checks.push({
        id: 'battery-power',
        category: 'POWER',
        title: 'Cockpit Power & Battery',
        status: 'WARN',
        detail: `Battery low (${battery.levelPercent}%). Connect to cockpit power bank or 12V/28V adapter.`,
      });
    }
  }

  // Check 6: Storage
  if (storage.supported && storage.quotaBytes > 0) {
    const usedMb = Math.round(storage.usedBytes / (1024 * 1024));
    const availMb = Math.round((storage.quotaBytes - storage.usedBytes) / (1024 * 1024));
    if (storage.percentUsed < 90) {
      checks.push({
        id: 'storage-space',
        category: 'STORAGE',
        title: 'Device Local Storage',
        status: 'PASS',
        detail: `${usedMb} MB used · ${availMb} MB free space in browser storage.`,
      });
    } else {
      checks.push({
        id: 'storage-space',
        category: 'STORAGE',
        title: 'Device Local Storage',
        status: 'WARN',
        detail: `Storage nearly full (${storage.percentUsed}% used). Purge old tile packs to prevent eviction.`,
      });
    }
  }

  // Determine overall status
  const hasFail = checks.some((c) => c.status === 'FAIL');
  const hasWarn = checks.some((c) => c.status === 'WARN');

  let overallStatus: 'READY' | 'CAUTION' | 'NOT_READY' = 'READY';
  let summaryMessage = 'All systems green. Aircraft and EFB are ready for offline VFR flight.';

  if (hasFail) {
    overallStatus = 'NOT_READY';
    summaryMessage = 'Action required before departure: One or more critical systems are not ready.';
  } else if (hasWarn) {
    overallStatus = 'CAUTION';
    const warnCount = checks.filter((c) => c.status === 'WARN').length;
    summaryMessage = `${warnCount} item${warnCount > 1 ? 's' : ''} need attention before flight (e.g. route tiles or GPS fix).`;
  }

  return {
    overallStatus,
    summaryMessage,
    databaseCached: dbCached,
    databaseSizeBytes: dbSize,
    tilePack,
    gpsQuality: ownship.gpsQuality,
    gpsAccuracyMeters: acc,
    wakeLockActive: isWakeLocked,
    battery,
    storage,
    checks,
    timestamp: Date.now(),
  };
}

/**
 * Packs the active route corridor into IndexedDB by downloading missing tiles.
 */
export async function packRouteCorridorTiles(
  waypoints: Waypoint[],
  layer: string = 'street',
  urlTemplate: string,
  onProgress?: (progress: TileDownloadProgress) => void,
  signal?: AbortSignal
): Promise<{ downloaded: number; failed: number }> {
  const coords = waypoints.map((w) => ({ latitude: w.latitude, longitude: w.longitude }));
  const tiles = getTilesForRouteCorridor(coords, 20, 7, 11);
  if (tiles.length === 0) return { downloaded: 0, failed: 0 };

  return await downloadTilePack(tiles, layer, urlTemplate, onProgress, signal);
}
