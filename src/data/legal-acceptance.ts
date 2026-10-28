import { CURRENT_LEGAL_VERSION } from './legal-terms';
import { getStorageItemSync, setStorageItem } from './storage-manager';
export interface LegalAcceptance { userId: string; version: string; acceptedAt: string; safetyAcknowledged: true; termsAccepted: true; }
export const legalAcceptanceKey = (userId: string) => `gustlog_legal_acceptance:${userId}`;
export function hasCurrentLegalAcceptance(userId: string): boolean {
  try {
  const record = getStorageItemSync<LegalAcceptance | null>(legalAcceptanceKey(userId), null);
  return !!record && record.userId === userId && record.version === CURRENT_LEGAL_VERSION && record.safetyAcknowledged === true && record.termsAccepted === true && Number.isFinite(Date.parse(record.acceptedAt));
  } catch {
    // Restricted or unavailable storage must require acceptance, not crash the app.
    return false;
  }
}
export function recordLegalAcceptance(userId: string): void {
  const record: LegalAcceptance = { userId, version: CURRENT_LEGAL_VERSION, acceptedAt: new Date().toISOString(), safetyAcknowledged: true, termsAccepted: true };
  // Local convenience record only; not a tamper-resistant or server-verified audit trail.
  void setStorageItem(legalAcceptanceKey(userId), record);
}
