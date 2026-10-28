import React, { useState, useEffect } from 'react';
import { LogbookService, PilotLogbookEntry } from '../logbook-service';

export interface LogbookModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LogbookModal: React.FC<LogbookModalProps> = ({ isOpen, onClose }) => {
  const [entries, setEntries] = useState<PilotLogbookEntry[]>([]);

  useEffect(() => {
    if (isOpen) {
      setEntries(LogbookService.getEntries());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleExportCsv = () => {
    const csv = LogbookService.exportCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `gustlog_pilot_logbook_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this flight entry from your logbook?')) {
      LogbookService.deleteEntry(id);
      setEntries(LogbookService.getEntries());
    }
  };

  const totalFlightMinutes = entries.reduce((acc, e) => acc + (e.flightTimeMinutes || 0), 0);
  const totalBlockMinutes = entries.reduce((acc, e) => acc + (e.blockTimeMinutes || 0), 0);
  const totalLandings = entries.reduce((acc, e) => acc + (e.landingsDay || 0) + (e.landingsNight || 0), 0);

  const formatHrsMins = (totalMins: number) => {
    const h = Math.floor(totalMins / 60);
    const m = Math.round(totalMins % 60);
    return `${h}h ${m.toString().padStart(2, '0')}m`;
  };

  return (
    <div className="logbook-modal-backdrop" onClick={onClose}>
      <div className="logbook-modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="logbook-modal-header">
          <div className="logbook-header-left">
            <span className="logbook-header-icon">📖</span>
            <div>
              <h3>PILOT DIGITAL LOGBOOK</h3>
              <p>Automatic OOOI Flight Times &amp; EASA/FAA Compatible Record</p>
            </div>
          </div>
          <div className="logbook-header-right">
            {entries.length > 0 && (
              <button type="button" className="logbook-btn-export" onClick={handleExportCsv}>
                ⬇ Export CSV
              </button>
            )}
            <button type="button" className="logbook-btn-close" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        {/* Totals Summary Ribbon */}
        <div className="logbook-totals-ribbon">
          <div className="logbook-stat">
            <span>TOTAL FLIGHT TIME</span>
            <strong>{formatHrsMins(totalFlightMinutes)}</strong>
          </div>
          <div className="logbook-stat">
            <span>TOTAL BLOCK TIME</span>
            <strong>{formatHrsMins(totalBlockMinutes)}</strong>
          </div>
          <div className="logbook-stat">
            <span>FLIGHTS LOGGED</span>
            <strong>{entries.length}</strong>
          </div>
          <div className="logbook-stat">
            <span>TOTAL LANDINGS</span>
            <strong>{totalLandings}</strong>
          </div>
        </div>

        {/* Entries Table */}
        <div className="logbook-table-wrap">
          {entries.length === 0 ? (
            <div className="logbook-empty-state">
              <span>✈️ No flights logged yet</span>
              <p>
                Flights are automatically logged when taking off and landing in GustLog Plus,
                recording Out, Off, On, and In (OOOI) timestamps.
              </p>
            </div>
          ) : (
            <table className="logbook-table">
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>AIRCRAFT</th>
                  <th>FROM</th>
                  <th>TO</th>
                  <th>OUT / OFF</th>
                  <th>ON / IN</th>
                  <th>FLIGHT</th>
                  <th>BLOCK</th>
                  <th>DIST</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const outTime = entry.outTimestamp
                    ? new Date(entry.outTimestamp).toISOString().slice(11, 16) + 'Z'
                    : '--:--Z';
                  const offTime = entry.offTimestamp
                    ? new Date(entry.offTimestamp).toISOString().slice(11, 16) + 'Z'
                    : '--:--Z';
                  const onTime = entry.onTimestamp
                    ? new Date(entry.onTimestamp).toISOString().slice(11, 16) + 'Z'
                    : '--:--Z';
                  const inTime = entry.inTimestamp
                    ? new Date(entry.inTimestamp).toISOString().slice(11, 16) + 'Z'
                    : '--:--Z';

                  return (
                    <tr key={entry.id}>
                      <td className="cell-mono">{entry.date}</td>
                      <td>
                        <strong>{entry.aircraftModel}</strong>
                        {entry.tailNumber && <small> ({entry.tailNumber})</small>}
                      </td>
                      <td className="cell-airport">{entry.departureIcao}</td>
                      <td className="cell-airport">{entry.destinationIcao}</td>
                      <td className="cell-mono">
                        {outTime} / {offTime}
                      </td>
                      <td className="cell-mono">
                        {onTime} / {inTime}
                      </td>
                      <td className="cell-time cell-bold">{formatHrsMins(entry.flightTimeMinutes)}</td>
                      <td className="cell-time">{formatHrsMins(entry.blockTimeMinutes)}</td>
                      <td>{entry.distanceFlownNm.toFixed(1)} NM</td>
                      <td>
                        <button
                          type="button"
                          className="logbook-btn-del"
                          onClick={() => handleDelete(entry.id)}
                          title="Delete entry"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
