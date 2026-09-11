import React, { useEffect, useState } from 'react';
import { avionicsManager, AvionicsState } from '../engine/avionics-manager';
import { Waypoint } from '../types';

interface AvionicsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeRoute: Waypoint[];
}

export const AvionicsModal: React.FC<AvionicsModalProps> = ({
  isOpen,
  onClose,
  activeRoute,
}) => {
  const [avionics, setAvionics] = useState<AvionicsState>(avionicsManager.getState());

  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = avionicsManager.subscribe((state) => {
      setAvionics(state);
    });
    return () => unsubscribe();
  }, [isOpen]);

  if (!isOpen) return null;

  const { status, receiverName, telemetry, trafficList } = avionics;

  const handleToggleGps = () => {
    if (status === 'CONNECTED' || status === 'SEARCHING') {
      avionicsManager.stopGpsTracking();
    } else {
      const nextWpt = activeRoute.length > 1 ? activeRoute[1] : null;
      avionicsManager.startGpsTracking(nextWpt);
    }
  };

  const handleToggleSimulation = () => {
    if (status === 'SIMULATING') {
      avionicsManager.stopSimulation();
      avionicsManager.stopGpsTracking();
    } else {
      avionicsManager.startSimulation(activeRoute, 115);
    }
  };

  const formatEte = (sec?: number) => {
    if (!sec || sec <= 0) return '--:--';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s.toString().padStart(2, '0')}s`;
  };

  return (
    <div className="legal-modal-overlay" onClick={onClose}>
      <div
        className="legal-modal-container"
        style={{ maxWidth: '780px', width: '92%' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="legal-modal-header" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.4rem' }}>📡</span>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
                Cockpit Avionics &amp; Telemetry HUD
              </h2>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Universal GPS Geolocation &amp; GDL 90 ADS-B Traffic Receiver
              </div>
            </div>
          </div>
          <button
            type="button"
            className="gemini-sidebar-collapse-btn"
            onClick={onClose}
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Status Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.75rem 1.25rem',
            background: 'var(--bg-secondary)',
            borderRadius: '8px',
            margin: '1rem 1.25rem 0.5rem',
            border: '1px solid var(--border-color)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              style={{
                display: 'inline-block',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor:
                  status === 'CONNECTED'
                    ? '#10b981'
                    : status === 'SIMULATING'
                    ? '#3b82f6'
                    : status === 'SEARCHING'
                    ? '#f59e0b'
                    : '#ef4444',
                boxShadow:
                  status === 'CONNECTED'
                    ? '0 0 8px #10b981'
                    : status === 'SIMULATING'
                    ? '0 0 8px #3b82f6'
                    : 'none',
              }}
            />
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
              {status === 'CONNECTED'
                ? 'ONLINE / LOCKED'
                : status === 'SIMULATING'
                ? 'SIMULATION ACTIVE'
                : status === 'SEARCHING'
                ? 'ACQUIRING POSITION...'
                : 'DISCONNECTED'}
            </span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              ({receiverName})
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-sm"
              style={{
                fontSize: '0.8rem',
                backgroundColor: status === 'CONNECTED' ? '#dc2626' : 'var(--primary-color)',
                color: '#fff',
                border: 'none',
                padding: '0.35rem 0.75rem',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
              onClick={handleToggleGps}
            >
              {status === 'CONNECTED' ? 'Disconnect GPS' : 'Enable Live GPS'}
            </button>

            <button
              type="button"
              className="btn btn-sm"
              style={{
                fontSize: '0.8rem',
                backgroundColor: status === 'SIMULATING' ? '#4b5563' : '#2563eb',
                color: '#fff',
                border: 'none',
                padding: '0.35rem 0.75rem',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
              disabled={activeRoute.length < 2}
              onClick={handleToggleSimulation}
              title={activeRoute.length < 2 ? 'Add at least 2 waypoints to simulate' : 'Simulate route flight'}
            >
              {status === 'SIMULATING' ? 'Stop Sim' : 'Simulate Flight'}
            </button>
          </div>
        </div>

        {/* Telemetry Metrics Grid */}
        <div style={{ padding: '0.75rem 1.25rem' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '0.75rem',
              marginBottom: '1rem',
            }}
          >
            <div
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '0.75rem',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>GROUND SPEED</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {telemetry ? `${telemetry.groundSpeedKnots}` : '--'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>KNOTS</div>
            </div>

            <div
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '0.75rem',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>TRUE TRACK</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {telemetry ? `${telemetry.trackDegrees.toString().padStart(3, '0')}°` : '---°'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>HEADING</div>
            </div>

            <div
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '0.75rem',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>GPS ALTITUDE</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {telemetry ? `${telemetry.altitudeFeet}` : '----'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>FT MSL</div>
            </div>

            <div
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '0.75rem',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>NEXT WAYPOINT</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                {telemetry?.distanceToNextNm !== undefined ? `${telemetry.distanceToNextNm} NM` : '-- NM'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                ETE: {formatEte(telemetry?.estimatedTimeEnrouteSec)}
              </div>
            </div>
          </div>

          {/* ADS-B Traffic Monitor Section */}
          <div
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '0.85rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.5rem',
              }}
            >
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                ADS-B COCKPIT TRAFFIC TARGETS ({trafficList.length})
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Port 4000 GDL 90 Standard
              </div>
            </div>

            {trafficList.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '1.5rem',
                  fontSize: '0.85rem',
                  color: 'var(--text-secondary)',
                }}
              >
                No active ADS-B traffic targets detected within range.
              </div>
            ) : (
              <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ textAlign: 'left', padding: '0.35rem' }}>TARGET</th>
                    <th style={{ textAlign: 'center', padding: '0.35rem' }}>ALTITUDE</th>
                    <th style={{ textAlign: 'center', padding: '0.35rem' }}>SPEED</th>
                    <th style={{ textAlign: 'center', padding: '0.35rem' }}>TRACK</th>
                    <th style={{ textAlign: 'right', padding: '0.35rem' }}>POSITION</th>
                  </tr>
                </thead>
                <tbody>
                  {trafficList.map((t) => (
                    <tr key={t.address} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '0.4rem', fontWeight: 600 }}>{t.callSign}</td>
                      <td style={{ textAlign: 'center', padding: '0.4rem' }}>{t.altitudeFeet} ft</td>
                      <td style={{ textAlign: 'center', padding: '0.4rem' }}>{t.groundSpeedKnots} kt</td>
                      <td style={{ textAlign: 'center', padding: '0.4rem' }}>{t.trackDegrees}°</td>
                      <td style={{ textAlign: 'right', padding: '0.4rem', color: 'var(--text-secondary)' }}>
                        {t.latitude.toFixed(3)}, {t.longitude.toFixed(3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className="legal-modal-footer"
          style={{
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Pos: {telemetry ? `${telemetry.latitude}, ${telemetry.longitude}` : 'No Fix'} (±{telemetry?.accuracyMeters ?? '--'}m)
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close HUD
          </button>
        </div>
      </div>
    </div>
  );
};
