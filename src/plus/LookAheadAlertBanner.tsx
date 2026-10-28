import React, { useState } from 'react';
import { LookAheadAlert } from './types-plus';

export interface LookAheadAlertBannerProps {
  alerts: LookAheadAlert[];
  lookAheadMinutes: number;
  onFocusCoordinate?: (lat: number, lon: number, airspaceId?: string) => void;
}

export const LookAheadAlertBanner: React.FC<LookAheadAlertBannerProps> = ({
  alerts,
  lookAheadMinutes,
  onFocusCoordinate,
}) => {
  const [dismissedIds, setDismissedIds] = useState<Record<string, boolean>>({});
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  const visibleAlerts = alerts.filter((a) => !dismissedIds[a.id]);

  if (visibleAlerts.length === 0) {
    return (
      <div className="plus-lookahead-clear-strip" role="status">
        <div className="plus-lookahead-clear-left">
          <span className="plus-clear-dot" />
          <strong>LOOK-AHEAD SCANNER ({lookAheadMinutes} MIN):</strong>
          <span>Path clear of terrain hazards &amp; controlled airspace conflicts</span>
        </div>
        {alerts.length > 0 && (
          <button
            type="button"
            className="plus-restore-alerts-btn"
            onClick={() => setDismissedIds({})}
          >
            Show {alerts.length} Acknowledged Advisory
          </button>
        )}
      </div>
    );
  }

  const topAlert = visibleAlerts[0];
  const criticalCount = visibleAlerts.filter((a) => a.severity === 'CRITICAL').length;
  const warningCount = visibleAlerts.filter((a) => a.severity === 'WARNING').length;

  return (
    <div
      className={`plus-lookahead-banner severity-${topAlert.severity.toLowerCase()}`}
      role="region"
      aria-label="In-Flight Visual Look-Ahead Alerts"
    >
      <div
        className="plus-lookahead-header"
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <div className="plus-lookahead-header-left">
          <span className="plus-alert-pulse-badge">
            {topAlert.severity === 'CRITICAL'
              ? '🚨 PULL UP / CRITICAL'
              : topAlert.severity === 'WARNING'
              ? '⚠️ LOOK-AHEAD WARNING'
              : '⚡ PROXIMITY CAUTION'}
          </span>
          <strong className="plus-lookahead-headline">{topAlert.title}</strong>
          {topAlert.frequency && (
            <span className="plus-alert-freq-pill">ATC {topAlert.frequency}</span>
          )}
        </div>

        <div className="plus-lookahead-header-right">
          {criticalCount > 0 && (
            <span className="plus-count-chip chip-crit">{criticalCount} CRIT</span>
          )}
          {warningCount > 0 && (
            <span className="plus-count-chip chip-warn">{warningCount} WARN</span>
          )}
          <span className="plus-expand-toggle">
            {isExpanded ? '▲ Hide' : `▼ All (${visibleAlerts.length})`}
          </span>
        </div>
      </div>

      {isExpanded && (
        <div className="plus-lookahead-cards-list">
          {visibleAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`plus-lookahead-card card-${alert.severity.toLowerCase()}`}
            >
              <div className="plus-card-main">
                <div className="plus-card-top-row">
                  <span className={`plus-cat-tag cat-${alert.category.toLowerCase()}`}>
                    {alert.category === 'AIRSPACE'
                      ? '🛡️ AIRSPACE'
                      : alert.category === 'TERRAIN'
                      ? '⛰️ TERRAIN'
                      : '🛰️ GPS INTEGRITY'}
                  </span>
                  <strong className="plus-card-title">{alert.title}</strong>

                  {alert.verticalLimits && (
                    <span className="plus-card-meta-pill">
                      Limits: {alert.verticalLimits}
                    </span>
                  )}
                  {alert.frequency && (
                    <span className="plus-card-freq-badge">
                      📻 {alert.frequency}
                    </span>
                  )}
                  {alert.distanceAheadNm !== undefined && alert.distanceAheadNm > 0 && (
                    <span className="plus-card-dist-badge">
                      {alert.distanceAheadNm.toFixed(1)} NM Ahead
                    </span>
                  )}
                </div>

                <div className="plus-card-detail">{alert.detail}</div>
              </div>

              <div className="plus-card-actions">
                {alert.hazardCoordinate && onFocusCoordinate && (
                  <button
                    type="button"
                    className="plus-alert-action-btn focus-btn"
                    onClick={() =>
                      onFocusCoordinate(
                        alert.hazardCoordinate![0],
                        alert.hazardCoordinate![1],
                        alert.airspaceId
                      )
                    }
                    title="Center map on this hazard"
                  >
                    📍 View on Map
                  </button>
                )}
                <button
                  type="button"
                  className="plus-alert-action-btn ack-btn"
                  onClick={() =>
                    setDismissedIds((prev) => ({ ...prev, [alert.id]: true }))
                  }
                  title="Acknowledge visual alert"
                >
                  ✓ ACK
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
