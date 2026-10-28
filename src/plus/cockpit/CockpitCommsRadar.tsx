import React, { useState, useEffect } from 'react';
import { ActiveOrUpcomingAirspaceRadio } from '../spatial-airspace-index';

export interface CockpitCommsRadarProps {
  showRadioCard: boolean;
  onToggleShowRadioCard: (show: boolean) => void;
  airspaceCommsStack: ActiveOrUpcomingAirspaceRadio[];
  onFocusHazardCoordinate: (lat: number, lon: number, airspaceId?: string) => void;
  activeCom?: { freq: string; station: string };
  onActiveComChange?: (com: { freq: string; station: string }) => void;
}

export const CockpitCommsRadar: React.FC<CockpitCommsRadarProps> = React.memo(
  ({
    showRadioCard,
    onToggleShowRadioCard,
    airspaceCommsStack,
    onFocusHazardCoordinate,
    activeCom: externalActiveCom,
    onActiveComChange,
  }) => {
    const [internalActiveCom, setInternalActiveCom] = useState<{ freq: string; station: string }>({
      freq: '120.305 MHz',
      station: 'Cascais Tower',
    });
    const activeCom = externalActiveCom || internalActiveCom;
    const setActiveCom = (com: { freq: string; station: string }) => {
      setInternalActiveCom(com);
      onActiveComChange?.(com);
    };

    const [stbyCom, setStbyCom] = useState<{ freq: string; station: string }>({
      freq: '119.105 MHz',
      station: 'Lisboa Info (FIS)',
    });

    // Auto-stage upcoming sector frequency into STBY when approaching new airspace
    useEffect(() => {
      const insideItem = airspaceCommsStack.find((a) => a.role === 'INSIDE');
      const aheadItem = airspaceCommsStack.find(
        (a) => a.role === 'AHEAD' || a.role === 'VERTICAL_BUFFER'
      );
      if (insideItem) {
        setActiveCom({
          freq: insideItem.frequencyNumber,
          station: insideItem.frequencyStation,
        });
      }
      if (aheadItem && aheadItem.frequencyNumber !== activeCom.freq) {
        setStbyCom({
          freq: aheadItem.frequencyNumber,
          station: aheadItem.frequencyStation,
        });
      }
    }, [airspaceCommsStack]);

    const handleSwapFreqs = () => {
      const prevAct = activeCom;
      setActiveCom(stbyCom);
      setStbyCom(prevAct);
    };

    if (!showRadioCard) {
      return (
        <button
          type="button"
          className="efb-restore-pill"
          onClick={() => onToggleShowRadioCard(true)}
        >
          📻 Show Airspace &amp; Frequencies
        </button>
      );
    }

    return (
      <div className="efb-hud-card efb-radio-card">
        <div className="efb-card-header">
          <div className="efb-card-title">
            <span>📻</span>
            <strong>AIRSPACE &amp; COMMS</strong>
          </div>
          <button
            type="button"
            className="efb-card-close-mini"
            onClick={() => onToggleShowRadioCard(false)}
            title="Minimize Airspace & Comms card"
          >
            ✕
          </button>
        </div>

        {/* Garmin GTN/G1000 Style Active <-> Standby Flip-Flop Tuner */}
        <div className="efb-com-tuner-strip">
          <div className="efb-com-slot is-active">
            <span className="com-slot-tag">COM1 ACT</span>
            <strong className="com-slot-freq">{activeCom.freq.replace(' MHz', '')}</strong>
            <small className="com-slot-stn">{activeCom.station}</small>
          </div>

          <button
            type="button"
            className="efb-com-swap-btn"
            onClick={handleSwapFreqs}
            title="Flip-Flop Active and Standby Frequencies"
          >
            ⇄
          </button>

          <div className="efb-com-slot is-stby">
            <span className="com-slot-tag">STBY (AUTO)</span>
            <strong className="com-slot-freq">{stbyCom.freq.replace(' MHz', '')}</strong>
            <small className="com-slot-stn">{stbyCom.station}</small>
          </div>
        </div>

        <div className="efb-radio-stack-body">
          {airspaceCommsStack.length > 0 ? (
            airspaceCommsStack.map((item) => (
              <div
                key={`${item.airspace.id}-${item.role}`}
                className={`efb-radio-sector-box role-${item.role.toLowerCase()}`}
                onClick={() => {
                  setStbyCom({
                    freq: item.frequencyNumber,
                    station: item.frequencyStation,
                  });
                  const c = item.airspace.polygon[0];
                  if (c) onFocusHazardCoordinate(c[0], c[1], item.airspace.id);
                }}
                title="Click to stage frequency in STBY and center sector on map"
              >
                <div className="efb-radio-top">
                  <span
                    className={`efb-radio-role-badge badge-${item.role.toLowerCase()}`}
                  >
                    {item.role === 'INSIDE'
                      ? '● ACTIVE SECTOR'
                      : item.role === 'VERTICAL_BUFFER'
                      ? '↕ OVER / UNDER'
                      : `➔ IN ${item.distanceAheadNm.toFixed(1)} NM`}
                  </span>
                  <span className="efb-radio-class">
                    {item.airspace.type} · Class {item.airspace.classification}
                  </span>
                </div>

                <div className="efb-radio-main-row">
                  <div className="efb-radio-sector-info">
                    <strong>{item.airspace.name}</strong>
                    <span>{item.statusLabel}</span>
                  </div>
                  <div className="efb-freq-readout">
                    <small>{item.frequencyStation}</small>
                    <strong>{item.frequencyNumber}</strong>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="efb-radio-uncontrolled">
              <div className="efb-radio-main-row">
                <div className="efb-radio-sector-info">
                  <strong>CLASS G · UNCONTROLLED VFR</strong>
                  <span>No controlled airspace within 12 mins along vector</span>
                </div>
                <div className="efb-freq-readout">
                  <small>Lisboa Info (FIS)</small>
                  <strong>119.105 MHz</strong>
                </div>
              </div>
            </div>
          )}

          {/* Always-available FIS & Emergency Guard Strip */}
          <div className="efb-guard-strip">
            <span
              style={{ cursor: 'pointer' }}
              onClick={() =>
                setStbyCom({ freq: '119.105 MHz', station: 'Lisboa Info (FIS)' })
              }
              title="Click to load Lisboa Info 119.105 into STBY"
            >
              FIS: <strong>119.105</strong>
            </span>
            <span>•</span>
            <span
              style={{ cursor: 'pointer' }}
              onClick={() =>
                setStbyCom({ freq: '121.500 MHz', station: 'EMERGENCY GUARD' })
              }
              title="Click to load Emergency 121.500 into STBY"
            >
              GUARD: <strong className="val-guard">121.500</strong>
            </span>
          </div>
        </div>
      </div>
    );
  }
);
