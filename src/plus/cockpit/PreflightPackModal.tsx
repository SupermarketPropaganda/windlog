import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Waypoint } from '../../types';
import { OwnshipTelemetry } from '../types-plus';
import {
  runPreflightPackAudit,
  packRouteCorridorTiles,
  PreflightPackHealthReport,
  PreflightCheckItem,
} from '../engine/preflight-pack';
import { TileDownloadProgress, clearTileCache } from '../../data/tile-cache';

export interface PreflightPackModalProps {
  isOpen: boolean;
  onClose: () => void;
  waypoints: Waypoint[];
  ownship: OwnshipTelemetry;
  isWakeLocked: boolean;
  onStartLiveGps?: () => void;
  onNotifyToast?: (msg: string) => void;
}

const TILE_URL_TEMPLATE = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

export const PreflightPackModal: React.FC<PreflightPackModalProps> = ({
  isOpen,
  onClose,
  waypoints,
  ownship,
  isWakeLocked,
  onStartLiveGps,
  onNotifyToast,
}) => {
  const [report, setReport] = useState<PreflightPackHealthReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isPacking, setIsPacking] = useState<boolean>(false);
  const [packProgress, setPackProgress] = useState<TileDownloadProgress | null>(null);
  const abortCtrlRef = useRef<AbortController | null>(null);

  const runAudit = useCallback(async () => {
    setIsLoading(true);
    try {
      const rep = await runPreflightPackAudit({
        waypoints,
        ownship,
        isWakeLocked,
        mapLayer: 'street',
      });
      setReport(rep);
    } catch (err) {
      console.error('Failed to run preflight audit', err);
    } finally {
      setIsLoading(false);
    }
  }, [waypoints, ownship, isWakeLocked]);

  useEffect(() => {
    if (isOpen) {
      runAudit();
    } else {
      if (abortCtrlRef.current) {
        abortCtrlRef.current.abort();
        abortCtrlRef.current = null;
      }
      setIsPacking(false);
      setPackProgress(null);
    }
  }, [isOpen, runAudit]);

  if (!isOpen) return null;

  const handleStartPack = async () => {
    if (waypoints.length === 0) {
      onNotifyToast?.('No route waypoints planned to pack.');
      return;
    }

    setIsPacking(true);
    setPackProgress({ total: 1, completed: 0, failed: 0, percent: 0 });
    const abortCtrl = new AbortController();
    abortCtrlRef.current = abortCtrl;

    try {
      onNotifyToast?.('Packing route corridor tiles into offline cache...');
      const result = await packRouteCorridorTiles(
        waypoints,
        'street',
        TILE_URL_TEMPLATE,
        (prog) => setPackProgress(prog),
        abortCtrl.signal
      );

      onNotifyToast?.(
        `✓ Route Packed: ${result.downloaded} tiles cached for offline use (${result.failed} failed)`
      );
      await runAudit();
    } catch (err: any) {
      if (err.message?.includes('cancelled')) {
        onNotifyToast?.('Route packing cancelled');
      } else {
        onNotifyToast?.(`Tile packing interrupted: ${err.message || 'Network error'}`);
      }
    } finally {
      setIsPacking(false);
      setPackProgress(null);
      abortCtrlRef.current = null;
    }
  };

  const handleCancelPack = () => {
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
      abortCtrlRef.current = null;
    }
    setIsPacking(false);
    setPackProgress(null);
  };

  const handleClearCache = async () => {
    if (window.confirm('Clear all cached offline map tiles to free device storage?')) {
      await clearTileCache();
      onNotifyToast?.('Offline tile cache cleared');
      await runAudit();
    }
  };

  const handleActionClick = (check: PreflightCheckItem) => {
    if (check.actionId === 'download-tiles') {
      handleStartPack();
    } else if (check.actionId === 'start-gps' && onStartLiveGps) {
      onStartLiveGps();
      onNotifyToast?.('Connecting to hardware GNSS sensor...');
      setTimeout(runAudit, 1000);
    }
  };

  const statusClass =
    report?.overallStatus === 'READY'
      ? 'status-ready'
      : report?.overallStatus === 'CAUTION'
      ? 'status-caution'
      : 'status-danger';

  const statusIcon =
    report?.overallStatus === 'READY'
      ? '✓'
      : report?.overallStatus === 'CAUTION'
      ? '⚠️'
      : '🚨';

  const statusTitle =
    report?.overallStatus === 'READY'
      ? 'READY FOR OFFLINE FLIGHT'
      : report?.overallStatus === 'CAUTION'
      ? 'PRE-FLIGHT CHECKS PENDING'
      : 'CRITICAL PRE-FLIGHT ISSUES';

  return (
    <div className="efb-modal-backdrop" onClick={onClose}>
      <div className="efb-pack-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="efb-pack-header">
          <div className="pack-header-left">
            <span className="pack-icon">📦</span>
            <div className="pack-title-wrap">
              <strong>PRE-FLIGHT OFFLINE PACK &amp; HEALTH MONITOR</strong>
              <small>System Readiness for In-Flight Zero-Connectivity Operations</small>
            </div>
          </div>
          <div className="pack-header-right">
            <button
              type="button"
              className="pack-btn-refresh"
              onClick={runAudit}
              disabled={isLoading || isPacking}
              title="Re-run pre-flight system checks"
            >
              🔄 Refresh
            </button>
            <button
              type="button"
              className="pack-btn-close"
              onClick={onClose}
              title="Close modal"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Go / No-Go Health Banner */}
        <div className={`efb-pack-banner ${statusClass}`}>
          <span className="banner-icon">{statusIcon}</span>
          <div className="banner-text">
            <strong>{statusTitle}</strong>
            <p>{report?.summaryMessage || 'Auditing offline readiness...'}</p>
          </div>
        </div>

        {/* Active Route Corridor Packing Progress Bar */}
        {isPacking && packProgress && (
          <div className="efb-pack-progress-card">
            <div className="pack-prog-row">
              <span className="pack-prog-label">
                📦 Caching Route Corridor Tiles ({packProgress.completed}/{packProgress.total})
              </span>
              <strong className="pack-prog-percent">{packProgress.percent}%</strong>
            </div>
            <div className="pack-bar-track">
              <div
                className="pack-bar-fill"
                style={{ width: `${packProgress.percent}%` }}
              />
            </div>
            <div className="pack-prog-actions">
              <small>
                Zoom levels 7–11 along active flight corridor (±20 NM buffer)
              </small>
              <button
                type="button"
                className="pack-btn-cancel"
                onClick={handleCancelPack}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Checklist Grid */}
        <div className="efb-pack-checklist-body">
          {isLoading && !report ? (
            <div className="pack-loading-msg">Auditing cockpit subsystems...</div>
          ) : (
            report?.checks.map((check) => {
              const checkCls =
                check.status === 'PASS'
                  ? 'is-pass'
                  : check.status === 'WARN'
                  ? 'is-warn'
                  : 'is-fail';
              const icon =
                check.status === 'PASS' ? '✓' : check.status === 'WARN' ? '⚡' : '✕';

              return (
                <div key={check.id} className={`pack-check-tile ${checkCls}`}>
                  <div className="check-tile-header">
                    <span className="check-badge-icon">{icon}</span>
                    <strong className="check-tile-title">{check.title}</strong>
                    <span className="check-category-tag">{check.category}</span>
                  </div>
                  <p className="check-tile-detail">{check.detail}</p>
                  {check.actionLabel && !isPacking && (
                    <div className="check-tile-actions">
                      <button
                        type="button"
                        className="check-action-btn"
                        onClick={() => handleActionClick(check)}
                      >
                        {check.actionLabel}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="efb-pack-footer">
          <div className="pack-footer-left">
            {report?.tilePack && (
              <span className="pack-stats-tag">
                🗺️ Route Corridor: <strong>{report.tilePack.percentCached}% Cached</strong> (
                {report.tilePack.cachedTiles}/{report.tilePack.totalTiles} tiles)
              </span>
            )}
          </div>
          <div className="pack-footer-right">
            <button
              type="button"
              className="pack-btn-clear-cache"
              onClick={handleClearCache}
              title="Clear cached map tiles"
            >
              Clear Tile Cache
            </button>
            <button
              type="button"
              className="pack-btn-primary"
              onClick={handleStartPack}
              disabled={isPacking || waypoints.length === 0}
            >
              {isPacking
                ? '⏳ Packing...'
                : report?.tilePack.percentCached === 100
                ? '✓ Re-Pack Corridor'
                : '⚡ Pack Route for Offline'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
