import React, { useState, useEffect } from 'react';
import { WindState, Wind, WindMode } from '../types';
import { parseManualWind } from '../data/winds-aloft';

export interface WindPanelProps {
  /** The current wind state */
  windState: WindState;
  /** Callback fired when wind is updated in manual mode */
  onWindChange: (wind: Wind | null) => void;
  /** Callback fired to switch between auto and manual modes */
  onModeChange: (mode: WindMode) => void;
  /** Whether auto wind data is currently loading */
  isLoading: boolean;
  /** Scheduled flight departure time (ISO string or null for Live/Now) */
  departureTime?: string | null;
  /** Callback fired when departure time changes */
  onDepartureTimeChange?: (time: string | null) => void;
}

/**
 * Wind panel displaying current wind, mode toggle, and flight departure date & hour scheduling.
 */
export const WindPanel: React.FC<WindPanelProps> = ({
  windState,
  onWindChange,
  onModeChange,
  isLoading,
  departureTime = null,
  onDepartureTimeChange,
}) => {
  const [inputValue, setInputValue] = useState<string>(() =>
    windState.wind ? `${windState.wind.direction}/${windState.wind.speed}` : ''
  );
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);

  // Synchronize input value with external windState when not actively editing
  useEffect(() => {
    if (windState.mode === 'manual') {
      const currentParsed = parseManualWind(inputValue);
      const isAlreadyMatching =
        currentParsed &&
        windState.wind &&
        currentParsed.direction === windState.wind.direction &&
        currentParsed.speed === windState.wind.speed;

      if (!isAlreadyMatching) {
        if (windState.wind) {
          setInputValue(`${windState.wind.direction}/${windState.wind.speed}`);
        } else if (!inputValue.trim()) {
          setInputValue('');
        }
      }
    }
  }, [windState.mode, windState.wind?.direction, windState.wind?.speed]);

  const handleManualChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);

    const parsed = parseManualWind(val);
    if (parsed) {
      onWindChange(parsed);
    } else if (val.trim() === '') {
      onWindChange(null);
    }
  };

  const formatWind = (w: Wind | null) =>
    w ? `${w.direction.toString().padStart(3, '0')}° / ${w.speed} kt` : 'No wind data';

  // Compute date boundaries (Today up to 14 days in future)
  const today = new Date();
  const minDateStr = today.toISOString().substring(0, 10);
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 14);
  const maxDateStr = maxDate.toISOString().substring(0, 10);

  // Selected date and hour states
  const currentDateObj = departureTime ? new Date(departureTime) : new Date();
  const [selectedDate, setSelectedDate] = useState<string>(
    departureTime ? departureTime.substring(0, 10) : minDateStr
  );
  const [selectedHour, setSelectedHour] = useState<string>(
    departureTime
      ? `${currentDateObj.getUTCHours().toString().padStart(2, '0')}:00`
      : `${new Date().getUTCHours().toString().padStart(2, '0')}:00`
  );

  const handleApplySchedule = (newDate: string, newHour: string) => {
    if (!onDepartureTimeChange) return;
    const hourNum = parseInt(newHour.split(':')[0], 10) || 0;
    // Create UTC date string
    const isoString = `${newDate}T${hourNum.toString().padStart(2, '0')}:00:00.000Z`;
    onDepartureTimeChange(isoString);
  };

  const handleResetToNow = () => {
    if (onDepartureTimeChange) {
      onDepartureTimeChange(null);
    }
    const now = new Date();
    setSelectedDate(now.toISOString().substring(0, 10));
    setSelectedHour(`${now.getUTCHours().toString().padStart(2, '0')}:00`);
    setIsScheduleOpen(false);
  };

  const formatDepartureBadge = (isoStr: string | null) => {
    if (!isoStr) return 'Live / Now';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return 'Live / Now';
      const day = d.getUTCDate().toString().padStart(2, '0');
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const mon = monthNames[d.getUTCMonth()];
      const h = d.getUTCHours().toString().padStart(2, '0');
      return `${day} ${mon} ${h}:00Z`;
    } catch {
      return 'Scheduled';
    }
  };

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
                value={inputValue}
                onChange={handleManualChange}
              />
              <span className="manual-wind-hint">DIR/KT (e.g. 290/15)</span>
            </div>
          ) : (
            <div className="wind-readout-group">
              <span className="wind-readout-text">{formatWind(windState.wind)}</span>
              {departureTime && (
                <span className="wind-scheduled-tag" title="Forecast for planned flight time">
                  📅 {formatDepartureBadge(departureTime)}
                </span>
              )}
            </div>
          )}
        </div>

        {windState.mode === 'auto' && (
          <div className="wind-meta">
            {isLoading ? (
              <span className="wind-loading">⚡ Fetching aloft forecast...</span>
            ) : windState.lastUpdated ? (
              <span>
                Source: {departureTime ? `Forecast (${formatDepartureBadge(departureTime)})` : windState.source || 'Auto (Aloft per-leg)'} (
                {windState.lastUpdated.toLocaleTimeString()})
              </span>
            ) : (
              <span>Awaiting route data...</span>
            )}
          </div>
        )}
      </div>

      <div className="wind-panel-right">
        {/* Departure Time & Date Selector Button (Available in Auto Mode) */}
        {windState.mode === 'auto' && onDepartureTimeChange && (
          <div className="flight-time-dropdown-wrap">
            <button
              type="button"
              className={`flight-time-trigger-btn ${departureTime ? 'is-scheduled' : ''}`}
              onClick={() => setIsScheduleOpen(!isScheduleOpen)}
              title="Select flight departure date and hour for accurate wind forecast"
            >
              <span className="calendar-icon">📅</span>
              <span className="flight-time-label">
                {departureTime ? formatDepartureBadge(departureTime) : 'Flight Time: Now'}
              </span>
              <span className="dropdown-caret">{isScheduleOpen ? '▴' : '▾'}</span>
            </button>

            {isScheduleOpen && (
              <div className="flight-time-popover">
                <div className="flight-time-popover-header">
                  <span>Flight Departure Schedule</span>
                  <button
                    type="button"
                    className="popover-close-btn"
                    onClick={() => setIsScheduleOpen(false)}
                  >
                    ✕
                  </button>
                </div>

                <div className="flight-time-fields">
                  <div className="flight-time-field">
                    <label>Departure Date</label>
                    <input
                      type="date"
                      className="flight-date-input"
                      value={selectedDate}
                      min={minDateStr}
                      max={maxDateStr}
                      onChange={(e) => {
                        setSelectedDate(e.target.value);
                        handleApplySchedule(e.target.value, selectedHour);
                      }}
                    />
                  </div>

                  <div className="flight-time-field">
                    <label>Hour (UTC / Zulu)</label>
                    <select
                      className="flight-hour-select"
                      value={selectedHour}
                      onChange={(e) => {
                        setSelectedHour(e.target.value);
                        handleApplySchedule(selectedDate, e.target.value);
                      }}
                    >
                      {Array.from({ length: 24 }).map((_, i) => {
                        const hStr = `${i.toString().padStart(2, '0')}:00`;
                        return (
                          <option key={hStr} value={hStr}>
                            {hStr}Z ({i.toString().padStart(2, '0')}:00 UTC)
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                <div className="flight-time-popover-footer">
                  <button
                    type="button"
                    className="time-reset-now-btn"
                    onClick={handleResetToNow}
                  >
                    ⚡ Use Real-Time (Now)
                  </button>
                  <button
                    type="button"
                    className="time-apply-btn"
                    onClick={() => setIsScheduleOpen(false)}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

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
    </div>
  );
};
