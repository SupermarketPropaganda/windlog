import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { NavLogSummary, RunwayWindResult, Waypoint, SurfaceWeatherReport, RunwayDefinition } from '../types';
import { computeRunwayWindComponents } from '../engine/runway-wind';
import { findAirportRunways, generateGenericRunways, scoreRunwaysForWind } from '../data/airport-runways';
import { fetchAirportSurfaceWeather } from '../engine/surface-weather';

export interface RunwayWindViewProps {
  routeWaypoints?: Waypoint[];
  navLogSummary: NavLogSummary | null;
  onBackToNavLog: () => void;
  onResultChange?: (res: RunwayWindResult) => void;
}

export const RunwayWindView: React.FC<RunwayWindViewProps> = ({
  routeWaypoints = [],
  navLogSummary,
  onBackToNavLog,
  onResultChange,
}) => {
  // ─── Extract Route Airports ───
  const routeAirports = useMemo(() => {
    const list: { role: 'Departure' | 'Destination' | 'En-route' | 'Default'; waypoint: Waypoint }[] = [];
    if (routeWaypoints && routeWaypoints.length > 0) {
      const dep = routeWaypoints[0];
      const dest = routeWaypoints.length > 1 ? routeWaypoints[routeWaypoints.length - 1] : null;

      list.push({ role: 'Departure', waypoint: dep });
      if (dest && dest.identifier !== dep.identifier) {
        list.push({ role: 'Destination', waypoint: dest });
      }

      // Add other airport waypoints along route
      routeWaypoints.slice(1, -1).forEach((wp) => {
        if (wp.type === 'airport' && !list.some((item) => item.waypoint.identifier === wp.identifier)) {
          list.push({ role: 'En-route', waypoint: wp });
        }
      });
    }

    if (list.length === 0) {
      // Default to Cascais (LPCS) if route is empty
      list.push({
        role: 'Default',
        waypoint: {
          id: 0,
          identifier: 'LPCS',
          name: 'Cascais Airport',
          type: 'airport',
          latitude: 38.725,
          longitude: -9.355,
          elevation: 325,
          country: 'PT',
        },
      });
    }
    return list;
  }, [routeWaypoints]);

  // Selected airport from route or presets
  const [selectedAirportIndex, setSelectedAirportIndex] = useState<number>(0);
  const activeAirport = routeAirports[selectedAirportIndex]?.waypoint || routeAirports[0].waypoint;
  const activeAirportRole = routeAirports[selectedAirportIndex]?.role || 'Airport';

  // ─── Runways for Active Airport ───
  const airportRunwayInfo = useMemo(() => {
    return findAirportRunways(activeAirport.identifier);
  }, [activeAirport.identifier]);

  // All available runway definitions
  const availableRunways: RunwayDefinition[] = useMemo(() => {
    if (airportRunwayInfo && airportRunwayInfo.runways.length > 0) {
      return airportRunwayInfo.runways;
    }
    // Fallback: If route leg 1 has track, use that heading, else 270
    const legHeading = navLogSummary?.legs[0]?.magneticHeading || 270;
    return generateGenericRunways(legHeading);
  }, [airportRunwayInfo, navLogSummary]);

  // ─── Weather State & Auto Wind ───
  const [isAutoWind, setIsAutoWind] = useState<boolean>(true);
  const [weatherReport, setWeatherReport] = useState<SurfaceWeatherReport | null>(null);
  const [isLoadingWeather, setIsLoadingWeather] = useState<boolean>(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  // Runway input (default to first runway or 270)
  const [runwayInput, setRunwayInput] = useState<string>(
    availableRunways[0]?.heading ? availableRunways[0].heading.toString() : '270'
  );
  
  // Wind inputs
  const [windDirInput, setWindDirInput] = useState<string>('310');
  const [windSpeedInput, setWindSpeedInput] = useState<string>('15');
  const [gustSpeedInput, setGustSpeedInput] = useState<string>('');
  const [maxDemoXwind, setMaxDemoXwind] = useState<string>('15');

  // Load weather for active airport
  const loadWeather = useCallback(
    async (airport: Waypoint, force: boolean = false) => {
      setIsLoadingWeather(true);
      setWeatherError(null);
      try {
        const report = await fetchAirportSurfaceWeather(
          airport.identifier,
          airport.latitude,
          airport.longitude,
          force
        );

        if (report) {
          setWeatherReport(report);
          setWindDirInput(report.windDirection.toString());
          setWindSpeedInput(report.windSpeed.toString());
          setGustSpeedInput(report.gustSpeed ? report.gustSpeed.toString() : '');

          // Automatically select best runway if available
          if (availableRunways.length > 0 && report.windSpeed > 0) {
            const scored = scoreRunwaysForWind(
              availableRunways,
              report.windDirection,
              report.windSpeed
            );
            const best = scored.find((s) => s.isBest);
            if (best) {
              setRunwayInput(best.runway.heading.toString());
            }
          }
        } else {
          setWeatherError('Live surface wind currently unavailable for this station.');
        }
      } catch (err) {
        console.error('Failed to load surface weather:', err);
        setWeatherError('Failed to fetch surface weather.');
      } finally {
        setIsLoadingWeather(false);
      }
    },
    [availableRunways]
  );

  // Trigger weather load when airport changes or when Auto is toggled ON
  useEffect(() => {
    if (isAutoWind && activeAirport) {
      loadWeather(activeAirport, false);
    }
  }, [activeAirport, isAutoWind, loadWeather]);

  // When airport changes, also update default runway if not auto-selected
  useEffect(() => {
    if (availableRunways.length > 0) {
      setRunwayInput(availableRunways[0].heading.toString());
    }
  }, [activeAirport.identifier, availableRunways]);

  // Numerical values
  const rwyHeading = parseFloat(runwayInput) || 270;
  const windDir = parseFloat(windDirInput) || 0;
  const windSpeed = parseFloat(windSpeedInput) || 0;
  const gustSpeed = gustSpeedInput ? parseFloat(gustSpeedInput) : undefined;
  const maxXwind = parseFloat(maxDemoXwind) || 15;

  // Compute Runway Wind Components
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

  // Scored runways for the current wind conditions
  const scoredRunways = useMemo(() => {
    return scoreRunwaysForWind(availableRunways, windDir, windSpeed);
  }, [availableRunways, windDir, windSpeed]);

  // Handle manual input tweaks (turns Auto Mode off)
  const handleManualWindDirChange = (val: string) => {
    setWindDirInput(val);
    setIsAutoWind(false);
  };

  const handleManualWindSpeedChange = (val: string) => {
    setWindSpeedInput(val);
    setIsAutoWind(false);
  };

  const handleManualGustChange = (val: string) => {
    setGustSpeedInput(val);
    setIsAutoWind(false);
  };

  const handleManualRwyChange = (deg: number) => {
    setRunwayInput(deg.toString());
  };

  const handleSwitchToReciprocal = () => {
    setRunwayInput(result.reciprocalHeading.toString());
  };

  const handleRefreshWeather = () => {
    setIsAutoWind(true);
    if (activeAirport) {
      loadWeather(activeAirport, true);
    }
  };

  // ─── Visual Compass Rose Geometry ───
  const cx = 150;
  const cy = 150;
  const radius = 105;

  const rwyRad = ((result.runwayHeading - 90) * Math.PI) / 180;
  const rwyX1 = cx - Math.cos(rwyRad) * (radius - 10);
  const rwyY1 = cy - Math.sin(rwyRad) * (radius - 10);
  const rwyX2 = cx + Math.cos(rwyRad) * (radius - 10);
  const rwyY2 = cy + Math.sin(rwyRad) * (radius - 10);

  const windRad = ((result.windDirection - 90) * Math.PI) / 180;
  const windStartX = cx + Math.cos(windRad) * (radius + 5);
  const windStartY = cy + Math.sin(windRad) * (radius + 5);
  const windEndX = cx - Math.cos(windRad) * 35;
  const windEndY = cy - Math.sin(windRad) * 35;

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
              Auto Route Runway Extraction, Live METAR &amp; Surface Wind Analysis
            </div>
          </div>
        </div>

        <div className="rw-header-actions">
          <button
            type="button"
            className={`btn ${isAutoWind ? 'btn-primary' : 'btn-cancel'} rw-auto-toggle-btn`}
            onClick={() => {
              const next = !isAutoWind;
              setIsAutoWind(next);
              if (next && activeAirport) loadWeather(activeAirport, true);
            }}
            title="Toggle automatic live weather fetching from NOAA METAR / Open-Meteo"
          >
            {isLoadingWeather ? '⏳ Loading...' : isAutoWind ? '⚡ Auto Weather: ON' : '⚙️ Manual Weather'}
          </button>
          <button
            type="button"
            className="btn btn-cancel rw-refresh-btn"
            onClick={handleRefreshWeather}
            disabled={isLoadingWeather}
            title="Refresh latest METAR and surface observations"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* ─── Route Airport Selector Bar ─── */}
      <div className="mb-card rw-airport-bar-card">
        <div className="rw-airport-bar-header">
          <div className="rw-airport-bar-title">
            <span className="rw-route-icon">🗺️</span>
            <strong>Flight Plan Airports &amp; Aerodromes:</strong>
          </div>
          <div className="rw-airport-bar-meta">
            {activeAirport.elevation != null && (
              <span className="rw-elev-badge">Elev: {activeAirport.elevation} ft MSL</span>
            )}
            <span className="rw-active-badge">Active: {activeAirport.identifier} ({activeAirportRole})</span>
          </div>
        </div>

        <div className="rw-airport-pills-wrap">
          {routeAirports.map((item, idx) => {
            const isSelected = idx === selectedAirportIndex;
            return (
              <button
                key={`${item.role}_${item.waypoint.identifier}_${idx}`}
                type="button"
                className={`rw-airport-pill ${isSelected ? 'active' : ''}`}
                onClick={() => setSelectedAirportIndex(idx)}
              >
                <span className="pill-role">
                  {item.role === 'Departure'
                    ? '🛫 Departure'
                    : item.role === 'Destination'
                    ? '🛬 Destination'
                    : item.role === 'En-route'
                    ? '📍 En-route'
                    : '🏢 Aerodrome'}
                </span>
                <span className="pill-ident">{item.waypoint.identifier}</span>
                <span className="pill-name">{item.waypoint.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Live METAR / Surface Weather Banner ─── */}
      {weatherReport && (
        <div className="rw-metar-banner">
          <div className="metar-banner-top">
            <div className="metar-source-tag">
              <span className="pulse-dot"></span>
              <strong>{weatherReport.source}</strong>
              <span className="metar-station">{weatherReport.stationId}</span>
              {weatherReport.flightCategory && (
                <span className={`flight-cat-badge cat-${weatherReport.flightCategory.toLowerCase()}`}>
                  {weatherReport.flightCategory}
                </span>
              )}
            </div>
            <div className="metar-quick-stats">
              <span>
                Wind: <strong>{weatherReport.windDirection}° / {weatherReport.windSpeed} kt</strong>
                {weatherReport.gustSpeed ? ` (Gusts ${weatherReport.gustSpeed} kt)` : ''}
              </span>
              {weatherReport.temperature != null && (
                <span>Temp: <strong>{weatherReport.temperature}°C</strong></span>
              )}
              {weatherReport.altimeterQnh != null && (
                <span>QNH: <strong>{weatherReport.altimeterQnh} hPa</strong></span>
              )}
              <span className="obs-time">
                Observed: {weatherReport.observedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
          {weatherReport.rawMetar && (
            <div className="metar-raw-code">
              <code>{weatherReport.rawMetar}</code>
            </div>
          )}
        </div>
      )}

      {weatherError && !weatherReport && (
        <div className="rw-weather-warn">
          ⚠️ {weatherError} You can enter wind values manually below.
        </div>
      )}

      {/* Main Grid */}
      <div className="rw-grid-layout">
        {/* Left Column: Inputs & Runways */}
        <div className="rw-inputs-col">
          {/* Runway Selection Card */}
          <div className="mb-card">
            <div className="mb-card-header">
              <span className="mb-card-title">1. Runway Selection ({activeAirport.identifier})</span>
              <span className="mb-badge">
                {airportRunwayInfo ? 'Official AIP Runways' : 'Generic Runways'}
              </span>
            </div>

            {/* Scored Runway Option Cards */}
            <div className="rw-runway-cards-grid">
              {scoredRunways.map((item) => {
                const isSelected = Math.round(rwyHeading) === item.runway.heading;
                const isRwyHeadwind = item.headwind >= 0;
                return (
                  <div
                    key={item.runway.designator}
                    className={`rw-runway-choice-card ${isSelected ? 'selected' : ''} ${
                      item.isBest ? 'is-best' : ''
                    }`}
                    onClick={() => handleManualRwyChange(item.runway.heading)}
                  >
                    <div className="rwy-choice-top">
                      <span className="rwy-choice-num">RWY {item.runway.designator}</span>
                      <span className="rwy-choice-heading">{item.runway.heading}°M</span>
                      {item.isBest && (
                        <span className="rwy-best-badge">🟢 Recommended</span>
                      )}
                    </div>

                    <div className="rwy-choice-stats">
                      <span className={`stat-hw ${isRwyHeadwind ? 'pos' : 'neg'}`}>
                        {isRwyHeadwind ? '+' : ''}{item.headwind} kt {isRwyHeadwind ? 'Headwind' : 'Tailwind'}
                      </span>
                      <span className="stat-xw">
                        {item.crosswind} kt X-Wind
                      </span>
                    </div>

                    {item.runway.lengthMeters && (
                      <div className="rwy-choice-dim">
                        {item.runway.lengthMeters}m ({Math.round(item.runway.lengthMeters * 3.28084)} ft) • {item.runway.surface || 'Asphalt'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Custom Heading Slider/Input */}
            <div className="rw-field-group rw-custom-heading-wrap">
              <div className="rw-input-wrap">
                <label>Custom Runway Heading (°M)</label>
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
            </div>
          </div>

          {/* Wind & Gust Card */}
          <div className="mb-card">
            <div className="mb-card-header">
              <span className="mb-card-title">2. Surface Wind &amp; Gusts</span>
              <span className={`mb-badge ${isAutoWind ? 'badge-live' : 'badge-manual'}`}>
                {isAutoWind ? '⚡ Live Weather Synced' : '⚙️ Manual Override'}
              </span>
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
                    onChange={(e) => handleManualWindDirChange(e.target.value)}
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
                    onChange={(e) => handleManualWindSpeedChange(e.target.value)}
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
                    onChange={(e) => handleManualGustChange(e.target.value)}
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
              <span className="mb-card-title">
                {activeAirport.identifier} RWY {rwyNum} Compass Rose
              </span>
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

                {/* Wind Vector Arrow */}
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
