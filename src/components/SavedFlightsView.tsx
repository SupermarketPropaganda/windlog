import React, { useState, useEffect, useMemo } from 'react';
import { SavedFlight, ActiveView } from '../types';
import { getSavedFlightsSync, deleteSavedFlight, saveFlightRecord } from '../data/saved-flights';
import { useAuth } from '../context/AuthContext';
import { copyShareableRouteLink } from '../utils/url-route';

export interface SavedFlightsViewProps {
  onLoadFlight: (flight: SavedFlight) => void;
  onNavigate: (view: ActiveView) => void;
}

export const filterSavedFlights = (flights: SavedFlight[], searchQuery: string): SavedFlight[] => {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return flights;
  return flights.filter(
    (f) =>
      Boolean(f && (
        (f.name && f.name.toLowerCase().includes(q)) ||
        (f.routeInput && f.routeInput.toLowerCase().includes(q)) ||
        (f.profile?.aircraftModel && f.profile.aircraftModel.toLowerCase().includes(q))
      ))
  );
};

export const formatEte = (seconds: number): string => {
  if (typeof seconds !== 'number' || isNaN(seconds) || seconds <= 0 || !isFinite(seconds)) {
    return '0m';
  }
  const mins = Math.floor(seconds / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  return `${m}m`;
};

export const formatDeparture = (timeStr: string | null): string => {
  if (!timeStr) return 'Live / Real-Time';
  try {
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) return timeStr;
    return (
      d.toLocaleDateString(undefined, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }) +
      ' • ' +
      d.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      })
    );
  } catch {
    return timeStr;
  }
};

export const SavedFlightsView: React.FC<SavedFlightsViewProps> = ({
  onLoadFlight,
  onNavigate,
}) => {
  const { user } = useAuth();
  const [flights, setFlights] = useState<SavedFlight[]>(() => getSavedFlightsSync(user?.id));
  const [searchQuery, setSearchQuery] = useState('');
  const [editingFlightId, setEditingFlightId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Keep list updated if storage changes
  const refreshFlights = () => {
    setFlights(getSavedFlightsSync(user?.id));
  };

  useEffect(() => {
    refreshFlights();
  }, [user?.id]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete "${name}"?`)) {
      await deleteSavedFlight(id);
      refreshFlights();
      showToast(`Flight "${name}" deleted.`);
    }
  };

  const handleStartRename = (flight: SavedFlight) => {
    setEditingFlightId(flight.id);
    setEditName(flight.name);
  };

  const handleSaveRename = async (flight: SavedFlight) => {
    if (!editName.trim()) return;
    await saveFlightRecord({
      ...flight,
      name: editName.trim(),
    });
    setEditingFlightId(null);
    refreshFlights();
    showToast('Flight title updated.');
  };

  const handleShare = async (flight: SavedFlight) => {
    const ok = await copyShareableRouteLink(flight.routeInput, flight.profile);
    if (ok) {
      showToast('Route link copied to clipboard!');
    }
  };

  const filteredFlights = useMemo(() => {
    return filterSavedFlights(flights, searchQuery);
  }, [flights, searchQuery]);

  return (
    <div className="saved-flights-view-container">
      {/* Toast Notification */}
      {toastMessage && <div className="toast-notification">✓ {toastMessage}</div>}

      {/* Header */}
      <div className="saved-flights-header">
        <div className="saved-flights-title-group">
          <div className="saved-flights-icon-badge">📁</div>
          <div>
            <h1 className="saved-flights-title">Saved Flights</h1>
            <p className="saved-flights-subtitle">
              Your personal flight route library and scheduled flight plans
            </p>
          </div>
        </div>

        <div className="saved-flights-top-actions">
          <button
            type="button"
            className="saved-flights-new-btn"
            onClick={() => onNavigate('navlog')}
          >
            <span>+</span> Plan New Flight
          </button>
        </div>
      </div>

      {/* Search & Counter Bar */}
      {flights.length > 0 && (
        <div className="saved-flights-controls-bar">
          <div className="saved-flights-search-wrap">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="saved-flights-search-input"
              placeholder="Search by flight title, route waypoints, or aircraft..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchQuery('')}
              >
                ✕
              </button>
            )}
          </div>
          <div className="saved-flights-count-badge">
            {filteredFlights.length} {filteredFlights.length === 1 ? 'flight' : 'flights'}
          </div>
        </div>
      )}

      {/* Flight Cards List */}
      {filteredFlights.length > 0 ? (
        <div className="saved-flights-grid">
          {filteredFlights.map((flight) => {
            const isEditing = editingFlightId === flight.id;
            return (
              <div key={flight.id} className="saved-flight-card">
                <div className="saved-flight-card-header">
                  <div className="saved-flight-name-row">
                    {isEditing ? (
                      <div className="saved-flight-edit-wrap">
                        <input
                          type="text"
                          className="saved-flight-edit-input"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(flight);
                            if (e.key === 'Escape') setEditingFlightId(null);
                          }}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="saved-flight-save-btn"
                          onClick={() => handleSaveRename(flight)}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="saved-flight-cancel-btn"
                          onClick={() => setEditingFlightId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <h3 className="saved-flight-name" title={flight.name}>
                          {flight.name}
                        </h3>
                        <button
                          type="button"
                          className="saved-flight-rename-icon"
                          onClick={() => handleStartRename(flight)}
                          title="Rename Flight"
                        >
                          ✏️
                        </button>
                      </>
                    )}
                  </div>
                  <span className="saved-flight-date">
                    Saved {new Date(flight.updatedAt).toLocaleDateString()}
                  </span>
                </div>

                {/* Route String Banner */}
                <div className="saved-flight-route-box">
                  <span className="route-indicator">ROUTE</span>
                  <code className="saved-flight-route-text">{flight.routeInput}</code>
                </div>

                {/* Flight Metadata Pills */}
                <div className="saved-flight-meta-pills">
                  <div className="flight-meta-pill">
                    <span className="pill-label">Departure</span>
                    <span className="pill-val">
                      {flight.departureTime ? '📅 ' : '⏱️ '}
                      {formatDeparture(flight.departureTime)}
                    </span>
                  </div>

                  <div className="flight-meta-pill">
                    <span className="pill-label">Aircraft</span>
                    <span className="pill-val">
                      ✈ {flight.profile?.aircraftModel || 'Custom'} (
                      {(flight.profile?.cruiseAltitude ?? 0).toLocaleString()} ft)
                    </span>
                  </div>

                  {flight.summary && (
                    <>
                      <div className="flight-meta-pill">
                        <span className="pill-label">Distance</span>
                        <span className="pill-val highlight">
                          {typeof flight.summary.totalDistance === 'number'
                            ? flight.summary.totalDistance.toFixed(1)
                            : flight.summary.totalDistance}{' '}
                          NM
                        </span>
                      </div>
                      <div className="flight-meta-pill">
                        <span className="pill-label">ETE</span>
                        <span className="pill-val">{formatEte(flight.summary.totalEte)}</span>
                      </div>
                      <div className="flight-meta-pill">
                        <span className="pill-label">Legs</span>
                        <span className="pill-val">{flight.summary.legsCount ?? 0}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="saved-flight-actions">
                  <button
                    type="button"
                    className="saved-flight-load-btn"
                    onClick={() => onLoadFlight(flight)}
                    title="Load route, altitude, and aircraft into cockpit"
                  >
                    <span>✈</span> Open in Cockpit
                  </button>

                  <button
                    type="button"
                    className="saved-flight-share-btn"
                    onClick={() => handleShare(flight)}
                    title="Copy shareable flight link"
                  >
                    🔗 Share
                  </button>

                  <button
                    type="button"
                    className="saved-flight-delete-btn"
                    onClick={() => handleDelete(flight.id, flight.name)}
                    title="Delete saved flight"
                  >
                    🗑
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="saved-flights-empty-card">
          <div className="empty-icon">📁</div>
          <h2 className="empty-title">
            {searchQuery ? 'No flights match your search' : 'No Saved Flights Yet'}
          </h2>
          <p className="empty-desc">
            {searchQuery
              ? `No flights found matching "${searchQuery}". Clear your search or try another query.`
              : 'Create a flight route in the Flight Planner and click the "💾 Save Flight" button to store it in your library for quick access anytime.'}
          </p>
          <button
            type="button"
            className="empty-action-btn"
            onClick={() => onNavigate('navlog')}
          >
            Launch Flight Planner ✈
          </button>
        </div>
      )}
    </div>
  );
};
