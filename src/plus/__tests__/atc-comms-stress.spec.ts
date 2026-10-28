import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AtcTranscriberService } from '../atc-transcriber';

describe('ATC Comms & Speech Processing Stress-Testing Suite', () => {
  let service: AtcTranscriberService;

  beforeEach(() => {
    service = new AtcTranscriberService();
    service.clearAll();
    service.setFrequency('120.305 MHz', 'Cascais Tower');
    service.setCallsign('CS-DXB');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. HIGH-VOLUME INGESTION & FREQUENCY HOPPING
  // =========================================================================
  describe('High-Volume Ingestion & Active Frequency Hopping', () => {
    it('processes 5,000 rapid radio messages across 50 active frequencies without memory bloat', () => {
      // 50 simulated active frequencies from 118.000 to 136.975 MHz
      const frequencies = Array.from({ length: 50 }, (_, i) => {
        const mhz = (118.0 + (i * (136.975 - 118.0)) / 49).toFixed(3);
        return {
          freq: `${mhz} MHz`,
          station: `Sim Station ${i + 1}`,
        };
      });

      const messageTemplates = [
        'CS-DXB cleared to land runway 35, wind 310 at 12kt, QNH 1018',
        'CS-DXB maintain 3500 feet, squawk 7000',
        'CS-DXB climb to FL 085, contact Lisboa radar',
        'CS-DXB request taxi to runway 03',
        'Runway 35 cleared to land, CS-DXB',
      ];

      const startTime = performance.now();
      const generatedIds = new Set<string>();

      // Ingest 5,000 rapid messages
      for (let i = 0; i < 5000; i++) {
        const freqObj = frequencies[i % frequencies.length];
        service.setFrequency(freqObj.freq, freqObj.station);

        const text = `${messageTemplates[i % messageTemplates.length]} [msg-${i}]`;
        const item = service.addTranscript(text);

        expect(item.id).toBeDefined();
        generatedIds.add(item.id);
        expect(item.frequency).toBe(freqObj.freq);
        expect(item.station).toBe(freqObj.station);
      }

      const durationMs = performance.now() - startTime;
      const items = service.getItems();

      // Bounding verification: ring buffer MUST cap at 100 entries max
      expect(items.length).toBe(100);

      // Verify throughput performance (should comfortably process > 5,000 msgs under 2s)
      expect(durationMs).toBeLessThan(5000);

      // Verify that all 5,000 generated IDs were globally unique
      expect(generatedIds.size).toBe(5000);

      // Most recent item should be msg-4999 with the 50th frequency
      const expectedLastFreq = frequencies[4999 % frequencies.length];
      expect(items[0].text).toContain('msg-4999');
      expect(items[0].frequency).toBe(expectedLastFreq.freq);
      expect(items[0].station).toBe(expectedLastFreq.station);
    });
  });

  // =========================================================================
  // 2. ADVERSARIAL PHRASEOLOGY & NUMBER EXTRACTION FUZZING
  // =========================================================================
  describe('Adversarial Aviation Phraseology & Number Extraction Fuzzing', () => {
    describe('QNH & Altimeter Setting Variations', () => {
      it('correctly extracts standard European hPa QNH values', () => {
        expect(service.extractAviationData('QNH 1013').qnh).toBe(1013);
        expect(service.extractAviationData('QNH 992').qnh).toBe(992);
        expect(service.extractAviationData('QNH 1024').qnh).toBe(1024);
        expect(service.extractAviationData('Information Bravo, QNH 1005, runway 21').qnh).toBe(1005);
      });

      it('correctly converts US inHg altimeter format with and without decimal to hPa', () => {
        // 29.92 inHg * 33.8639 = 1013.2 -> 1013 hPa
        expect(service.extractAviationData('altimeter 29.92').qnh).toBe(1013);
        expect(service.extractAviationData('altimeter 2992').qnh).toBe(1013);

        // 30.12 inHg * 33.8639 = 1020 hPa
        expect(service.extractAviationData('altimeter 30.12').qnh).toBe(1020);
        expect(service.extractAviationData('altimeter 3012').qnh).toBe(1020);

        // 28.50 inHg * 33.8639 = 965 hPa
        expect(service.extractAviationData('altimeter 28.50').qnh).toBe(965);
      });

      it('normalizes spoken and phonetic numbers for QNH and Altimeter', () => {
        // "altimeter two niner niner two" -> 2992 inHg -> 1013 hPa
        expect(service.extractAviationData('altimeter two niner niner two').qnh).toBe(1013);

        // "altimeter two niner decimal niner two" -> 29.92 inHg -> 1013 hPa
        expect(service.extractAviationData('altimeter two niner decimal niner two').qnh).toBe(1013);

        // "QNH one zero two zero" -> 1020 hPa
        expect(service.extractAviationData('QNH one zero two zero').qnh).toBe(1020);

        // "QNH niner niner two" -> 992 hPa
        expect(service.extractAviationData('QNH niner niner two').qnh).toBe(992);
      });

      it('handles extreme barometric pressures (850 to 1080 hPa) and rejects out-of-bounds numbers', () => {
        // Valid extreme record pressures
        expect(service.extractAviationData('QNH 850').qnh).toBe(850);
        expect(service.extractAviationData('QNH 1080').qnh).toBe(1080);
        expect(service.extractAviationData('QNH 870').qnh).toBe(870);
        expect(service.extractAviationData('QNH 1065').qnh).toBe(1065);

        // Unsafe / out of physical limits pressures should be safely discarded
        expect(service.extractAviationData('QNH 849').qnh).toBeUndefined();
        expect(service.extractAviationData('QNH 1081').qnh).toBeUndefined();
        expect(service.extractAviationData('QNH 500').qnh).toBeUndefined();
        expect(service.extractAviationData('QNH 2000').qnh).toBeUndefined();
      });

      it('heals common OCR / Speech-to-Text letter substitutions (O/l) and safely ignores corrupt strings', () => {
        // Letter 'O' substituted for digit '0'
        expect(service.extractAviationData('QNH 1O13').qnh).toBe(1013);
        expect(service.extractAviationData('QNH 102O').qnh).toBe(1020);

        // Letter 'l' (lowercase L) substituted for digit '1'
        expect(service.extractAviationData('QNH l013').qnh).toBe(1013);

        // Missing numbers / malformed strings should not crash and yield undefined
        expect(service.extractAviationData('QNH').qnh).toBeUndefined();
        expect(service.extractAviationData('altimeter').qnh).toBeUndefined();
        expect(service.extractAviationData('altimeter set').qnh).toBeUndefined();
        expect(service.extractAviationData('altimeter 29.9Z').qnh).toBeUndefined();
        expect(service.extractAviationData('QNH ABCD').qnh).toBeUndefined();
      });
    });

    describe('Squawk Code Validation (Strict Octal Check)', () => {
      it('correctly extracts valid 4-digit octal squawk codes (digits 0-7)', () => {
        expect(service.extractAviationData('squawk 7000').squawk).toBe('7000');
        expect(service.extractAviationData('squawk 0421').squawk).toBe('0421');
        expect(service.extractAviationData('transponder 7700').squawk).toBe('7700');
        expect(service.extractAviationData('squawk 1200').squawk).toBe('1200');
        expect(service.extractAviationData('transponder 7500').squawk).toBe('7500');
        expect(service.extractAviationData('squawk 7600').squawk).toBe('7600');
        expect(service.extractAviationData('squawk 0000').squawk).toBe('0000');
      });

      it('normalizes spoken digit squawk codes and heals letter O', () => {
        expect(service.extractAviationData('squawk seven zero zero zero').squawk).toBe('7000');
        expect(service.extractAviationData('squawk zero four two one').squawk).toBe('0421');
        expect(service.extractAviationData('squawk 7OOO').squawk).toBe('7000');
      });

      it('strictly discards invalid non-octal codes (containing digits 8 or 9) and wrong lengths', () => {
        // Contains digit 8 or 9 (invalid in aviation octal transponder)
        expect(service.extractAviationData('squawk 8999').squawk).toBeUndefined();
        expect(service.extractAviationData('squawk 9999').squawk).toBeUndefined();
        expect(service.extractAviationData('squawk 8000').squawk).toBeUndefined();
        expect(service.extractAviationData('squawk 7800').squawk).toBeUndefined();
        expect(service.extractAviationData('squawk eight nine nine nine').squawk).toBeUndefined();

        // Invalid lengths (must be exactly 4 digits)
        expect(service.extractAviationData('squawk 12').squawk).toBeUndefined();
        expect(service.extractAviationData('squawk 7').squawk).toBeUndefined();
        expect(service.extractAviationData('squawk 12345').squawk).toBeUndefined();
        expect(service.extractAviationData('squawk').squawk).toBeUndefined();
        expect(service.extractAviationData('transponder').squawk).toBeUndefined();
      });
    });

    describe('Runway Assignments & Formatting', () => {
      it('correctly extracts standard 2-digit runways with optional suffix (L/R/C)', () => {
        expect(service.extractAviationData('runway 03').runway).toBe('03');
        expect(service.extractAviationData('rwy 21L').runway).toBe('21L');
        expect(service.extractAviationData('rwy 35C').runway).toBe('35C');
        expect(service.extractAviationData('runway 36').runway).toBe('36');
        expect(service.extractAviationData('rwy 09R').runway).toBe('09R');
      });

      it('translates spoken runway words (right, left, center) to standard single-letter suffixes', () => {
        expect(service.extractAviationData('runway 36 right').runway).toBe('36R');
        expect(service.extractAviationData('rwy 21 left').runway).toBe('21L');
        expect(service.extractAviationData('runway 35 center').runway).toBe('35C');
        expect(service.extractAviationData('runway 08 centre').runway).toBe('08C');
      });

      it('pads single-digit runways with leading zero ("runway 3" -> "03")', () => {
        expect(service.extractAviationData('runway 3').runway).toBe('03');
        expect(service.extractAviationData('runway 9').runway).toBe('09');
        expect(service.extractAviationData('rwy 3 left').runway).toBe('03L');
        expect(service.extractAviationData('runway 8 right').runway).toBe('08R');
        expect(service.extractAviationData('runway three six right').runway).toBe('36R');
        expect(service.extractAviationData('runway three').runway).toBe('03');
      });

      it('strictly discards impossible runway numbers (outside 01-36)', () => {
        // Runways only range from 01 to 36
        expect(service.extractAviationData('runway 45').runway).toBeUndefined();
        expect(service.extractAviationData('runway 00').runway).toBeUndefined();
        expect(service.extractAviationData('runway 0').runway).toBeUndefined();
        expect(service.extractAviationData('runway 37').runway).toBeUndefined();
        expect(service.extractAviationData('rwy 99').runway).toBeUndefined();
        expect(service.extractAviationData('cleared to land runway').runway).toBeUndefined();
      });
    });

    describe('Altitudes & Flight Levels', () => {
      it('correctly extracts Flight Levels (FL 065 -> 6500 ft, FL100 -> 10000 ft)', () => {
        expect(service.extractAviationData('FL 065').altitudeFt).toBe(6500);
        expect(service.extractAviationData('FL100').altitudeFt).toBe(10000);
        expect(service.extractAviationData('flight level 350').altitudeFt).toBe(35000);
        expect(service.extractAviationData('FL 085 contact Lisboa radar').altitudeFt).toBe(8500);
        expect(service.extractAviationData('climb to FL60').altitudeFt).toBe(6000);
      });

      it('correctly extracts climb, descend, and maintain altitude instructions', () => {
        expect(service.extractAviationData('climb to 4500 feet').altitudeFt).toBe(4500);
        expect(service.extractAviationData('descend and maintain 2000').altitudeFt).toBe(2000);
        expect(service.extractAviationData('climb and maintain 5000').altitudeFt).toBe(5000);
        expect(service.extractAviationData('maintain 2500 feet').altitudeFt).toBe(2500);
        expect(service.extractAviationData('descend to 3000').altitudeFt).toBe(3000);
        expect(service.extractAviationData('climb 4000').altitudeFt).toBe(4000);
      });

      it('rejects negative altitudes, non-physical altitudes, and corrupt values', () => {
        expect(service.extractAviationData('climb to -500 feet').altitudeFt).toBeUndefined();
        expect(service.extractAviationData('descend to -2000').altitudeFt).toBeUndefined();
        expect(service.extractAviationData('maintain 200 feet').altitudeFt).toBeUndefined();
        expect(service.extractAviationData('climb to 80000 feet').altitudeFt).toBeUndefined();
        expect(service.extractAviationData('climb feet').altitudeFt).toBeUndefined();
      });

      it('handles compound step-climbs and complex altitude phrases', () => {
        const stepClimb = 'CS-DXB climb to 4000 feet then expect FL100';
        const data = service.extractAviationData(stepClimb);
        // FL takes precedence as the higher target level
        expect(data.altitudeFt).toBe(10000);
      });
    });

    describe('Speaker Classification Stress & Adversarial Payloads', () => {
      it('distinguishes ATC instructions from Pilot readbacks even with mixed jargon', () => {
        // ATC issuing instruction starting with callsign
        expect(service.detectSpeaker('CS-DXB cleared to land runway 35 wind 320 at 10kt')).toBe('ATC');
        expect(service.detectSpeaker('CS-DXB hold short runway 21')).toBe('ATC');
        expect(service.detectSpeaker('CS-DXB contact Lisboa Radar 125.55')).toBe('ATC');
        expect(service.detectSpeaker('CS-DXB maintain 3000 feet squawk 7000')).toBe('ATC');

        // Pilot readbacks ending with callsign
        expect(service.detectSpeaker('Runway 35 cleared to land, CS-DXB')).toBe('PILOT');
        expect(service.detectSpeaker('Maintain 3000 feet, squawk 7000, CS-DXB')).toBe('PILOT');
        expect(service.detectSpeaker('Contact Lisboa Radar 125.55, CS-DXB')).toBe('PILOT');

        // Pilot requests and acknowledgments
        expect(service.detectSpeaker('CS-DXB request taxi to holding point runway 35')).toBe('PILOT');
        expect(service.detectSpeaker('CS-DXB roger')).toBe('PILOT');
        expect(service.detectSpeaker('CS-DXB wilco')).toBe('PILOT');
        expect(service.detectSpeaker('CS-DXB ready for departure')).toBe('PILOT');
        expect(service.detectSpeaker('Cascais Tower, CS-DXB inbound Sierra 1')).toBe('PILOT');
      });

      it('handles heavy punctuation, speech noise, and transcript stutter artifacts', () => {
        expect(service.detectSpeaker('!?!?!... --- CS-DXB request radio check ???')).toBe('PILOT');
        expect(service.detectSpeaker('...CS-DXB... cleared touch and go runway 35...')).toBe('ATC');
        expect(service.detectSpeaker('uhhh Cascais Tower CS-DXB ready for departure')).toBe('PILOT');
        expect(service.detectSpeaker('c-climb to 4500 feet, CS-DXB')).toBe('PILOT');
      });

      it('safely handles Unicode emojis without corrupting speaker detection or throwing', () => {
        expect(service.detectSpeaker('🛫 CS-DXB ready for departure runway 03 ✈️')).toBe('PILOT');
        expect(service.detectSpeaker('⚠️ CS-DXB hold short of runway 21 🛑')).toBe('ATC');
        expect(service.detectSpeaker('🛬 Cleared to land runway 35, CS-DXB')).toBe('PILOT');
      });

      it('resists XSS and SQL injection payloads in speech text', () => {
        const xssPayload = "<script>alert('xss')</script> CS-DXB request taxi";
        expect(() => service.detectSpeaker(xssPayload)).not.toThrow();
        expect(service.detectSpeaker(xssPayload)).toBe('PILOT');

        const sqlPayload = "CS-DXB'; DROP TABLE transcripts; -- cleared to land runway 03";
        expect(() => service.detectSpeaker(sqlPayload)).not.toThrow();
        expect(service.detectSpeaker(sqlPayload)).toBe('ATC');

        const orPayload = "' OR '1'='1 CS-DXB ready for departure";
        expect(service.detectSpeaker(orPayload)).toBe('PILOT');

        // Adding malicious payloads directly to transcript store should not crash
        const item = service.addTranscript(xssPayload);
        expect(item.speaker).toBe('PILOT');
        expect(item.text).toBe(xssPayload);
      });
    });
  });

  // =========================================================================
  // 3. CONCURRENCY, RING BUFFER & STORAGE ENDURANCE
  // =========================================================================
  describe('Concurrency, Ring-Buffer & Storage Quota Endurance', () => {
    it('rapidly adds, pins, unpins, toggles speaker, and deletes 1,000 entries consistently', () => {
      const addedIds: string[] = [];

      for (let i = 0; i < 1000; i++) {
        const item = service.addTranscript(`Radio transmission #${i}: QNH 1018, runway 35`);
        addedIds.push(item.id);

        // Every 5th item: toggle speaker
        if (i % 5 === 0) {
          service.toggleSpeaker(item.id);
        }

        // Every 10th item: toggle pin twice (pin then unpin)
        if (i % 10 === 0) {
          service.togglePin(item.id);
          service.togglePin(item.id);
        }

        // Every 25th item: delete it
        if (i % 25 === 0) {
          service.deleteItem(item.id);
        }
      }

      const currentItems = service.getItems();
      // Ring buffer must maintain <= 100 items
      expect(currentItems.length).toBeLessThanOrEqual(100);

      // Verify no corrupted data in stored items
      for (const it of currentItems) {
        expect(it.id).toBeTruthy();
        expect(it.timestamp).toBeGreaterThan(0);
        expect(['ATC', 'PILOT']).toContain(it.speaker);
        expect(it.extracted?.qnh).toBe(1018);
        expect(it.extracted?.runway).toBe('35');
      }
    });

    it('guarantees ring-buffer bounding (max 100 entries) prevents unbounded memory growth', () => {
      service.clearAll();
      expect(service.getItems().length).toBe(0);

      // Add 250 items
      for (let i = 0; i < 250; i++) {
        service.addTranscript(`Message number ${i}`);
      }

      const items = service.getItems();
      expect(items.length).toBe(100);
      // Index 0 must be the newest item
      expect(items[0].text).toBe('Message number 249');
      // Index 99 must be the oldest retained item (249 - 99 = 150)
      expect(items[99].text).toBe('Message number 150');
    });

    it('resiliently handles localStorage QuotaExceededError and quota failures', () => {
      const mockStorage: Record<string, string> = {};
      const storageMock = {
        getItem: vi.fn((key: string) => mockStorage[key] || null),
        setItem: vi.fn(() => {
          const err = new Error('QuotaExceededError: DOM Exception 22');
          err.name = 'QuotaExceededError';
          throw err;
        }),
        removeItem: vi.fn((key: string) => {
          delete mockStorage[key];
        }),
        clear: vi.fn(() => {}),
      };

      vi.stubGlobal('localStorage', storageMock);

      // Instantiating and adding transcripts should not crash despite QuotaExceededError
      const quotaService = new AtcTranscriberService();
      expect(() => {
        for (let i = 0; i < 50; i++) {
          quotaService.addTranscript(`Quota stress message ${i}`);
        }
      }).not.toThrow();

      expect(quotaService.getItems().length).toBe(50);
    });

    it('resiliently recovers from corrupt or invalid localStorage data', () => {
      // 1. Corrupt JSON in localStorage
      const corruptMock = {
        getItem: vi.fn(() => '{ this is not valid JSON !!!'),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      };
      vi.stubGlobal('localStorage', corruptMock);

      expect(() => {
        const s1 = new AtcTranscriberService();
        expect(s1.getItems()).toEqual([]);
      }).not.toThrow();

      // 2. Non-array JSON (e.g. object or number)
      corruptMock.getItem.mockReturnValue('{"version": 1, "data": "unexpected"}');
      expect(() => {
        const s2 = new AtcTranscriberService();
        expect(s2.getItems()).toEqual([]);
      }).not.toThrow();

      // 3. Array containing null or corrupt entries
      corruptMock.getItem.mockReturnValue(
        JSON.stringify([
          null,
          { id: 123 }, // invalid id type
          { id: 'valid_id_1', text: 'Valid transmission', timestamp: 12345, speaker: 'ATC' },
        ])
      );
      const s3 = new AtcTranscriberService();
      expect(s3.getItems().length).toBe(1);
      expect(s3.getItems()[0].id).toBe('valid_id_1');
    });

    it('handles null/undefined localStorage without throwing (SSR / Node compatibility)', () => {
      vi.stubGlobal('localStorage', undefined);

      expect(() => {
        const ssrService = new AtcTranscriberService();
        ssrService.addTranscript('SSR test transmission');
        expect(ssrService.getItems().length).toBe(1);
      }).not.toThrow();
    });
  });
});
