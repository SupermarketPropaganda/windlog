import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { NavLogSummary, RunwayWindResult, Waypoint, SurfaceWeatherReport, RunwayDefinition } from '../types';
import { computeRunwayWindComponents } from '../engine/runway-wind';
import { findAirportRunways, generateGenericRunways, scoreRunwaysForWind } from '../data/airport-runways';
import { fetchAirportSurfaceWeather } from '../engine/surface-weather';

export interface RunwayWindViewProps {
  routeWaypoints?: Waypoint[];
  navLogSummary: NavLogSummary | null;
  onBackToNavLog?: () => void;
  onResultChange?: (res: RunwayWindResult) => void;
}

export const RunwayWindView: React.FC<RunwayWindViewProps> = ({
  routeWaypoints = [],
  navLogSummary,
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
      // Default to Évora (LPEV) & MAXED if route is empty
      list.push({
        role: 'Departure',
        waypoint: {
          id: 1,
          identifier: 'LPEV',
          name: 'Évora Airfield',
          type: 'airport',
          latitude: 38.532,
          longitude: -7.889,
          elevation: 807,
          country: 'PT',
        },
      });
      list.push({
        role: 'Destination',
        waypoint: {
          id: 2,
          identifier: 'MAXED',
          name: 'N. SRA. DE MACHEDE...',
          type: 'custom',
          latitude: 38.65,
          longitude: -7.7,
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
          <span className="rw-header-icon">✈</span>
          <div>
            <h1 className="rw-title">Runway Wind &amp; Crosswind Calculator</h1>
            <div className="rw-subtitle">
              Auto Route Runway Extraction, Live METAR &amp; Surface Wind Analysis
            </div>
          </div>
        </div>

        <div className="rw-header-actions">
          <button
            type="button"
            className={`btn rw-auto-toggle-btn ${isAutoWind ? 'rw-auto-on' : 'btn-cancel'}`}
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
            className="btn rw-refresh-btn"
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
            <span className="rw-route-icon">📁</span>
            <strong>Flight Plan Airports &amp; Aerodromes:</strong>
          </div>
          <div className="rw-airport-bar-meta">
            {activeAirport.elevation != null && (
              <span className="rw-elev-badge">Elev: {activeAirport.elevation} FT MSL</span>
            )}
            <span className="rw-active-badge">Active: {activeAirport.identifier} ({activeAirportRole})</span>
          </div>
        </div>

        <div className="rw-airport-cards-row">
          {routeAirports.map((item, idx) => {
            const isSelected = idx === selectedAirportIndex;
            return (
              <button
                key={`${item.role}_${item.waypoint.identifier}_${idx}`}
                type="button"
                className={`rw-airport-card-btn ${isSelected ? 'active' : ''}`}
                onClick={() => setSelectedAirportIndex(idx)}
              >
                <div className="rw-airport-card-role">
                  {item.role === 'Departure'
                    ? '🛫 DEPARTURE'
                    : item.role === 'Destination'
                    ? '🛬 DESTINATION'
                    : item.role === 'En-route'
                    ? '📍 EN-ROUTE'
                    : '🏢 AERODROME'}
                </div>
                <div className="rw-airport-card-ident">{item.waypoint.identifier}</div>
                <div className="rw-airport-card-name">{item.waypoint.name}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Live METAR / Surface Weather Banner or Amber Notice ─── */}
      {weatherReport && !weatherError && isAutoWind && weatherReport.windSpeed > 0 ? (
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
      ) : (
        <div className="rw-weather-amber-banner">
          <span className="amber-warn-icon">⚠️</span>
          <span>Live surface wind unavailable. Enter manual values.</span>
        </div>
      )}

      {/* Main Grid */}
      <div className="rw-grid-layout">
        {/* Left Column: Calculation Hub */}
        <div className="rw-inputs-col">
          <div className="rw-col-header">
            <h2 className="rw-col-title">CALCULATION HUB</h2>
          </div>

          {/* Runway Selection Card */}
          <div className="mb-card rw-step-card">
            <div className="mb-card-header">
              <span className="mb-card-title">STEP 1: Runway Selection &amp; Environment</span>
              <span className="rw-official-badge">
                {airportRunwayInfo ? 'Official. AIP Runways' : 'Generic Runways'}
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
                      <div className="rwy-choice-left">
                        <span className="rwy-choice-prefix">RWY</span>
                        <span className="rwy-choice-num">{item.runway.designator}</span>
                        <span className="rwy-choice-heading-pill">
                          {item.runway.heading.toString().padStart(item.runway.heading < 100 ? 1 : 3, '0')}°M
                        </span>
                      </div>
                      {item.isBest ? (
                        <span className="rwy-best-badge">
                          Recommended ✓
                        </span>
                      ) : item.runway.lengthMeters ? (
                        <span className="rwy-length-pill">
                          {item.runway.lengthMeters}M
                        </span>
                      ) : null}
                    </div>

                    <div className="rwy-choice-stats">
                      <span className={`stat-hw ${isRwyHeadwind ? 'pos' : 'neg'}`}>
                        {isRwyHeadwind ? '+' : ''}{item.headwind} kt {isRwyHeadwind ? 'Headwind' : 'Tailwind'}
                      </span>
                      <span className="stat-xw">
                        {item.crosswind} kt X-Wind
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 3-field row: Headwind, Crosswind, Custom Heading (°M) */}
            <div className="rw-step1-metrics-row">
              <div className="rw-step1-metric-box">
                <label className="rw-sublabel">Headwind</label>
                <div className="rw-step1-val">{Math.abs(result.headwind)} kt</div>
              </div>
              <div className="rw-step1-metric-box">
                <label className="rw-sublabel">Crosswind ({result.crosswindSide.toUpperCase()})</label>
                <div className="rw-step1-val">{result.crosswind} kt</div>
              </div>
              <div className="rw-step1-metric-box">
                <label className="rw-sublabel">Custom Heading (°M)</label>
                <div className="rw-input-unit-box">
                  <input
                    type="number"
                    min="1"
                    max="360"
                    value={runwayInput}
                    onChange={(e) => setRunwayInput(e.target.value)}
                    className="rw-main-input"
                  />
                  <span className="rw-unit-text">-</span>
                </div>
              </div>
            </div>
          </div>

          {/* Step 2: Wind Inputs Card */}
          <div className="mb-card rw-step-card">
            <div className="mb-card-header">
              <span className="mb-card-title">STEP 2: Wind Inputs</span>
            </div>

            <div className="rw-field-grid">
              <div className="rw-input-wrap">
                <label>WIND DIRECTION (°M)</label>
                <div className="rw-input-unit-box">
                  <input
                    type="number"
                    min="0"
                    max="360"
                    value={windDirInput}
                    onChange={(e) => handleManualWindDirChange(e.target.value)}
                    className="rw-main-input"
                  />
                  <span className="rw-unit-text">▾</span>
                </div>
              </div>

              <div className="rw-input-wrap">
                <label>WIND SPEED (KT)</label>
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
                <label>GUST SPEED (KT, OPTIONAL)</label>
                <div className="rw-input-unit-box">
                  <input
                    type="text"
                    placeholder="None"
                    value={gustSpeedInput}
                    onChange={(e) => handleManualGustChange(e.target.value)}
                    className="rw-main-input"
                  />
                  <span className="rw-unit-text">kt</span>
                </div>
              </div>

              <div className="rw-input-wrap">
                <label>MAX DEMO CROSSWIND (KT)</label>
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

          {/* 3. Reciprocal Runway Card */}
          <div className="mb-card rw-step-card rw-recip-summary-card">
            <div className="mb-card-header">
              <span className="mb-card-title">3. Reciprocal Runway ({recipNum})</span>
            </div>
            <div className="rw-reciprocal-body">
              <div className="rw-recip-info">
                <div>
                  <strong>RWY {recipNum} ({result.reciprocalHeading}°M):</strong>
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
            </div>
          </div>
        </div>

        {/* Right Column: Performance Analysis & Compass Rose */}
        <div className="rw-visual-col">
          {/* Card 1: STEP 3: Performance Analysis & Reciprocal */}
          <div className="mb-card rw-step-card">
            <div className="mb-card-header">
              <span className="mb-card-title">STEP 3: Performance Analysis &amp; Reciprocal</span>
            </div>

            {/* Top row: 2 Component Metric Cards */}
            <div className="rw-perf-cards-row">
              {/* Headwind Card */}
              <div className="rw-perf-metric-card">
                <div className="rw-perf-card-header">
                  <div className="rw-perf-header-left">
                    <span className="perf-icon-square">⬇</span>
                    <span className="rw-perf-title">{isHeadwind ? 'Headwind' : 'Tailwind'}</span>
                  </div>
                  <div className="rw-perf-val">
                    {Math.abs(result.headwind)} <span className="rw-perf-unit">kt</span>
                  </div>
                </div>
                <div className="rw-perf-bar-track">
                  <div
                    className="rw-perf-bar-fill rw-bar-headwind"
                    style={{
                      width: `${Math.min(100, Math.max(15, (Math.abs(result.headwind) / (windSpeed || 15)) * 100))}%`,
                    }}
                  />
                </div>
              </div>

              {/* Crosswind Card */}
              <div className="rw-perf-metric-card">
                <div className="rw-perf-card-header">
                  <div className="rw-perf-header-left">
                    <span className="perf-icon-square">➖</span>
                    <span className="rw-perf-title">Crosswind ({result.crosswindSide.toUpperCase()})</span>
                  </div>
                  <div className="rw-perf-val">
                    {result.crosswind} <span className="rw-perf-unit">kt</span>
                  </div>
                </div>
                <div className="rw-perf-bar-track">
                  <div
                    className="rw-perf-bar-fill rw-bar-crosswind"
                    style={{
                      width: `${Math.min(100, Math.max(15, (result.crosswind / (windSpeed || 15)) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Bottom section: Max Demo Crosswind */}
            <div className="rw-max-demo-section">
              <div className="rw-max-demo-header">
                <span className="rw-sublabel">Max Demo Crosswind (KT)</span>
                <span className="rw-max-demo-val">{maxXwind} kt</span>
              </div>
              <div className="xwind-limit-bar-wrap">
                <div
                  className="xwind-limit-bar-fill"
                  style={{
                    width: `${Math.min(100, xwindPercentage)}%`,
                    backgroundColor: '#f59e0b',
                  }}
                />
              </div>
              <div className="xwind-limit-text">
                {xwindPercentage.toFixed(0)}% of Max Demo ({maxXwind} KT)
              </div>
            </div>
          </div>

          {/* Card 2: Visual Compass Rose with Nested Reciprocal Box */}
          <div className="mb-card rw-step-card rw-compass-card">
            <div className="mb-card-header">
              <span className="mb-card-title">
                {activeAirport.identifier} RWY {rwyNum} Compass Rose
              </span>
              <span className="rw-angle-diff-badge">
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
                  strokeWidth="1.5"
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
                  
                  {/* Detailed Realistic Top-Down White Aircraft Silhouette */}
                  {/* Wings */}
                  <path
                    d={`M ${cx - 4} ${cy - 40} L ${cx + 6} ${cy - 40} L ${cx + 10} ${cy - 3} L ${cx + 10} ${cy + 3} L ${cx + 6} ${cy + 40} L ${cx - 4} ${cy + 40} L ${cx - 2} ${cy + 4} L ${cx - 2} ${cy - 4} Z`}
                    fill="#f8fafc"
                    stroke="#cbd5e1"
                    strokeWidth="0.8"
                  />
                  {/* Wing Trim / Control Surfaces */}
                  <line x1={cx - 3} y1={cy - 38} x2={cx - 3} y2={cy - 8} stroke="#94a3b8" strokeWidth="1" />
                  <line x1={cx - 3} y1={cy + 8} x2={cx - 3} y2={cy + 38} stroke="#94a3b8" strokeWidth="1" />
                  {/* Tail Horizontal Stabilizers */}
                  <path
                    d={`M ${cx - 26} ${cy - 15} L ${cx - 21} ${cy - 15} L ${cx - 17} ${cy - 2} L ${cx - 17} ${cy + 2} L ${cx - 21} ${cy + 15} L ${cx - 26} ${cy + 15} L ${cx - 24} ${cy} Z`}
                    fill="#f8fafc"
                    stroke="#cbd5e1"
                    strokeWidth="0.8"
                  />
                  {/* Fuselage */}
                  <ellipse cx={cx} cy={cy} rx="28" ry="5" fill="#ffffff" stroke="#cbd5e1" strokeWidth="0.8" />
                  {/* Nose Cone */}
                  <path d={`M ${cx + 26} ${cy - 3} Q ${cx + 31} ${cy} ${cx + 26} ${cy + 3} Z`} fill="#e2e8f0" />
                  {/* Cockpit Windshield */}
                  <path
                    d={`M ${cx + 8} ${cy - 3.5} L ${cx + 14} ${cy - 3} Q ${cx + 16} ${cy} ${cx + 14} ${cy + 3} L ${cx + 8} ${cy + 3.5} Q ${cx + 10} ${cy} ${cx + 8} ${cy - 3.5} Z`}
                    fill="#0f172a"
                  />
                  {/* Vertical Fin Dorsal Spine */}
                  <line x1={cx - 24} y1={cy} x2={cx - 14} y2={cy} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />

                  {/* Crosswind Deflection / Drift Vector Arrow near the nose */}
                  {result.crosswind > 0 && (
                    <g className="rw-crosswind-drift-arrow">
                      {result.crosswindSide === 'left' ? (
                        /* Pushed rightwards (+Y) */
                        <g>
                          <line
                            x1={cx + 14}
                            y1={cy + 8}
                            x2={cx + 14}
                            y2={cy + 20}
                            stroke="#38bdf8"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          />
                          <polygon
                            points={`${cx + 14},${cy + 25} ${cx + 9},${cy + 17} ${cx + 19},${cy + 17}`}
                            fill="#38bdf8"
                          />
                        </g>
                      ) : (
                        /* Pushed leftwards (-Y) */
                        <g>
                          <line
                            x1={cx + 14}
                            y1={cy - 8}
                            x2={cx + 14}
                            y2={cy - 20}
                            stroke="#38bdf8"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          />
                          <polygon
                            points={`${cx + 14},${cy - 25} ${cx + 9},${cy - 17} ${cx + 19},${cy - 17}`}
                            fill="#38bdf8"
                          />
                        </g>
                      )}
                    </g>
                  )}
                </g>

                {/* Runway Designator Numbers (Fixed Orientation) */}
                <rect
                  x={rwyX2 - 14}
                  y={rwyY2 - 10}
                  width="28"
                  height="20"
                  rx="3"
                  fill="#14b8a6"
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
                      strokeWidth="2.5"
                      markerEnd="url(#windArrow)"
                    />
                    <circle
                      cx={windStartX}
                      cy={windStartY}
                      r="4"
                      fill="#38bdf8"
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

            {/* Nested Reciprocal Runway Box at bottom of Compass Rose Card */}
            <div className="rw-compass-recip-box">
              <div className="rw-compass-recip-title">
                Reciprocal Runway ({recipNum})
              </div>
              <div className="rw-compass-recip-metrics">
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
          </div>
        </div>
      </div>
    </div>
  );
};
