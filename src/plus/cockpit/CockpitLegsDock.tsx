import React from 'react';
import { Leg, Waypoint } from '../../types';
import {
  DirectToState,
  InFlightNavSolution,
  LegRuntimeRecord,
} from '../types-plus';

export type LegsHudMode = 'current-next' | 'all-legs' | 'hidden';

export interface CockpitLegsDockProps {
  legsHudMode: LegsHudMode;
  onChangeLegsHudMode: (mode: LegsHudMode) => void;
  legs: Leg[];
  effectiveActiveLegIdx: number;
  onSelectLeg: (idx: number) => void;
  directToState: DirectToState | null;
  onCancelDirectTo: () => void;
  onActivateDirectTo: (target: Waypoint, routeIndex: number | null) => void;
  navSolution: InFlightNavSolution;
  legAtaRecords: Record<number, LegRuntimeRecord>;
  fuelUnitLabel: string;
}

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '00:00';
  const totalMins = Math.floor(seconds / 60);
  const totalSecs = Math.round(seconds % 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h > 0) {
    return `${h}h ${m.toString().padStart(2, '0')}m`;
  }
  return `${m.toString().padStart(2, '0')}:${totalSecs.toString().padStart(2, '0')}`;
};

const formatUtcClock = (ts: number | null): string => {
  if (!ts || !Number.isFinite(ts)) return '--:--Z';
  try {
    return new Date(ts).toISOString().slice(11, 16) + 'Z';
  } catch {
    return '--:--Z';
  }
};

export const CockpitLegsDock: React.FC<CockpitLegsDockProps> = React.memo(
  ({
    legsHudMode,
    onChangeLegsHudMode,
    legs,
    effectiveActiveLegIdx,
    onSelectLeg,
    directToState,
    onCancelDirectTo,
    onActivateDirectTo,
    navSolution,
    legAtaRecords,
    fuelUnitLabel,
  }) => {
    if (legsHudMode === 'hidden') {
      return (
        <button
          type="button"
          className="efb-restore-pill"
          onClick={() => onChangeLegsHudMode('current-next')}
        >
          🧭 Show Flight Legs ({effectiveActiveLegIdx + 1}/{legs.length})
        </button>
      );
    }

    const currentLeg = legs[effectiveActiveLegIdx] ?? null;
    const nextLeg = legs[effectiveActiveLegIdx + 1] ?? null;
    const absXte = Math.abs(navSolution.crossTrackErrorNm);

    return (
      <div className="efb-hud-card efb-legs-card">
        <div className="efb-card-header">
          <div className="efb-card-title">
            <span>🧭</span>
            <strong>FLIGHT LEGS</strong>
          </div>
          <div className="efb-card-mode-tabs">
            <button
              type="button"
              className={legsHudMode === 'current-next' ? 'active' : ''}
              onClick={() => onChangeLegsHudMode('current-next')}
              title="Show active and next leg"
            >
              Leg {effectiveActiveLegIdx + 1}/{legs.length}
            </button>
            <button
              type="button"
              onClick={() => onChangeLegsHudMode('hidden')}
              title="Hide Legs HUD to maximize map"
            >
              ✕
            </button>
          </div>
        </div>

        {legsHudMode === 'current-next' ? (
          <div className="efb-focused-legs-body">
            {/* CURRENT ACTIVE LEG (OR DIRECT-TO) */}
            {directToState ? (
              <div className="efb-leg-box is-direct-to">
                <div className="efb-leg-box-top">
                  <span className="efb-leg-role-tag tag-dct">⚡ DIRECT-TO ACTIVE</span>
                  <button
                    type="button"
                    className="efb-resume-leg-mini"
                    onClick={onCancelDirectTo}
                  >
                    Resume Leg
                  </button>
                </div>
                <div className="efb-leg-wpts-row">
                  <span className="wpt-from">PPOS</span>
                  <span className="wpt-arrow">➔</span>
                  <span className="wpt-to">
                    {directToState.targetWaypoint.identifier}
                  </span>
                  <span className="efb-leg-alt-pill">
                    {navSolution.targetAltitudeFt.toLocaleString()} FT
                  </span>
                </div>
                <div className="efb-leg-metrics-4">
                  <div>
                    <small>STEER</small>
                    <strong>
                      {Math.round(navSolution.bearingToNextMagDeg)
                        .toString()
                        .padStart(3, '0')}
                      °M
                    </strong>
                  </div>
                  <div>
                    <small>DIST</small>
                    <strong>{navSolution.distanceToNextNm.toFixed(1)} NM</strong>
                  </div>
                  <div>
                    <small>ETE</small>
                    <strong>{formatTime(navSolution.eteToNextSec)}</strong>
                  </div>
                  <div>
                    <small>ETA</small>
                    <strong>{formatUtcClock(navSolution.etaNextTimestamp)}</strong>
                  </div>
                </div>
              </div>
            ) : currentLeg ? (
              <div className="efb-leg-box is-current">
                <div className="efb-leg-box-top">
                  <span className="efb-leg-role-tag tag-active">
                    ● CURRENT LEG {effectiveActiveLegIdx + 1}/{legs.length}
                  </span>
                  <div className="efb-leg-stepper-mini">
                    <button
                      type="button"
                      disabled={effectiveActiveLegIdx <= 0}
                      onClick={() =>
                        onSelectLeg(Math.max(0, effectiveActiveLegIdx - 1))
                      }
                      title="Previous Leg"
                    >
                      ◀
                    </button>
                    <button
                      type="button"
                      disabled={effectiveActiveLegIdx >= legs.length - 1}
                      onClick={() =>
                        onSelectLeg(
                          Math.min(legs.length - 1, effectiveActiveLegIdx + 1)
                        )
                      }
                      title="Next Leg"
                    >
                      ▶
                    </button>
                  </div>
                </div>

                <div className="efb-leg-wpts-row">
                  <span className="wpt-from">{currentLeg.from.identifier}</span>
                  <span className="wpt-arrow">➔</span>
                  <span className="wpt-to">{currentLeg.to.identifier}</span>
                  <span className="efb-leg-alt-pill">
                    {currentLeg.altitude.toLocaleString()} FT
                  </span>
                </div>

                <div className="efb-leg-metrics-4">
                  <div>
                    <small>BRG / HDG</small>
                    <strong className="val-gold">
                      {Math.round(navSolution.bearingToNextMagDeg)
                        .toString()
                        .padStart(3, '0')}
                      °M
                    </strong>
                  </div>
                  <div>
                    <small>REM DIST</small>
                    <strong className="val-cyan">
                      {navSolution.distanceToNextNm.toFixed(1)} NM
                    </strong>
                  </div>
                  <div>
                    <small>ETE</small>
                    <strong>{formatTime(navSolution.eteToNextSec)}</strong>
                  </div>
                  <div>
                    <small>REQ VS</small>
                    <strong>
                      {navSolution.requiredVsNextFpm !== null
                        ? `${
                            navSolution.requiredVsNextFpm > 0
                              ? `+${navSolution.requiredVsNextFpm}`
                              : navSolution.requiredVsNextFpm
                          }`
                        : 'LVL'}
                    </strong>
                  </div>
                </div>

                {/* Live Off-Track Intercept Advisory Bar inside Current Leg Card */}
                {absXte >= 0.25 && (
                  <div
                    className={`efb-leg-offtrack-bar ${
                      absXte > 1.5 ? 'is-critical' : 'is-warn'
                    }`}
                  >
                    <span>
                      ⚠️ Off Track {absXte.toFixed(1)} NM{' '}
                      {navSolution.crossTrackErrorNm > 0 ? 'R' : 'L'}
                      {navSolution.interceptHeadingMagDeg !== null
                        ? ` · Steer ${Math.round(navSolution.interceptHeadingMagDeg)
                            .toString()
                            .padStart(3, '0')}°M to intercept`
                        : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onActivateDirectTo(currentLeg.to, effectiveActiveLegIdx + 1)
                      }
                    >
                      ⚡ DCT {currentLeg.to.identifier}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="efb-empty-note">No active route legs.</div>
            )}

            {/* NEXT UPCOMING LEG */}
            {nextLeg && (
              <div className="efb-leg-box is-next">
                <div className="efb-leg-box-top">
                  <span className="efb-leg-role-tag tag-next">
                    NEXT LEG {effectiveActiveLegIdx + 2}/{legs.length}
                  </span>
                  <button
                    type="button"
                    className="efb-mini-dct-trigger"
                    onClick={() =>
                      onActivateDirectTo(nextLeg.to, effectiveActiveLegIdx + 2)
                    }
                    title={`Fly Direct-To ${nextLeg.to.identifier}`}
                  >
                    ⚡ DCT {nextLeg.to.identifier}
                  </button>
                </div>

                <div className="efb-leg-wpts-row compact">
                  <span className="wpt-from">{nextLeg.from.identifier}</span>
                  <span className="wpt-arrow">➔</span>
                  <span className="wpt-to">{nextLeg.to.identifier}</span>
                  <span className="efb-leg-alt-pill muted">
                    {nextLeg.altitude.toLocaleString()} FT
                  </span>
                </div>

                <div className="efb-leg-metrics-4 compact">
                  <div>
                    <small>CRS</small>
                    <strong>
                      {Math.round(nextLeg.magneticHeading)
                        .toString()
                        .padStart(3, '0')}
                      °M
                    </strong>
                  </div>
                  <div>
                    <small>LEG DIST</small>
                    <strong>{nextLeg.distance.toFixed(1)} NM</strong>
                  </div>
                  <div>
                    <small>LEG ETE</small>
                    <strong>{formatTime(nextLeg.ete)}</strong>
                  </div>
                  <div>
                    <small>FUEL</small>
                    <strong>
                      {nextLeg.fuelBurn.toFixed(1)} {fuelUnitLabel}
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ALL LEGS COMPACT LIST */
          <div className="efb-all-legs-list">
            {legs.map((leg, idx) => {
              const isAct = idx === effectiveActiveLegIdx;
              const ata = legAtaRecords[idx];
              return (
                <div
                  key={leg.id || idx}
                  className={`efb-all-leg-row ${isAct ? 'active' : ''}`}
                  onClick={() => onSelectLeg(idx)}
                >
                  <div className="efb-all-leg-main">
                    <span className="efb-all-leg-idx">#{idx + 1}</span>
                    <strong>
                      {leg.from.identifier} ➔ {leg.to.identifier}
                    </strong>
                    <span className="efb-all-leg-alt">
                      {leg.altitude.toLocaleString()}ft
                    </span>
                  </div>
                  <div className="efb-all-leg-sub">
                    <span>
                      {Math.round(leg.magneticHeading).toString().padStart(3, '0')}°M
                    </span>
                    <span>•</span>
                    <span>{leg.distance.toFixed(1)} NM</span>
                    <span>•</span>
                    <span>
                      {ata
                        ? `ATA ${formatUtcClock(ata.ataTimestamp)}`
                        : formatTime(leg.ete)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onActivateDirectTo(leg.to, idx + 1);
                      }}
                    >
                      ⚡ DCT
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
);
