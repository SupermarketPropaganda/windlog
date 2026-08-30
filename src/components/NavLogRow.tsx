import React, { useState } from 'react';
import { Leg } from '../types';
import { getSemicircularOptions } from '../engine/navlog-engine';

export interface NavLogRowProps {
  /** The leg data to display */
  leg: Leg;
  /** Whether this leg is currently selected/active */
  isActive?: boolean;
  /** Callback fired when the leg is tapped */
  onSelect?: () => void;
  /** Callback fired when altitude is modified for this specific leg */
  onAltitudeChange?: (newAltitude: number) => void;
}

const formatEte = (seconds: number) => {
  if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '--:--';
  const totalMins = Math.floor(seconds / 60);
  const totalSecs = Math.round(seconds % 60);
  if (totalMins >= 60) {
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  } else {
    return `${totalMins.toString().padStart(2, '0')}:${totalSecs.toString().padStart(2, '0')}`;
  }
};

/**
 * Displays a single navigation leg as a card with full aviation math details and per-leg altitude control.
 */
export const NavLogRow: React.FC<NavLogRowProps> = ({
  leg,
  isActive = false,
  onSelect,
  onAltitudeChange,
}) => {
  const [showMathDetails, setShowMathDetails] = useState(false);
  const [isEditingAlt, setIsEditingAlt] = useState(false);
  const [customAltInput, setCustomAltInput] = useState(leg.altitude.toString());

  const wcaSign =
    leg.windCorrectionAngle >= 0
      ? `+${Math.round(leg.windCorrectionAngle)}°`
      : `${Math.round(leg.windCorrectionAngle)}°`;
  const varStr = `${Math.abs(leg.magneticVariation).toFixed(1)}°${
    leg.magneticVariation >= 0 ? 'E' : 'W'
  }`;
  const isZeroGs = leg.groundSpeed <= 0;

  // Calculate magnetic track for accurate semicircular rule
  let magTrack = (leg.trueTrack - leg.magneticVariation) % 360;
  if (magTrack < 0) magTrack += 360;

  const semicircular = getSemicircularOptions(magTrack, leg.altitude);

  const applyAltitude = (alt: number) => {
    if (onAltitudeChange && alt > 0) {
      onAltitudeChange(alt);
    }
    setCustomAltInput(alt.toString());
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const val = parseInt(customAltInput, 10);
    if (!isNaN(val) && val > 0) {
      applyAltitude(val);
      setIsEditingAlt(false);
    }
  };

  return (
    <div
      className={`navlog-row ${isActive ? 'active-leg' : ''}`}
      onClick={onSelect}
    >
      <div className="navlog-header">
        <div className="navlog-waypoints">
          <span className="waypoint-id">{leg.from.identifier}</span>
          {leg.from.name && <span className="waypoint-name"> {leg.from.name}</span>}
          <span className="waypoint-arrow"> ➔ </span>
          <span className="waypoint-id">{leg.to.identifier}</span>
          {leg.to.name && <span className="waypoint-name"> {leg.to.name}</span>}
        </div>

        <div className="navlog-header-actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`alt-chip-btn ${isEditingAlt ? 'editing' : ''}`}
            title="Click to change altitude for this leg"
            onClick={() => {
              setCustomAltInput(leg.altitude.toString());
              setIsEditingAlt(!isEditingAlt);
            }}
          >
            ✈ {leg.altitude.toLocaleString()} ft {isEditingAlt ? '▲' : '✎'}
          </button>

          <button
            type="button"
            className="details-toggle-btn"
            title="Toggle flight math breakdown"
            onClick={() => setShowMathDetails(!showMathDetails)}
          >
            {showMathDetails ? '▲ Math' : '▼ Math'}
          </button>
        </div>
      </div>

      <div className="navlog-grid">
        <div className="grid-item">
          <span className="grid-label">MH (Heading)</span>
          <span className="grid-val val-mh">
            {Math.round(leg.magneticHeading).toString().padStart(3, '0')}°
          </span>
        </div>
        <div className="grid-item">
          <span className="grid-label">Dist</span>
          <span className="grid-val">{leg.distance.toFixed(1)} nm</span>
        </div>
        <div className="grid-item">
          <span className="grid-label">Ground Speed</span>
          <span className={`grid-val ${isZeroGs ? 'val-warning' : ''}`}>
            {Math.round(leg.groundSpeed)} kt
          </span>
        </div>
        <div className="grid-item">
          <span className="grid-label">ETE</span>
          <span className="grid-val">{formatEte(leg.ete)}</span>
        </div>
        {leg.fuelBurn > 0 && (
          <div className="grid-item">
            <span className="grid-label">Fuel</span>
            <span className="grid-val val-fuel">{leg.fuelBurn.toFixed(1)}</span>
          </div>
        )}
      </div>

      {isZeroGs && (
        <div className="wind-warning-badge">
          ⚠️ Headwind/Crosswind exceeds TAS — zero forward progress!
        </div>
      )}

      {/* Interactive Altitude Selector Panel */}
      {isEditingAlt && (
        <div className="alt-presets-bar" onClick={(e) => e.stopPropagation()}>
          <div className="presets-header">
            <span className="presets-label">
              🧭 Track {Math.round(magTrack).toString().padStart(3, '0')}° — {semicircular.ruleLabel}
            </span>
            <button
              type="button"
              className="alt-panel-close-btn"
              onClick={() => setIsEditingAlt(false)}
            >
              ✕ Done
            </button>
          </div>

          <div className="presets-pill-group">
            {semicircular.availableLevels.map((alt) => {
              const isCurrent = alt === leg.altitude;
              const isSuggested = alt === semicircular.suggestedAltitude;

              return (
                <button
                  key={alt}
                  type="button"
                  className={`preset-pill ${isSuggested ? 'suggested' : ''} ${isCurrent ? 'current' : ''}`}
                  onClick={() => applyAltitude(alt)}
                >
                  {isSuggested && '★ '}
                  {alt.toLocaleString()} ft
                  {isCurrent && ' ✓'}
                </button>
              );
            })}
          </div>

          {/* Stepper and Custom Input */}
          <div className="alt-custom-row">
            <div className="alt-stepper-group">
              <button
                type="button"
                className="alt-step-btn"
                onClick={() => applyAltitude(Math.max(500, leg.altitude - 500))}
              >
                − 500 ft
              </button>
              <button
                type="button"
                className="alt-step-btn"
                onClick={() => applyAltitude(leg.altitude + 500)}
              >
                + 500 ft
              </button>
            </div>

            <form onSubmit={handleCustomSubmit} className="alt-custom-form">
              <input
                type="number"
                step="100"
                placeholder="Custom ft"
                className="alt-custom-input"
                value={customAltInput}
                onChange={(e) => setCustomAltInput(e.target.value)}
              />
              <button type="submit" className="alt-custom-set-btn">
                Set
              </button>
            </form>
          </div>
        </div>
      )}

      {showMathDetails && (
        <div className="math-breakdown">
          <span><strong>Altitude:</strong> {leg.altitude.toLocaleString()} ft MSL</span>
          <span><strong>Mag Track:</strong> {Math.round(magTrack).toString().padStart(3, '0')}°</span>
          <span><strong>True Track:</strong> {Math.round(leg.trueTrack)}°</span>
          <span><strong>WCA:</strong> {wcaSign}</span>
          <span><strong>TH:</strong> {Math.round(leg.trueHeading)}°</span>
          <span><strong>Var:</strong> {varStr}</span>
          <span><strong>MH:</strong> {Math.round(leg.magneticHeading)}°</span>
          {leg.wind && (
            <span><strong>Wind:</strong> {leg.wind.direction.toString().padStart(3, '0')}°/{leg.wind.speed}kt</span>
          )}
        </div>
      )}
    </div>
  );
};
