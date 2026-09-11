import React, { useState } from 'react';
import { NavLogSummary } from '../types';
import {
  checkRouteAirspaceConflicts,
  AirspaceConflict,
  getAirspaceClearanceAdvisory,
} from '../engine/airspace-engine';
import { AIRSPACES } from '../data/airspace-data';

export interface AirspaceAlertBannerProps {
  navLog: NavLogSummary | null;
}

export const AirspaceAlertBanner: React.FC<AirspaceAlertBannerProps> = ({ navLog }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedFreq, setCopiedFreq] = useState<string | null>(null);

  if (!navLog || !navLog.legs || navLog.legs.length === 0) {
    return null;
  }

  const report = checkRouteAirspaceConflicts(navLog.legs, AIRSPACES);

  // Filter for actionable conflicts (PENETRATING, CLIPPING)
  const activeConflicts = report.conflicts.filter(
    (c) => c.status === 'PENETRATING' || c.status === 'CLIPPING'
  );

  if (activeConflicts.length === 0) {
    return (
      <div
        className="airspace-clear-pill"
        title="Route does not penetrate restricted or controlled airspaces"
      >
        <span className="clear-icon">✓</span>
        <span>Airspace: Clear of Restricted &amp; Conflicting Controlled Sectors</span>
      </div>
    );
  }

  const criticalCount = activeConflicts.filter((c) => c.severity === 'CRITICAL').length;
  const warningCount = activeConflicts.filter((c) => c.severity === 'WARNING').length;

  const bannerClass =
    criticalCount > 0
      ? 'airspace-banner-critical'
      : warningCount > 0
      ? 'airspace-banner-warning'
      : 'airspace-banner-caution';

  const handleCopyFreq = (freq: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Extract numbers and dot, e.g. "120.305"
    const match = freq.match(/(\d{3}\.\d{2,3})/);
    const textToCopy = match ? match[1] : freq;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedFreq(textToCopy);
      setTimeout(() => setCopiedFreq(null), 2000);
    });
  };

  return (
    <div className={`airspace-alert-banner ${bannerClass}`}>
      <div className="airspace-banner-summary" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="banner-left">
          <span className="banner-icon">{criticalCount > 0 ? '⛔' : '⚠️'}</span>
          <div className="banner-text">
            <strong>
              {criticalCount > 0
                ? `${criticalCount} Restricted / Prohibited Airspace Conflict${criticalCount === 1 ? '' : 's'}`
                : `${warningCount} Controlled Airspace Sector${warningCount === 1 ? '' : 's'} Penetrated`}
            </strong>
            <span className="banner-subtext">
              {report.summaryMessage} Click for aeronautical frequencies, floor clearance &amp; VFR advisories.
            </span>
          </div>
        </div>

        <button
          type="button"
          className="banner-toggle-btn"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
        >
          {isExpanded ? '▲ Hide Details' : `▼ View (${activeConflicts.length})`}
        </button>
      </div>

      {isExpanded && (
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
      )}
    </div>
  );
};
