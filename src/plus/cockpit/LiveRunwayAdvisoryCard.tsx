import React from 'react';
import { AirportRunwayAdvisory, ScoredRunwayWind } from '../engine/runway-wind';

export interface LiveRunwayAdvisoryCardProps {
  advisory: AirportRunwayAdvisory;
  distanceToDestNm: number;
  activeCircuitRunway: string | null;
  onToggleCircuitRunway: (runway: ScoredRunwayWind) => void;
  onClose: () => void;
  isMinimized: boolean;
  onToggleMinimize: () => void;
}

export const LiveRunwayAdvisoryCard: React.FC<LiveRunwayAdvisoryCardProps> = ({
  advisory,
  distanceToDestNm,
  activeCircuitRunway,
  onToggleCircuitRunway,
  onClose,
  isMinimized,
  onToggleMinimize,
}) => {
  const { icao, name, windDirectionDeg, windSpeedKt, favoredRunway, runways } = advisory;

  if (isMinimized) {
    return (
      <div
        className="live-runway-minimized-pill"
        onClick={onToggleMinimize}
        title="Click to expand Live Runway Wind Advisory"
      >
        <span className="rwy-mini-icon">🛬</span>
        <strong className="rwy-mini-ident">{icao}</strong>
        <span className="rwy-mini-badge">RWY {favoredRunway.designator}</span>
        <small className="rwy-mini-wind">
          {favoredRunway.headwindKt > 0 ? `${favoredRunway.headwindKt}k HW` : `${favoredRunway.tailwindKt}k TW`}
        </small>
      </div>
    );
  }

  return (
    <div className="live-runway-advisory-card">
      {/* Header */}
      <div className="live-rwy-header">
        <div className="live-rwy-title-wrap">
          <span className="live-rwy-icon">🛬</span>
          <div className="live-rwy-titles">
            <strong>{icao} · {name}</strong>
            <small>
              {distanceToDestNm.toFixed(1)} NM out · Wind {windDirectionDeg.toString().padStart(3, '0')}° / {windSpeedKt} KT
            </small>
          </div>
        </div>
        <div className="live-rwy-header-actions">
          <button
            type="button"
            className="rwy-card-btn-icon"
            onClick={onToggleMinimize}
            title="Minimize advisory"
          >
            ▲
          </button>
          <button
            type="button"
            className="rwy-card-btn-icon"
            onClick={onClose}
            title="Dismiss advisory"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Favored Runway Highlight Banner */}
      <div className="live-rwy-favored-banner">
        <div className="rwy-fav-badge">★ RWY {favoredRunway.designator} FAVORED</div>
        <div className="rwy-fav-summary">
          <span>{favoredRunway.headingMag.toString().padStart(3, '0')}°M</span>
          <span>•</span>
          <span className="hw-val">
            {favoredRunway.headwindKt > 0
              ? `🟢 ${favoredRunway.headwindKt} KT Headwind`
              : `🔴 ${favoredRunway.tailwindKt} KT Tailwind`}
          </span>
          <span>•</span>
          <span className="cw-val">
            {favoredRunway.crosswindKt > 0
              ? `${favoredRunway.crosswindKt} KT X-Wind (${favoredRunway.crosswindSide})`
              : 'Direct Headwind'}
          </span>
        </div>
      </div>

      {/* Runway Breakdown List */}
      <div className="live-rwy-table-body">
        {runways.map((rwy) => {
          const isCircuitActive = activeCircuitRunway === rwy.designator;
          const statusClass =
            rwy.crosswindStatus === 'LIMIT_EXCEEDED'
              ? 'is-limit'
              : rwy.crosswindStatus === 'CAUTION'
              ? 'is-caution'
              : 'is-safe';

          return (
            <div
              key={rwy.designator}
              className={`live-rwy-row ${rwy.isFavored ? 'is-favored' : ''}`}
            >
              <div className="rwy-row-left">
                <span className="rwy-desig-tag">RWY {rwy.designator}</span>
                <span className="rwy-hdg-tag">{rwy.headingMag.toString().padStart(3, '0')}°</span>
                <span className="rwy-dim-tag">{rwy.lengthMeters}m</span>
              </div>

              <div className="rwy-row-center">
                <span className={`rwy-hw-pill ${rwy.headwindKt > 0 ? 'hw-safe' : 'tw-danger'}`}>
                  {rwy.headwindKt > 0 ? `+${rwy.headwindKt}k HW` : `-${rwy.tailwindKt}k TW`}
                </span>
                <span className={`rwy-cw-pill ${statusClass}`}>
                  {rwy.crosswindKt > 0
                    ? `${rwy.crosswindKt}k ${rwy.crosswindSide}`
                    : '0k XW'}
                </span>
              </div>

              <div className="rwy-row-right">
                <button
                  type="button"
                  className={`rwy-btn-circuit ${isCircuitActive ? 'active' : ''}`}
                  onClick={() => onToggleCircuitRunway(rwy)}
                  title={isCircuitActive ? 'Hide Visual Traffic Circuit' : 'Show Visual Traffic Circuit on Map'}
                >
                  {isCircuitActive ? '✓ Circuit Active' : '🧭 Show Circuit'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
