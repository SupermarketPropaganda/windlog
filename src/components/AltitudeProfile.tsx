import React from 'react';
import { NavLogSummary } from '../types';

export interface AltitudeProfileProps {
  navLog: NavLogSummary;
  activeLegIndex: number | null;
  onSelectLeg: (idx: number) => void;
}

/**
 * 2D Vertical Altitude Profile (Side-view Cross Section)
 * Renders an SVG chart displaying route distance vs cruise altitude profile.
 */
export const AltitudeProfile: React.FC<AltitudeProfileProps> = ({
  navLog,
  activeLegIndex,
  onSelectLeg,
}) => {
  if (!navLog || navLog.legs.length === 0) return null;

  const width = 800;
  const height = 160;
  const paddingLeft = 55;
  const paddingRight = 45;
  const paddingTop = 25;
  const paddingBottom = 35;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const totalDist = Math.max(1, navLog.totalDistance);

  // Find max altitude to scale Y axis (rounded up to next 2000ft)
  const maxAltInRoute = Math.max(...navLog.legs.map((l) => l.altitude), 3500);
  const yMaxAlt = Math.ceil((maxAltInRoute + 1500) / 2000) * 2000;

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
        <span className="profile-stats">
          Total: {navLog.totalDistance.toFixed(1)} nm • Max Alt: {maxAltInRoute.toLocaleString()} ft MSL
        </span>
      </div>

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
            const startDist = idx === 0 ? 0 : navLog.legs.slice(0, idx).reduce((acc, l) => acc + l.distance, 0);
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
