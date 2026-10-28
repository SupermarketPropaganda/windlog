import React, { useState } from 'react';
import { Waypoint } from '../types';
import { getAirportWaypoint } from '../data/airport-runways';
import {
  BreadcrumbPoint,
  DirectToState,
  InFlightNavSolution,
  OwnshipTelemetry,
} from './types-plus';

export interface InFlightHudBarProps {
  isFlightModeActive: boolean;
  onToggleFlightMode: (active: boolean) => void;
  ownship: OwnshipTelemetry;
  navSolution: InFlightNavSolution;
  waypoints: Waypoint[];
  alternateAirport?: Waypoint | null;
  activeLegIndex: number;
  totalLegsCount: number;
  onSelectLeg: (idx: number) => void;
  directToState: DirectToState | null;
  onActivateDirectTo: (target: Waypoint, routeIndex: number | null) => void;
  onCancelDirectTo: () => void;
  lookAheadMinutes: number;
  onChangeLookAheadMinutes: (mins: number) => void;
  breadcrumbs: BreadcrumbPoint[];
  onClearBreadcrumbs: () => void;
  onExportGpx: () => void;
  onStartLiveGps: () => void;
  onAdjustManualOwnship: (updates: Partial<{
    latitude: number;
    longitude: number;
    altitudeMslFt: number;
    groundSpeedKt: number;
    trueTrackDeg: number;
    verticalSpeedFpm: number;
  }>) => void;
  isSimPlaying: boolean;
  simSpeedMultiplier: number;
  onToggleSimPlay: (speed?: number) => void;
  isMapClickPlacementMode: boolean;
  onToggleMapClickPlacementMode: () => void;
  onSetAltimeterOffset: (offsetFt: number) => void;
  gpsError: string | null;
  fuelUnitLabel: string;
}

const formatEteCompact = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';
  const totalMins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h > 0) {
    return `${h}h ${m.toString().padStart(2, '0')}m`;
  }
  return `${m.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const formatUtcClock = (timestampMs: number | null): string => {
  if (!timestampMs || !Number.isFinite(timestampMs)) return '--:--Z';
  const d = new Date(timestampMs);
  return `${d.getUTCHours().toString().padStart(2, '0')}:${d
    .getUTCMinutes()
    .toString()
    .padStart(2, '0')}Z`;
};

export const InFlightHudBar: React.FC<InFlightHudBarProps> = ({
  isFlightModeActive,
  onToggleFlightMode,
  ownship,
  navSolution,
  waypoints,
  alternateAirport,
  activeLegIndex,
  totalLegsCount,
  onSelectLeg,
  directToState,
  onActivateDirectTo,
  onCancelDirectTo,
  lookAheadMinutes,
  onChangeLookAheadMinutes,
  breadcrumbs,
  onClearBreadcrumbs,
  onExportGpx,
  onStartLiveGps,
  onAdjustManualOwnship,
  isSimPlaying,
  simSpeedMultiplier,
  onToggleSimPlay,
  isMapClickPlacementMode,
  onToggleMapClickPlacementMode,
  onSetAltimeterOffset,
  gpsError,
  fuelUnitLabel,
}) => {
  const [isDctMenuOpen, setIsDctMenuOpen] = useState(false);
  const [customDctIcao, setCustomDctIcao] = useState('');
  const [isAltSyncOpen, setIsAltSyncOpen] = useState(false);
  const [showTestControls, setShowTestControls] = useState(false);

  const handleCustomDctSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = customDctIcao.trim().toUpperCase();
    if (!code) return;
    // Check route waypoints first
    const routeIdx = waypoints.findIndex(
      (w) => w.identifier.toUpperCase() === code
    );
    if (routeIdx >= 0) {
      onActivateDirectTo(waypoints[routeIdx], routeIdx);
      setCustomDctIcao('');
      setIsDctMenuOpen(false);
      return;
    }
    const airportWp = getAirportWaypoint(code);
    if (airportWp) {
      onActivateDirectTo(airportWp, null);
      setCustomDctIcao('');
      setIsDctMenuOpen(false);
    }
  };

  // Compute CDI needle horizontal offset percentage (-100% = 2 NM Left, +100% = 2 NM Right)
  const cdiClampedPercent = Math.max(
    -100,
    Math.min(100, (navSolution.crossTrackErrorNm / 2.0) * 100)
  );

  return (
    <section
      className={`plus-inflight-hud-shell ${
        isFlightModeActive ? 'is-active' : 'is-standby'
      }`}
      aria-label="GustLog Plus In-Flight EFB Telemetry & Controls"
    >
      {/* Top Bar: Mode Switcher, GPS Integrity, Direct-To, Track Vector & Breadcrumbs */}
      <div className="plus-hud-topbar">
        <div className="plus-hud-brand-group">
          <button
            type="button"
            className={`plus-flight-mode-toggle ${
              isFlightModeActive ? 'active' : ''
            }`}
            onClick={() => onToggleFlightMode(!isFlightModeActive)}
          >
            <span className="plus-mode-dot" />
            <span>
              {isFlightModeActive
                ? '✈️ IN-FLIGHT EFB ACTIVE'
                : '✈️ ENGAGE IN-FLIGHT MODE (PLUS)'}
            </span>
          </button>

          {isFlightModeActive && (
            <div className="plus-sensor-group">
              <button
                type="button"
                className={`plus-sensor-btn ${
                  ownship.source === 'gps' ? 'active' : ''
                }`}
                onClick={onStartLiveGps}
                title="Connect to live hardware GPS receiver"
              >
                🛰️ Live GPS
                {ownship.source === 'gps' && (
                  <span
                    className={`plus-gps-acc-pill qual-${ownship.gpsQuality.toLowerCase()}`}
                  >
                    ±{ownship.horizontalAccuracyM}m
                  </span>
                )}
              </button>

              <button
                type="button"
                className={`plus-sensor-btn ${
                  showTestControls || ownship.source === 'manual-test'
                    ? 'active-sim'
                    : ''
                }`}
                onClick={() => setShowTestControls((prev) => !prev)}
                title="Open Cockpit GPS Simulator / Map Placement controls for desktop testing"
              >
                🕹️ {ownship.source === 'manual-test' ? 'Cockpit Sim' : 'Test / Sim'}
              </button>
            </div>
          )}
        </div>

        {isFlightModeActive && (
          <div className="plus-hud-actions-group">
            {/* Direct-To (DCT) Button & Popover */}
            <div className="plus-dct-wrap" style={{ position: 'relative' }}>
              <button
                type="button"
                className={`plus-hud-action-btn dct-btn ${
                  directToState ? 'dct-active' : ''
                }`}
                onClick={() => setIsDctMenuOpen((prev) => !prev)}
                title="Direct-To (DCT) any waypoint or aerodrome from present GPS position"
              >
                <span>⚡ DCT</span>
                {directToState && (
                  <span className="plus-dct-target-tag">
                    ➔ {directToState.targetWaypoint.identifier}
                  </span>
                )}
              </button>

              {directToState && (
                <button
                  type="button"
                  className="plus-Cancel-dct-inline"
                  onClick={onCancelDirectTo}
                  title="Cancel Direct-To and resume planned route leg"
                >
                  ✕ Resume Leg
                </button>
              )}

              {isDctMenuOpen && (
                <div className="plus-dct-popover">
                  <div className="plus-popover-header">
                    <strong>⚡ Direct-To (DCT) Navigation</strong>
                    <button
                      type="button"
                      className="plus-popover-close"
                      onClick={() => setIsDctMenuOpen(false)}
                    >
                      ✕
                    </button>
                  </div>

                  <p className="plus-popover-sub">
                    Creates an immediate course line from your live GPS coordinates (
                    {ownship.latitude.toFixed(3)}°, {ownship.longitude.toFixed(3)}°)
                    directly to the selected fix:
                  </p>

                  {waypoints.length > 0 && (
                    <div className="plus-dct-wpt-list">
                      {waypoints.map((wp, idx) => {
                        const isCurrentDct =
                          directToState?.targetWaypoint.identifier ===
                          wp.identifier;
                        return (
                          <button
                            key={`${wp.identifier}-${idx}`}
                            type="button"
                            className={`plus-dct-wpt-item ${
                              isCurrentDct ? 'active' : ''
                            }`}
                            onClick={() => {
                              onActivateDirectTo(wp, idx);
                              setIsDctMenuOpen(false);
                            }}
                          >
                            <span className="dct-item-ident">
                              {idx === 0
                                ? '🛫 '
                                : idx === waypoints.length - 1
                                ? '🛬 '
                                : '◆ '}
                              {wp.identifier}
                            </span>
                            <span className="dct-item-name">
                              {wp.name || wp.type.toUpperCase()}
                            </span>
                            <span className="dct-item-go">DCT ➔</span>
                          </button>
                        );
                      })}

                      {alternateAirport && (
                        <button
                          type="button"
                          className="plus-dct-wpt-item is-alt"
                          onClick={() => {
                            onActivateDirectTo(alternateAirport, null);
                            setIsDctMenuOpen(false);
                          }}
                        >
                          <span className="dct-item-ident">
                            ⚠️ ALT: {alternateAirport.identifier}
                          </span>
                          <span className="dct-item-name">
                            {alternateAirport.name}
                          </span>
                          <span className="dct-item-go">DIVERT ➔</span>
                        </button>
                      )}
                    </div>
                  )}

                  <form onSubmit={handleCustomDctSubmit} className="plus-dct-custom-form">
                    <input
                      type="text"
                      placeholder="Airport/Fix ICAO (e.g. LPCS)"
                      value={customDctIcao}
                      maxLength={6}
                      onChange={(e) => setCustomDctIcao(e.target.value.toUpperCase())}
                      className="plus-dct-input"
                    />
                    <button type="submit" className="plus-dct-go-btn">
                      Go DCT
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* Track Vector Look-Ahead Time Selector */}
            <div className="plus-vector-selector" title="Projected Track Vector & Look-Ahead Scanner Horizon">
              <span className="plus-ctrl-label">Vector:</span>
              {[2, 5, 10].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  className={`plus-vec-pill ${
                    lookAheadMinutes === mins ? 'active' : ''
                  }`}
                  onClick={() => onChangeLookAheadMinutes(mins)}
                >
                  {mins}m
                </button>
              ))}
            </div>

            {/* Breadcrumbs Trail Controls */}
            <div className="plus-breadcrumbs-ctrl">
              <span className="plus-crumb-badge" title="Recorded in-flight breadcrumb coordinates">
                🟣 Trail: <strong>{breadcrumbs.length}</strong> pts
              </span>
              {breadcrumbs.length > 0 && (
                <>
                  <button
                    type="button"
                    className="plus-crumb-btn"
                    onClick={onExportGpx}
                    title="Export flown breadcrumb track as GPX 1.1 file"
                  >
                    ⬇ GPX
                  </button>
                  <button
                    type="button"
                    className="plus-crumb-btn"
                    onClick={onClearBreadcrumbs}
                    title="Clear recorded breadcrumb trail"
                  >
                    Clear
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Optional GPS Error / Permission Banner */}
      {isFlightModeActive && gpsError && ownship.source === 'gps' && (
        <div className="plus-gps-error-strip">
          <span>⚠️ {gpsError}</span>
          <button
            type="button"
            className="plus-switch-sim-btn"
            onClick={() => setShowTestControls(true)}
          >
            Use Cockpit Simulator / Map Placement
          </button>
        </div>
      )}

      {/* Interactive Cockpit Simulator / Map Placement Drawer (For Desktop & Pre-Flight Rehearsal) */}
      {isFlightModeActive && showTestControls && (
        <div className="plus-sim-drawer">
          <div className="plus-sim-drawer-left">
            <span className="plus-sim-badge">🕹️ COCKPIT SIMULATOR</span>
            <button
              type="button"
              className={`plus-sim-play-btn ${isSimPlaying ? 'playing' : ''}`}
              onClick={() => onToggleSimPlay(simSpeedMultiplier)}
            >
              {isSimPlaying ? '⏸ Pause Flight' : '▶ Fly Vector'}
            </button>
            {[1, 5, 10].map((spd) => (
              <button
                key={spd}
                type="button"
                className={`plus-sim-spd-btn ${
                  simSpeedMultiplier === spd ? 'active' : ''
                }`}
                onClick={() => onToggleSimPlay(spd)}
              >
                {spd}x
              </button>
            ))}
            <button
              type="button"
              className={`plus-map-place-btn ${
                isMapClickPlacementMode ? 'active' : ''
              }`}
              onClick={onToggleMapClickPlacementMode}
              title="Click anywhere on the Tactical Map to move the aircraft there immediately"
            >
              {isMapClickPlacementMode
                ? '🎯 Click Any Point on Map (Active)'
                : '📍 Click Map to Place Aircraft'}
            </button>
          </div>

          <div className="plus-sim-sliders">
            <div className="plus-sim-field">
              <label>ALT (FT)</label>
              <div className="plus-sim-stepper">
                <button
                  type="button"
                  onClick={() =>
                    onAdjustManualOwnship({
                      altitudeMslFt: Math.max(
                        0,
                        (ownship.altitudeMslFt ?? 3500) - 250
                      ),
                    })
                  }
                >
                  -250
                </button>
                <span>{(ownship.altitudeMslFt ?? 3500).toLocaleString()}</span>
                <button
                  type="button"
                  onClick={() =>
                    onAdjustManualOwnship({
                      altitudeMslFt: (ownship.altitudeMslFt ?? 3500) + 250,
                    })
                  }
                >
                  +250
                </button>
              </div>
            </div>

            <div className="plus-sim-field">
              <label>GS (KT)</label>
              <div className="plus-sim-stepper">
                <button
                  type="button"
                  onClick={() =>
                    onAdjustManualOwnship({
                      groundSpeedKt: Math.max(0, ownship.groundSpeedKt - 10),
                    })
                  }
                >
                  -10
                </button>
                <span>{ownship.groundSpeedKt}</span>
                <button
                  type="button"
                  onClick={() =>
                    onAdjustManualOwnship({
                      groundSpeedKt: ownship.groundSpeedKt + 10,
                    })
                  }
                >
                  +10
                </button>
              </div>
            </div>

            <div className="plus-sim-field">
              <label>TRK (°T)</label>
              <div className="plus-sim-stepper">
                <button
                  type="button"
                  onClick={() =>
                    onAdjustManualOwnship({
                      trueTrackDeg: (ownship.trueTrackDeg - 10 + 360) % 360,
                    })
                  }
                >
                  -10°
                </button>
                <span>{ownship.trueTrackDeg.toString().padStart(3, '0')}°</span>
                <button
                  type="button"
                  onClick={() =>
                    onAdjustManualOwnship({
                      trueTrackDeg: (ownship.trueTrackDeg + 10) % 360,
                    })
                  }
                >
                  +10°
                </button>
              </div>
            </div>

            <div className="plus-sim-field">
              <label>VS (FPM)</label>
              <div className="plus-sim-stepper">
                <button
                  type="button"
                  onClick={() =>
                    onAdjustManualOwnship({
                      verticalSpeedFpm: ownship.verticalSpeedFpm - 200,
                    })
                  }
                >
                  -200
                </button>
                <span>
                  {ownship.verticalSpeedFpm > 0
                    ? `+${ownship.verticalSpeedFpm}`
                    : ownship.verticalSpeedFpm}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onAdjustManualOwnship({
                      verticalSpeedFpm: ownship.verticalSpeedFpm + 200,
                    })
                  }
                >
                  +200
                </button>
              </div>
            </div>

            {navSolution.nextWaypoint && (
              <button
                type="button"
                className="plus-sim-align-btn"
                onClick={() =>
                  onAdjustManualOwnship({
                    trueTrackDeg: Math.round(navSolution.bearingToNextTrueDeg),
                  })
                }
                title="Align aircraft track directly toward active next waypoint"
              >
                🧭 Align to {navSolution.nextWaypoint.identifier}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Primary 8-Cell Avionics Telemetry Ribbon */}
      {isFlightModeActive && (
        <div className="plus-hud-instrument-grid">
          {/* 1. Ground Speed */}
          <div className="plus-hud-cell">
            <div className="plus-cell-top">
              <span className="plus-cell-label">GROUND SPEED</span>
              <span className={`plus-phase-tag phase-${ownship.flightPhase.toLowerCase()}`}>
                {ownship.flightPhase}
              </span>
            </div>
            <div className="plus-cell-value val-cyan">
              {ownship.groundSpeedKt} <small>KT</small>
            </div>
            <div className="plus-cell-sub">
              {ownship.source === 'gps' ? 'GNSS Ground Vector' : 'Simulated GS'}
            </div>
          </div>

          {/* 2. Magnetic & True Track */}
          <div className="plus-hud-cell">
            <div className="plus-cell-top">
              <span className="plus-cell-label">TRACK (MAG)</span>
              <span className="plus-cell-tag">
                {ownship.trueTrackDeg.toString().padStart(3, '0')}°T
              </span>
            </div>
            <div className="plus-cell-value val-gold">
              {ownship.magneticTrackDeg.toString().padStart(3, '0')}°<small>M</small>
            </div>
            <div className="plus-cell-sub">
              DTK {Math.round(navSolution.desiredTrackMagDeg).toString().padStart(3, '0')}°M •
              BRG {Math.round(navSolution.bearingToNextMagDeg).toString().padStart(3, '0')}°M
            </div>
          </div>

          {/* 3. Altitude (MSL + AGL + Target + QNH Calibration) */}
          <div className="plus-hud-cell" style={{ position: 'relative' }}>
            <div className="plus-cell-top">
              <span className="plus-cell-label">ALTITUDE (MSL)</span>
              <button
                type="button"
                className="plus-alt-cal-btn"
                onClick={() => setIsAltSyncOpen((prev) => !prev)}
                title="Calibrate GPS altitude to cockpit barometric altimeter (QNH)"
              >
                ⚙ Cal {ownship.altimeterOffsetFt >= 0 ? `+${ownship.altimeterOffsetFt}` : ownship.altimeterOffsetFt}
              </button>
            </div>
            <div className="plus-cell-value val-white">
              {ownship.altitudeMslFt !== null
                ? ownship.altitudeMslFt.toLocaleString()
                : '---'}{' '}
              <small>FT</small>
            </div>
            <div className="plus-cell-sub">
              {navSolution.estimatedAglFt !== null && (
                <span
                  className={
                    navSolution.estimatedAglFt < 500
                      ? 'sub-alert'
                      : 'sub-emerald'
                  }
                >
                  {navSolution.estimatedAglFt.toLocaleString()} FT AGL
                </span>
              )}{' '}
              • Plan {navSolution.targetAltitudeFt.toLocaleString()} FT
            </div>

            {isAltSyncOpen && (
              <div className="plus-alt-cal-popover">
                <div className="plus-popover-header">
                  <strong>Barometric Altimeter Sync</strong>
                  <button
                    type="button"
                    className="plus-popover-close"
                    onClick={() => setIsAltSyncOpen(false)}
                  >
                    ✕
                  </button>
                </div>
                <p className="plus-popover-sub">
                  Adjust offset (FT) so GPS MSL matches your cockpit QNH altimeter:
                </p>
                <div className="plus-alt-cal-controls">
                  <button
                    type="button"
                    onClick={() =>
                      onSetAltimeterOffset(ownship.altimeterOffsetFt - 50)
                    }
                  >
                    -50 FT
                  </button>
                  <strong>
                    {ownship.altimeterOffsetFt >= 0
                      ? `+${ownship.altimeterOffsetFt}`
                      : ownship.altimeterOffsetFt}{' '}
                    FT
                  </strong>
                  <button
                    type="button"
                    onClick={() =>
                      onSetAltimeterOffset(ownship.altimeterOffsetFt + 50)
                    }
                  >
                    +50 FT
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetAltimeterOffset(0)}
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 4. Vertical Speed & VSR */}
          <div className="plus-hud-cell">
            <div className="plus-cell-top">
              <span className="plus-cell-label">VERT SPEED</span>
              <span className="plus-cell-tag">
                {ownship.verticalSpeedFpm > 50
                  ? '▲ CLIMB'
                  : ownship.verticalSpeedFpm < -50
                  ? '▼ DESC'
                  : '— LEVEL'}
              </span>
            </div>
            <div
              className={`plus-cell-value ${
                ownship.verticalSpeedFpm > 50
                  ? 'val-cyan'
                  : ownship.verticalSpeedFpm < -50
                  ? 'val-gold'
                  : 'val-white'
              }`}
            >
              {ownship.verticalSpeedFpm > 0
                ? `+${ownship.verticalSpeedFpm}`
                : ownship.verticalSpeedFpm}{' '}
              <small>FPM</small>
            </div>
            <div className="plus-cell-sub">
              {navSolution.requiredVsNextFpm !== null
                ? `Req VSR: ${
                    navSolution.requiredVsNextFpm > 0
                      ? `+${navSolution.requiredVsNextFpm}`
                      : navSolution.requiredVsNextFpm
                  } FPM`
                : 'On Target Altitude'}
            </div>
          </div>

          {/* 5. Cross-Track Error (XTE) & CDI Bar */}
          <div className="plus-hud-cell">
            <div className="plus-cell-top">
              <span className="plus-cell-label">CROSS-TRACK (XTE)</span>
              <span className="plus-cell-tag">
                {Math.abs(navSolution.crossTrackErrorNm) < 0.05
                  ? 'CENTERED'
                  : navSolution.crossTrackErrorNm < 0
                  ? 'LEFT OF CRS'
                  : 'RIGHT OF CRS'}
              </span>
            </div>
            <div className="plus-cell-value">
              {Math.abs(navSolution.crossTrackErrorNm).toFixed(2)}{' '}
              <small>
                NM{' '}
                {Math.abs(navSolution.crossTrackErrorNm) < 0.05
                  ? ''
                  : navSolution.crossTrackErrorNm < 0
                  ? 'L'
                  : 'R'}
              </small>
            </div>
            <div className="plus-cdi-track" title="Course Deviation Indicator (±2.0 NM full scale)">
              <div className="plus-cdi-center-tick" />
              <div
                className="plus-cdi-needle"
                style={{ left: `${50 + cdiClampedPercent * 0.45}%` }}
              />
            </div>
          </div>

          {/* 6. Active Next Waypoint & Leg Stepper */}
          <div className="plus-hud-cell">
            <div className="plus-cell-top">
              <span className="plus-cell-label">
                {directToState ? '⚡ DIRECT-TO FIX' : `ACTIVE LEG ${activeLegIndex + 1}/${Math.max(1, totalLegsCount)}`}
              </span>
              {totalLegsCount > 1 && !directToState && (
                <div className="plus-leg-step-btns">
                  <button
                    type="button"
                    disabled={activeLegIndex <= 0}
                    onClick={() => onSelectLeg(Math.max(0, activeLegIndex - 1))}
                    title="Previous Route Leg"
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    disabled={activeLegIndex >= totalLegsCount - 1}
                    onClick={() =>
                      onSelectLeg(Math.min(totalLegsCount - 1, activeLegIndex + 1))
                    }
                    title="Advance to Next Route Leg"
                  >
                    ▶
                  </button>
                </div>
              )}
            </div>
            <div className="plus-cell-value val-emerald">
              {navSolution.nextWaypoint?.identifier || '---'}{' '}
              <small>{navSolution.distanceToNextNm.toFixed(1)} NM</small>
            </div>
            <div className="plus-cell-sub">
              Steer {Math.round(navSolution.bearingToNextMagDeg).toString().padStart(3, '0')}°M •
              Alt {navSolution.targetAltitudeFt.toLocaleString()} FT
            </div>
          </div>

          {/* 7. ETE & ETA to Next Waypoint */}
          <div className="plus-hud-cell">
            <div className="plus-cell-top">
              <span className="plus-cell-label">ETE / ETA NEXT</span>
              <span className="plus-cell-tag">
                {formatUtcClock(navSolution.etaNextTimestamp)}
              </span>
            </div>
            <div className="plus-cell-value val-white">
              {formatEteCompact(navSolution.eteToNextSec)}
            </div>
            <div className="plus-cell-sub">
              {navSolution.altitudeCaptureArc
                ? `🟢 Alt Arc in ${navSolution.altitudeCaptureArc.distanceAheadNm.toFixed(1)} NM`
                : `To ${navSolution.nextWaypoint?.identifier || 'WPT'}`}
            </div>
          </div>

          {/* 8. Destination Totals & Remaining Fuel */}
          <div className="plus-hud-cell">
            <div className="plus-cell-top">
              <span className="plus-cell-label">DEST TOTALS</span>
              <span className="plus-cell-tag">
                {formatUtcClock(navSolution.etaDestTimestamp)}
              </span>
            </div>
            <div className="plus-cell-value val-cyan">
              {navSolution.distanceToDestNm.toFixed(1)} <small>NM</small>
            </div>
            <div className="plus-cell-sub">
              ETE {formatEteCompact(navSolution.eteToDestSec)}
              {navSolution.estimatedFuelRemainingAtDest !== null && (
                <span>
                  {' '}
                  • Rem {navSolution.estimatedFuelRemainingAtDest.toFixed(1)}{' '}
                  {fuelUnitLabel}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
