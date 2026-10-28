import { describe, it, expect, beforeEach } from 'vitest';
import { AtcTranscriberService } from '../atc-transcriber';

describe('AtcTranscriberService Radio Speech-to-Text & Extraction Engine', () => {
  let service: AtcTranscriberService;

  beforeEach(() => {
    service = new AtcTranscriberService();
    service.clearAll();
    service.setFrequency('120.305 MHz', 'Cascais Tower');
    service.setCallsign('CS-DXB');
  });

  it('tracks current active frequency in use', () => {
    const f0 = service.getFrequency();
    expect(f0.freq).toBe('120.305 MHz');
    expect(f0.station).toBe('Cascais Tower');

    service.setFrequency('119.105 MHz', 'Lisboa Info (FIS)');
    const f1 = service.getFrequency();
    expect(f1.freq).toBe('119.105 MHz');
    expect(f1.station).toBe('Lisboa Info (FIS)');
  });

  it('correctly extracts QNH, Squawk, Runway, and Altitude numbers from radio phraseology', () => {
    const text = 'CS-DXB cleared to enter Cascais CTR via Sierra 1, maintain 2500 feet, QNH 1019, squawk 7000, runway 35';
    const extracted = service.extractAviationData(text);

    expect(extracted.qnh).toBe(1019);
    expect(extracted.squawk).toBe('7000');
    expect(extracted.runway).toBe('35');
    expect(extracted.altitudeFt).toBe(2500);
  });

  it('extracts Flight Level (FL) format altitudes correctly', () => {
    const text = 'TAP123 climb to FL 085 contact Lisboa radar';
    const extracted = service.extractAviationData(text);

    expect(extracted.altitudeFt).toBe(8500);
  });

  it('intelligently distinguishes ATC instructions from Pilot readbacks/requests', () => {
    const atcMsg = 'CS-DXB cleared to land runway 35 wind 320 at 10kt';
    expect(service.detectSpeaker(atcMsg)).toBe('ATC');

    const pilotMsg = 'CS-DXB request taxi to holding point runway 35';
    expect(service.detectSpeaker(pilotMsg)).toBe('PILOT');
  });

  it('adds transcript entries with timestamp, frequency, and tags', () => {
    const item = service.addTranscript('Cleared touch and go runway 35, QNH 1020');

    expect(item.id).toBeDefined();
    expect(item.frequency).toBe('120.305 MHz');
    expect(item.station).toBe('Cascais Tower');
    expect(item.extracted?.qnh).toBe(1020);
    expect(item.extracted?.runway).toBe('35');

    const all = service.getItems();
    expect(all.length).toBe(1);
    expect(all[0].text).toContain('touch and go');

    // Test pinning
    service.togglePin(item.id);
    expect(service.getItems()[0].isPinned).toBe(true);

    // Test delete
    service.deleteItem(item.id);
    expect(service.getItems().length).toBe(0);
  });
});
