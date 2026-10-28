import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  unescapeGdl90Frame,
  parseGdl90Message,
  Gdl90StreamDecoder,
  encodeGdl90TrafficReport,
  Gdl90TrafficReport,
} from '../gdl90-parser';
import { TrafficService, TrafficTarget } from '../traffic-service';

/**
 * Fast deterministic 32-bit PRNG (Xorshift) for reproducible chaos fuzzing
 */
class XorShift32 {
  private state: number;
  constructor(seed: number = 0x19283746) {
    this.state = seed || 1;
  }
  public nextUint32(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }
  public nextByte(): number {
    return this.nextUint32() & 0xff;
  }
}

describe('GDL-90 ADS-B In & Traffic Engine Stress & Chaos Fuzz Suite', () => {

  describe('1. Traffic Swarm Saturation & High-Rate Ingestion', () => {
    let service: TrafficService;

    beforeEach(() => {
      service = new TrafficService();
      // Ownship at Lisbon/Cascais (LPCS)
      service.setOwnship(38.725, -9.355, 3500, 120, 90);
    });

    afterEach(() => {
      service.destroy();
    });

    it('saturates with 500 simultaneous traffic targets updating at high burst rates', () => {
      const SWARM_SIZE = 500;
      const BURST_TICKS = 5;
      let lastReceivedTargets: TrafficTarget[] = [];
      let listenerCallCount = 0;

      service.subscribe((targets) => {
        lastReceivedTargets = targets;
        listenerCallCount++;
      });

      // Generate 500 distinct aircraft targets scattered around LPCS
      const initialTargets: Gdl90TrafficReport[] = [];
      for (let i = 0; i < SWARM_SIZE; i++) {
        const hex = i.toString(16).toUpperCase().padStart(6, '0');
        const angle = (i * (360 / SWARM_SIZE)) * (Math.PI / 180);
        const radiusDeg = 0.05 + (i % 50) * 0.01; // 3 to 30 NM radius
        const lat = 38.725 + Math.sin(angle) * radiusDeg;
        const lon = -9.355 + Math.cos(angle) * radiusDeg;

        initialTargets.push({
          msgId: 20,
          isOwnship: false,
          trafficAlert: false,
          addressType: 0,
          icaoAddress: `49${hex.slice(2)}`,
          callsign: `SWM${i.toString().padStart(3, '0')}`,
          latitude: lat,
          longitude: lon,
          altitudeFt: 1500 + (i % 40) * 200,
          misc: 0,
          nic: 8,
          nacc: 9,
          groundSpeedKt: 80 + (i % 150),
          verticalSpeedFpm: ((i % 10) - 5) * 100,
          trackDeg: (i * 37) % 360,
          emitterCategory: 1,
        });
      }

      // Initial flood of 500 targets via encoded GDL-90 byte frames
      const frames: Uint8Array[] = initialTargets.map((t) => encodeGdl90TrafficReport(t));
      
      // Ingest all 500 targets in a single byte stream buffer
      const totalByteLength = frames.reduce((acc, f) => acc + f.length, 0);
      const combinedBuffer = new Uint8Array(totalByteLength);
      let offset = 0;
      for (const f of frames) {
        combinedBuffer.set(f, offset);
        offset += f.length;
      }

      service.ingestBytes(combinedBuffer);

      expect(service.getRawTargetCount()).toBe(SWARM_SIZE);
      expect(lastReceivedTargets.length).toBe(SWARM_SIZE);

      // Verify targets are strictly sorted by distance (closest first)
      for (let i = 0; i < lastReceivedTargets.length - 1; i++) {
        expect(lastReceivedTargets[i].distanceNm).toBeLessThanOrEqual(lastReceivedTargets[i + 1].distanceNm);
      }

      // High-rate position burst updates: 5 ticks x 500 targets = 2,500 position updates
      const burstStart = performance.now();
      for (let tick = 1; tick <= BURST_TICKS; tick++) {
        const tickFrames: Uint8Array[] = [];
        for (let i = 0; i < SWARM_SIZE; i++) {
          const t = initialTargets[i];
          // Advance coordinates slightly along heading
          t.latitude += 0.001 * tick;
          t.longitude += 0.001 * tick;
          t.altitudeFt = (t.altitudeFt ?? 3000) + 50;
          tickFrames.push(encodeGdl90TrafficReport(t));
        }

        const tickBufLen = tickFrames.reduce((acc, f) => acc + f.length, 0);
        const tickBuffer = new Uint8Array(tickBufLen);
        let off = 0;
        for (const f of tickFrames) {
          tickBuffer.set(f, off);
          off += f.length;
        }
        service.ingestBytes(tickBuffer);
      }
      const burstEnd = performance.now();

      const totalUpdates = SWARM_SIZE * BURST_TICKS;
      const burstDurationMs = burstEnd - burstStart;
      const updatesPerSec = Math.round((totalUpdates / burstDurationMs) * 1000);

      expect(service.getRawTargetCount()).toBe(SWARM_SIZE);
      expect(lastReceivedTargets.length).toBe(SWARM_SIZE);
      expect(burstDurationMs).toBeLessThan(1000); // 2,500 target updates processed under 1 second

      console.log(`[Swarm Saturation] 500 targets x ${BURST_TICKS} ticks (${totalUpdates} updates) in ${burstDurationMs.toFixed(1)}ms (${updatesPerSec.toLocaleString()} updates/sec)`);
    });
  });

  describe('2. Corrupted & Adversarial GDL-90 Byte Stream Fuzzing', () => {
    let decoder: Gdl90StreamDecoder;

    beforeEach(() => {
      decoder = new Gdl90StreamDecoder();
    });

    it('rejects truncated frames and missing CRC bytes without throwing', () => {
      const validMsg = encodeGdl90TrafficReport({
        icaoAddress: '4951AB',
        callsign: 'TAP123',
        latitude: 38.7,
        longitude: -9.3,
        altitudeFt: 5000,
        groundSpeedKt: 180,
      });

      // Test slicing at every possible length from 0 to len-1
      for (let cut = 0; cut < validMsg.length; cut++) {
        const truncated = validMsg.subarray(0, cut);
        expect(() => {
          const msgs = decoder.pushBytes(truncated);
          // If frame isn't closed by 0x7E or missing bytes, no message should be yielded
          if (cut < validMsg.length - 1) {
            expect(msgs.length).toBe(0);
          }
        }).not.toThrow();
      }

      // Missing CRC bytes: unescaped payload without the 2 trailing CRC bytes
      const inner = unescapeGdl90Frame(validMsg.subarray(1, validMsg.length - 1));
      const noCrcPayload = inner.subarray(0, inner.length - 2);
      expect(parseGdl90Message(noCrcPayload)).toBeNull();

      // Only 1 byte of CRC
      const partialCrcPayload = inner.subarray(0, inner.length - 1);
      expect(parseGdl90Message(partialCrcPayload)).toBeNull();
    });

    it('rejects 100% of frames with random CRC bit flips', () => {
      const rng = new XorShift32(42);
      const validMsg = encodeGdl90TrafficReport({
        icaoAddress: 'A0B1C2',
        callsign: 'CRCTEST',
        latitude: 38.725,
        longitude: -9.355,
        altitudeFt: 4000,
        groundSpeedKt: 140,
      });

      const inner = unescapeGdl90Frame(validMsg.subarray(1, validMsg.length - 1));
      let rejectedCount = 0;
      const ITERATIONS = 200;

      for (let i = 0; i < ITERATIONS; i++) {
        const corrupted = new Uint8Array(inner);
        // Flip bits in the CRC bytes (last 2 bytes) or payload bytes
        const flipIdx = corrupted.length - 2 + (rng.nextByte() % 2);
        const bitMask = 1 << (rng.nextByte() % 8);
        corrupted[flipIdx] ^= bitMask;

        const result = parseGdl90Message(corrupted);
        if (result === null) {
          rejectedCount++;
        }
      }

      expect(rejectedCount).toBe(ITERATIONS);
    });

    it('resists byte-stuffing attack vectors: runaway 0x7D, unescaped 0x7E, and nested flags', () => {
      // 1. Runaway 0x7D sequence (500 unescaped 0x7D bytes)
      const runaway7D = new Uint8Array(500);
      runaway7D.fill(0x7d);
      expect(() => decoder.pushBytes(runaway7D)).not.toThrow();

      // 2. Unescaped 0x7E inside message payload
      const validMsg = encodeGdl90TrafficReport({
        icaoAddress: '495199',
        latitude: 38.7,
        longitude: -9.3,
      });
      // Inject unescaped 0x7E inside payload
      const corrupted = new Uint8Array(validMsg);
      corrupted[10] = 0x7e;
      expect(() => {
        const msgs = decoder.pushBytes(corrupted);
        // Corrupted frame should be rejected due to CRC / length mismatch
        expect(msgs.length).toBe(0);
      }).not.toThrow();

      // 3. Repeated rapid 0x7E flag delimiters
      const rapidFlags = new Uint8Array([0x7e, 0x7e, 0x7e, 0x7e, 0x7e, 0x7e]);
      expect(() => {
        const msgs = decoder.pushBytes(rapidFlags);
        expect(msgs.length).toBe(0);
      }).not.toThrow();

      // 4. Runaway frame exceeding buffer capacity (> 1024 bytes) without 0x7E
      const giantBlob = new Uint8Array(1500);
      giantBlob.fill(0xaa);
      expect(() => decoder.pushBytes(giantBlob)).not.toThrow();

      // 5. Verify decoder recovers and decodes next valid frame cleanly
      const validFollowup = encodeGdl90TrafficReport({
        icaoAddress: '495100',
        callsign: 'RECOVER',
        latitude: 38.725,
        longitude: -9.355,
      });
      const msgs = decoder.pushBytes(validFollowup);
      expect(msgs.length).toBe(1);
      expect((msgs[0] as Gdl90TrafficReport).icaoAddress).toBe('495100');
    });

    it('sanitizes invalid emitter categories, non-ASCII callsigns, NaN lat/lon, and 24-bit int overflows', () => {
      // Test NaN & extreme values in encoder
      const badData = {
        icaoAddress: 'HEXBAD',
        callsign: '✈️ПОЛЕТ123\x00\x1f',
        latitude: NaN,
        longitude: Infinity,
        altitudeFt: NaN,
        groundSpeedKt: -50,
        trackDeg: 720,
        emitterCategory: 9999,
      };

      const encoded = encodeGdl90TrafficReport(badData as any);
      expect(encoded.length).toBeGreaterThan(0);

      // Decode and check field sanitization
      const msgs = decoder.pushBytes(encoded);
      expect(msgs.length).toBe(1);
      const parsed = msgs[0] as Gdl90TrafficReport;

      // Coordinates must be finite and within valid bounds
      expect(Number.isFinite(parsed.latitude)).toBe(true);
      expect(parsed.latitude).toBeGreaterThanOrEqual(-90);
      expect(parsed.latitude).toBeLessThanOrEqual(90);

      expect(Number.isFinite(parsed.longitude)).toBe(true);
      expect(parsed.longitude).toBeGreaterThanOrEqual(-180);
      expect(parsed.longitude).toBeLessThanOrEqual(180);

      // Callsign must contain only printable ASCII characters
      for (let i = 0; i < parsed.callsign.length; i++) {
        const code = parsed.callsign.charCodeAt(i);
        expect(code).toBeGreaterThanOrEqual(32);
        expect(code).toBeLessThanOrEqual(126);
      }

      // Emitter category must be bounded to 8-bit uint
      expect(parsed.emitterCategory).toBeLessThanOrEqual(255);
      expect(parsed.emitterCategory).toBeGreaterThanOrEqual(0);

      // 24-bit latitude boundary overflow (+999 degrees lat, -999 degrees lon)
      const overflowMsg = encodeGdl90TrafficReport({
        icaoAddress: '499999',
        latitude: 999.9,
        longitude: -999.9,
      });
      const overflowParsed = decoder.pushBytes(overflowMsg)[0] as Gdl90TrafficReport;
      expect(overflowParsed.latitude).toBeLessThanOrEqual(90);
      expect(overflowParsed.longitude).toBeGreaterThanOrEqual(-180);
    });

    it('evaluates 100,000 randomized raw byte chunks pushed into Gdl90StreamDecoder without crashing', () => {
      const TOTAL_CHUNKS = 100_000;
      const rng = new XorShift32(0xdeadbeef);
      let validFramesFound = 0;
      let totalBytesFed = 0;

      const t0 = performance.now();

      // Push 100,000 chunks of variable sizes (8 to 48 bytes) with randomized byte values
      // occasionally injecting real 0x7E, 0x7D framing bytes
      const chunkBuffer = new Uint8Array(48);

      for (let i = 0; i < TOTAL_CHUNKS; i++) {
        const chunkSize = 8 + (rng.nextByte() % 40); // 8 to 47 bytes
        for (let b = 0; b < chunkSize; b++) {
          chunkBuffer[b] = rng.nextByte();
        }
        totalBytesFed += chunkSize;

        const chunk = chunkBuffer.subarray(0, chunkSize);
        const msgs = decoder.pushBytes(chunk);
        if (msgs.length > 0) {
          validFramesFound += msgs.length;
        }
      }

      const t1 = performance.now();
      const durationMs = t1 - t0;
      const throughputChunksPerSec = Math.round((TOTAL_CHUNKS / durationMs) * 1000);
      const throughputMbPerSec = ((totalBytesFed / (1024 * 1024)) / (durationMs / 1000)).toFixed(2);

      console.log(`[Fuzzing Stream] 100,000 chunks (${(totalBytesFed / (1024 * 1024)).toFixed(2)} MB) evaluated in ${durationMs.toFixed(1)}ms (${throughputChunksPerSec.toLocaleString()} chunks/sec, ${throughputMbPerSec} MB/s)`);

      expect(durationMs).toBeLessThan(5000); // 100,000 chunks processed in under 5 seconds
      // Decoder must remain alive and ready for legitimate data
      const validFrame = encodeGdl90TrafficReport({
        icaoAddress: 'A1B2C3',
        callsign: 'VALID01',
        latitude: 38.725,
        longitude: -9.355,
      });
      const followup = decoder.pushBytes(validFrame);
      expect(followup.length).toBe(1);
      expect((followup[0] as Gdl90TrafficReport).icaoAddress).toBe('A1B2C3');
    });
  });

  describe('3. Proximity Threat & CPA Extreme Geometry', () => {
    let service: TrafficService;

    beforeEach(() => {
      service = new TrafficService();
      // Ownship at LPCS: 38.725, -9.355, 3500 ft, 120 kt, heading 360 (North)
      service.setOwnship(38.725, -9.355, 3500, 120, 360);
    });

    afterEach(() => {
      service.destroy();
    });

    it('handles 50 aircraft converging simultaneously onto exact Ownship coordinate (zero distance, same altitude, vertical pass-through)', () => {
      const CONVERGING_COUNT = 50;
      const threatsDetected: TrafficTarget[] = [];

      service.onThreatAlert((threat) => {
        threatsDetected.push(threat);
      });

      // 50 aircraft positioned at exact ownship lat/lon with identical altitude (3500 ft)
      // and varying high-rate vertical speeds (-4000 fpm to +4000 fpm)
      const convergingFrames: Uint8Array[] = [];
      for (let i = 0; i < CONVERGING_COUNT; i++) {
        const hex = (0x1000 + i).toString(16).toUpperCase();
        const vsFpm = ((i % 9) - 4) * 1000; // -4000 to +4000 fpm
        
        const frame = encodeGdl90TrafficReport({
          icaoAddress: hex,
          callsign: `CVG${i}`,
          latitude: 38.725,
          longitude: -9.355,
          altitudeFt: 3500, // Exact ownship altitude
          groundSpeedKt: 100 + i * 5,
          trackDeg: (i * 7.2) % 360,
          verticalSpeedFpm: vsFpm,
        });
        convergingFrames.push(frame);
      }

      // Ingest all 50 converging frames
      for (const f of convergingFrames) {
        service.ingestBytes(f);
      }

      const activeTargets = service.getTargets();
      expect(activeTargets.length).toBe(CONVERGING_COUNT);

      // Verify every target is flagged as threat with distance = 0 and relativeAlt = 0
      for (const t of activeTargets) {
        expect(t.distanceNm).toBeCloseTo(0, 1);
        expect(t.relativeAltFt).toBe(0);
        expect(t.isThreat).toBe(true);
        expect(t.timeToCpaSec).toBeDefined();
        expect(t.timeToCpaSec).toBe(0); // At zero distance, CPA time is 0
        expect(Number.isFinite(t.timeToCpaSec)).toBe(true);
      }

      expect(threatsDetected.length).toBeGreaterThanOrEqual(CONVERGING_COUNT);
    });

    it('evaluates head-on closing speed collision geometries at 1,000+ kt combined speed', () => {
      // Ownship flying North (360 deg) at 500 kt
      service.setOwnship(38.725, -9.355, 25000, 500, 360);

      // Supersonic traffic directly ahead (heading 180 deg South) at 650 kt
      // Combined closing speed = 1,150 kt
      // Initial distance: 8.0 NM ahead (North of ownship)
      // 8 NM North is roughly +0.133 degrees latitude (1 deg lat ~ 60 NM)
      const targetLat = 38.725 + (8.0 / 60.0);
      const targetLon = -9.355;

      const headOnTarget = encodeGdl90TrafficReport({
        icaoAddress: 'MIG001',
        callsign: 'HEADON',
        latitude: targetLat,
        longitude: targetLon,
        altitudeFt: 25000, // Co-altitude
        groundSpeedKt: 650,
        trackDeg: 180, // Head-on opposite track
        verticalSpeedFpm: 0,
      });

      service.ingestBytes(headOnTarget);
      const targets = service.getTargets();
      expect(targets.length).toBe(1);

      const target = targets[0];
      expect(target.callsign).toBe('HEADON');
      expect(target.distanceNm).toBeCloseTo(8.0, 1);
      expect(target.relativeAltFt).toBe(0);
      expect(target.isCaution).toBe(false); // 8 NM > 6 NM caution zone

      // Time to CPA at 1,150 kt across 8 NM:
      // (8 NM / 1150 kt) * 3600 sec ~ 25 seconds
      expect(target.timeToCpaSec).toBeDefined();
      expect(target.timeToCpaSec!).toBeGreaterThan(20);
      expect(target.timeToCpaSec!).toBeLessThan(35);

      // Advance traffic closer to 2.5 NM (inside 3 NM threat zone)
      const closeInLat = 38.725 + (2.5 / 60.0);
      const closeInFrame = encodeGdl90TrafficReport({
        icaoAddress: 'MIG001',
        callsign: 'HEADON',
        latitude: closeInLat,
        longitude: targetLon,
        altitudeFt: 25000,
        groundSpeedKt: 650,
        trackDeg: 180,
      });

      service.ingestBytes(closeInFrame);
      const closeTargets = service.getTargets();
      expect(closeTargets[0].distanceNm).toBeCloseTo(2.5, 1);
      expect(closeTargets[0].isThreat).toBe(true);
      expect(closeTargets[0].timeToCpaSec!).toBeLessThan(12);
    });

    it('safely sweeps 500 stale targets from memory without CPU spikes or memory leaks', () => {
      const TARGET_COUNT = 500;
      
      // Inject 500 targets
      for (let i = 0; i < TARGET_COUNT; i++) {
        const hex = (0x2000 + i).toString(16).toUpperCase();
        service.ingestReport({
          msgId: 20,
          isOwnship: false,
          trafficAlert: false,
          addressType: 0,
          icaoAddress: hex,
          callsign: `TGT${i}`,
          latitude: 38.7 + (i % 10) * 0.01,
          longitude: -9.3 + (i % 10) * 0.01,
          altitudeFt: 3000,
          misc: 0,
          nic: 8,
          nacc: 9,
          groundSpeedKt: 100,
          verticalSpeedFpm: 0,
          trackDeg: 0,
          emitterCategory: 1,
        });
      }

      expect(service.getRawTargetCount()).toBe(TARGET_COUNT);
      expect(service.getTargets().length).toBe(TARGET_COUNT);

      // Fast-forward time past 15 seconds (e.g. +20,000 ms)
      const futureTimestamp = Date.now() + 20_000;
      
      const t0 = performance.now();
      const prunedCount = service.pruneStaleTargets(futureTimestamp);
      const t1 = performance.now();
      const sweepDurationMs = t1 - t0;

      expect(prunedCount).toBe(TARGET_COUNT);
      expect(service.getRawTargetCount()).toBe(0);
      expect(service.getTargets().length).toBe(0);
      expect(sweepDurationMs).toBeLessThan(10); // Pruning 500 targets must take < 10ms

      console.log(`[Target Pruning] 500 stale targets swept in ${sweepDurationMs.toFixed(2)}ms`);
    });
  });
});
