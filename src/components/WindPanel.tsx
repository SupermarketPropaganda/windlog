import React from 'react';
import { WindState, Wind, WindMode } from '../types';

export interface WindPanelProps {
  /** The current wind state */
  windState: WindState;
  /** Callback fired when wind is updated in manual mode */
  onWindChange: (wind: Wind | null) => void;
  /** Callback fired to switch between auto and manual modes */
  onModeChange: (mode: WindMode) => void;
  /** Whether auto wind data is currently loading */
  isLoading: boolean;
}

/**
 * Wind panel displaying current wind and mode toggle.
 */
export const WindPanel: React.FC<WindPanelProps> = ({
  windState,
  onWindChange,
  onModeChange,
  isLoading,
}) => {
  const handleManualChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const match = val.match(/^(\d{1,3})\/(\d{1,3})$/);
    if (match) {
      const dir = parseInt(match[1], 10);
      const spd = parseInt(match[2], 10);
      if (dir >= 0 && dir <= 360) {
        onWindChange({ direction: dir, speed: spd });
      }
    }
  };

  const formatWind = (w: Wind | null) =>
    w ? `${w.direction.toString().padStart(3, '0')}° / ${w.speed} kt` : 'No wind data';

  return (
    <div className="wind-panel">
      <div className="wind-display">
        <div className="wind-value">
          {windState.mode === 'manual' ? (
            <div className="manual-wind-group">
              <input
                type="text"
                className="manual-wind-input"
                placeholder="270/15"
                defaultValue={
                  windState.wind
                    ? `${windState.wind.direction}/${windState.wind.speed}`
                    : ''
                }
                onChange={handleManualChange}
              />
              <span className="manual-wind-hint">DIR/KT (e.g. 290/15)</span>
            </div>
          ) : (
            <span className="wind-readout-text">{formatWind(windState.wind)}</span>
          )}
        </div>

        {windState.mode === 'auto' && (
          <div className="wind-meta">
            {isLoading ? (
              <span className="wind-loading">⚡ Fetching live winds aloft...</span>
            ) : windState.lastUpdated ? (
              <span>
                Source: {windState.source || 'Auto (Aloft per-leg)'} (
                {windState.lastUpdated.toLocaleTimeString()})
              </span>
            ) : (
              <span>Awaiting route data...</span>
            )}
          </div>
        )}
      </div>

      <div className="mode-toggle-group">
        <button
          type="button"
          className={`mode-btn ${windState.mode === 'auto' ? 'active' : ''}`}
          onClick={() => onModeChange('auto')}
        >
          Auto
        </button>
        <button
          type="button"
          className={`mode-btn ${windState.mode === 'manual' ? 'active' : ''}`}
          onClick={() => onModeChange('manual')}
        >
          Manual
        </button>
      </div>
    </div>
  );
};
