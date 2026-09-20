import React, { useState, useMemo, useEffect } from 'react';
import { NavLogSummary } from '../types';
import { computeAirspaceProfileSlices, AirspaceVerticalSlice } from '../engine/airspace-engine';
import { AirspaceFilterType } from './RouteMap';
import { fetchTerrainProfile, TerrainProfileResult, TerrainSamplePoint } from '../engine/terrain-engine';

export interface AltitudeProfileProps {
  navLog: NavLogSummary;
  activeLegIndex: number | null;
  onSelectLeg: (idx: number) => void;
  showAirspaces?: boolean;
  onToggleShowAirspaces?: (show: boolean) => void;
  airspaceFilter?: AirspaceFilterType;
  onlyRouteAirspaces?: boolean;
}

/**
 * 2D Vertical Altitude Profile (Side-view Cross Section)
 * Renders an SVG chart displaying route distance vs cruise altitude profile,
 * with real-time 3D controlled airspace penetration cross-sections and
 * digital elevation terrain profiling.
 */
function getSliceShortName(name: string, w: number): string {
  if (w < 45) return '';
  if (w < 85) {
    const m = name.match(/SECTOR\s*(\w+)/i);
    if (m) return `S${m[1]}`;
    if (name.includes('CTR')) return 'CTR';
    return name.slice(0, 5);
  }
  if (w < 150) {
    return name.replace(/LISBOA\s*TMA\s*SECTOR/i, 'TMA S').replace('PORTUGAL', '').trim();
  }
  return name;
}

export const AltitudeProfile: React.FC<AltitudeProfileProps> = ({
  navLog,
  activeLegIndex,
  onSelectLeg,
  showAirspaces: externalShowAirspaces,
  onToggleShowAirspaces,
  airspaceFilter = 'ALL',
}) => {
  if (!navLog || navLog.legs.length === 0) return null;

  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  const [internalShowAirspaces, setInternalShowAirspaces] = useState<boolean>(true);
  const showAirspaceSlices =
    externalShowAirspaces !== undefined ? externalShowAirspaces : internalShowAirspaces;
  const setShowAirspaceSlices = onToggleShowAirspaces || setInternalShowAirspaces;

  const [showTerrain, setShowTerrain] = useState<boolean>(true);
  const [terrainResult, setTerrainResult] = useState<TerrainProfileResult | null>(null);
  const [isTerrainLoading, setIsTerrainLoading] = useState<boolean>(false);
  const [selectedPoint, setSelectedPoint] = useState<TerrainSamplePoint | null>(null);
  const [selectedSlice, setSelectedSlice] = useState<AirspaceVerticalSlice | null>(null);

  const width = 960;
  const height = 360;
  const paddingLeft = 75;
  const paddingRight = 45;
  const paddingTop = 36;
  const paddingBottom = 58;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const totalDist = Math.max(1, navLog.totalDistance);

  // Fetch terrain digital elevation profile
  useEffect(() => {
    let isMounted = true;
    setIsTerrainLoading(true);
    fetchTerrainProfile(navLog.legs)
      .then((res) => {
        if (isMounted) setTerrainResult(res);
      })
      .catch((err) => {
        console.warn('Failed to load terrain profile:', err);
      })
      .finally(() => {
        if (isMounted) setIsTerrainLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [navLog.legs]);

  // Compute 2D vertical airspace slices
  const allAirspaceSlices = useMemo(() => {
    return computeAirspaceProfileSlices(navLog.legs);
  }, [navLog.legs]);

  // Filter slices based on shared airspaceFilter
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

  // VFR Altitude Envelope Scaling:
  // Strictly driven by planned flight altitudes and terrain elevation along the route.
  // We do NOT scale up to high-altitude TMA ceilings (FL145/FL245), ensuring the VFR
  // trajectory and terrain clearance are prominent, large, and readable.
  const maxAltInRoute = Math.max(...navLog.legs.map((l) => l.altitude), 2000);
  const maxTerrainInRoute = showTerrain && terrainResult ? terrainResult.maxTerrainFt : 0;
  const flightCeiling = Math.max(maxAltInRoute, maxTerrainInRoute);
  const yMaxAlt = Math.max(4000, Math.ceil((flightCeiling + 1800) / 1000) * 1000);

  // Filter slices to those that enter our visible VFR vertical window (floor < yMaxAlt)
  const visibleAirspaceSlices = useMemo(() => {
    return airspaceSlices.filter((s) => s.lowerLimitFt < yMaxAlt);
  }, [airspaceSlices, yMaxAlt]);

  const scaleX = (dist: number) => paddingLeft + (dist / totalDist) * chartWidth;
  const scaleY = (alt: number) => paddingTop + chartHeight - (alt / yMaxAlt) * chartHeight;

  // Compute waypoint positions along route
  let cumulative = 0;
  const waypointPoints: { ident: string; dist: number; x: number; alt: number }[] = [];

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

  // Build SVG path for terrain elevation profile
  let terrainPathD = '';
  let terrainRidgeD = '';
  if (showTerrain && terrainResult && terrainResult.samples.length > 0) {
    terrainPathD = `M ${scaleX(0)} ${scaleY(0)}`;
    terrainResult.samples.forEach((p, idx) => {
      const px = scaleX(p.distNm);
      const py = scaleY(p.elevationFt);
      terrainPathD += ` L ${px} ${py}`;
      if (idx === 0) {
        terrainRidgeD = `M ${px} ${py}`;
      } else {
        terrainRidgeD += ` L ${px} ${py}`;
      }
    });
    terrainPathD += ` L ${scaleX(totalDist)} ${scaleY(0)} Z`;
  }

  // Grid lines for Y axis (every 1,000 ft up to 8,000 ft, every 2,000 ft above)
  const tickStep = yMaxAlt <= 8000 ? 1000 : 2000;
  const yTicks: number[] = [];
  for (let a = tickStep; a <= yMaxAlt; a += tickStep) {
    yTicks.push(a);
  }

  return (
    <div className={`altitude-profile-container vsd-docked-shelf ${isCollapsed ? 'is-collapsed' : ''}`}>
      {/* Avionics Telemetry HUD Ribbon */}
      <div className="vsd-shelf-header">
        <div className="vsd-shelf-left">
          <button
            type="button"
            className="vsd-collapse-btn"
            onClick={() => setIsCollapsed((prev) => !prev)}
            title={isCollapsed ? 'Expand Vertical Situation Display' : 'Collapse Vertical Situation Display'}
          >
            <span className="vsd-shelf-icon">✈</span>
            <span className="vsd-shelf-title">VSD Profile</span>
            <span className="vsd-shelf-caret">{isCollapsed ? '▲' : '▼'}</span>
          </button>

          <div className="vsd-hud-chips">
            <span className="vsd-hud-chip" title="Total Route Distance">
              <span className="chip-dim">DIST</span> {navLog.totalDistance.toFixed(1)} NM
            </span>
            <span className="vsd-hud-chip" title="Max Planned Cruise Altitude">
              <span className="chip-dim">CRZ</span> {maxAltInRoute.toLocaleString()} FT
            </span>
            {showTerrain && terrainResult && (
              <>
                <span className="vsd-hud-chip" title="Peak Terrain Elevation along Route">
                  <span className="chip-dim">PEAK TER</span> {terrainResult.maxTerrainFt.toLocaleString()} FT
                </span>
                <span
                  className={`vsd-hud-chip ${terrainResult.hasWarning ? 'chip-alert' : 'chip-safe'}`}
                  title="Minimum Clearance Above Terrain"
                >
                  <span className="chip-dim">MIN CLR</span>{' '}
                  {terrainResult.minClearanceFt >= 0
                    ? `+${terrainResult.minClearanceFt.toLocaleString()}`
                    : terrainResult.minClearanceFt.toLocaleString()}{' '}
                  FT AGL {terrainResult.hasWarning ? '⚠️ LOW' : '· SAFE'}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="vsd-shelf-controls">
          <button
            type="button"
            className={`vsd-toggle-pill ${showTerrain ? 'active' : ''}`}
            onClick={() => setShowTerrain((prev) => !prev)}
            title="Toggle Digital Elevation Terrain Profile"
          >
            ⛰️ Terrain{isTerrainLoading ? '...' : ''}
          </button>
          <button
            type="button"
            className={`vsd-toggle-pill ${showAirspaceSlices ? 'active' : ''}`}
            onClick={() => setShowAirspaceSlices(!showAirspaceSlices)}
            title="Toggle 2D Airspace Penetration Slices"
          >
            🛡️ Airspaces ({airspaceSlices.length})
          </button>
        </div>
      </div>

      {/* When expanded: Warnings, Floating Popover, and SVG Canvas */}
      {!isCollapsed && (
        <>
          {showTerrain && terrainResult?.hasWarning && (
            <div className="profile-terrain-warning-banner">
              ⚠️ TERRAIN PROXIMITY ALERT: Route clearance drops to {terrainResult.minClearanceFt.toLocaleString()} ft AGL (&lt; 500 ft safety buffer). Verify Minimum Enroute Altitude (MEA).
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
            {/* Clean Floating Inspector Popover (Zero Layout Shift) */}
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
                    title="Close Inspector"
                  >
                    ✕
                  </button>
                </div>

                <div className="inspector-grid">
                  <div className="inspector-cell">
                    <span className="cell-label">ROUTE DIST</span>
                    <span className="cell-value">{selectedPoint.distNm.toFixed(1)} NM</span>
                  </div>
                  <div className="inspector-cell">
                    <span className="cell-label">CRUISE ALT</span>
                    <span className="cell-value">{selectedPoint.cruiseAltFt.toLocaleString()} FT</span>
                  </div>
                  <div className="inspector-cell">
                    <span className="cell-label">TERRAIN ELEV</span>
                    <span className="cell-value">{selectedPoint.elevationFt.toLocaleString()} FT</span>
                  </div>
                  <div className={`inspector-cell ${selectedPoint.isWarning ? 'cell-alert' : 'cell-safe'}`}>
                    <span className="cell-label">CLEARANCE</span>
                    <span className="cell-value">
                      {selectedPoint.clearanceFt >= 0
                        ? `+${selectedPoint.clearanceFt.toLocaleString()}`
                        : selectedPoint.clearanceFt.toLocaleString()}{' '}
                      FT AGL {selectedPoint.isWarning ? '⚠️ LOW' : '✓ SAFE'}
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
                    title="Close Inspector"
                  >
                    ✕
                  </button>
                </div>

                <div className="inspector-grid">
                  <div className="inspector-cell">
                    <span className="cell-label">TYPE &amp; CLASS</span>
                    <span className="cell-value">
                      {selectedSlice.airspace.type} · Class {selectedSlice.airspace.classification}
                    </span>
                  </div>
                  <div className="inspector-cell">
                    <span className="cell-label">LIMITS</span>
                    <span className="cell-value">
                      {selectedSlice.airspace.lowerLimitLabel} — {selectedSlice.airspace.upperLimitLabel}
                    </span>
                  </div>
                  <div className="inspector-cell">
                    <span className="cell-label">SECTOR DIST</span>
                    <span className="cell-value">
                      {selectedSlice.startDistNm.toFixed(1)} to {selectedSlice.endDistNm.toFixed(1)} NM
                    </span>
                  </div>
                  {selectedSlice.airspace.frequency && (
                    <div className="inspector-cell">
                      <span className="cell-label">ATC FREQUENCY</span>
                      <span className="cell-value val-accent">{selectedSlice.airspace.frequency}</span>
                    </div>
                  )}
                  <div
                    className={`inspector-cell cell-wide ${
                      selectedSlice.status === 'PENETRATING' ? 'cell-alert' : 'cell-safe'
                    }`}
                  >
                    <span className="cell-label">STATUS</span>
                    <span className="cell-value">
                      {selectedSlice.status === 'PENETRATING'
                        ? `⚠️ Penetrating at cruise altitude (${selectedSlice.legAltitudeFt} FT) — Clearance Required`
                        : `✓ Clear of airspace floor (cruising at ${selectedSlice.legAltitudeFt} FT)`}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <svg viewBox={`0 0 ${width} ${height}`} className="altitude-profile-svg">
              <defs>
                <linearGradient id="terrainGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#334155" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#0a0f1d" stopOpacity="0.98" />
                </linearGradient>
                <filter id="cyanGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#38bdf8" floodOpacity="0.8" />
                </filter>
                {visibleAirspaceSlices.map((slice, sIdx) => {
                  const sX = scaleX(slice.startDistNm);
                  const eX = scaleX(slice.endDistNm);
                  const rW = Math.max(6, eX - sX);
                  const cU = Math.min(slice.upperLimitFt, yMaxAlt);
                  const yT = scaleY(cU);
                  const yB = scaleY(Math.max(0, slice.lowerLimitFt));
                  return (
                    <clipPath key={`clip-${sIdx}`} id={`clip-as-${sIdx}`}>
                      <rect x={sX + 2} y={yT} width={Math.max(0, rW - 4)} height={Math.max(4, yB - yT)} />
                    </clipPath>
                  );
                })}
              </defs>

              {/* Background Altitude Grid Lines */}
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
                    <text x={paddingLeft - 10} y={y + 4} className="profile-axis-text-y">
                      {alt >= 10000 ? `FL${alt / 100}` : alt.toLocaleString()}
                    </text>
                  </g>
                );
              })}

              {/* Y-axis Unit Header */}
              <text x={paddingLeft - 10} y={paddingTop - 12} className="profile-axis-unit-label">
                FT MSL
              </text>

              {/* Airspace Cross-Section Slices */}
              {showAirspaceSlices &&
                visibleAirspaceSlices.map((slice, sIdx) => {
                  const startX = scaleX(slice.startDistNm);
                  const endX = scaleX(slice.endDistNm);
                  const rectWidth = Math.max(6, endX - startX);
                  const isCappedAtTop = slice.upperLimitFt > yMaxAlt;
                  const clampedUpper = Math.min(slice.upperLimitFt, yMaxAlt);
                  const yTop = scaleY(clampedUpper);
                  const yBottom = scaleY(Math.max(0, slice.lowerLimitFt));
                  const rectHeight = Math.max(6, yBottom - yTop);
                  const isSelected = selectedSlice?.airspace.id === slice.airspace.id;

                  let fillColor = 'rgba(59, 130, 246, 0.08)';
                  let strokeColor = '#3b82f6';
                  let strokeDash: string | undefined = '4,3';

                  if (slice.airspace.type === 'TMA') {
                    fillColor = 'rgba(168, 85, 247, 0.09)';
                    strokeColor = '#a855f7';
                  } else if (
                    slice.airspace.type === 'RESTRICTED' ||
                    slice.airspace.type === 'PROHIBITED'
                  ) {
                    fillColor = 'rgba(239, 68, 68, 0.18)';
                    strokeColor = '#ef4444';
                    strokeDash = '5,2';
                  } else if (slice.airspace.type === 'DANGER') {
                    fillColor = 'rgba(245, 158, 11, 0.14)';
                    strokeColor = '#f59e0b';
                    strokeDash = '5,2';
                  } else if (slice.airspace.type === 'ATZ') {
                    fillColor = 'rgba(20, 184, 166, 0.12)';
                    strokeColor = '#14b8a6';
                  }

                  if (slice.status === 'PENETRATING') {
                    fillColor =
                      slice.airspace.type === 'RESTRICTED' || slice.airspace.type === 'PROHIBITED'
                        ? 'rgba(239, 68, 68, 0.32)'
                        : 'rgba(249, 115, 22, 0.24)';
                    strokeColor = '#f97316';
                    strokeDash = undefined;
                  }

                  if (isSelected) {
                    strokeColor = '#38bdf8';
                    strokeDash = undefined;
                  }

                  const titleText = getSliceShortName(slice.airspace.name, rectWidth);

                  return (
                    <g
                      key={`${slice.airspace.id}-${sIdx}`}
                      className={`profile-airspace-slice ${isSelected ? 'is-selected' : ''}`}
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
                        fill={isSelected ? 'rgba(56, 189, 248, 0.22)' : fillColor}
                        stroke={strokeColor}
                        strokeWidth={isSelected ? 3 : slice.status === 'PENETRATING' ? 2 : 1.5}
                        strokeDasharray={strokeDash}
                        rx={3}
                      />
                      {isCappedAtTop && (
                        <line
                          x1={startX}
                          y1={yTop}
                          x2={startX + rectWidth}
                          y2={yTop}
                          stroke={strokeColor}
                          strokeWidth="2.5"
                          strokeDasharray="3,3"
                        />
                      )}
                      {titleText && (
                        <text
                          x={startX + 6}
                          y={yTop + 16}
                          fill={isSelected ? '#ffffff' : strokeColor}
                          fontSize="12"
                          fontFamily="var(--font-mono, monospace)"
                          fontWeight="bold"
                          clipPath={`url(#clip-as-${sIdx})`}
                        >
                          {titleText}
                          {isCappedAtTop && rectWidth >= 160 && ` (▲ ${slice.airspace.upperLimitLabel})`}
                        </text>
                      )}
                      {rectWidth > 45 && rectHeight > 36 && (
                        <text
                          x={startX + 6}
                          y={yBottom - 7}
                          fill="#cbd5e1"
                          fontSize="11"
                          fontFamily="var(--font-mono, monospace)"
                          fontWeight="600"
                          clipPath={`url(#clip-as-${sIdx})`}
                        >
                          FLR: {slice.airspace.lowerLimitLabel}
                        </text>
                      )}
                    </g>
                  );
                })}

              {/* Digital Elevation Topographic Terrain Layer */}
              {showTerrain && terrainPathD && (
                <g className="profile-terrain-layer">
                  <path d={terrainPathD} fill="url(#terrainGradient)" />
                  <path
                    d={terrainRidgeD}
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth="2.5"
                  />
                  {terrainResult?.samples.map((p, pIdx) => {
                    const px = scaleX(p.distNm);
                    const py = scaleY(p.elevationFt);
                    const isSelected = selectedPoint?.distNm === p.distNm;

                    return (
                      <g
                        key={`tp-${pIdx}`}
                        className="profile-terrain-sample"
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
                          r={isSelected ? 5.5 : p.isWarning ? 4 : 2.5}
                          fill={isSelected ? '#38bdf8' : p.isWarning ? '#ef4444' : '#64748b'}
                          stroke={isSelected ? '#ffffff' : p.isWarning ? '#ffffff' : 'none'}
                          strokeWidth={isSelected ? 2 : 1}
                        />
                      </g>
                    );
                  })}
                </g>
              )}

              {/* Selected Terrain Point Clearance Measurement Bracket */}
              {selectedPoint && (
                <g className="selected-terrain-indicator">
                  <line
                    x1={scaleX(selectedPoint.distNm)}
                    y1={scaleY(selectedPoint.elevationFt)}
                    x2={scaleX(selectedPoint.distNm)}
                    y2={scaleY(selectedPoint.cruiseAltFt)}
                    stroke="#38bdf8"
                    strokeWidth="2"
                    strokeDasharray="4, 3"
                  />
                  <circle
                    cx={scaleX(selectedPoint.distNm)}
                    cy={scaleY(selectedPoint.elevationFt)}
                    r={9}
                    stroke="#38bdf8"
                    strokeWidth="2"
                    fill="#0284c7"
                    fillOpacity="0.4"
                  />
                  <circle
                    cx={scaleX(selectedPoint.distNm)}
                    cy={scaleY(selectedPoint.cruiseAltFt)}
                    r={5}
                    fill="#38bdf8"
                    stroke="#090d16"
                    strokeWidth="1.5"
                  />
                </g>
              )}

              {/* Base Ground Line */}
              <line
                x1={paddingLeft}
                y1={scaleY(0)}
                x2={width - paddingRight}
                y2={scaleY(0)}
                className="profile-ground-line"
              />

              {/* Waypoint Vertical Drop Lines */}
              {waypointPoints.map((wpt, idx) => (
                <line
                  key={`drop-${idx}`}
                  x1={wpt.x}
                  y1={scaleY(wpt.alt)}
                  x2={wpt.x}
                  y2={scaleY(0)}
                  stroke="rgba(148, 163, 184, 0.3)"
                  strokeDasharray="4, 4"
                  strokeWidth="1.5"
                />
              ))}

              {/* Flight Trajectory Segments & Altitude Badges */}
              {navLog.legs.map((leg, idx) => {
                const startDist =
                  idx === 0 ? 0 : navLog.legs.slice(0, idx).reduce((acc, l) => acc + l.distance, 0);
                const startX = scaleX(startDist);
                const endX = scaleX(startDist + leg.distance);
                const legY = scaleY(leg.altitude);
                const isActive = activeLegIndex === idx;

                // If previous leg had different altitude, draw step-climb/descent connector
                let stepConnector = null;
                if (idx > 0) {
                  const prevAlt = navLog.legs[idx - 1].altitude;
                  if (prevAlt !== leg.altitude) {
                    const prevY = scaleY(prevAlt);
                    stepConnector = (
                      <line
                        x1={startX}
                        y1={prevY}
                        x2={startX}
                        y2={legY}
                        className={`profile-cruise-line ${isActive ? 'active' : ''}`}
                        strokeWidth={isActive ? 5 : 3.5}
                      />
                    );
                  }
                }

                return (
                  <g
                    key={leg.id}
                    className={`profile-leg-segment ${isActive ? 'active' : ''}`}
                    onClick={() => onSelectLeg(idx)}
                  >
                    {stepConnector}

                    {/* Flight Path Instrument Line */}
                    <line
                      x1={startX}
                      y1={legY}
                      x2={endX}
                      y2={legY}
                      className={`profile-cruise-line ${isActive ? 'active' : ''}`}
                      filter={isActive ? 'url(#cyanGlow)' : undefined}
                    />

                    {/* Altitude Pill above line */}
                    <rect
                      x={(startX + endX) / 2 - 38}
                      y={legY - 22}
                      width={76}
                      height={20}
                      rx={4}
                      className={`profile-alt-badge-bg ${isActive ? 'active' : ''}`}
                    />
                    <text
                      x={(startX + endX) / 2}
                      y={legY - 7}
                      className={`profile-alt-badge-text ${isActive ? 'active' : ''}`}
                    >
                      {leg.altitude.toLocaleString()} FT
                    </text>
                  </g>
                );
              })}

              {/* Waypoint Diamond Markers at Flight Alt */}
              {waypointPoints.map((wpt, idx) => {
                const y = scaleY(wpt.alt);
                return (
                  <polygon
                    key={`wpt-diamond-${idx}`}
                    points={`${wpt.x},${y - 6.5} ${wpt.x + 6.5},${y} ${wpt.x},${y + 6.5} ${wpt.x - 6.5},${y}`}
                    fill="#38bdf8"
                    stroke="#090d16"
                    strokeWidth="2"
                  />
                );
              })}

              {/* Waypoint Ticks and Labels at Ground */}
              {waypointPoints.map((wpt, idx) => (
                <g key={`ground-tick-${idx}`} className="waypoint-tick-group">
                  <line
                    x1={wpt.x}
                    y1={scaleY(0)}
                    x2={wpt.x}
                    y2={scaleY(0) + 10}
                    className="wpt-tick-line"
                  />
                  <circle cx={wpt.x} cy={scaleY(0)} r={3.5} className="wpt-tick-dot" />
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
        </>
      )}
    </div>
  );
};
