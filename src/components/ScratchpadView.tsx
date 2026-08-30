import React, { useState } from 'react';
import {
  AircraftProfile,
  WindState,
  WindMode,
  Wind,
  RouteToken,
  NavLogSummary,
  Waypoint,
} from '../types';
import { AircraftBar } from './AircraftBar';
import { WindPanel } from './WindPanel';
import { NavLogRow } from './NavLogRow';
import { CoordPrompt } from './CoordPrompt';
import { RouteMap } from './RouteMap';
import { AltitudeProfile } from './AltitudeProfile';

export interface ScratchpadViewProps {
  /** The current aircraft profile */
  profile: AircraftProfile;
  onProfileChange: (p: AircraftProfile) => void;

  /** The current wind configuration */
  windState: WindState;
  onWindChange: (w: Wind | null) => void;
  onWindModeChange: (m: WindMode) => void;
  isWindLoading: boolean;

  /** The main route input string */
  routeInput: string;
  onRouteInputChange: (s: string) => void;

  /** The parsed route tokens and their resolution statuses */
  tokens: RouteToken[];
  resolvedWaypoints: Waypoint[];

  /** The compiled navigation log summary */
  navLog: NavLogSummary | null;

  /** Currently active leg index for in-flight tracking */
  activeLegIndex: number | null;
  onSelectLeg: (index: number) => void;

  /** Action handlers */
  onReverseRoute: () => void;
  onClearRoute: () => void;
  onShareRoute: () => void;
  onOpenKneeboard: () => void;
  onTokenClick: (token: RouteToken) => void;
  onLegAltitudeChange: (legIndex: number, newAltitude: number) => void;

  /** Toast notification text */
  toastMessage: string | null;

  /** If present, displays the custom coordinate modal for the given identifier */
  coordPrompt: { identifier: string } | null;
  onCoordConfirm: (w: Waypoint) => void;
  onCoordCancel: () => void;
}

const formatTime = (seconds: number) => {
  if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '--:--';
  const totalMins = Math.floor(seconds / 60);
  const totalSecs = Math.round(seconds % 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m`;
  }
  return `${m.toString().padStart(2, '0')}:${totalSecs.toString().padStart(2, '0')}`;
};

/**
 * Main application screen composing all subcomponents in an iPad/PC responsive layout.
 */
export const ScratchpadView: React.FC<ScratchpadViewProps> = (props) => {
  const [showMap, setShowMap] = useState(true);
  const [showProfile, setShowProfile] = useState(true);

  const hasWaypoints = props.resolvedWaypoints.length > 0;
  const fuelUnitLabel = props.profile.fuelUnit === 'gph' ? 'gal' : 'L';

  return (
    <div className="app-container">
      {/* Toast Notification */}
      {props.toastMessage && (
        <div className="toast-notification">
          ✓ {props.toastMessage}
        </div>
      )}

      {/* Top Header: Aircraft Settings & Live Wind */}
      <div className="app-header">
        <AircraftBar profile={props.profile} onChange={props.onProfileChange} />
        <WindPanel
          windState={props.windState}
          onWindChange={props.onWindChange}
          onModeChange={props.onWindModeChange}
          isLoading={props.isWindLoading}
        />
      </div>

      {/* Flight Route Scratchpad Input */}
      <div className="route-section">
        <div className="route-input-wrapper">
          <input
            type="text"
            className="route-input"
            placeholder="TYPE ROUTE: LPCS/4500 COIMB/3500 LPCS"
            value={props.routeInput}
            onChange={(e) => props.onRouteInputChange(e.target.value)}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
          />

          <div className="route-actions">
            {props.routeInput.trim().length > 0 && (
              <>
                <button
                  type="button"
                  className="route-action-btn"
                  title="Share flight route as URL"
                  onClick={props.onShareRoute}
                >
                  🔗 Share
                </button>
                {props.navLog && props.navLog.legs.length > 0 && (
                  <button
                    type="button"
                    className="route-action-btn"
                    title="Open Printable SOP Form 002 Kneeboard / PDF"
                    onClick={props.onOpenKneeboard}
                    style={{ borderColor: '#3b82f6', color: '#60a5fa' }}
                  >
                    📄 PDF Kneeboard
                  </button>
                )}
                <button
                  type="button"
                  className="route-action-btn"
                  title="Reverse Route (Return Flight)"
                  onClick={props.onReverseRoute}
                >
                  ⇄ Reverse
                </button>
                <button
                  type="button"
                  className="route-action-btn"
                  title="Clear Route"
                  onClick={props.onClearRoute}
                >
                  ✕ Clear
                </button>
              </>
            )}

            {hasWaypoints && (
              <>
                <button
                  type="button"
                  className={`route-action-btn ${showMap ? 'active-toggle' : ''}`}
                  onClick={() => setShowMap(!showMap)}
                  title="Toggle interactive map"
                >
                  🗺️ {showMap ? 'Hide Map' : 'Show Map'}
                </button>
                <button
                  type="button"
                  className={`route-action-btn ${showProfile ? 'active-toggle' : ''}`}
                  onClick={() => setShowProfile(!showProfile)}
                  title="Toggle vertical altitude cross-section"
                >
                  ✈ {showProfile ? 'Hide Profile' : 'Show Profile'}
                </button>
              </>
            )}
          </div>
        </div>

        {props.tokens.length > 0 && (
          <div className="route-tokens">
            {props.tokens.map((token, idx) => (
              <span
                key={idx}
                className={`token ${token.status} ${token.status === 'not-found' ? 'clickable' : ''}`}
                onClick={() => props.onTokenClick(token)}
                title={
                  token.status === 'not-found'
                    ? 'Click to set coordinates manually'
                    : `${token.waypoint?.name || token.identifier}${
                        token.altitudeOverride
                          ? ` @ ${token.altitudeOverride.toLocaleString()} ft`
                          : ''
                      }`
                }
              >
                {token.identifier}
                {token.altitudeOverride && (
                  <span className="token-alt"> {token.altitudeOverride / 1000}k</span>
                )}
                {token.status === 'not-found' && ' ⚠️'}
                {token.status === 'resolved' && ' ✓'}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Responsive Main Layout:
          - Desktop & iPad: 2 Columns (Left: NavLog & Summary, Right: Map & Vertical Profile)
          - Mobile: Single Column (NavLog & Summary, then Map, then Vertical Profile below) */}
      <div className={`flight-dashboard-grid ${hasWaypoints && (showMap || showProfile) ? 'with-sidebar' : 'single-col'}`}>
        {/* Left Column: NavLog Legs & Summary */}
        <div className="dashboard-left-col">
          <div className="navlog-list">
            {props.navLog?.legs.map((leg, idx) => (
              <NavLogRow
                key={leg.id}
                leg={leg}
                isActive={props.activeLegIndex === idx}
                onSelect={() => props.onSelectLeg(idx)}
                onAltitudeChange={(newAlt) => props.onLegAltitudeChange(idx, newAlt)}
              />
            ))}

            {(!props.navLog || props.navLog.legs.length === 0) &&
              props.routeInput.trim().length > 0 && (
                <div className="empty-navlog-hint">
                  Type at least 2 valid waypoints to generate the flight navigation log.
                </div>
              )}
          </div>

          {/* Clean Flight & Fuel Summary */}
          {props.navLog && props.navLog.legs.length > 0 && (
            <div className="navlog-summary-container">
              <div className="navlog-summary">
                <div className="summary-item">
                  <div className="summary-label">Total Distance</div>
                  <div className="summary-val">{props.navLog.totalDistance.toFixed(1)} nm</div>
                </div>
                <div className="summary-item">
                  <div className="summary-label">Total ETE</div>
                  <div className="summary-val">{formatTime(props.navLog.totalEte)}</div>
                </div>
                <div className="summary-item">
                  <div className="summary-label">Total Legs</div>
                  <div className="summary-val">{props.navLog.legs.length}</div>
                </div>
                {props.profile.fuelFlow > 0 && (
                  <div className="summary-item">
                    <div className="summary-label">Trip Fuel</div>
                    <div className="summary-val val-fuel">
                      {props.navLog.totalFuel.toFixed(1)} {fuelUnitLabel}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Tactical Map + Vertical Altitude Profile directly below */}
        {hasWaypoints && (showMap || showProfile) && (
          <div className="dashboard-right-col">
            {showMap && (
              <RouteMap
                navLog={props.navLog}
                waypoints={props.resolvedWaypoints}
                activeLegIndex={props.activeLegIndex}
                onSelectLeg={props.onSelectLeg}
              />
            )}

            {props.navLog && props.navLog.legs.length > 0 && showProfile && (
              <AltitudeProfile
                navLog={props.navLog}
                activeLegIndex={props.activeLegIndex}
                onSelectLeg={props.onSelectLeg}
              />
            )}
          </div>
        )}
      </div>

      {props.coordPrompt && (
        <CoordPrompt
          identifier={props.coordPrompt.identifier}
          onConfirm={props.onCoordConfirm}
          onCancel={props.onCoordCancel}
        />
      )}
    </div>
  );
};
