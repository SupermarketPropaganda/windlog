import React, { useState, useMemo } from 'react';
import { NavLogSummary, RunwayWindResult } from '../types';
import { computeRunwayWindComponents } from '../engine/runway-wind';

export interface RunwayWindViewProps {
  navLogSummary: NavLogSummary | null;
  onBackToNavLog: () => void;
  onResultChange?: (res: RunwayWindResult) => void;
}

export const RunwayWindView: React.FC<RunwayWindViewProps> = ({
  navLogSummary,
  onBackToNavLog,
  onResultChange,
}) => {
  // Runway input (default 270 / RWY 27)
  const [runwayInput, setRunwayInput] = useState<string>('270');
  
  // Wind inputs (default 310 / 15G22)
  const [windDirInput, setWindDirInput] = useState<string>('310');
  const [windSpeedInput, setWindSpeedInput] = useState<string>('15');
  const [gustSpeedInput, setGustSpeedInput] = useState<string>('22');
  const [maxDemoXwind, setMaxDemoXwind] = useState<string>('15');

  const rwyHeading = parseFloat(runwayInput) || 270;
  const windDir = parseFloat(windDirInput) || 0;
  const windSpeed = parseFloat(windSpeedInput) || 0;
  const gustSpeed = gustSpeedInput ? parseFloat(gustSpeedInput) : undefined;
  const maxXwind = parseFloat(maxDemoXwind) || 15;

  // Compute components
  const result: RunwayWindResult = useMemo(() => {
    const res = computeRunwayWindComponents(
      rwyHeading,
      windDir,
      windSpeed,
      gustSpeed,
      maxXwind
    );
    if (onResultChange) onResultChange(res);
    return res;
  }, [rwyHeading, windDir, windSpeed, gustSpeed, maxXwind, onResultChange]);

  // Quick runway buttons (e.g. 09, 18, 27, 36, or first route leg track)
  const handleQuickRwy = (deg: number) => {
    setRunwayInput(deg.toString());
  };

  // Flip to reciprocal runway
  const handleSwitchToReciprocal = () => {
    setRunwayInput(result.reciprocalHeading.toString());
  };

  // Sync departure airport / leg wind if available
  const handleSyncRouteWind = () => {
    if (navLogSummary && navLogSummary.legs.length > 0) {
      const leg = navLogSummary.legs[0];
      if (leg.wind) {
        setWindDirInput(leg.wind.direction.toString());
        setWindSpeedInput(leg.wind.speed.toString());
      }
      setRunwayInput(Math.round(leg.magneticHeading).toString());
    }
  };

  // ─── Visual Compass Rose SVG Geometry ───
  // Center is (150, 150), radius is 110
  const cx = 150;
  const cy = 150;
  const radius = 105;

  // Runway line endpoints
  const rwyRad = ((result.runwayHeading - 90) * Math.PI) / 180;
  const rwyX1 = cx - Math.cos(rwyRad) * (radius - 10);
  const rwyY1 = cy - Math.sin(rwyRad) * (radius - 10);
  const rwyX2 = cx + Math.cos(rwyRad) * (radius - 10);
  const rwyY2 = cy + Math.sin(rwyRad) * (radius - 10);

  // Wind vector arrow
  // Wind comes FROM windDir, so arrow points towards center from perimeter
  const windRad = ((result.windDirection - 90) * Math.PI) / 180;
  const windStartX = cx + Math.cos(windRad) * (radius + 5);
  const windStartY = cy + Math.sin(windRad) * (radius + 5);
  const windEndX = cx - Math.cos(windRad) * 35;
  const windEndY = cy - Math.sin(windRad) * 35;

  // Runway designator label numbers
  const rwyNum = Math.round(result.runwayHeading / 10).toString().padStart(2, '0');
  const recipNum = Math.round(result.reciprocalHeading / 10).toString().padStart(2, '0');

  const isHeadwind = result.headwind >= 0;
  const xwindPercentage = maxXwind > 0 ? (result.crosswind / maxXwind) * 100 : 0;

  return (
    <div className="rw-view-container">
      {/* Top Header Card */}
      <div className="rw-header-card">
        <div className="rw-header-left">
          <button
            type="button"
            className="btn btn-cancel mb-back-btn"
            onClick={onBackToNavLog}
          >
            ← Back to Flight Plan
          </button>
          <div>
            <h1 className="rw-title">🛫 Runway Wind &amp; Crosswind Calculator</h1>
            <div className="rw-subtitle">
              Interactive Runway Heading, Crosswind Limits &amp; Reciprocal Analysis
            </div>
          </div>
        </div>

        {navLogSummary && navLogSummary.legs.length > 0 && (
          <button
            type="button"
            className="btn btn-cancel"
            onClick={handleSyncRouteWind}
            title="Sync departure runway and wind from active flight plan"
          >
            🔄 Sync Route Leg 1 ({navLogSummary.legs[0].from.identifier})
          </button>
        )}
      </div>

      {/* Main Grid */}
      <div className="rw-grid-layout">
        {/* Left Column: Inputs */}
        <div className="rw-inputs-col">
          {/* Runway Heading Card */}
          <div className="mb-card">
            <div className="mb-card-header">
              <span className="mb-card-title">1. Runway Alignment</span>
              <span className="mb-badge">Magnetic Heading</span>
            </div>

            <div className="rw-field-group">
              <div className="rw-input-wrap">
                <label>Runway Heading (°M)</label>
                <div className="rw-input-unit-box">
                  <input
                    type="number"
                    min="1"
                    max="360"
                    value={runwayInput}
                    onChange={(e) => setRunwayInput(e.target.value)}
                    className="rw-main-input"
                  />
                  <span className="rw-unit-text">°</span>
                </div>
              </div>

              {/* Quick Runway Numbers */}
              <div className="rw-quick-pills">
                <span className="rw-pills-label">Presets:</span>
                {[
                  { label: 'RWY 03', deg: 30 },
                  { label: 'RWY 09', deg: 90 },
                  { label: 'RWY 18', deg: 180 },
                  { label: 'RWY 21', deg: 210 },
                  { label: 'RWY 27', deg: 270 },
                  { label: 'RWY 36', deg: 360 },
                ].map((item) => (
                  <button
                    key={item.deg}
                    type="button"
                    className={`rw-pill-btn ${
                      Math.round(rwyHeading) === item.deg ? 'active' : ''
                    }`}
                    onClick={() => handleQuickRwy(item.deg)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Wind & Gust Card */}
          <div className="mb-card">
            <div className="mb-card-header">
              <span className="mb-card-title">2. Surface Wind &amp; Gusts</span>
              <span className="mb-badge">METAR / ATIS / Tower</span>
            </div>

            <div className="rw-field-grid">
              <div className="rw-input-wrap">
                <label>Wind Direction (°M)</label>
                <div className="rw-input-unit-box">
                  <input
                    type="number"
                    min="0"
                    max="360"
                    value={windDirInput}
                    onChange={(e) => setWindDirInput(e.target.value)}
                    className="rw-main-input"
                  />
                  <span className="rw-unit-text">°</span>
                </div>
              </div>

              <div className="rw-input-wrap">
                <label>Wind Speed (KT)</label>
                <div className="rw-input-unit-box">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={windSpeedInput}
                    onChange={(e) => setWindSpeedInput(e.target.value)}
                    className="rw-main-input"
                  />
                  <span className="rw-unit-text">kt</span>
                </div>
              </div>

              <div className="rw-input-wrap">
                <label>Gust Speed (KT, Optional)</label>
                <div className="rw-input-unit-box">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="None"
                    value={gustSpeedInput}
                    onChange={(e) => setGustSpeedInput(e.target.value)}
                    className="rw-main-input"
                  />
                  <span className="rw-unit-text">kt</span>
                </div>
              </div>

              <div className="rw-input-wrap">
                <label>Max Demo Crosswind (KT)</label>
                <div className="rw-input-unit-box">
                  <input
                    type="number"
                    min="5"
                    max="50"
                    value={maxDemoXwind}
                    onChange={(e) => setMaxDemoXwind(e.target.value)}
                    className="rw-main-input"
                  />
                  <span className="rw-unit-text">kt</span>
                </div>
              </div>
            </div>
          </div>

          {/* Reciprocal Runway Card */}
          <div className="mb-card rw-reciprocal-card">
            <div className="mb-card-header">
              <span className="mb-card-title">3. Reciprocal Runway ({recipNum})</span>
              <span className="mb-badge">Opposite Direction</span>
            </div>
            <div className="rw-reciprocal-body">
              <div className="rw-recip-info">
                <div>
                  <strong>RWY {recipNum} ({result.reciprocalHeading}°M)</strong>:
                </div>
                <div className="rw-recip-values">
                  Headwind:{' '}
                  <span
                    style={{
                      color: result.reciprocalHeadwind >= 0 ? '#4ade80' : '#f87171',
                    }}
                  >
                    {result.reciprocalHeadwind >= 0 ? '+' : ''}
                    {result.reciprocalHeadwind} kt
                  </span>{' '}
                  • Crosswind: <strong>{result.reciprocalCrosswind} kt</strong>
                </div>
              </div>

              {result.reciprocalHeadwind > result.headwind && (
                <div className="rw-recip-benefit">
                  💡 <strong>RWY {recipNum}</strong> gives a better{' '}
                  {result.reciprocalHeadwind.toFixed(1)} kt headwind advantage!
                </div>
              )}

              <button
                type="button"
                className="btn btn-cancel btn-sm"
                onClick={handleSwitchToReciprocal}
              >
                ⇄ Switch to RWY {recipNum}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Visual Compass Rose & Component Cards */}
        <div className="rw-visual-col">
          {/* Component Metric Cards */}
          <div className="rw-metrics-row">
            {/* Headwind / Tailwind Card */}
            <div
              className={`rw-metric-card ${
                isHeadwind ? 'card-headwind' : 'card-tailwind'
              }`}
            >
              <div className="metric-header">
                <span className="metric-icon">{isHeadwind ? '⬇️' : '⬆️'}</span>
                <span className="metric-label">
                  {isHeadwind ? 'HEADWIND' : 'TAILWIND'}
                </span>
              </div>
              <div className="metric-value">
                {Math.abs(result.headwind)}{' '}
                <span className="metric-unit">kt</span>
              </div>
              {result.gustHeadwind !== undefined && (
                <div className="metric-gust">
                  Gusts to {Math.abs(result.gustHeadwind)} kt
                </div>
              )}
            </div>

            {/* Crosswind Card */}
            <div
              className={`rw-metric-card ${
                result.crosswindStatus === 'safe'
                  ? 'card-xwind-safe'
                  : result.crosswindStatus === 'caution'
                  ? 'card-xwind-caution'
                  : 'card-xwind-alert'
              }`}
            >
              <div className="metric-header">
                <span className="metric-icon">
                  {result.crosswindSide === 'left'
                    ? '⬅️'
                    : result.crosswindSide === 'right'
                    ? '➡️'
                    : '🎯'}
                </span>
                <span className="metric-label">
                  CROSSWIND ({result.crosswindSide.toUpperCase()})
                </span>
              </div>
              <div className="metric-value">
                {result.crosswind} <span className="metric-unit">kt</span>
              </div>
              {result.gustCrosswind !== undefined && (
                <div className="metric-gust">
                  Gusts to {result.gustCrosswind} kt
                </div>
              )}
              <div className="xwind-limit-bar-wrap">
                <div
                  className="xwind-limit-bar-fill"
                  style={{
                    width: `${Math.min(100, xwindPercentage)}%`,
                    backgroundColor:
                      result.crosswindStatus === 'safe'
                        ? '#22c55e'
                        : result.crosswindStatus === 'caution'
                        ? '#eab308'
                        : '#ef4444',
                  }}
                />
              </div>
              <div className="xwind-limit-text">
                {xwindPercentage.toFixed(0)}% of Max Demo ({maxXwind} kt)
              </div>
            </div>
          </div>

          {/* Visual Interactive Compass Rose SVG */}
          <div className="mb-card rw-compass-card">
            <div className="mb-card-header">
              <span className="mb-card-title">Runway &amp; Wind Compass Rose</span>
              <span className="mb-badge">
                Angle Diff: {Math.abs(result.angleDifference)}°
              </span>
            </div>

            <div className="rw-compass-wrapper">
              <svg viewBox="0 0 300 300" className="rw-compass-svg">
                <defs>
                  {/* Marker Arrow for Wind Vector */}
                  <marker
                    id="windArrow"
                    viewBox="0 0 10 10"
                    refX="6"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
                  </marker>
                </defs>

                {/* Outer Compass Dial */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill="#0e131f"
                  stroke="#334155"
                  strokeWidth="2"
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={radius - 20}
                  fill="none"
                  stroke="#1e293b"
                  strokeWidth="1"
                  strokeDasharray="4 3"
                />

                {/* Cardinal Points */}
                <text x={cx} y={cy - radius + 15} fill="#94a3b8" fontSize="11" fontWeight="bold" textAnchor="middle">
                  N
                </text>
                <text x={cx + radius - 15} y={cy + 4} fill="#94a3b8" fontSize="11" fontWeight="bold" textAnchor="middle">
                  E
                </text>
                <text x={cx} y={cy + radius - 6} fill="#94a3b8" fontSize="11" fontWeight="bold" textAnchor="middle">
                  S
                </text>
                <text x={cx - radius + 15} y={cy + 4} fill="#94a3b8" fontSize="11" fontWeight="bold" textAnchor="middle">
                  W
                </text>

                {/* Degree tick lines */}
                {Array.from({ length: 12 }).map((_, i) => {
                  const deg = i * 30;
                  const rad = ((deg - 90) * Math.PI) / 180;
                  const x1 = cx + Math.cos(rad) * (radius - 5);
                  const y1 = cy + Math.sin(rad) * (radius - 5);
                  const x2 = cx + Math.cos(rad) * radius;
                  const y2 = cy + Math.sin(rad) * radius;
                  return (
                    <line
                      key={i}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="#475569"
                      strokeWidth={i % 3 === 0 ? '2' : '1'}
                    />
                  );
                })}

                {/* Runway Strip (Rotated) */}
                <g transform={`rotate(${result.runwayHeading - 90} ${cx} ${cy})`}>
                  {/* Runway Pavement */}
                  <rect
                    x={cx - 85}
                    y={cy - 12}
                    width="170"
                    height="24"
                    rx="3"
                    fill="#1e293b"
                    stroke="#64748b"
                    strokeWidth="1.5"
                  />
                  {/* Centerline Dashes */}
                  <line
                    x1={cx - 70}
                    y1={cy}
                    x2={cx + 70}
                    y2={cy}
                    stroke="#fbbf24"
                    strokeWidth="1.5"
                    strokeDasharray="8 6"
                  />
                  {/* Threshold Markings */}
                  <rect x={cx - 83} y={cy - 10} width="6" height="20" fill="#ffffff" opacity="0.8" />
                  <rect x={cx + 77} y={cy - 10} width="6" height="20" fill="#ffffff" opacity="0.8" />
                  
                  {/* Aircraft Silhouette heading along runway */}
                  <path
                    d={`M ${cx + 10} ${cy} L ${cx - 5} ${cy - 8} L ${cx - 2} ${cy - 2} L ${cx - 15} ${cy - 2} L ${cx - 18} ${cy - 6} L ${cx - 20} ${cy - 6} L ${cx - 19} ${cy} L ${cx - 20} ${cy + 6} L ${cx - 18} ${cy + 6} L ${cx - 15} ${cy + 2} L ${cx - 2} ${cy + 2} L ${cx - 5} ${cy + 8} Z`}
                    fill="#22c55e"
                  />
                </g>

                {/* Runway Designator Numbers (Fixed Orientation) */}
                <rect
                  x={rwyX2 - 14}
                  y={rwyY2 - 10}
                  width="28"
                  height="20"
                  rx="3"
                  fill="#0284c7"
                  stroke="#ffffff"
                  strokeWidth="1"
                />
                <text
                  x={rwyX2}
                  y={rwyY2 + 4}
                  fill="#ffffff"
                  fontSize="10"
                  fontWeight="900"
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  {rwyNum}
                </text>

                <rect
                  x={rwyX1 - 14}
                  y={rwyY1 - 10}
                  width="28"
                  height="20"
                  rx="3"
                  fill="#334155"
                  stroke="#94a3b8"
                  strokeWidth="1"
                />
                <text
                  x={rwyX1}
                  y={rwyY1 + 4}
                  fill="#ffffff"
                  fontSize="10"
                  fontWeight="900"
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  {recipNum}
                </text>

                {/* Wind Vector Vector Arrow */}
                {windSpeed > 0 && (
                  <g>
                    <line
                      x1={windStartX}
                      y1={windStartY}
                      x2={windEndX}
                      y2={windEndY}
                      stroke="#38bdf8"
                      strokeWidth="3"
                      markerEnd="url(#windArrow)"
                    />
                    <circle
                      cx={windStartX}
                      cy={windStartY}
                      r="4"
                      fill="#0284c7"
                      stroke="#ffffff"
                      strokeWidth="1"
                    />
                    <text
                      x={windStartX}
                      y={windStartY - 8}
                      fill="#38bdf8"
                      fontSize="10"
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      {result.windDirection}° / {result.windSpeed}kt
                    </text>
                  </g>
                )}

                {/* Center Pivot Point */}
                <circle cx={cx} cy={cy} r="3" fill="#ffffff" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
