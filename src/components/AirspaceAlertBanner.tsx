import React, { useState } from 'react';
import { NavLogSummary } from '../types';
import {
  checkRouteAirspaceConflicts,
  AirspaceConflict,
  getAirspaceClearanceAdvisory,
} from '../engine/airspace-engine';
import { AIRSPACES } from '../data/airspace-data';

export interface AirspaceAlertBadgeProps {
  navLog: NavLogSummary | null;
  isExpanded: boolean;
  onToggle: () => void;
}

/**
 * Compact Airspace Alert Badge designed to sit horizontally at level
 * with the route action buttons (Share, Clear, Reverse, Map, Profile).
 */
export const AirspaceAlertBadge: React.FC<AirspaceAlertBadgeProps> = ({
  navLog,
  isExpanded,
  onToggle,
}) => {
  if (!navLog || !navLog.legs || navLog.legs.length === 0) {
    return null;
  }

  const report = checkRouteAirspaceConflicts(navLog.legs, AIRSPACES);
  const activeConflicts = report.conflicts.filter(
    (c) => c.status === 'PENETRATING' || c.status === 'CLIPPING'
  );

  if (activeConflicts.length === 0) {
    return (
      <div
        className="route-action-pill airspace-pill-clear"
        title="Flight route is clear of active restricted, prohibited, or conflicting controlled airspaces"
      >
        <span className="pill-dot dot-clear" />
        <span className="pill-text">✓ Airspace Clear</span>
      </div>
    );
  }

  const criticalCount = activeConflicts.filter((c) => c.severity === 'CRITICAL').length;
  const warningCount = activeConflicts.filter((c) => c.severity === 'WARNING').length;

  const isCritical = criticalCount > 0;
  const btnClass = isCritical ? 'btn-critical' : 'btn-warning';
  const labelText = isCritical
    ? `${criticalCount} Restricted Conflict${criticalCount === 1 ? '' : 's'}`
    : `${warningCount} Controlled Sector${warningCount === 1 ? '' : 's'}`;
  const icon = isCritical ? '⛔' : '⚠️';

  return (
    <button
      type="button"
      className={`route-action-btn airspace-action-btn ${btnClass} ${isExpanded ? 'active-toggle' : ''}`}
      onClick={onToggle}
      title={
        isCritical
          ? 'Click to inspect restricted/prohibited airspace conflicts & tactical contact frequencies'
          : 'Click to inspect controlled airspace penetration details'
      }
    >
      <span className="airspace-btn-icon">{icon}</span>
      <span className="airspace-btn-text">{labelText}</span>
      <span className="airspace-btn-toggle">{isExpanded ? '▲' : `▼ (${activeConflicts.length})`}</span>
    </button>
  );
};

export interface AirspaceConflictDetailsProps {
  navLog: NavLogSummary | null;
  onClose: () => void;
}

/**
 * Detailed conflict breakdown panel that opens directly below the route input & action bar
 */
export const AirspaceConflictDetails: React.FC<AirspaceConflictDetailsProps> = ({
  navLog,
  onClose,
}) => {
  const [copiedFreq, setCopiedFreq] = useState<string | null>(null);

  if (!navLog || !navLog.legs || navLog.legs.length === 0) {
    return null;
  }

  const report = checkRouteAirspaceConflicts(navLog.legs, AIRSPACES);
  const activeConflicts = report.conflicts.filter(
    (c) => c.status === 'PENETRATING' || c.status === 'CLIPPING'
  );

  if (activeConflicts.length === 0) {
    return null;
  }

  const criticalCount = activeConflicts.filter((c) => c.severity === 'CRITICAL').length;
  const warningCount = activeConflicts.filter((c) => c.severity === 'WARNING').length;

  const handleCopyFreq = (freq: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const match = freq.match(/(\d{3}\.\d{2,3})/);
    const textToCopy = match ? match[1] : freq;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedFreq(textToCopy);
      setTimeout(() => setCopiedFreq(null), 2000);
    });
  };

  return (
    <div className="airspace-conflict-dropdown-panel">
      <div className="airspace-dropdown-header">
        <div className="dropdown-header-left">
          <span className="dropdown-header-icon">{criticalCount > 0 ? '⛔' : '⚠️'}</span>
          <div>
            <strong>
              {criticalCount > 0
                ? `${criticalCount} Restricted / Prohibited Airspace Conflict${criticalCount === 1 ? '' : 's'}`
                : `${warningCount} Controlled Airspace Sector${warningCount === 1 ? '' : 's'} Penetrated`}
            </strong>
            <span className="dropdown-subtext">{report.summaryMessage}</span>
          </div>
        </div>
        <button
          type="button"
          className="dropdown-close-btn"
          onClick={onClose}
          title="Close conflict details"
        >
          ✕ Close
        </button>
      </div>

      <div className="airspace-conflict-list">
        {activeConflicts.map((c: AirspaceConflict, idx: number) => {
          const isCrit = c.severity === 'CRITICAL';
          const advisory = getAirspaceClearanceAdvisory(c.airspace, c.legAltitudeFt);

          return (
            <div
              key={`${c.airspace.id}_${c.legIndex}_${idx}`}
              className={`conflict-item ${isCrit ? 'conflict-critical' : 'conflict-warning'}`}
            >
              <div className="conflict-header">
                <span className={`conflict-badge badge-${c.airspace.type.toLowerCase()}`}>
                  {c.airspace.type} · Class {c.airspace.classification}
                </span>
                <strong className="conflict-name">{c.airspace.name}</strong>
                <span className="conflict-leg">
                  Leg {c.legIndex + 1} ({c.legFrom} → {c.legTo}) @ {c.legAltitudeFt.toLocaleString()} ft MSL
                </span>
              </div>

              <div className="conflict-details">
                <div className="conflict-vert">
                  <span>Vertical Limits:</span>{' '}
                  <strong>
                    {c.airspace.lowerLimitLabel} – {c.airspace.upperLimitLabel}
                  </strong>
                  {c.status === 'PENETRATING' && (
                    <span className="penetration-tag alert-pen">PENETRATING</span>
                  )}
                  {c.status === 'CLIPPING' && (
                    <span className="penetration-tag alert-clip">
                      CLEARANCE: {c.verticalClearanceFt} FT
                    </span>
                  )}
                </div>

                {c.airspace.frequency && (
                  <div className="conflict-freq">
                    <span>ATC Contact:</span> <strong>{c.airspace.frequency}</strong>
                    <button
                      type="button"
                      className="copy-freq-btn"
                      onClick={(e) => handleCopyFreq(c.airspace.frequency!, e)}
                      title="Copy radio frequency to clipboard"
                    >
                      {copiedFreq && c.airspace.frequency.includes(copiedFreq) ? '✓ Copied' : '📋 Copy Freq'}
                    </button>
                  </div>
                )}
              </div>

              {/* Pilot Clearance Advisory */}
              <div className="conflict-advisory">
                <span className="advisory-title">{advisory.actionTitle}:</span>{' '}
                <span className="advisory-detail">{advisory.actionDetail}</span>
              </div>

              {c.airspace.remarks && (
                <div className="conflict-remarks">
                  <em>AIP Note: {c.airspace.remarks}</em>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export interface AirspaceAlertBannerProps {
  navLog: NavLogSummary | null;
}

/**
 * Composite AirspaceAlertBanner backward-compatible wrapper
 */
export const AirspaceAlertBanner: React.FC<AirspaceAlertBannerProps> = ({ navLog }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      <AirspaceAlertBadge
        navLog={navLog}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded(!isExpanded)}
      />
      {isExpanded && (
        <AirspaceConflictDetails
          navLog={navLog}
          onClose={() => setIsExpanded(false)}
        />
      )}
    </>
  );
};
