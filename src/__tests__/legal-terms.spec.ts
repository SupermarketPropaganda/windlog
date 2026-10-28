import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DisclaimerModal } from '../components/DisclaimerModal';
import { CURRENT_LEGAL_VERSION, LEGAL_SECTIONS, PRIVACY_SECTIONS, legalDocumentText } from '../data/legal-terms';
const storage = vi.hoisted(() => new Map<string, unknown>());
vi.mock('../data/storage-manager', () => ({ getStorageItemSync: (key: string, fallback: unknown) => storage.get(key) ?? fallback, setStorageItem: async (key: string, value: unknown) => { storage.set(key, value); } }));
import { hasCurrentLegalAcceptance, legalAcceptanceKey, recordLegalAcceptance } from '../data/legal-acceptance';
describe('Versioned legal acceptance', () => {
  beforeEach(() => storage.clear());
  it('requires fresh agreement and never imports a device-wide legacy acceptance', () => {
    storage.set('gustlog_legal_version_accepted', CURRENT_LEGAL_VERSION);
    expect(hasCurrentLegalAcceptance('pilot-a')).toBe(false);
  });
  it('records acceptance for one profile, not other people on the same device', () => {
    recordLegalAcceptance('pilot-a');
    expect(hasCurrentLegalAcceptance('pilot-a')).toBe(true);
    expect(hasCurrentLegalAcceptance('pilot-b')).toBe(false);
  });
  it('requires renewed acceptance for an old version and rejects incomplete records', () => {
    recordLegalAcceptance('pilot-a');
    const record = storage.get(legalAcceptanceKey('pilot-a')) as Record<string, unknown>;
    storage.set(legalAcceptanceKey('pilot-a'), { ...record, version: '2026.1-REL' });
    expect(hasCurrentLegalAcceptance('pilot-a')).toBe(false);
    for (const changed of [{ userId: 'pilot-b' }, { termsAccepted: false }, { safetyAcknowledged: false }, { acceptedAt: 'invalid' }]) {
      storage.set(legalAcceptanceKey('pilot-a'), { ...record, ...changed });
      expect(hasCurrentLegalAcceptance('pilot-a')).toBe(false);
    }
  });
  it('starts unchecked, disables agreement and offers a decline path', () => {
    const markup = renderToStaticMarkup(React.createElement(DisclaimerModal, { onAccept: () => {}, onClose: () => {} }));
    expect(markup).not.toContain('checked=""');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('Leave without accepting');
    expect(markup).toContain('aria-modal="true"');
  });
  it('allows read-only access without another acceptance', () => {
    const markup = renderToStaticMarkup(React.createElement(DisclaimerModal, { onAccept: () => {}, onClose: () => {}, isReadOnly: true }));
    expect(markup).not.toContain('type="checkbox"');
    expect(markup).not.toContain('Agree and continue');
  });
});
describe('Legal document distribution', () => {
  it('exports distinct complete terms and privacy notices with version and review status', () => {
    for (const privacy of [false, true]) {
      const text = legalDocumentText(privacy);
      expect(text).toContain(CURRENT_LEGAL_VERSION);
      expect(text).toContain('Review draft');
      for (const section of privacy ? PRIVACY_SECTIONS : LEGAL_SECTIONS) {
        expect(text).toContain(section.title);
        for (const paragraph of section.content) expect(text).toContain(paragraph);
      }
    }
    expect(legalDocumentText(true)).not.toContain('14. Allocation of liability');
    expect(legalDocumentText()).not.toContain('exclusively in the courts located in Delaware');
  });
});
