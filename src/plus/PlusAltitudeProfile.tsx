import React, { useState, useMemo, useEffect } from 'react';
import { NavLogSummary } from '../types';
import {
  computeAirspaceProfileSlices,
  AirspaceVerticalSlice,
} from '../engine/airspace-engine';
import {
  fetchTerrainProfile,
  TerrainProfileResult,
  TerrainSamplePoint,
} from '../engine/terrain-engine';
import { AirspaceFilterType } from './PlusRouteMap';
import { InFlightNavSolution, OwnshipTelemetry } from './types-plus';

export interface PlusAltitudeProfileProps {
  navLog: NavLogSummary;
  activeLegIndex: number | null;
  onSelectLeg: (idx: number) => void;
  showAirspaces?: boolean;
  onToggleShowAirspaces?: (show: boolean) => void;
  airspaceFilter?: AirspaceFilterType;
  onlyRouteAirspaces?: boolean;
  isFlightModeActive?: boolean;
  ownship?: OwnshipTelemetry;
  navSolution?: InFlightNavSolution;
  terrainResultOverride?: TerrainProfileResult | null;
}

function getSliceShortName(name: string, w: number): string {
  if (w < 45) return '';
  if (w < 85) {
    const m = name.match(/SECTOR\s*(\w+)/i);
    if (m) return `S${m[1]}`;
    if (name.includes('CTR')) return 'CTR';
    return name.slice(0, 5);
  }
  if (w < 150) {
    return name
      .replace(/LISBOA\s*TMA\s*SECTOR/i, 'TMA S')
      .replace('PORTUGAL', '')
      .trim();
  }
  return name;
}

export const PlusAltitudeProfile: React.FC<PlusAltitudeProfileProps> = ({
  navLog,
  activeLegIndex,
  onSelectLeg,
  showAirspaces: externalShowAirspaces,
  onToggleShowAirspaces,
  airspaceFilter = 'ALL',
  isFlightModeActive = false,
  ownship,
  navSolution,
  terrainResultOverride,
}) => {
  if (!navLog || navLog.legs.length === 0) return null;

  // SkyDemon-style Virtual Radar mode (Next 25 NM ahead of nose) vs Full Route mode
  const [profileMode, setProfileMode] = useState<'radar' | 'full'>(
    isFlightModeActive ? 'radar' : 'full'
  );

  const [internalShowAirspaces, setInternalShowAirspaces] = useState<boolean>(true);
  const showAirspaceSlices =
    externalShowAirspaces !== undefined
      ? externalShowAirspaces
      : internalShowAirspaces;
  const setShowAirspaceSlices = onToggleShowAirspaces || setInternalShowAirspaces;

  const [fetchedTerrain, setFetchedTerrain] = useState<TerrainProfileResult | null>(
    null
  );
  const terrainResult = terrainResultOverride ?? fetchedTerrain;

  const [selectedPoint, setSelectedPoint] = useState<TerrainSamplePoint | null>(
    null
  );
  const [selectedSlice, setSelectedSlice] = useState<AirspaceVerticalSlice | null>(
    null
  );

  const width = 960;
  const height = 340;
  const paddingLeft = 72;
  const paddingRight = 40;
  const paddingTop = 32;
  const paddingBottom = 54;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const totalDist = Math.max(1, navLog.totalDistance);
  const liveDistNm = navSolution ? navSolution.cumulativeRouteDistNm : 0;

  // Determine X-axis distance window (SkyDemon Virtual Radar 25 NM window vs Full Route)
  const isRadarMode = isFlightModeActive && profileMode === 'radar';
  const radarSpanNm = Math.min(25, Math.max(12, totalDist));
  const windowStartNm = isRadarMode
    ? Math.max(0, Math.min(Math.max(0, totalDist - radarSpanNm), liveDistNm - 1.5))
    : 0;
  const windowEndNm = isRadarMode
    ? Math.max(windowStartNm + 10, Math.min(totalDist, windowStartNm + radarSpanNm))
    : totalDist;
  const windowSpanNm = Math.max(1, windowEndNm - windowStartNm);

  useEffect(() => {
    if (terrainResultOverride) return;
    let isMounted = true;
    fetchTerrainProfile(navLog.legs)
      .then((res) => {
        if (isMounted) setFetchedTerrain(res);
      })
      .catch((err) => {
        console.warn('Failed to load terrain profile:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [navLog.legs, terrainResultOverride]);

  const allAirspaceSlices = useMemo(() => {
    return computeAirspaceProfileSlices(navLog.legs);
  }, [navLog.legs]);

  const airspaceSlices = useMemo(() => {
    if (!airspaceFilter || airspaceFilter === 'ALL') return allAirspaceSlices;
    return allAirspaceSlices.filter((s) => {
      if (airspaceFilter === 'CTR') return s.airspace.type === 'CTR';
      if (airspaceFilter === 'TMA') return s.airspace.type === 'TMA';
      if (airspaceFilter === 'SPECIAL') {
        return (
          s.airspace.type === 'RESTRICTED' ||
          s.airspace.type === 'PROHIBITED' ||
          s.airspace.type === 'DANGER'
        );
      }
      if (airspaceFilter === 'ATZ') return s.airspace.type === 'ATZ';
      return true;
    });
  }, [allAirspaceSlices, airspaceFilter]);

  const maxAltInRoute = Math.max(...navLog.legs.map((l) => l.altitude), 2000);
  const ownAlt =
    isFlightModeActive && ownship?.altitudeMslFt ? ownship.altitudeMslFt : 0;
  const maxTerrainInRoute = terrainResult ? terrainResult.maxTerrainFt : 0;
  const flightCeiling = Math.max(maxAltInRoute, maxTerrainInRoute, ownAlt);
  const yMaxAlt = Math.max(
    4000,
    Math.ceil((flightCeiling + 1800) / 1000) * 1000
  );

  const visibleAirspaceSlices = useMemo(() => {
    return airspaceSlices.filter(
      (s) =>
        s.lowerLimitFt < yMaxAlt &&
        s.endDistNm >= windowStartNm &&
        s.startDistNm <= windowEndNm
    );
  }, [airspaceSlices, yMaxAlt, windowStartNm, windowEndNm]);

  const scaleX = (dist: number) =>
    paddingLeft + ((dist - windowStartNm) / windowSpanNm) * chartWidth;
  const scaleY = (alt: number) =>
    paddingTop +
    chartHeight -
    (Math.max(0, Math.min(yMaxAlt, alt)) / yMaxAlt) * chartHeight;

  let cumulative = 0;
  const waypointPoints: { ident: string; dist: number; x: number; alt: number }[] =
    [];

  waypointPoints.push({
    ident: navLog.legs[0].from.identifier,
    dist: 0,
    x: scaleX(0),
    alt: navLog.legs[0].altitude,
  });

  navLog.legs.forEach((leg) => {
    cumulative += leg.distance;
    waypointPoints.push({
      ident: leg.to.identifier,
      dist: cumulative,
      x: scaleX(cumulative),
      alt: leg.altitude,
    });
  });

  let terrainPathD = '';
  let terrainRidgeD = '';
  let caution1000RibbonD = '';
  let danger500RibbonD = '';

  if (terrainResult && terrainResult.samples.length > 0) {
    terrainPathD = `M ${scaleX(0)} ${scaleY(0)}`;
    terrainResult.samples.forEach((p, idx) => {
      const px = scaleX(p.distNm);
      const py = scaleY(p.elevationFt);
      const py500 = scaleY(p.elevationFt + 500);
      const py1000 = scaleY(p.elevationFt + 1000);
      terrainPathD += ` L ${px} ${py}`;
      if (idx === 0) {
        terrainRidgeD = `M ${px} ${py}`;
        danger500RibbonD = `M ${px} ${py500}`;
        caution1000RibbonD = `M ${px} ${py1000}`;
      } else {
        terrainRidgeD += ` L ${px} ${py}`;
        danger500RibbonD += ` L ${px} ${py500}`;
        caution1000RibbonD += ` L ${px} ${py1000}`;
      }
    });
    terrainPathD += ` L ${scaleX(totalDist)} ${scaleY(0)} Z`;
  }

  const tickStep = yMaxAlt <= 8000 ? 1000 : 2000;
  const yTicks: number[] = [];
  for (let a = tickStep; a <= yMaxAlt; a += tickStep) {
    yTicks.push(a);
  }

  // Live Ownship Coordinates on the 2D Vertical Profile
  const liveAltFt =
    ownship?.altitudeMslFt ?? navSolution?.targetAltitudeFt ?? maxAltInRoute;
  const liveTerrainFt = navSolution?.estimatedTerrainElevFt ?? 0;
  const liveAglFt = Math.round(liveAltFt - liveTerrainFt);
  const liveX = scaleX(liveDistNm);
  const liveY = scaleY(liveAltFt);
  const liveTerrainY = scaleY(liveTerrainFt);

  // 2-Minute & 5-Minute Projected Vertical Trend Vector on Profile
  const gsKt = ownship?.groundSpeedKt ?? 100;
  const vsFpm = ownship?.verticalSpeedFpm ?? 0;
  const proj5MinDistNm = Math.min(totalDist, liveDistNm + (gsKt * 5) / 60);
  const proj5MinAltFt = Math.max(0, Math.min(yMaxAlt, liveAltFt + vsFpm * 5));
  const projX = scaleX(proj5MinDistNm);
  const projY = scaleY(proj5MinAltFt);

  // Radar look-ahead distance ruler ticks (+5, +10, +15, +20 NM ahead of nose)
  const radarAheadTicksNm = isRadarMode
    ? [5, 10, 15, 20].filter((offset) => liveDistNm + offset <= windowEndNm)
    : [];

  return (
    <div className="altitude-profile-container vsd-docked-shelf">
      <div className="vsd-shelf-header">
        <div className="vsd-shelf-left">
          <div className="vsd-hud-chips">
            {isFlightModeActive && (
              <div className="efb-card-mode-tabs" style={{ marginRight: '6px' }}>
                <button
                  type="button"
                  className={profileMode === 'radar' ? 'active' : ''}
                  onClick={() => setProfileMode('radar')}
                  title="SkyDemon-style Live Look-Ahead Virtual Radar (Next 25 NM ahead of nose)"
                >
                  📡 Live Radar (25 NM)
                </button>
                <button
                  type="button"
                  className={profileMode === 'full' ? 'active' : ''}
                  onClick={() => setProfileMode('full')}
                  title="Show entire route from Departure to Destination"
                >
                  🗺️ Full Route ({navLog.totalDistance.toFixed(0)} NM)
                </button>
              </div>
            )}

            {isFlightModeActive && ownship && (
              <span
                className="vsd-hud-chip"
                style={{
                  borderColor: '#10b981',
                  background: 'rgba(16, 185, 129, 0.14)',
                  color: '#6ee7b7',
                }}
              >
                <span className="chip-dim" style={{ color: '#34d399' }}>
                  ✈️ OWNSHIP
                </span>{' '}
                {liveAltFt.toLocaleString()} FT MSL (
                {liveAglFt >= 0 ? `+${liveAglFt.toLocaleString()}` : liveAglFt} FT
                AGL)
              </span>
            )}
            {terrainResult && (
              <>
                <span className="vsd-hud-chip">
                  <span className="chip-dim">PEAK TER</span>{' '}
                  {terrainResult.maxTerrainFt.toLocaleString()} FT
                </span>
                <span
                  className={`vsd-hud-chip ${
                    terrainResult.hasWarning ? 'chip-alert' : 'chip-safe'
                  }`}
                >
                  <span className="chip-dim">MIN CLR</span>{' '}
                  {terrainResult.minClearanceFt >= 0
                    ? `+${terrainResult.minClearanceFt.toLocaleString()}`
                    : terrainResult.minClearanceFt.toLocaleString()}{' '}
                  FT AGL {terrainResult.hasWarning ? '⚠️ LOW' : '· SAFE'}
                </span>
              </>
            )}
            <button
              type="button"
              className={`vsd-toggle-pill ${showAirspaceSlices ? 'active' : ''}`}
              onClick={() => setShowAirspaceSlices(!showAirspaceSlices)}
            >
              🛡️ Airspaces ({airspaceSlices.length})
            </button>
          </div>
        </div>
      </div>

      {terrainResult?.hasWarning && (
        <div className="profile-terrain-warning-banner">
          ⚠️ TERRAIN PROXIMITY ALERT: Route clearance drops to{' '}
          {terrainResult.minClearanceFt.toLocaleString()} ft AGL (&lt; 500 ft
          safety buffer). Verify Minimum Enroute Altitude (MEA).
        </div>
      )}

      <div
        className="profile-svg-wrapper"
        style={{ position: 'relative' }}
        onClick={() => {
          setSelectedPoint(null);
          setSelectedSlice(null);
        }}
      >
        {selectedPoint && (
          <div
            className="profile-floating-inspector"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="inspector-header">
              <div className="inspector-title">
                <span className="inspector-icon">⛰️</span>
                <span>Terrain Elevation &amp; Clearance</span>
              </div>
              <button
                type="button"
                className="inspector-close-btn"
                onClick={() => setSelectedPoint(null)}
              >
                ✕
              </button>
            </div>
            <div className="inspector-grid">
              <div className="inspector-cell">
                <span className="cell-label">ROUTE DIST</span>
                <span className="cell-value">
                  {selectedPoint.distNm.toFixed(1)} NM
                </span>
              </div>
              <div className="inspector-cell">
                <span className="cell-label">CRUISE ALT</span>
                <span className="cell-value">
                  {selectedPoint.cruiseAltFt.toLocaleString()} FT
                </span>
              </div>
              <div className="inspector-cell">
                <span className="cell-label">TERRAIN ELEV</span>
                <span className="cell-value">
                  {selectedPoint.elevationFt.toLocaleString()} FT
                </span>
              </div>
              <div
                className={`inspector-cell ${
                  selectedPoint.isWarning ? 'cell-alert' : 'cell-safe'
                }`}
              >
                <span className="cell-label">CLEARANCE</span>
                <span className="cell-value">
                  +{selectedPoint.clearanceFt.toLocaleString()} FT AGL
                </span>
              </div>
            </div>
          </div>
        )}

        {selectedSlice && (
          <div
            className="profile-floating-inspector"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="inspector-header">
              <div className="inspector-title">
                <span className="inspector-icon">🛡️</span>
                <span>{selectedSlice.airspace.name}</span>
              </div>
              <button
                type="button"
                className="inspector-close-btn"
                onClick={() => setSelectedSlice(null)}
              >
                ✕
              </button>
            </div>
            <div className="inspector-grid">
              <div className="inspector-cell">
                <span className="cell-label">TYPE &amp; CLASS</span>
                <span className="cell-value">
                  {selectedSlice.airspace.type} · Class{' '}
                  {selectedSlice.airspace.classification}
                </span>
              </div>
              <div className="inspector-cell">
                <span className="cell-label">LIMITS</span>
                <span className="cell-value">
                  {selectedSlice.airspace.lowerLimitLabel} —{' '}
                  {selectedSlice.airspace.upperLimitLabel}
                </span>
              </div>
              <div className="inspector-cell">
                <span className="cell-label">SECTOR DIST</span>
                <span className="cell-value">
                  {selectedSlice.startDistNm.toFixed(1)} to{' '}
                  {selectedSlice.endDistNm.toFixed(1)} NM
                </span>
              </div>
              {selectedSlice.airspace.frequency && (
                <div className="inspector-cell">
                  <span className="cell-label">ATC FREQUENCY</span>
                  <span className="cell-value val-accent">
                    {selectedSlice.airspace.frequency}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <svg viewBox={`0 0 ${width} ${height}`} className="altitude-profile-svg">
          <defs>
            <linearGradient id="terrainGradientPlus" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#475569" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0.98" />
            </linearGradient>
            <clipPath id="vsd-plot-viewport-clip">
              <rect
                x={paddingLeft}
                y={paddingTop - 8}
                width={chartWidth}
                height={chartHeight + 12}
              />
            </clipPath>
          </defs>

          {yTicks.map((alt) => {
            const y = scaleY(alt);
            return (
              <g key={alt} className="grid-line-group">
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  className="profile-grid-line"
                />
                <text
                  x={paddingLeft - 10}
                  y={y + 4}
                  className="profile-axis-text-y"
                >
                  {alt >= 10000 ? `FL${alt / 100}` : alt.toLocaleString()}
                </text>
              </g>
            );
          })}

          <text
            x={paddingLeft - 10}
            y={paddingTop - 10}
            className="profile-axis-unit-label"
          >
            FT MSL
          </text>

          {/* Clipped Plot Viewport for Smooth SkyDemon Radar Scrolling */}
          <g clipPath="url(#vsd-plot-viewport-clip)">
            {/* Airspace Cross-Section Slices */}
            {showAirspaceSlices &&
              visibleAirspaceSlices.map((slice, sIdx) => {
                const startX = Math.max(paddingLeft, scaleX(slice.startDistNm));
                const endX = Math.min(width - paddingRight, scaleX(slice.endDistNm));
                const rectWidth = Math.max(6, endX - startX);
                const clampedUpper = Math.min(slice.upperLimitFt, yMaxAlt);
                const yTop = scaleY(clampedUpper);
                const yBottom = scaleY(Math.max(0, slice.lowerLimitFt));
                const rectHeight = Math.max(6, yBottom - yTop);
                const isSelected =
                  selectedSlice?.airspace.id === slice.airspace.id;

                let fillColor = 'rgba(56, 189, 248, 0.12)';
                let strokeColor = '#38bdf8';

                if (slice.airspace.type === 'TMA') {
                  fillColor = 'rgba(168, 85, 247, 0.13)';
                  strokeColor = '#a855f7';
                } else if (
                  slice.airspace.type === 'RESTRICTED' ||
                  slice.airspace.type === 'PROHIBITED'
                ) {
                  fillColor = 'rgba(239, 68, 68, 0.22)';
                  strokeColor = '#ef4444';
                } else if (slice.airspace.type === 'DANGER') {
                  fillColor = 'rgba(245, 158, 11, 0.16)';
                  strokeColor = '#f59e0b';
                }

                if (slice.status === 'PENETRATING') {
                  fillColor = 'rgba(249, 115, 22, 0.28)';
                  strokeColor = '#f97316';
                }

                const titleText = getSliceShortName(
                  slice.airspace.name,
                  rectWidth
                );

                return (
                  <g
                    key={`${slice.airspace.id}-${sIdx}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSlice(slice);
                      setSelectedPoint(null);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect
                      x={startX}
                      y={yTop}
                      width={rectWidth}
                      height={rectHeight}
                      fill={isSelected ? 'rgba(56, 189, 248, 0.28)' : fillColor}
                      stroke={strokeColor}
                      strokeWidth={isSelected ? 3 : 1.5}
                      rx={3}
                    />
                    {titleText && (
                      <text
                        x={startX + 6}
                        y={yTop + 15}
                        fill={strokeColor}
                        fontSize="11.5"
                        fontFamily="var(--font-mono, monospace)"
                        fontWeight="bold"
                      >
                        {titleText} ({slice.airspace.lowerLimitLabel}–{slice.airspace.upperLimitLabel})
                      </text>
                    )}
                  </g>
                );
              })}

            {/* Terrain Layer + 500ft / 1000ft AGL Safety Contour Ribbons */}
            {terrainPathD && (
              <g className="profile-terrain-layer">
                <path d={terrainPathD} fill="url(#terrainGradientPlus)" />
                {/* 1000 ft AGL Caution Contour Line */}
                <path
                  d={caution1000RibbonD}
                  fill="none"
                  stroke="rgba(245, 158, 11, 0.35)"
                  strokeWidth="1.2"
                  strokeDasharray="4, 4"
                />
                {/* 500 ft AGL Danger Contour Line */}
                <path
                  d={danger500RibbonD}
                  fill="none"
                  stroke="rgba(239, 68, 68, 0.55)"
                  strokeWidth="1.4"
                  strokeDasharray="3, 3"
                />
                <path
                  d={terrainRidgeD}
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="2.5"
                />
                {terrainResult?.samples.map((p, pIdx) => {
                  const px = scaleX(p.distNm);
                  const py = scaleY(p.elevationFt);
                  return (
                    <g
                      key={`tp-${pIdx}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPoint(p);
                        setSelectedSlice(null);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <circle cx={px} cy={py} r={10} fill="transparent" />
                      <circle
                        cx={px}
                        cy={py}
                        r={p.isWarning ? 4 : 2.5}
                        fill={p.isWarning ? '#ef4444' : '#64748b'}
                      />
                    </g>
                  );
                })}
              </g>
            )}

            {/* Waypoint Vertical Drop Lines */}
            {waypointPoints.map((wpt, idx) => (
              <line
                key={`drop-${idx}`}
                x1={wpt.x}
                y1={scaleY(wpt.alt)}
                x2={wpt.x}
                y2={scaleY(0)}
                stroke="rgba(148, 163, 184, 0.32)"
                strokeDasharray="4, 4"
                strokeWidth="1.5"
              />
            ))}

            {/* Planned Flight Trajectory Segments */}
            {navLog.legs.map((leg, idx) => {
              const startDist =
                idx === 0
                  ? 0
                  : navLog.legs
                      .slice(0, idx)
                      .reduce((acc, l) => acc + l.distance, 0);
              const endDist = startDist + leg.distance;
              const startX = scaleX(startDist);
              const endX = scaleX(endDist);
              const legY = scaleY(leg.altitude);
              const isActive = activeLegIndex === idx;
              const midX = ( Math.max(paddingLeft, startX) + Math.min(width - paddingRight, endX) ) / 2;

              return (
                <g
                  key={leg.id}
                  className={`profile-leg-segment ${isActive ? 'active' : ''}`}
                  onClick={() => onSelectLeg(idx)}
                >
                  <line
                    x1={startX}
                    y1={legY}
                    x2={endX}
                    y2={legY}
                    className={`profile-cruise-line ${isActive ? 'active' : ''}`}
                  />
                  {endX - startX > 55 && (
                    <>
                      <rect
                        x={midX - 38}
                        y={legY - 22}
                        width={76}
                        height={20}
                        rx={4}
                        className={`profile-alt-badge-bg ${isActive ? 'active' : ''}`}
                      />
                      <text
                        x={midX}
                        y={legY - 7}
                        className={`profile-alt-badge-text ${isActive ? 'active' : ''}`}
                      >
                        {leg.altitude.toLocaleString()} FT
                      </text>
                    </>
                  )}
                </g>
              );
            })}

            {/* ─── LIVE IN-FLIGHT OWNSHIP & 5-MINUTE VERTICAL TREND VECTOR ─── */}
            {isFlightModeActive && ownship && (
              <g className="plus-vsd-live-ownship">
                {/* Vertical AGL Clearance Bracket down to Terrain */}
                <line
                  x1={liveX}
                  y1={liveY}
                  x2={liveX}
                  y2={liveTerrainY}
                  stroke={liveAglFt < 500 ? '#ef4444' : '#10b981'}
                  strokeWidth="2"
                  strokeDasharray="3, 3"
                />
                <circle
                  cx={liveX}
                  cy={liveTerrainY}
                  r={4}
                  fill={liveAglFt < 500 ? '#ef4444' : '#10b981'}
                />

                {/* 5-Minute Projected Vertical Trend Vector */}
                <line
                  x1={liveX}
                  y1={liveY}
                  x2={projX}
                  y2={projY}
                  stroke="#22d3ee"
                  strokeWidth="2.8"
                  strokeDasharray="5, 3"
                />
                <circle cx={projX} cy={projY} r={4} fill="#22d3ee" />

                {/* Live Ownship Aircraft Marker Circle & Badge */}
                <circle
                  cx={liveX}
                  cy={liveY}
                  r={8}
                  fill="#10b981"
                  stroke="#090d16"
                  strokeWidth="2"
                />
                <rect
                  x={Math.min(
                    width - paddingRight - 140,
                    Math.max(paddingLeft + 4, liveX - 65)
                  )}
                  y={Math.max(paddingTop + 4, liveY - 36)}
                  width={140}
                  height={22}
                  rx={4}
                  fill="#064e3b"
                  stroke="#10b981"
                  strokeWidth="1.5"
                />
                <text
                  x={Math.min(
                    width - paddingRight - 70,
                    Math.max(paddingLeft + 74, liveX)
                  )}
                  y={Math.max(paddingTop + 19, liveY - 21)}
                  textAnchor="middle"
                  fill="#ecfdf5"
                  fontSize="11"
                  fontWeight="bold"
                  fontFamily="var(--font-mono, monospace)"
                >
                  ✈️ {liveAltFt.toLocaleString()} FT ({liveAglFt >= 0 ? `+${liveAglFt}` : liveAglFt} AGL)
                </text>
              </g>
            )}
          </g>

          {/* Ground Line */}
          <line
            x1={paddingLeft}
            y1={scaleY(0)}
            x2={width - paddingRight}
            y2={scaleY(0)}
            className="profile-ground-line"
          />

          {/* Radar Look-Ahead Distance Ruler Ticks (+5, +10, +15, +20 NM) */}
          {radarAheadTicksNm.map((offsetNm) => {
            const tx = scaleX(liveDistNm + offsetNm);
            if (tx < paddingLeft || tx > width - paddingRight) return null;
            return (
              <g key={`radar-tick-${offsetNm}`}>
                <line
                  x1={tx}
                  y1={scaleY(0)}
                  x2={tx}
                  y2={scaleY(0) + 8}
                  stroke="#22d3ee"
                  strokeWidth="1.5"
                />
                <text
                  x={tx}
                  y={scaleY(0) + 21}
                  textAnchor="middle"
                  fill="#22d3ee"
                  fontSize="10"
                  fontFamily="var(--font-mono, monospace)"
                  fontWeight="bold"
                >
                  +{offsetNm} NM
                </text>
              </g>
            );
          })}

          {/* Waypoint Ticks at Ground */}
          {waypointPoints
            .filter((w) => w.dist >= windowStartNm && w.dist <= windowEndNm)
            .map((wpt, idx) => (
              <g key={`ground-tick-${idx}`} className="waypoint-tick-group">
                <line
                  x1={wpt.x}
                  y1={scaleY(0)}
                  x2={wpt.x}
                  y2={scaleY(0) + 10}
                  className="wpt-tick-line"
                />
                <circle
                  cx={wpt.x}
                  cy={scaleY(0)}
                  r={3.5}
                  className="wpt-tick-dot"
                />
                <text x={wpt.x} y={scaleY(0) + 24} className="wpt-tick-ident">
                  {wpt.ident}
                </text>
                <text x={wpt.x} y={scaleY(0) + 40} className="wpt-tick-dist">
                  {wpt.dist.toFixed(0)} NM
                </text>
              </g>
            ))}
        </svg>
      </div>
    </div>
  );
};
