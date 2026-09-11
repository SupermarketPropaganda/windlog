import React, { useState, useEffect, useRef } from 'react';
import {
  getTileStorageStats,
  clearTileCache,
  downloadTilePack,
  getTilesForRouteCorridor,
  getTilesForBounds,
  TileDownloadProgress,
} from '../data/tile-cache';
import { Waypoint } from '../types';

export interface OfflineChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  waypoints: Waypoint[];
  currentLayer: string;
  tileUrlTemplate: string;
}

export const OfflineChartModal: React.FC<OfflineChartModalProps> = ({
  isOpen,
  onClose,
  waypoints,
  currentLayer,
  tileUrlTemplate,
}) => {
  const [stats, setStats] = useState<{ tileCount: number; totalSizeBytes: number }>({
    tileCount: 0,
    totalSizeBytes: 0,
  });
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState<TileDownloadProgress | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const refreshStats = async () => {
    const s = await getTileStorageStats();
    setStats(s);
  };

  useEffect(() => {
    if (isOpen) {
      refreshStats();
      setStatusMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleDownloadRouteCorridor = async () => {
    if (waypoints.length === 0) {
      setStatusMessage('No waypoints in route. Enter a route first.');
      return;
    }

    const tiles = getTilesForRouteCorridor(waypoints, 20, 7, 11);
    await startDownload(tiles, `Active Route Corridor (${tiles.length} tiles)`);
  };

  const handleDownloadPortugalVFR = async () => {
    // Portugal Continental bounds: ~42.15N, 36.95S, -6.18E, -9.55W
    const tiles = getTilesForBounds(42.15, 36.95, -6.18, -9.55, 6, 10);
    await startDownload(tiles, `Portugal Continental VFR (${tiles.length} tiles)`);
  };

  const handleDownloadLisbonMetro = async () => {
    // Lisbon/Cascais/Sintra metro: ~39.2N, 38.4N, -8.7E, -9.6W
    const tiles = getTilesForBounds(39.2, 38.4, -8.7, -9.6, 7, 12);
    await startDownload(tiles, `Lisbon Metro Airspace (${tiles.length} tiles)`);
  };

  const startDownload = async (tiles: any[], packName: string) => {
    if (tiles.length === 0) return;

    setIsDownloading(true);
    setStatusMessage(`Preparing ${packName}...`);
    abortControllerRef.current = new AbortController();

    try {
      const res = await downloadTilePack(
        tiles,
        currentLayer,
        tileUrlTemplate,
        (p) => setProgress(p),
        abortControllerRef.current.signal
      );

      await refreshStats();
      setStatusMessage(`✓ Finished downloading ${res.downloaded} tiles (${res.failed} failed)`);
    } catch (err: any) {
      if (err.message?.includes('cancelled')) {
        setStatusMessage('Download cancelled by user.');
      } else {
        setStatusMessage(`Download error: ${err.message}`);
      }
    } finally {
      setIsDownloading(false);
      setProgress(null);
      abortControllerRef.current = null;
    }
  };

  const handleCancelDownload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleClearCache = async () => {
    if (window.confirm('Are you sure you want to clear all offline map tiles?')) {
      await clearTileCache();
      await refreshStats();
      setStatusMessage('Offline tile cache cleared.');
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-dialog offline-chart-modal" style={{ maxWidth: '540px' }}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <span className="modal-icon">💾</span>
            <h3>Offline Aeronautical Charts</h3>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={isDownloading}
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          {/* Storage Quota Gauge */}
          <div className="offline-storage-box">
            <div className="offline-storage-metric">
              <span className="metric-label">Tiles Cached</span>
              <span className="metric-val">{stats.tileCount.toLocaleString()}</span>
            </div>
            <div className="offline-storage-metric">
              <span className="metric-label">Disk Storage</span>
              <span className="metric-val">{formatBytes(stats.totalSizeBytes)}</span>
            </div>
            <div className="offline-storage-metric">
              <span className="metric-label">Active Base Layer</span>
              <span className="metric-val" style={{ textTransform: 'capitalize' }}>
                {currentLayer}
              </span>
            </div>
          </div>

          <p className="offline-explanation">
            Pre-download map tiles for in-flight cockpit navigation without cellular or WiFi.
            Cached tiles load with zero latency and function in full offline airplane mode.
          </p>

          {/* Download Progress Bar */}
          {isDownloading && progress && (
            <div className="offline-progress-card">
              <div className="progress-header">
                <span>Downloading tiles ({progress.completed} / {progress.total})</span>
                <span className="progress-percent">{progress.percent}%</span>
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <button
                type="button"
                className="cancel-download-btn"
                onClick={handleCancelDownload}
              >
                Cancel Download
              </button>
            </div>
          )}

          {statusMessage && !isDownloading && (
            <div className="status-banner">{statusMessage}</div>
          )}

          {/* Download Packs List */}
          <div className="offline-pack-list">
            <div className="pack-row">
              <div className="pack-info">
                <strong>Active Route Corridor</strong>
                <span>±20 NM corridor along route waypoints (Zooms 7–11)</span>
              </div>
              <button
                type="button"
                className="download-pack-btn primary"
                onClick={handleDownloadRouteCorridor}
                disabled={isDownloading || waypoints.length === 0}
              >
                {waypoints.length === 0 ? 'No Route' : 'Download Route'}
              </button>
            </div>

            <div className="pack-row">
              <div className="pack-info">
                <strong>Portugal Continental VFR</strong>
                <span>Full mainland territory coverage (Zooms 6–10)</span>
              </div>
              <button
                type="button"
                className="download-pack-btn"
                onClick={handleDownloadPortugalVFR}
                disabled={isDownloading}
              >
                Download FIR
              </button>
            </div>

            <div className="pack-row">
              <div className="pack-info">
                <strong>Lisbon Metro Airspace</strong>
                <span>High detail Lisbon, Cascais, Sintra CTR/TMA (Zooms 7–12)</span>
              </div>
              <button
                type="button"
                className="download-pack-btn"
                onClick={handleDownloadLisbonMetro}
                disabled={isDownloading}
              >
                Download Metro
              </button>
            </div>
          </div>
        </div>

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button
            type="button"
            className="clear-cache-btn"
            onClick={handleClearCache}
            disabled={isDownloading || stats.tileCount === 0}
          >
            Clear Offline Cache
          </button>
          <button
            type="button"
            className="modal-done-btn"
            onClick={onClose}
            disabled={isDownloading}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
