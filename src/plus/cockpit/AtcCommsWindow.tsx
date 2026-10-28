import React, { useState, useEffect, useRef } from 'react';
import {
  AtcTranscriptItem,
  AtcTranscriberService,
} from '../atc-transcriber';

export interface AtcCommsWindowProps {
  isOpen: boolean;
  onClose: () => void;
  activeCom: { freq: string; station: string };
  callsign?: string;
  onNotifyToast?: (msg: string) => void;
}

export const AtcCommsWindow: React.FC<AtcCommsWindowProps> = ({
  isOpen,
  onClose,
  activeCom,
  callsign = 'CS-DXB',
  onNotifyToast,
}) => {
  const [service] = useState<AtcTranscriberService>(() => new AtcTranscriberService());
  const [items, setItems] = useState<AtcTranscriptItem[]>([]);
  const [interimText, setInterimText] = useState<string>('');
  const [manualInput, setManualInput] = useState<string>('');
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    service.setFrequency(activeCom.freq, activeCom.station);
    service.setCallsign(callsign);
  }, [service, activeCom, callsign]);

  useEffect(() => {
    const unsubItems = service.subscribe(setItems);
    const unsubInterim = service.onInterimSpeech(setInterimText);
    return () => {
      unsubItems();
      unsubInterim();
    };
  }, [service]);

  useEffect(() => {
    if (scrollRef.current && items.length > 0) {
      scrollRef.current.scrollTop = 0;
    }
  }, [items]);

  if (!isOpen) return null;

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    service.addTranscript(manualInput);
    setManualInput('');
  };

  const handleCopy = (text: string) => {
    navigator.clipboard?.writeText(text);
    onNotifyToast?.('Copied transmission to clipboard');
  };

  const formatUtcTime = (ts: number): string => {
    try {
      return new Date(ts).toISOString().slice(11, 19) + 'Z';
    } catch {
      return '--:--:--Z';
    }
  };

  // Find most recent pinned or extracted clearances
  const pinnedItem = items.find((i) => i.isPinned);
  const latestExtracted = items.find(
    (i) => i.extracted && (i.extracted.qnh || i.extracted.squawk || i.extracted.runway || i.extracted.altitudeFt)
  )?.extracted;

  return (
    <div className={`atc-comms-floating-window ${isMinimized ? 'is-minimized' : ''}`}>
      {/* Window Header */}
      <div className="atc-window-header">
        <div className="atc-header-left">
          <span className="atc-radio-icon">📻</span>
          <div className="atc-freq-readout">
            <span className="atc-freq-label">COM1 ACTIVE</span>
            <strong className="atc-freq-mhz">{activeCom.freq}</strong>
            <small className="atc-stn-name">{activeCom.station}</small>
          </div>
        </div>

        <div className="atc-header-right">
          <div
            className="atc-rx-pill is-active"
            title={`VHF Radio Audio Stream · Monitoring incoming frequency transmissions on ${activeCom.freq}`}
          >
            <span className="atc-rx-dot is-active" />
            <span>RX {activeCom.freq.replace(' MHz', '')}</span>
          </div>

          <button
            type="button"
            className="atc-btn-icon"
            onClick={() => setIsMinimized((p) => !p)}
            title={isMinimized ? 'Expand Window' : 'Minimize Window'}
          >
            {isMinimized ? '▲' : '▼'}
          </button>
          <button
            type="button"
            className="atc-btn-icon atc-btn-close"
            onClick={onClose}
            title="Close ATC Comms Window"
          >
            ✕
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Pinned Clearances & Flight Numbers Bar */}
          {(pinnedItem || latestExtracted) && (
            <div className="atc-pinned-clearance-bar">
              <span className="atc-pinned-tag">📌 ACTIVE CLEARANCE / DATA</span>
              <div className="atc-chips-row">
                {latestExtracted?.qnh && (
                  <span className="atc-data-chip chip-qnh">
                    QNH: <strong>{latestExtracted.qnh}</strong>
                  </span>
                )}
                {latestExtracted?.squawk && (
                  <span className="atc-data-chip chip-squawk">
                    SQUAWK: <strong>{latestExtracted.squawk}</strong>
                  </span>
                )}
                {latestExtracted?.runway && (
                  <span className="atc-data-chip chip-rwy">
                    RWY: <strong>{latestExtracted.runway}</strong>
                  </span>
                )}
                {latestExtracted?.altitudeFt && (
                  <span className="atc-data-chip chip-alt">
                    ALT: <strong>{latestExtracted.altitudeFt.toLocaleString()} FT</strong>
                  </span>
                )}
              </div>
              {pinnedItem && (
                <div className="atc-pinned-text">
                  <em>"{pinnedItem.text}"</em>
                </div>
              )}
            </div>
          )}

          {/* Interim Real-Time Speech Preview */}
          {interimText && (
            <div className="atc-interim-preview">
              <span className="interim-indicator">🎙️ Speaking...</span>
              <em>"{interimText}"</em>
            </div>
          )}

          {/* Scrollable Transcript List */}
          <div className="atc-transcript-scroll" ref={scrollRef}>
            {items.length === 0 ? (
              <div className="atc-empty-state">
                <span>🎙️ Ready to transcribe ATC &amp; Cockpit Radio</span>
                <p>
                  Transmissions on <strong>{activeCom.freq}</strong> ({activeCom.station}) will
                  appear here in real time as speech is detected.
                </p>
                <div className="atc-quick-sim-buttons">
                  <button
                    type="button"
                    onClick={() => service.simulateSampleExchange('CLEARANCE')}
                  >
                    ▶ Test Clearance Exchange
                  </button>
                  <button
                    type="button"
                    onClick={() => service.simulateSampleExchange('APPROACH')}
                  >
                    ▶ Test Approach &amp; Landing
                  </button>
                </div>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className={`atc-bubble speaker-${item.speaker.toLowerCase()} ${
                    item.isPinned ? 'is-pinned' : ''
                  }`}
                >
                  <div className="atc-bubble-meta">
                    <span className={`atc-speaker-badge badge-${item.speaker.toLowerCase()}`}>
                      {item.speaker === 'ATC' ? '📡 ATC / CONTROLLER' : '✈️ PILOT'}
                    </span>
                    <span className="atc-bubble-freq">{item.frequency}</span>
                    <span className="atc-bubble-time">{formatUtcTime(item.timestamp)}</span>
                    <div className="atc-bubble-actions">
                      <button
                        type="button"
                        onClick={() => service.togglePin(item.id)}
                        title={item.isPinned ? 'Unpin' : 'Pin to top'}
                      >
                        {item.isPinned ? '★' : '☆'}
                      </button>
                      <button
                        type="button"
                        onClick={() => service.toggleSpeaker(item.id)}
                        title="Toggle Speaker (ATC <-> Pilot)"
                      >
                        ⇄
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy(item.text)}
                        title="Copy text"
                      >
                        📋
                      </button>
                      <button
                        type="button"
                        onClick={() => service.deleteItem(item.id)}
                        title="Delete entry"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div className="atc-bubble-text">{item.text}</div>

                  {item.extracted && (
                    <div className="atc-bubble-extracted">
                      {item.extracted.qnh && (
                        <span className="chip-mini">QNH {item.extracted.qnh}</span>
                      )}
                      {item.extracted.squawk && (
                        <span className="chip-mini">Squawk {item.extracted.squawk}</span>
                      )}
                      {item.extracted.runway && (
                        <span className="chip-mini">Rwy {item.extracted.runway}</span>
                      )}
                      {item.extracted.altitudeFt && (
                        <span className="chip-mini">{item.extracted.altitudeFt} ft</span>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Bottom Manual Scratchpad & Sim Controls */}
          <div className="atc-window-footer">
            <form onSubmit={handleManualSubmit} className="atc-input-form">
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Type or paste radio transmission (e.g. QNH 1019, squawk 7000)..."
              />
              <button type="submit" disabled={!manualInput.trim()}>
                Add
              </button>
            </form>

            <div className="atc-footer-actions">
              <div className="atc-sim-pills">
                <button
                  type="button"
                  onClick={() => service.simulateSampleExchange('CLEARANCE')}
                  title="Simulate ATC Departure / Transit Clearance"
                >
                  ⚡ Clearance Sim
                </button>
                <button
                  type="button"
                  onClick={() => service.simulateSampleExchange('APPROACH')}
                  title="Simulate Landing Clearance"
                >
                  🛬 Landing Sim
                </button>
              </div>

              {items.length > 0 && (
                <button
                  type="button"
                  className="atc-btn-clear"
                  onClick={() => {
                    if (confirm('Clear ATC comms transcript history?')) {
                      service.clearAll();
                    }
                  }}
                >
                  Clear Log
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
