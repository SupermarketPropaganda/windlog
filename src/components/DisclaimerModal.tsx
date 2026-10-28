import React, { useEffect, useRef, useState } from 'react';
import { CURRENT_LEGAL_VERSION, LEGAL_DOCUMENT_TITLE, LEGAL_DOCUMENT_SUBTITLE, LEGAL_REVIEW_STATUS, LEGAL_SECTIONS, LEGAL_SUMMARY, PRIVACY_DOCUMENT_TITLE, PRIVACY_SECTIONS, downloadLegalDocument } from '../data/legal-terms';
export interface DisclaimerModalProps { onAccept: () => void; onClose?: () => void; isReadOnly?: boolean; }
export const DisclaimerModal: React.FC<DisclaimerModalProps> = ({ onAccept, onClose, isReadOnly = false }) => {
  const [viewMode, setViewMode] = useState<'summary' | 'full' | 'privacy'>('summary');
  const [safety, setSafety] = useState(false);
  const [terms, setTerms] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => previous?.focus();
  }, []);
  return <div className="modal-overlay" style={{ zIndex: 10000 }}>
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="legal-title" className="disclaimer-modal legal-modal-container" onKeyDown={e => {
      if (e.key === 'Escape' && onClose) { e.preventDefault(); onClose(); }
      if (e.key !== 'Tab') return;
      const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]') || []);
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }}>
      <div className="disclaimer-header"><div><h2 id="legal-title" className="disclaimer-title">{LEGAL_DOCUMENT_TITLE}</h2><p className="disclaimer-subtitle">{LEGAL_DOCUMENT_SUBTITLE} · Version {CURRENT_LEGAL_VERSION}</p></div></div>
      <div className="legal-view-tabs" aria-label="Legal documents">
        <button className="legal-tab-btn" aria-pressed={viewMode === 'summary'} onClick={() => setViewMode('summary')}>Safety summary</button>
        <button className="legal-tab-btn" aria-pressed={viewMode === 'full'} onClick={() => setViewMode('full')}>Full agreement</button>
        <button className="legal-tab-btn" aria-pressed={viewMode === 'privacy'} onClick={() => setViewMode('privacy')}>Privacy notice</button>
        <button className="legal-tab-btn" onClick={() => downloadLegalDocument(viewMode === 'privacy')}>Download {viewMode === 'privacy' ? 'privacy notice' : 'agreement'}</button>
      </div>
      <div className="disclaimer-body legal-modal-body">
        <p className="disclaimer-callout-danger">{LEGAL_REVIEW_STATUS}</p>
        {viewMode === 'summary' ? <ul className="disclaimer-points">{LEGAL_SUMMARY.map(p => <li key={p}>{p}</li>)}</ul> : <div className="legal-full-view">
          {viewMode === 'privacy' && <h3>{PRIVACY_DOCUMENT_TITLE}</h3>}
          {(viewMode === 'privacy' ? PRIVACY_SECTIONS : LEGAL_SECTIONS).map(s => <section key={s.id} className={`legal-section-block ${s.isCallout ? 'is-callout' : ''} ${s.isUccCaps ? 'is-ucc-caps' : ''}`}><h3 className="legal-section-title">{s.title}</h3><div className="legal-section-content">{s.content.map(p => <p key={p}>{p}</p>)}</div></section>)}
        </div>}
      </div>
      {!isReadOnly && <div className="disclaimer-checkboxes-card">
        <label className="disclaimer-checkbox-label"><input className="disclaimer-checkbox" type="checkbox" checked={safety} onChange={e => setSafety(e.target.checked)} /><span>I understand Gustlog is a supplemental planning aid. Its outputs require independent verification and do not replace the pilot’s operational responsibilities.</span></label>
        <label className="disclaimer-checkbox-label"><input className="disclaimer-checkbox" type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} /><span>I agree to the Terms of Service and User Agreement, version {CURRENT_LEGAL_VERSION}, and acknowledge the separate Privacy Notice. My mandatory legal rights remain unaffected.</span></label>
      </div>}
      <div className="disclaimer-actions">
        {onClose && <button className="btn btn-cancel" onClick={onClose}>{isReadOnly ? 'Close' : 'Leave without accepting'}</button>}
        {!isReadOnly && <button className="btn btn-confirm disclaimer-accept-btn" disabled={!safety || !terms} onClick={() => { if (safety && terms) onAccept(); }}>Agree and continue</button>}
      </div>
    </div>
  </div>;
};
