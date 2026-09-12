import React, { useState, useMemo } from 'react';
import { NavLogSummary } from '../types';
import { computeAirspaceProfileSlices, AirspaceVerticalSlice } from '../engine/airspace-engine';
import { AirspaceFilterType } from './RouteMap';

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
 * with real-time 3D controlled airspace penetration cross-sections.
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

  const [internalShowAirspaces, setInternalShowAirspaces] = useState<boolean>(true);
  const showAirspaceSlices =
    externalShowAirspaces !== undefined ? externalShowAirspaces : internalShowAirspaces;
  const setShowAirspaceSlices = onToggleShowAirspaces || setInternalShowAirspaces;

  const [hoveredSlice, setHoveredSlice] = useState<AirspaceVerticalSlice | null>(null);

  const width = 800;
  const height = 180;
  const paddingLeft = 55;
  const paddingRight = 45;
  const paddingTop = 25;
  const paddingBottom = 40;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const totalDist = Math.max(1, navLog.totalDistance);

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

  // Find max altitude to scale Y axis (rounded up to next 2000ft)
  const maxAltInRoute = Math.max(...navLog.legs.map((l) => l.altitude), 3500);
  const relevantAirspaceAlt = Math.max(
    ...airspaceSlices.map((s) =>
      s.status === 'PENETRATING' || s.status === 'CLIPPING'
        ? s.upperLimitFt
        : Math.min(s.upperLimitFt, 9500)
    ),
    0
  );
  const effectiveMaxAlt = Math.max(maxAltInRoute, Math.min(relevantAirspaceAlt, 14500));
  const yMaxAlt = Math.ceil((effectiveMaxAlt + 1500) / 2000) * 2000;

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

  // Build SVG path for flight profile
  let pathD = `M ${scaleX(0)} ${scaleY(0)} L ${scaleX(0)} ${scaleY(navLog.legs[0].altitude)}`;
  let areaD = `M ${scaleX(0)} ${scaleY(0)} L ${scaleX(0)} ${scaleY(navLog.legs[0].altitude)}`;

  let currentDist = 0;
  navLog.legs.forEach((leg) => {
    const startX = scaleX(currentDist);
    const endX = scaleX(currentDist + leg.distance);
    const legY = scaleY(leg.altitude);

    pathD += ` L ${startX} ${legY} L ${endX} ${legY}`;
    areaD += ` L ${startX} ${legY} L ${endX} ${legY}`;

    currentDist += leg.distance;
  });

  pathD += ` L ${scaleX(totalDist)} ${scaleY(0)}`;
  areaD += ` L ${scaleX(totalDist)} ${scaleY(0)} Z`;

  // Grid lines for Y axis (every 2,000 ft)
  const yTicks: number[] = [];
  for (let a = 2000; a <= yMaxAlt; a += 2000) {
    yTicks.push(a);
  }

  return (
    <div className="altitude-profile-container">
      <div className="profile-header">
        <span className="profile-title">✈ Vertical Flight Profile (Cross-Section)</span>
        <div className="profile-controls">
          <label className="profile-airspace-toggle">
            <input
              type="checkbox"
              checked={showAirspaceSlices}
              onChange={(e) => setShowAirspaceSlices(e.target.checked)}
            />
            <span>
              Airspaces{airspaceFilter && airspaceFilter !== 'ALL' ? ` (${airspaceFilter})` : ''} ({airspaceSlices.length})
            </span>
          </label>
          <span className="profile-stats">
            Total: {navLog.totalDistance.toFixed(1)} nm • Max Alt: {maxAltInRoute.toLocaleString()} ft MSL
          </span>
        </div>
      </div>

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
            <linearGradient id="profileGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Background Grid */}
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
                <text x={paddingLeft - 8} y={y + 3} className="profile-axis-text-y">
                  {alt >= 10000 ? `FL${alt / 100}` : `${alt / 1000}k`}
                </text>
              </g>
            );
          })}

          {/* Airspace Cross-Section Blocks */}
          {showAirspaceSlices &&
            airspaceSlices.map((slice, sIdx) => {
              const startX = scaleX(slice.startDistNm);
              const endX = scaleX(slice.endDistNm);
              const rectWidth = Math.max(4, endX - startX);
              const clampedUpper = Math.min(slice.upperLimitFt, yMaxAlt);
              const yTop = scaleY(clampedUpper);
              const yBottom = scaleY(slice.lowerLimitFt);
              const rectHeight = Math.max(4, yBottom - yTop);

              let fillColor = 'rgba(59, 130, 246, 0.10)';
              let strokeColor = '#3b82f6';
              let strokeDash: string | undefined = '3,3';

              if (slice.airspace.type === 'TMA') {
                fillColor = 'rgba(168, 85, 247, 0.10)';
                strokeColor = '#a855f7';
              } else if (
                slice.airspace.type === 'RESTRICTED' ||
                slice.airspace.type === 'PROHIBITED'
              ) {
                fillColor = 'rgba(239, 68, 68, 0.20)';
                strokeColor = '#ef4444';
                strokeDash = '4,2';
              } else if (slice.airspace.type === 'DANGER') {
                fillColor = 'rgba(245, 158, 11, 0.16)';
                strokeColor = '#f59e0b';
                strokeDash = '4,2';
              } else if (slice.airspace.type === 'ATZ') {
                fillColor = 'rgba(20, 184, 166, 0.12)';
                strokeColor = '#14b8a6';
              }

              if (slice.status === 'PENETRATING') {
                fillColor =
                  slice.airspace.type === 'RESTRICTED' || slice.airspace.type === 'PROHIBITED'
                    ? 'rgba(239, 68, 68, 0.35)'
                    : 'rgba(249, 115, 22, 0.25)';
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
                    strokeWidth={slice.status === 'PENETRATING' ? 1.5 : 1}
                    strokeDasharray={strokeDash}
                    rx={2}
                  />
                  {rectWidth > 32 && (
                    <text
                      x={startX + 4}
                      y={yTop + 11}
                      fill={strokeColor}
                      fontSize="8.5"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      {slice.airspace.name.length > 14 && rectWidth < 80
                        ? slice.airspace.id
                        : slice.airspace.name}
                    </text>
                  )}
                  {rectWidth > 40 && (
                    <text
                      x={startX + 4}
                      y={yBottom - 4}
                      fill="#94a3b8"
                      fontSize="7.5"
                      fontFamily="monospace"
                    >
                      {slice.airspace.lowerLimitLabel}
                    </text>
                  )}
                </g>
              );
            })}

          {/* Area Fill */}
          <path d={areaD} fill="url(#profileGradient)" />

          {/* Base Ground Line */}
          <line
            x1={paddingLeft}
            y1={scaleY(0)}
            x2={width - paddingRight}
            y2={scaleY(0)}
            className="profile-ground-line"
          />

          {/* Interactive Leg Blocks */}
          {navLog.legs.map((leg, idx) => {
            const startDist =
              idx === 0 ? 0 : navLog.legs.slice(0, idx).reduce((acc, l) => acc + l.distance, 0);
            const startX = scaleX(startDist);
            const endX = scaleX(startDist + leg.distance);
            const legY = scaleY(leg.altitude);
            const isActive = activeLegIndex === idx;

            return (
              <g
                key={leg.id}
                className={`profile-leg-segment ${isActive ? 'active' : ''}`}
                onClick={() => onSelectLeg(idx)}
              >
                {/* Leg Cruise Line */}
                <line
                  x1={startX}
                  y1={legY}
                  x2={endX}
                  y2={legY}
                  className={`profile-cruise-line ${isActive ? 'active' : ''}`}
                />

                {/* Altitude Pill above line */}
                <rect
                  x={(startX + endX) / 2 - 28}
                  y={legY - 18}
                  width={56}
                  height={14}
                  rx={3}
                  className={`profile-alt-badge-bg ${isActive ? 'active' : ''}`}
                />
                <text
                  x={(startX + endX) / 2}
                  y={legY - 7}
                  className={`profile-alt-badge-text ${isActive ? 'active' : ''}`}
                >
                  {leg.altitude.toLocaleString()} ft
                </text>
              </g>
            );
          })}

          {/* Waypoint Ticks and Labels */}
          {waypointPoints.map((wpt, idx) => (
            <g key={idx} className="waypoint-tick-group">
              <line
                x1={wpt.x}
                y1={scaleY(0)}
                x2={wpt.x}
                y2={scaleY(0) + 6}
                className="wpt-tick-line"
              />
              <circle cx={wpt.x} cy={scaleY(0)} r={3} className="wpt-tick-dot" />
              <text x={wpt.x} y={scaleY(0) + 18} className="wpt-tick-ident">
                {wpt.ident}
              </text>
              <text x={wpt.x} y={scaleY(0) + 28} className="wpt-tick-dist">
                {wpt.dist.toFixed(0)}nm
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
};
