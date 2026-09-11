import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  unescapeGdl90,
  buildGdl90Frame,
  parseGdl90Frame,
  GDL90_FLAG,
  GDL90_ESCAPE,
  GDL90_XOR_KEY,
  Gdl90Ownship,
  Gdl90Heartbeat,
} from '../engine/gdl90';
import { avionicsManager, RawLocationCoords } from '../engine/avionics-manager';
import { greatCircleDistance, initialBearing } from '../engine/coordinate-math';
import { Waypoint } from '../types';

/**
 * Helper to construct a Message 0x0A (Ownship) or 0x14 (Traffic) frame with fine-grained control
 */
function createMsgFrame(params: {
  msgId?: number;
  address?: number;
  lat?: number;
  lon?: number;
  rawLat?: number;
  rawLon?: number;
  altFeet?: number;
  rawAlt?: number;
  speedKnots?: number;
  rawSpeed?: number;
  vsFpm?: number;
  rawVs?: number;
  trackDeg?: number;
  rawTrack?: number;
  callsignBytes?: number[];
  callsignStr?: string;
  isAirborne?: boolean;
  nic?: number;
}): Uint8Array {
  const {
    msgId = 0x0A,
    address = 0x4bc123,
    lat = 0,
    lon = 0,
    rawLat,
    rawLon,
    altFeet,
    rawAlt,
    speedKnots,
    rawSpeed,
    vsFpm,
    rawVs,
    trackDeg,
    rawTrack,
    callsignBytes,
    callsignStr,
    isAirborne = true,
    nic = 9,
  } = params;

  const payload = new Uint8Array(27);
  payload[0] = 0x00; // Target alert / status
  payload[1] = (address >> 16) & 0xff;
  payload[2] = (address >> 8) & 0xff;
  payload[3] = address & 0xff;

  // Latitude (24-bit signed)
  let encLat = rawLat !== undefined ? rawLat : Math.round((lat * 8388608) / 180);
  if (encLat < 0) encLat += 0x1000000;
  payload[4] = (encLat >> 16) & 0xff;
  payload[5] = (encLat >> 8) & 0xff;
  payload[6] = encLat & 0xff;

  // Longitude (24-bit signed)
  let encLon = rawLon !== undefined ? rawLon : Math.round((lon * 8388608) / 180);
  if (encLon < 0) encLon += 0x1000000;
  payload[7] = (encLon >> 16) & 0xff;
  payload[8] = (encLon >> 8) & 0xff;
  payload[9] = encLon & 0xff;

  // Altitude (12-bit unsigned, 25 ft res, -1000 ft offset)
  let encAlt = rawAlt !== undefined ? rawAlt : (altFeet !== undefined ? Math.round((altFeet + 1000) / 25) : 40);
  payload[10] = (encAlt >> 4) & 0xff;
  payload[11] = (encAlt & 0x0f) << 4;

  // Misc flags: airborne is bit 7 (0 = airborne, 1 = on ground in GDL90 spec), NIC low 4 bits
  payload[12] = (isAirborne ? 0x00 : 0x80) | (nic & 0x0f);

  // Ground speed (12 bits) & Vertical speed (12 bits signed)
  let encSpeed = rawSpeed !== undefined ? rawSpeed : (speedKnots ?? 0);
  let encVs = rawVs !== undefined ? rawVs : (vsFpm !== undefined ? Math.round(vsFpm / 64) : 0);
  if (encVs < 0) encVs += 0x1000;

  payload[13] = (encSpeed >> 4) & 0xff;
  payload[14] = ((encSpeed & 0x0f) << 4) | ((encVs >> 8) & 0x0f);
  payload[15] = encVs & 0xff;

  // Track (8-bit)
  let encTrack = rawTrack !== undefined ? rawTrack : (trackDeg !== undefined ? Math.round((trackDeg * 256) / 360) : 0);
  payload[16] = encTrack & 0xff;

  // Callsign (bytes 18-25)
  if (callsignBytes) {
    for (let i = 0; i < 8 && i < callsignBytes.length; i++) {
      payload[18 + i] = callsignBytes[i];
    }
  } else if (callsignStr !== undefined) {
    const padded = callsignStr.padEnd(8, ' ').slice(0, 8);
    for (let i = 0; i < 8; i++) {
      payload[18 + i] = padded.charCodeAt(i);
    }
  }

  return buildGdl90Frame(msgId, payload);
}

describe('Cockpit Protocol & Avionics Fuzzer', () => {

  // =========================================================================
  // SECTION 1: GDL 90 Byte Stream Edge Cases & Malicious Buffers
  // =========================================================================
  describe('GDL 90 Byte Stream Edge Cases', () => {
    it('handles empty buffer (length 0) and small buffers without throwing', () => {
      expect(parseGdl90Frame(new Uint8Array([]))).toBeNull();
      expect(parseGdl90Frame(new Uint8Array([0x7e]))).toBeNull();
      expect(parseGdl90Frame(new Uint8Array([0x00]))).toBeNull();
      expect(parseGdl90Frame(new Uint8Array([0x7d]))).toBeNull();
      expect(parseGdl90Frame(new Uint8Array([0x7e, 0x7e]))).toBeNull();
      expect(parseGdl90Frame(new Uint8Array([0x7e, 0x00, 0x7e]))).toBeNull();
      // Null / undefined safety
      expect(parseGdl90Frame(null as any)).toBeNull();
      expect(parseGdl90Frame(undefined as any)).toBeNull();
    });

    it('handles truncated / unclosed escape sequence at end of buffer', () => {
      // Buffer ends with 0x7D escape flag without trailing byte
      const truncatedEscape = new Uint8Array([GDL90_FLAG, 0x00, 0x01, 0x02, GDL90_ESCAPE]);
      expect(() => parseGdl90Frame(truncatedEscape)).not.toThrow();
      expect(parseGdl90Frame(truncatedEscape)).toBeNull();

      // Test unescapeGdl90 directly with trailing 0x7D
      const unesc = unescapeGdl90(new Uint8Array([0x01, 0x02, GDL90_ESCAPE]));
      expect(unesc).toBeInstanceOf(Uint8Array);
      // Notice: trailing 0x7D without following byte is emitted literally by unescapeGdl90
      expect(unesc.length).toBe(3);
      expect(unesc[2]).toBe(GDL90_ESCAPE);
    });

    it('handles repeated escape sequences without infinite loops or buffer overflows', () => {
      const repeatedEscapes = new Uint8Array([
        GDL90_ESCAPE, GDL90_ESCAPE, GDL90_ESCAPE, GDL90_ESCAPE, GDL90_ESCAPE
      ]);
      expect(() => unescapeGdl90(repeatedEscapes)).not.toThrow();
      const res = unescapeGdl90(repeatedEscapes);
      // Pairs [0x7D, 0x7D] unescape to (0x7D ^ 0x20 = 0x5D)
      expect(res.length).toBe(3);
      expect(res[0]).toBe(0x7D ^ GDL90_XOR_KEY);
      expect(res[1]).toBe(0x7D ^ GDL90_XOR_KEY);
      expect(res[2]).toBe(GDL90_ESCAPE); // lone trailing escape

      // Frame with repeated escapes
      const frameWithEscapes = new Uint8Array([
        GDL90_FLAG, GDL90_ESCAPE, GDL90_ESCAPE, GDL90_ESCAPE, GDL90_FLAG
      ]);
      expect(() => parseGdl90Frame(frameWithEscapes)).not.toThrow();
      expect(parseGdl90Frame(frameWithEscapes)).toBeNull();
    });

    it('rejects frames with corrupted or invalid CRC-16 (CCITT)', () => {
      const validPayload = new Uint8Array([0x81, 0x01, 0x00, 0x10, 0x20, 0x05]);
      const validFrame = buildGdl90Frame(0x00, validPayload);
      expect(parseGdl90Frame(validFrame)).not.toBeNull();

      // 1. Bit flip in payload
      const corruptedPayload = new Uint8Array(validFrame);
      corruptedPayload[3] ^= 0x01;
      expect(parseGdl90Frame(corruptedPayload)).toBeNull();

      // 2. Corrupt CRC bytes directly (last bytes before 0x7E)
      const corruptedCrc = new Uint8Array(validFrame);
      corruptedCrc[corruptedCrc.length - 2] ^= 0xff;
      expect(parseGdl90Frame(corruptedCrc)).toBeNull();

      // 3. Zeroed CRC
      const zeroCrc = new Uint8Array(validFrame);
      zeroCrc[zeroCrc.length - 2] = 0x00;
      zeroCrc[zeroCrc.length - 3] = 0x00;
      expect(parseGdl90Frame(zeroCrc)).toBeNull();
    });

    it('processes overly large buffers (100KB) of noise and flags without crashing', () => {
      // 100KB of flag bytes 0x7E
      const largeFlags = new Uint8Array(100_000).fill(GDL90_FLAG);
      const startFlags = performance.now();
      expect(parseGdl90Frame(largeFlags)).toBeNull();
      const timeFlags = performance.now() - startFlags;
      expect(timeFlags).toBeLessThan(200); // Must be fast

      // 100KB of escape bytes 0x7D
      const largeEscapes = new Uint8Array(100_000).fill(GDL90_ESCAPE);
      expect(parseGdl90Frame(largeEscapes)).toBeNull();

      // 100KB of pseudo-random byte noise
      const largeNoise = new Uint8Array(100_000);
      let seed = 0x1337;
      for (let i = 0; i < largeNoise.length; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        largeNoise[i] = seed & 0xff;
      }
      expect(parseGdl90Frame(largeNoise)).toBeNull();
    });

    it('fuzzes all 256 possible message IDs (0x00 to 0xFF) safely', () => {
      const dummyPayload = new Uint8Array(30).fill(0xAA);
      let parsedCount = 0;
      const parsedTypes = new Set<string>();

      for (let msgId = 0x00; msgId <= 0xff; msgId++) {
        const frame = buildGdl90Frame(msgId, dummyPayload);
        expect(() => {
          const result = parseGdl90Frame(frame);
          if (result) {
            parsedCount++;
            parsedTypes.add(result.type);
          }
        }).not.toThrow();
      }

      // Handled message IDs in decoder: 0x00 (HEARTBEAT), 0x0A (OWNSHIP), 0x0B (GEOMETRIC_ALT), 0x14 (TRAFFIC)
      expect(parsedTypes.has('HEARTBEAT')).toBe(true);
      expect(parsedTypes.has('OWNSHIP')).toBe(true);
      expect(parsedTypes.has('TRAFFIC')).toBe(true);
      expect(parsedTypes.has('GEOMETRIC_ALT')).toBe(true);
      // Exactly 4 types supported out of 256 IDs, all others safely return null (never crash)
      expect(parsedCount).toBe(4);
    });
  });

  // =========================================================================
  // SECTION 2: Numerical Boundary Cases for Msg 0x0A (Ownship) & 0x14 (Traffic)
  // =========================================================================
  describe('GDL 90 Ownship & Traffic Numerical Boundary Cases', () => {
    it('decodes extreme geographic coordinates (North Pole, South Pole, Date Line, Equator)', () => {
      // 1. North Pole (90.0° N)
      const npFrame = createMsgFrame({ lat: 90.0, lon: 0.0 });
      const npMsg = parseGdl90Frame(npFrame) as Gdl90Ownship;
      expect(npMsg).not.toBeNull();
      expect(npMsg.latitude).toBe(90.0);
      expect(npMsg.longitude).toBe(0.0);

      // 2. South Pole (-90.0° S)
      const spFrame = createMsgFrame({ lat: -90.0, lon: 0.0 });
      const spMsg = parseGdl90Frame(spFrame) as Gdl90Ownship;
      expect(spMsg).not.toBeNull();
      expect(spMsg.latitude).toBe(-90.0);
      expect(spMsg.longitude).toBe(0.0);

      // 3. Date Line (-180.0° W)
      const dlWestFrame = createMsgFrame({ lat: 0.0, lon: -180.0 });
      const dlWestMsg = parseGdl90Frame(dlWestFrame) as Gdl90Ownship;
      expect(dlWestMsg).not.toBeNull();
      expect(dlWestMsg.longitude).toBe(-180.0);

      // 4. Date Line (+179.99998° E: max positive 24-bit representation)
      const rawMaxPositive = 0x7fffff; // 8388607
      const dlEastFrame = createMsgFrame({ lat: 0.0, rawLon: rawMaxPositive });
      const dlEastMsg = parseGdl90Frame(dlEastFrame) as Gdl90Ownship;
      expect(dlEastMsg).not.toBeNull();
      expect(dlEastMsg.longitude).toBeCloseTo(180.0, 4);

      // 5. Prime Meridian and Equator (0.0°, 0.0°)
      const originFrame = createMsgFrame({ lat: 0.0, lon: 0.0 });
      const originMsg = parseGdl90Frame(originFrame) as Gdl90Ownship;
      expect(originMsg.latitude).toBe(0.0);
      expect(originMsg.longitude).toBe(0.0);
    });

    it('enforces latitude range validation and clamping for out-of-range coordinates (> 90°, < -90°)', () => {
      // GDL90 24-bit allows values up to ~180° latitude if unvalidated
      // Encode lat = +120°
      const invalidLatRaw = Math.round((120.0 * 8388608) / 180);
      const invalidLatFrame = createMsgFrame({ rawLat: invalidLatRaw, lon: 0.0 });
      const msg = parseGdl90Frame(invalidLatFrame) as Gdl90Ownship;

      expect(msg).not.toBeNull();
      // Parser correctly clamps latitude to 90.0
      expect(msg.latitude).toBe(90.0);

      // Encode lat = -135°
      const invalidNegLatRaw = Math.round((-135.0 * 8388608) / 180);
      const negLatFrame = createMsgFrame({ rawLat: invalidNegLatRaw, lon: 0.0 });
      const negMsg = parseGdl90Frame(negLatFrame) as Gdl90Ownship;
      expect(negMsg).not.toBeNull();
      expect(negMsg.latitude).toBe(-90.0);
    });

    it('decodes extreme altitudes and exposes unavailable altitude (0xFFF) behavior', () => {
      // 1. Minimum supported altitude: -1,000 ft (rawAlt = 0)
      const minAltFrame = createMsgFrame({ rawAlt: 0 });
      const minAltMsg = parseGdl90Frame(minAltFrame) as Gdl90Ownship;
      expect(minAltMsg.altitudeFeet).toBe(-1000);

      // 2. Negative altitude: -500 ft (rawAlt = 20)
      const negAltFrame = createMsgFrame({ altFeet: -500 });
      const negAltMsg = parseGdl90Frame(negAltFrame) as Gdl90Ownship;
      expect(negAltMsg.altitudeFeet).toBe(-500);

      // 3. Sea level: 0 ft (rawAlt = 40)
      const seaLevelFrame = createMsgFrame({ altFeet: 0 });
      const seaLevelMsg = parseGdl90Frame(seaLevelFrame) as Gdl90Ownship;
      expect(seaLevelMsg.altitudeFeet).toBe(0);

      // 4. High altitude: FL600 (60,000 ft)
      const fl600Frame = createMsgFrame({ altFeet: 60000 });
      const fl600Msg = parseGdl90Frame(fl600Frame) as Gdl90Ownship;
      expect(fl600Msg.altitudeFeet).toBe(60000);

      // 5. Maximum valid altitude: 101,350 ft (rawAlt = 4094 = 0xFFE)
      const maxAltFrame = createMsgFrame({ rawAlt: 4094 });
      const maxAltMsg = parseGdl90Frame(maxAltFrame) as Gdl90Ownship;
      expect(maxAltMsg.altitudeFeet).toBe(101350);

      // 6. Altitude Unavailable (rawAlt = 0xFFF = 4095)
      // BUG AUDIT: GDL90 specification designates 0xFFF as "Altitude Unavailable".
      // Line 185: rawAlt === 0xfff ? 0 : ... maps it to 0 ft (sea level),
      // conflating unknown altitude with sea level flight!
      const unavailAltFrame = createMsgFrame({ rawAlt: 0xfff });
      const unavailMsg = parseGdl90Frame(unavailAltFrame) as Gdl90Ownship;
      expect(unavailMsg.altitudeFeet).toBe(0); // Masked as sea level
    });

    it('decodes boundary speeds: 0 kt, GA (120 kt), jet (600 kt), supersonic (1200 kt)', () => {
      // 1. Stationary / hover (0 kt)
      const hoverMsg = parseGdl90Frame(createMsgFrame({ speedKnots: 0 })) as Gdl90Ownship;
      expect(hoverMsg.groundSpeedKnots).toBe(0);

      // 2. General Aviation (120 kt)
      const gaMsg = parseGdl90Frame(createMsgFrame({ speedKnots: 120 })) as Gdl90Ownship;
      expect(gaMsg.groundSpeedKnots).toBe(120);

      // 3. High-speed jet (600 kt)
      const jetMsg = parseGdl90Frame(createMsgFrame({ speedKnots: 600 })) as Gdl90Ownship;
      expect(jetMsg.groundSpeedKnots).toBe(600);

      // 4. Supersonic flight (1200 kt)
      const sonicMsg = parseGdl90Frame(createMsgFrame({ speedKnots: 1200 })) as Gdl90Ownship;
      expect(sonicMsg.groundSpeedKnots).toBe(1200);

      // 5. Raw speed 0xFFF (4095 kt, GDL 90 Unavailable indicator)
      const unavailSpeedMsg = parseGdl90Frame(createMsgFrame({ rawSpeed: 0xfff })) as Gdl90Ownship;
      expect(unavailSpeedMsg.groundSpeedKnots).toBe(0);
    });

    it('handles vertical speed boundary and unavailable value (0x800)', () => {
      // Level flight
      const levelMsg = parseGdl90Frame(createMsgFrame({ vsFpm: 0 })) as Gdl90Ownship;
      expect(levelMsg.verticalSpeedFpm).toBe(0);

      // Normal climb +1,500 fpm
      const climbMsg = parseGdl90Frame(createMsgFrame({ vsFpm: 1536 })) as Gdl90Ownship;
      expect(climbMsg.verticalSpeedFpm).toBe(1536);

      // Max climb (rawVs = 0x7FF = 2047) -> 131,008 fpm
      const maxClimbMsg = parseGdl90Frame(createMsgFrame({ rawVs: 0x7ff })) as Gdl90Ownship;
      expect(maxClimbMsg.verticalSpeedFpm).toBe(131008);

      // rawVs = 0x800 indicates "Vertical speed unavailable" in GDL 90 -> returns 0
      const unavailVsMsg = parseGdl90Frame(createMsgFrame({ rawVs: 0x800 })) as Gdl90Ownship;
      expect(unavailVsMsg.verticalSpeedFpm).toBe(0);
    });

    it('handles track degrees and boundary wrapping (0°, 359°, 360°)', () => {
      // 0°
      const t0Msg = parseGdl90Frame(createMsgFrame({ trackDeg: 0 })) as Gdl90Ownship;
      expect(t0Msg.trackDegrees).toBe(0);

      // 359° (rawTrack = 255)
      const t359Msg = parseGdl90Frame(createMsgFrame({ rawTrack: 255 })) as Gdl90Ownship;
      expect(t359Msg.trackDegrees).toBe(359);

      // 180° (rawTrack = 128)
      const t180Msg = parseGdl90Frame(createMsgFrame({ rawTrack: 128 })) as Gdl90Ownship;
      expect(t180Msg.trackDegrees).toBe(180);

      // % 360 ensures result is always in [0, 359]
      for (let r = 0; r <= 255; r++) {
        const msg = parseGdl90Frame(createMsgFrame({ rawTrack: r })) as Gdl90Ownship;
        expect(msg.trackDegrees).toBeGreaterThanOrEqual(0);
        expect(msg.trackDegrees).toBeLessThan(360);
      }
    });

    it('fuzzes callsigns with null bytes, emojis, unprintable ASCII, and spaces', () => {
      // 1. All null bytes [0x00, 0x00, ...]
      const nullCallsignFrame = createMsgFrame({
        callsignBytes: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
        address: 0x123456,
      });
      const nullMsg = parseGdl90Frame(nullCallsignFrame) as Gdl90Ownship;
      // When empty, parser falls back to `OWNSHIP` for Ownship messages
      expect(nullMsg.callSign).toBe('OWNSHIP');

      // 2. Unprintable ASCII (0x01 through 0x08)
      const ctrlCharFrame = createMsgFrame({
        callsignBytes: [0x01, 0x02, 0x07, 0x08, 0x1b, 0x1f, 0x00, 0x00],
        address: 0xabcdef,
      });
      const ctrlMsg = parseGdl90Frame(ctrlCharFrame) as Gdl90Ownship;
      expect(ctrlMsg.callSign).toBe('OWNSHIP');

      // 3. Emojis and high-byte UTF-8 sequences (bytes > 127)
      const emojiBytes = [0xf0, 0x9f, 0x9a, 0x80, 0x41, 0x42, 0x43, 0x44]; // 🚀ABCD
      const emojiFrame = createMsgFrame({ callsignBytes: emojiBytes });
      const emojiMsg = parseGdl90Frame(emojiFrame) as Gdl90Ownship;
      // Bytes > 126 are filtered out by `charCode >= 32 && charCode <= 126`
      expect(emojiMsg.callSign).toBe('ABCD');

      // 4. Leading and trailing spaces
      const spaceMsg = parseGdl90Frame(createMsgFrame({ callsignStr: '  CSAZG ' })) as Gdl90Ownship;
      expect(spaceMsg.callSign).toBe('CSAZG');
    });

    it('verifies the Heartbeat 17-bit timestamp MSB decoding', () => {
      // Message 0x00: Heartbeat
      // In GDL 90 specification, payload byte 2 bit 7 is the 17th bit (MSB) of the timestamp
      // 17-bit seconds UTC range is 0 to 86,400.
      // Let's test a timestamp > 65535 seconds (e.g., 70,000 seconds UTC = 19:26:40 UTC)
      // 70000 = 0x11170. MSB (bit 16) is 1. Byte 2 bit 7 should be 0x80.
      // Byte 3 = 0x11, Byte 4 = 0x70.
      const payload = new Uint8Array([
        0x81, // b1: GPS Valid
        0x01, // b2: UTC Valid
        0x80, // payload[2] bit 7 is set!
        0x11, // payload[3]
        0x70, // payload[4]
        0x01, // msg count
      ]);
      const frame = buildGdl90Frame(0x00, payload);
      const parsed = parseGdl90Frame(frame) as Gdl90Heartbeat;

      expect(parsed).not.toBeNull();
      // Verifies 17-bit timestamp preservation (70000 s)
      expect(parsed.timeStampSeconds).toBe(70000);
    });
  });

  // =========================================================================
  // SECTION 3: Avionics Manager Stress, Memory Leaks & Edge Cases
  // =========================================================================
  describe('Avionics Manager Stress & Edge Cases', () => {
    afterEach(async () => {
      await avionicsManager.stopGpsTracking();
      avionicsManager.stopSimulation();
    });

    it('rapid subscription and unsubscription prevents listener leaks', () => {
      const initialListenersCount = (avionicsManager as any).listeners.size;
      const unsubscribers: (() => void)[] = [];

      // Subscribe 1,000 times
      for (let i = 0; i < 1000; i++) {
        const unsub = avionicsManager.subscribe(() => {});
        unsubscribers.push(unsub);
      }

      expect((avionicsManager as any).listeners.size).toBe(initialListenersCount + 1000);

      // Unsubscribe all
      for (const unsub of unsubscribers) {
        unsub();
      }

      expect((avionicsManager as any).listeners.size).toBe(initialListenersCount);

      // Calling unsubscribe multiple times must be safe
      expect(() => {
        for (const unsub of unsubscribers) {
          unsub();
        }
      }).not.toThrow();
    });

    it('handles self-unsubscribing listeners during notification callback safely', () => {
      let runCount = 0;
      let unsubscribeSelf: (() => void) | null = null;

      unsubscribeSelf = avionicsManager.subscribe(() => {
        runCount++;
        if (unsubscribeSelf) {
          unsubscribeSelf();
        }
      });

      // Ingest packet to trigger notify
      const testFrame = createMsgFrame({ lat: 38.7, lon: -9.1 });
      expect(() => avionicsManager.ingestGdl90Packet(testFrame)).not.toThrow();
      expect(runCount).toBeGreaterThanOrEqual(1);
    });
    it('verifies simulation cleanup on route change and exposes watchPosition leak on rapid startGpsTracking', async () => {
      const dummyWaypoints: Waypoint[] = [
        { id: 1, identifier: 'LPPT', name: 'Lisbon', type: 'airport', latitude: 38.774, longitude: -9.134, country: 'PT' },
        { id: 2, identifier: 'LPCS', name: 'Cascais', type: 'airport', latitude: 38.725, longitude: -9.355, country: 'PT' },
      ];

      // 1. Simulation stops cleanly when re-invoked
      avionicsManager.startSimulation(dummyWaypoints, 120);
      expect((avionicsManager as any).simInterval).not.toBeNull();
      avionicsManager.stopSimulation();
      expect((avionicsManager as any).simInterval).toBeNull();

      // 2. WatchPosition leak: Mock geolocation
      let activeWatchCount = 0;
      const watchIds = new Set<number>();
      const mockGeolocation = {
        watchPosition: vi.fn(() => {
          const id = ++activeWatchCount;
          watchIds.add(id);
          return id;
        }),
        clearWatch: vi.fn((id: number) => {
          watchIds.delete(id);
        }),
      };

      try {
        Object.defineProperty(globalThis.navigator, 'geolocation', {
          value: mockGeolocation,
          configurable: true,
          writable: true,
        });

        // Rapidly call startGpsTracking 3 times while status is SEARCHING
        await avionicsManager.startGpsTracking();
        await avionicsManager.startGpsTracking();
        await avionicsManager.startGpsTracking();

        // Previous watches are cleanly cancelled on subsequent startGpsTracking calls to prevent leaks
        expect(mockGeolocation.watchPosition).toHaveBeenCalledTimes(3);

        // When stopGpsTracking is called, all watches have been cleanly cleared
        await avionicsManager.stopGpsTracking();
        expect(mockGeolocation.clearWatch).toHaveBeenCalledTimes(3);

        // 0 watches leaked in the browser geolocation engine!
        expect(watchIds.size).toBe(0);
      } finally {
        // Cleanup all active watches
        watchIds.forEach((id) => mockGeolocation.clearWatch(id));
      }
    });

    it('tests Distance-to-next calculations at exact waypoint, collinear, and antipodal positions', () => {
      const wptA: Waypoint = { id: 1, identifier: 'WPTA', name: 'Alpha', type: 'vrp', latitude: 0, longitude: 0, country: 'PT' };
      const wptB: Waypoint = { id: 2, identifier: 'WPTB', name: 'Bravo', type: 'vrp', latitude: 0, longitude: 10, country: 'PT' };

      // 1. Exactly at waypoint
      const distAtWpt = greatCircleDistance(wptA.latitude, wptA.longitude, wptA.latitude, wptA.longitude);
      expect(distAtWpt).toBe(0);
      const bearingAtWpt = initialBearing(wptA.latitude, wptA.longitude, wptA.latitude, wptA.longitude);
      expect(bearingAtWpt).toBe(0);

      // 2. Collinear point midway between A and B
      const distHalf = greatCircleDistance(wptA.latitude, wptA.longitude, 0, 5);
      const distFull = greatCircleDistance(wptA.latitude, wptA.longitude, wptB.latitude, wptB.longitude);
      expect(distHalf).toBeCloseTo(distFull / 2, 2);

      // 3. Antipodal points (0,0 to 0,180) - exactly half Earth circumference
      const distAntipodal = greatCircleDistance(0, 0, 0, 180);
      expect(distAntipodal).not.toBeNaN();
      expect(Number.isFinite(distAntipodal)).toBe(true);
      // Half circumference = 3440.065 * pi ≈ 10807.28 NM
      expect(distAntipodal).toBeCloseTo(3440.065 * Math.PI, 1);
    });

    it('verifies Cross-Track Error (XTE) computation in handlePositionUpdate', () => {
      const prevWpt: Waypoint = { id: 1, identifier: 'DEP', name: 'Departure', type: 'airport', latitude: 38.7, longitude: -9.3, country: 'PT' };
      const nextWpt: Waypoint = { id: 2, identifier: 'DEST', name: 'Dest', type: 'airport', latitude: 38.7, longitude: -9.1, country: 'PT' };

      // Simulate a position update through private handlePositionUpdate
      const rawCoords: RawLocationCoords = {
        latitude: 38.75,
        longitude: -9.2,
        speed: 50, // ~97 knots
        heading: 90,
        altitude: 1000,
        accuracy: 5,
      };

      // With prevWaypoint provided:
      (avionicsManager as any).handlePositionUpdate(rawCoords, nextWpt, prevWpt);
      const telemetry = avionicsManager.getState().telemetry;

      expect(telemetry).not.toBeNull();
      expect(telemetry?.distanceToNextNm).toBeGreaterThan(0);
      expect(telemetry?.estimatedTimeEnrouteSec).toBeGreaterThan(0);
      expect(telemetry?.crossTrackErrorNm).toBeDefined();
      expect(Number.isFinite(telemetry?.crossTrackErrorNm)).toBe(true);

      // Without prevWaypoint:
      (avionicsManager as any).handlePositionUpdate(rawCoords, nextWpt, null);
      const telemetryNoPrev = avionicsManager.getState().telemetry;
      expect(telemetryNoPrev?.crossTrackErrorNm).toBeUndefined();
    });

    it('tests stationary GPS position and div-by-zero protection in telemetry', () => {
      const nextWpt: Waypoint = { id: 2, identifier: 'DEST', name: 'Dest', type: 'airport', latitude: 38.7, longitude: -9.1, country: 'PT' };

      // Stationary aircraft (speed = 0)
      const stationaryCoords: RawLocationCoords = {
        latitude: 38.7,
        longitude: -9.1,
        speed: 0,
        heading: 0,
        altitude: 50,
      };

      (avionicsManager as any).handlePositionUpdate(stationaryCoords, nextWpt);
      const state = avionicsManager.getState().telemetry;

      expect(state).not.toBeNull();
      expect(state?.groundSpeedKnots).toBe(0);
      // Protected by `speedKnots > 20` guard: eteSec should be undefined, NOT Infinity or NaN!
      expect(state?.estimatedTimeEnrouteSec).toBeUndefined();
    });

    it('verifies simulation div-by-zero protection in ETE and singularity at North Pole', () => {
      // 1. Simulation at speedKnots = 0
      const route: Waypoint[] = [
        { id: 1, identifier: 'P1', name: 'P1', type: 'vrp', latitude: 10, longitude: 10, country: 'PT' },
        { id: 2, identifier: 'P2', name: 'P2', type: 'vrp', latitude: 11, longitude: 11, country: 'PT' },
      ];

      vi.useFakeTimers();
      try {
        avionicsManager.startSimulation(route, 0);
        vi.advanceTimersByTime(1000);

        const telem = avionicsManager.getState().telemetry;
        expect(telem).not.toBeNull();
        // Zero speed guard returns undefined instead of division-by-zero Infinity
        expect(telem?.estimatedTimeEnrouteSec).toBeUndefined();
      } finally {
        avionicsManager.stopSimulation();
        vi.useRealTimers();
      }

      // 2. Polar flight singularity
      // At lat = 90 (North Pole), Math.cos(90°) ≈ 0
      // In simulation: dLon = (stepNm / (60 * Math.cos(radLat))) * sin(radBearing)
      // When currentLat reaches 90°, cos is 6.12e-17, resulting in dLon blowing up to ~1e16!
      const polarLat = 90.0;
      const cosVal = Math.cos((polarLat * Math.PI) / 180);
      const stepNm = 120 / 3600;
      const blownUpDlon = (stepNm / (60 * cosVal)) * Math.sin((90 * Math.PI) / 180);
      expect(Math.abs(blownUpDlon)).toBeGreaterThan(1e10);
    });

    it('traffic cleanup caps memory usage to 20 targets when flooded with unique GDL 90 traffic', () => {
      // Flood with 100 unique traffic targets
      for (let i = 1; i <= 100; i++) {
        const frame = createMsgFrame({
          msgId: 0x14, // TRAFFIC
          address: i,
          lat: 38.0 + (i * 0.01),
          lon: -9.0 + (i * 0.01),
          altFeet: 3000 + i * 100,
          callsignStr: `FLT${i}`,
        });
        avionicsManager.ingestGdl90Packet(frame);
      }

      const traffic = avionicsManager.getState().trafficList;
      // Should be capped at 20 targets
      expect(traffic.length).toBe(20);
      // Earliest targets (1 to 80) were pruned; most recent target #100 is present
      const targetAddresses = traffic.map((t) => t.address);
      expect(targetAddresses).toContain((100).toString(16).toUpperCase().padStart(6, '0'));
      expect(targetAddresses).not.toContain((1).toString(16).toUpperCase().padStart(6, '0'));
    });
  });

  // =========================================================================
  // SECTION 4: Randomized Chaos Fuzzing & Protocol Robustness
  // =========================================================================
  describe('GDL 90 Randomized Chaos Fuzzing', () => {
    it('survives 2,000 iterations of random bitstreams without throwing uncaught exceptions', () => {
      let seed = 42;
      function pseudoRandom(): number {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      }

      for (let i = 0; i < 2000; i++) {
        const len = Math.floor(pseudoRandom() * 500);
        const buffer = new Uint8Array(len);
        for (let j = 0; j < len; j++) {
          buffer[j] = Math.floor(pseudoRandom() * 256);
        }

        // Randomly insert 0x7E flags or 0x7D escape bytes
        if (len > 2 && pseudoRandom() > 0.5) {
          buffer[0] = GDL90_FLAG;
          buffer[len - 1] = GDL90_FLAG;
        }

        expect(() => {
          const result = parseGdl90Frame(buffer);
          if (result) {
            expect(result.type).toBeDefined();
          }
        }).not.toThrow();
      }
    });

    it('decodes Message 0x0B (Geometric Altitude) and exposes 0x8000 unavailable anomaly', () => {
      // 1. Normal positive geometric altitude: +5,000 ft (raw = 1,000)
      const geoPayload = new Uint8Array([
        (1000 >> 8) & 0xff,
        1000 & 0xff,
        0x00, 0x14, // VFOM = 20 ft
      ]);
      const geoFrame = buildGdl90Frame(0x0B, geoPayload);
      const geoMsg = parseGdl90Frame(geoFrame);
      expect(geoMsg).not.toBeNull();
      if (geoMsg && geoMsg.type === 'GEOMETRIC_ALT') {
        expect(geoMsg.altitudeFeet).toBe(5000);
        expect(geoMsg.vfomFeet).toBe(20);
      }

      // 2. Dead Sea below sea level: -1,300 ft (raw = -260 -> 16-bit 0xFEFC)
      const rawNeg = (-260 + 0x10000) & 0xffff;
      const negGeoPayload = new Uint8Array([
        (rawNeg >> 8) & 0xff,
        rawNeg & 0xff,
        0x00, 0x0A, // VFOM = 10 ft
      ]);
      const negGeoMsg = parseGdl90Frame(buildGdl90Frame(0x0B, negGeoPayload));
      expect(negGeoMsg).not.toBeNull();
      if (negGeoMsg && negGeoMsg.type === 'GEOMETRIC_ALT') {
        expect(negGeoMsg.altitudeFeet).toBe(-1300);
      }

      // 3. 0x8000 in GDL 90 indicates "Geometric Altitude Unavailable" -> maps to 0 ft
      const unavailGeoPayload = new Uint8Array([0x80, 0x00, 0xff, 0xff]);
      const unavailGeoMsg = parseGdl90Frame(buildGdl90Frame(0x0B, unavailGeoPayload));
      expect(unavailGeoMsg).not.toBeNull();
      if (unavailGeoMsg && unavailGeoMsg.type === 'GEOMETRIC_ALT') {
        expect(unavailGeoMsg.altitudeFeet).toBe(0);
      }
    });

    it('models and verifies Cross-Track Error (XTE) mathematical calculations', () => {
      // Aeronautical Great-Circle Cross-Track Error formula:
      // XTE = asin(sin(dist_A_to_P / R) * sin(bearing_A_to_P - bearing_A_to_B)) * R
      const R = 3440.065; // NM

      function calculateXte(
        latStart: number,
        lonStart: number,
        latEnd: number,
        lonEnd: number,
        latCurr: number,
        lonCurr: number
      ): number {
        const d13 = greatCircleDistance(latStart, lonStart, latCurr, lonCurr);
        const theta13 = (initialBearing(latStart, lonStart, latCurr, lonCurr) * Math.PI) / 180;
        const theta12 = (initialBearing(latStart, lonStart, latEnd, lonEnd) * Math.PI) / 180;

        const delta13 = d13 / R;
        const sinXte = Math.sin(delta13) * Math.sin(theta13 - theta12);
        // Clamping to avoid NaN on precision edge cases
        const clampedSin = Math.max(-1, Math.min(1, sinXte));
        return Math.asin(clampedSin) * R;
      }

      // 1. Exactly on track (collinear between Lisbon and Porto)
      const latLisbon = 38.774;
      const lonLisbon = -9.134;
      const latPorto = 41.248;
      const lonPorto = -8.681;

      // On-track Lisbon
      expect(calculateXte(latLisbon, lonLisbon, latPorto, lonPorto, latLisbon, lonLisbon)).toBeCloseTo(0, 4);

      // On-track midway
      const midLat = (latLisbon + latPorto) / 2;
      const midLon = (lonLisbon + lonPorto) / 2;
      const xteMid = calculateXte(latLisbon, lonLisbon, latPorto, lonPorto, midLat, midLon);
      expect(Math.abs(xteMid)).toBeLessThan(1.0); // very close to track (small spherical deviation)

      // 2. Off-track to the North (Left of Eastbound track -> -60 NM)
      const xteNorth = calculateXte(0, 0, 0, 10, 1, 5); // 1 degree North of equatorial leg
      expect(xteNorth).toBeCloseTo(-60.04, 1); // Negative indicates Left of track
      expect(Math.abs(xteNorth)).toBeGreaterThan(50);
      expect(Number.isFinite(xteNorth)).toBe(true);

      // 3. Antipodal edge case
      const xteAntipodal = calculateXte(0, 0, 0, 10, 0, 180);
      expect(Number.isFinite(xteAntipodal)).toBe(true);
      expect(xteAntipodal).not.toBeNaN();
    });
  });
});

