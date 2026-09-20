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
  const [hoveredPoint, setHoveredPoint] = useState<TerrainSamplePoint | null>(null);
  const [hoveredSlice, setHoveredSlice] = useState<AirspaceVerticalSlice | null>(null);

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

      {/* When expanded: Warnings, Tooltip Cards, and SVG Canvas */}
      {!isCollapsed && (
        <>
          {showTerrain && terrainResult?.hasWarning && (
            <div className="profile-terrain-warning-banner">
              ⚠️ TERRAIN PROXIMITY ALERT: Route clearance drops to {terrainResult.minClearanceFt.toLocaleString()} ft AGL (&lt; 500 ft safety buffer). Verify Minimum Enroute Altitude (MEA).
            </div>
          )}

          {hoveredPoint && (
            <div className="profile-airspace-hover-card">
              <div className="hover-card-title">
                ⛰️ <strong>Terrain Elevation &amp; Clearance</strong>
              </div>
              <div className="hover-card-limits">
                Route Dist: <strong>{hoveredPoint.distNm.toFixed(1)} NM</strong> • Cruise: <strong>{hoveredPoint.cruiseAltFt.toLocaleString()} ft MSL</strong>
              </div>
              <div className="hover-card-limits">
                Terrain Elevation: <strong>{hoveredPoint.elevationFt.toLocaleString()} ft MSL</strong>
              </div>
              <div className={`hover-card-status ${hoveredPoint.isWarning ? 'alert-pen' : ''}`}>
                Clearance: <strong>{hoveredPoint.clearanceFt >= 0 ? `+${hoveredPoint.clearanceFt.toLocaleString()}` : hoveredPoint.clearanceFt.toLocaleString()} ft AGL</strong>
                {hoveredPoint.isWarning && ' (⚠️ LOW CLEARANCE)'}
              </div>
            </div>
          )}

          {hoveredSlice && (
            <div className="profile-airspace-hover-card">
              <div className="hover-card-title">
                <strong>{hoveredSlice.airspace.name}</strong> ({hoveredSlice.airspace.type} · Class {hoveredSlice.airspace.classification})
              </div>
              <div className="hover-card-limits">
                Limits: <strong>{hoveredSlice.airspace.lowerLimitLabel} — {hoveredSlice.airspace.upperLimitLabel}</strong> • Route Dist: {hoveredSlice.startDistNm} to {hoveredSlice.endDistNm} NM
              </div>
              {hoveredSlice.airspace.frequency && (
                <div className="hover-card-freq">
                  ATC: <strong>{hoveredSlice.airspace.frequency}</strong>
                </div>
              )}
              {hoveredSlice.status === 'PENETRATING' && (
                <div className="hover-card-status alert-pen">
                  ⚠️ Penetrating at cruise altitude {hoveredSlice.legAltitudeFt} ft MSL
                </div>
              )}
            </div>
          )}

          <div className="profile-svg-wrapper">
            <svg viewBox={`0 0 ${width} ${height}`} className="altitude-profile-svg">
              <defs>
                <linearGradient id="terrainGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#334155" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#0a0f1d" stopOpacity="0.98" />
                </linearGradient>
                <filter id="cyanGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#38bdf8" floodOpacity="0.8" />
                </filter>
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

                  return (
                    <g
                      key={`${slice.airspace.id}-${sIdx}`}
                      className="profile-airspace-slice"
                      onMouseEnter={() => setHoveredSlice(slice)}
                      onMouseLeave={() => setHoveredSlice(null)}
                    >
                      <rect
                        x={startX}
                        y={yTop}
                        width={rectWidth}
                        height={rectHeight}
                        fill={fillColor}
                        stroke={strokeColor}
                        strokeWidth={slice.status === 'PENETRATING' ? 2 : 1.5}
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
                          strokeWidth="2"
                          strokeDasharray="2,3"
                        />
                      )}
                      {rectWidth > 36 && (
                        <text
                          x={startX + 6}
                          y={yTop + 16}
                          fill={strokeColor}
                          fontSize="12"
                          fontFamily="var(--font-mono, monospace)"
                          fontWeight="bold"
                        >
                          {rectWidth < 85 ? slice.airspace.id : slice.airspace.name}
                          {isCappedAtTop && ` (▲ ${slice.airspace.upperLimitLabel})`}
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
                        >
                          Floor: {slice.airspace.lowerLimitLabel}
                          {!isCappedAtTop && ` • Top: ${slice.airspace.upperLimitLabel}`}
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

                    return (
                      <g
                        key={`tp-${pIdx}`}
                        className="profile-terrain-sample"
                        onMouseEnter={() => setHoveredPoint(p)}
                        onMouseLeave={() => setHoveredPoint(null)}
                      >
                        <circle cx={px} cy={py} r={8} fill="transparent" cursor="crosshair" />
                        {p.isWarning && (
                          <circle
                            cx={px}
                            cy={py}
                            r={4}
                            fill="#ef4444"
                            stroke="#ffffff"
                            strokeWidth={1.5}
                          />
                        )}
                      </g>
                    );
                  })}
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
