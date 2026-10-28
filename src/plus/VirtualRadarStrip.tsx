import React, { useMemo } from 'react';
import { NavLogSummary } from '../types';
import { TerrainProfileResult } from '../engine/terrain-engine';
import { InFlightNavSolution, OwnshipTelemetry } from './types-plus';
import { computeAirspaceProfileSlices } from '../engine/airspace-engine';

export interface VirtualRadarStripProps {
  navLog: NavLogSummary | null;
  ownship: OwnshipTelemetry;
  navSolution: InFlightNavSolution;
  terrainProfile: TerrainProfileResult | null;
  onExpandFullProfile?: () => void;
  onClose?: () => void;
}

export const VirtualRadarStrip: React.FC<VirtualRadarStripProps> = ({
  navLog,
  ownship,
  navSolution,
  terrainProfile,
  onExpandFullProfile,
  onClose,
}) => {
  const currentAlt = ownship.altitudeMslFt ?? 3500;
  const currentDistNm = navSolution.cumulativeRouteDistNm || 0;
  const radarHorizonNm = 20; // 20 NM forward radar window
  const endDistNm = currentDistNm + radarHorizonNm;

  // Chart dimensions
  const width = 800;
  const height = 80;
  const padLeft = 55;
  const padRight = 30;
  const padTop = 14;
  const padBottom = 20;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Altitude scaling (dynamic ceiling: currentAlt + 2000 ft, min 4500 ft)
  const maxAlt = Math.max(4500, Math.ceil((currentAlt + 1800) / 1000) * 1000);

  const scaleX = (nm: number) => {
    const clamped = Math.max(currentDistNm, Math.min(endDistNm, nm));
    return padLeft + ((clamped - currentDistNm) / radarHorizonNm) * chartW;
  };

  const scaleY = (altFt: number) => {
    const clamped = Math.max(0, Math.min(maxAlt, altFt));
    return padTop + chartH - (clamped / maxAlt) * chartH;
  };

  // Terrain profile path
  const terrainSvg = useMemo(() => {
    if (!terrainProfile || !terrainProfile.samples || terrainProfile.samples.length === 0) {
      return null;
    }

    // Filter samples in [currentDistNm, endDistNm]
    const relevant = terrainProfile.samples.filter(
      (s) => s.distNm >= currentDistNm - 1 && s.distNm <= endDistNm + 1
    );

    if (relevant.length < 2) return null;

    let pathD = `M ${scaleX(relevant[0].distNm)} ${scaleY(0)}`;
    for (const pt of relevant) {
      pathD += ` L ${scaleX(pt.distNm)} ${scaleY(pt.elevationFt)}`;
    }
    pathD += ` L ${scaleX(relevant[relevant.length - 1].distNm)} ${scaleY(0)} Z`;

    // Calculate minimum terrain clearance along forward radar horizon
    let minAgl = 99999;
    for (const pt of relevant) {
      const agl = currentAlt - pt.elevationFt;
      if (agl < minAgl) minAgl = agl;
    }

    const terrainFill =
      minAgl < 500
        ? 'rgba(239, 68, 68, 0.45)'
        : minAgl < 1000
        ? 'rgba(245, 158, 11, 0.35)'
        : 'rgba(52, 211, 153, 0.22)';
    const terrainStroke =
      minAgl < 500 ? '#ef4444' : minAgl < 1000 ? '#f59e0b' : '#34d399';

    return { pathD, terrainFill, terrainStroke, minAgl };
  }, [terrainProfile, currentDistNm, endDistNm, currentAlt, maxAlt]);

  // Airspace forward slices
  const airspaceSlices = useMemo(() => {
    if (!navLog || !navLog.legs || navLog.legs.length === 0) return [];
    try {
      const allSlices = computeAirspaceProfileSlices(navLog.legs);
      return allSlices.filter(
        (s) =>
          s.endDistNm >= currentDistNm &&
          s.startDistNm <= endDistNm &&
          s.lowerLimitFt <= maxAlt
      );
    } catch {
      return [];
    }
  }, [navLog, currentDistNm, endDistNm, maxAlt]);

  // Airspace forward slices with smart de-clutter & non-overlapping labels
  const formattedAirspaceSlices = useMemo(() => {
    if (!airspaceSlices || airspaceSlices.length === 0) return [];

    const placedLabels: { x: number; y: number; w: number; h: number }[] = [];

    return airspaceSlices.map((slice, idx) => {
      const x1 = scaleX(slice.startDistNm);
      const x2 = scaleX(slice.endDistNm);
      const w = Math.max(4, x2 - x1);
      const yTop = scaleY(slice.upperLimitFt);
      const yBottom = scaleY(slice.lowerLimitFt);
      const h = Math.max(4, yBottom - yTop);

      // Clean label text: e.g. "LISBOA TMA" or "LPPT CTR"
      const rawName = slice.airspace.name.replace(/SECTOR\s*\d+/i, '').trim();
      const shortName = rawName.length > 10 ? rawName.slice(0, 9) + '…' : rawName;
      const labelW = Math.max(28, shortName.length * 6 + 8);
      const labelH = 12;

      let showLabel = false;
      let labelX = x1 + 4;
      let labelY = yTop + 10;

      // Only label if slice has sufficient width and height
      if (w >= 45 && h >= 14) {
        // Prevent label collision with previously placed labels in this radar strip
        const collides = placedLabels.some(
          (b) => Math.abs(labelX - b.x) < 45 && Math.abs(labelY - b.y) < 14
        );

        if (!collides) {
          showLabel = true;
          placedLabels.push({ x: labelX, y: labelY, w: labelW, h: labelH });
        } else if (h >= 28) {
          // If vertical space permits, try placing near lower boundary
          const altY = yBottom - 4;
          const altCollides = placedLabels.some(
            (b) => Math.abs(labelX - b.x) < 45 && Math.abs(altY - b.y) < 14
          );
          if (!altCollides) {
            showLabel = true;
            labelY = altY;
            placedLabels.push({ x: labelX, y: labelY, w: labelW, h: labelH });
          }
        }
      }

      return {
        ...slice,
        idx,
        x1,
        yTop,
        w,
        h,
        showLabel,
        labelX,
        labelY,
        labelText: shortName,
        labelW,
        labelH,
      };
    });
  }, [airspaceSlices, scaleX, scaleY]);

  // Flight path line (with climb/descent vector)
  const flightPathD = useMemo(() => {
    const x0 = scaleX(currentDistNm);
    const y0 = scaleY(currentAlt);
    const vs = ownship.verticalSpeedFpm;
    const gs = Math.max(40, ownship.groundSpeedKt);

    if (Math.abs(vs) < 150) {
      // Level flight
      const x1 = scaleX(endDistNm);
      return `M ${x0} ${y0} L ${x1} ${y0}`;
    }

    // Projected altitude at horizon
    const timeToHorizonHours = radarHorizonNm / gs;
    const projectedAlt = currentAlt + vs * 60 * timeToHorizonHours;
    const x1 = scaleX(endDistNm);
    const y1 = scaleY(projectedAlt);
    return `M ${x0} ${y0} L ${x1} ${y1}`;
  }, [currentDistNm, endDistNm, currentAlt, ownship.verticalSpeedFpm, ownship.groundSpeedKt, maxAlt]);

  return (
    <div className="virtual-radar-strip-container">
      <div className="radar-strip-header">
        <div className="radar-strip-title">
          <span className="radar-pulse-dot" />
          <strong>VIRTUAL RADAR</strong>
          <span className="radar-horizon-tag">FORWARD 20 NM</span>
          {terrainSvg && (
            <span
              className={`radar-agl-tag ${
                terrainSvg.minAgl < 500
                  ? 'is-danger'
                  : terrainSvg.minAgl < 1000
                  ? 'is-caution'
                  : 'is-safe'
              }`}
            >
              MIN CLR: {terrainSvg.minAgl.toLocaleString()} FT AGL
            </span>
          )}
        </div>
        <div className="radar-strip-controls">
          {onExpandFullProfile && (
            <button
              type="button"
              className="radar-btn-expand"
              onClick={onExpandFullProfile}
              title="Expand into full 2D terrain profile drawer"
            >
              ⛶ Full Profile
            </button>
          )}
          {onClose && (
            <button
              type="button"
              className="radar-btn-close"
              onClick={onClose}
              title="Close Virtual Radar strip"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="radar-strip-viewport">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="radar-svg-canvas"
          preserveAspectRatio="none"
        >
          {/* Background grid */}
          <line
            x1={padLeft}
            y1={scaleY(currentAlt)}
            x2={padLeft + chartW}
            y2={scaleY(currentAlt)}
            stroke="rgba(56, 189, 248, 0.25)"
            strokeDasharray="2, 4"
          />

          {/* Airspace Blocks with Smart De-Clutter Badges */}
          {formattedAirspaceSlices.map((slice) => (
            <g key={`asp_${slice.idx}`}>
              <rect
                x={slice.x1}
                y={slice.yTop}
                width={slice.w}
                height={slice.h}
                fill="rgba(59, 130, 246, 0.14)"
                stroke="rgba(96, 165, 250, 0.55)"
                strokeWidth="1"
                strokeDasharray="3, 3"
              />
              {slice.showLabel && (
                <g>
                  <rect
                    x={slice.labelX - 1}
                    y={slice.labelY - 9}
                    width={slice.labelW}
                    height={slice.labelH}
                    rx="2"
                    fill="rgba(9, 13, 24, 0.88)"
                    stroke="rgba(96, 165, 250, 0.4)"
                    strokeWidth="0.5"
                  />
                  <text
                    x={slice.labelX + 3}
                    y={slice.labelY}
                    fill="#93c5fd"
                    fontSize="8.5"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    {slice.labelText}
                  </text>
                </g>
              )}
            </g>
          ))}

          {/* Terrain Profile Fill */}
          {terrainSvg && (
            <path
              d={terrainSvg.pathD}
              fill={terrainSvg.terrainFill}
              stroke={terrainSvg.terrainStroke}
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          )}

          {/* Projected Flight Path Vector */}
          <path
            d={flightPathD}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2.2"
            strokeDasharray="4, 2"
          />

          {/* Ownship Nose Symbol */}
          <circle cx={scaleX(currentDistNm)} cy={scaleY(currentAlt)} r="4" fill="#38bdf8" />
          <path
            d={`M ${scaleX(currentDistNm) - 6} ${scaleY(currentAlt)} L ${scaleX(currentDistNm) + 6} ${scaleY(currentAlt)}`}
            stroke="#ffffff"
            strokeWidth="2"
          />

          {/* Distance Ticks */}
          {[0, 5, 10, 15, 20].map((d) => (
            <g key={`tick_${d}`} transform={`translate(${scaleX(currentDistNm + d)}, ${padTop + chartH})`}>
              <line x1="0" y1="0" x2="0" y2="4" stroke="#64748b" />
              <text
                x={d === 0 ? 3 : 0}
                y="14"
                fill="#94a3b8"
                fontSize="9"
                textAnchor={d === 0 ? 'start' : 'middle'}
                fontFamily="monospace"
              >
                {d === 0 ? 'NOW' : `+${d}NM`}
              </text>
            </g>
          ))}

          {/* Current Altitude Indicator Badge */}
          <g transform={`translate(2, ${Math.max(12, Math.min(chartH + padTop - 12, scaleY(currentAlt) - 7))})`}>
            <rect width="48" height="15" rx="3" fill="#090d18" stroke="#38bdf8" strokeWidth="1" />
            <text x="24" y="11" fill="#38bdf8" fontSize="9.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
              {currentAlt.toLocaleString()}
            </text>
          </g>
        </svg>
      </div>
    </div>
  );
};
