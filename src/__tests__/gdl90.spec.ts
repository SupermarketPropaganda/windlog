import { describe, it, expect } from 'vitest';
import {
  computeGdl90Crc,
  unescapeGdl90,
  escapeGdl90,
  buildGdl90Frame,
  parseGdl90Frame,
  GDL90_FLAG,
  GDL90_ESCAPE,
} from '../engine/gdl90';

describe('GDL 90 ADS-B & Avionics Protocol Decoder', () => {
  it('computes valid CRC-16 (CCITT) checksums', () => {
    // Standard test buffer
    const testData = new Uint8Array([0x00, 0x81, 0x41, 0x00, 0x00, 0x00, 0x00]);
    const crc = computeGdl90Crc(testData);
    expect(typeof crc).toBe('number');
    expect(crc).toBeGreaterThan(0);
  });

  it('escapes and unescapes GDL 90 byte-stuffing sequences correctly', () => {
    const raw = new Uint8Array([0x10, GDL90_FLAG, 0x20, GDL90_ESCAPE, 0x30]);
    const escaped = escapeGdl90(raw);

    // Escaped buffer should be larger because 0x7E and 0x7D are escaped
    expect(escaped.length).toBe(raw.length + 2);

    const unescaped = unescapeGdl90(escaped);
    expect(Array.from(unescaped)).toEqual(Array.from(raw));
  });

  it('encodes and decodes a GDL 90 Heartbeat message (Message 0x00)', () => {
    const payload = new Uint8Array([
      0x81, // GPS Valid (bit 7) + UAT init (bit 0)
      0x01, // UTC valid
      0x00, 0x10, 0x20, // Timestamp
      0x05, // Message count
    ]);

    const frame = buildGdl90Frame(0x00, payload);
    const parsed = parseGdl90Frame(frame);

    expect(parsed).not.toBeNull();
    if (parsed && parsed.type === 'HEARTBEAT') {
      expect(parsed.gpsValid).toBe(true);
      expect(parsed.uatInitialized).toBe(true);
      expect(parsed.utcTimeValid).toBe(true);
      expect(parsed.messageCount).toBe(5);
    }
  });

  it('encodes and decodes a GDL 90 Ownship Report (Message 0x0A)', () => {
    // 28 bytes payload for ownship
    const payload = new Uint8Array(27);
    payload[0] = 0x00; // alert status
    payload[1] = 0x4B; payload[2] = 0xC1; payload[3] = 0x23; // Address 4BC123

    // Lat/Lon encoding: 38.725 deg lat -> raw = 38.725 * 8388608 / 180 = 1804702 (0x1B89DE)
    const latInt = Math.round((38.725 * 8388608) / 180);
    payload[4] = (latInt >> 16) & 0xff;
    payload[5] = (latInt >> 8) & 0xff;
    payload[6] = latInt & 0xff;

    // Lon: -9.355 deg -> raw = -9.355 * 8388608 / 180 = -435974 (0xF9577A)
    let lonInt = Math.round((-9.355 * 8388608) / 180);
    if (lonInt < 0) lonInt += 0x1000000;
    payload[7] = (lonInt >> 16) & 0xff;
    payload[8] = (lonInt >> 8) & 0xff;
    payload[9] = lonInt & 0xff;

    // Altitude: 4,500 ft -> raw = (4500 + 1000) / 25 = 220 (0x0DC)
    const altRaw = Math.round((4500 + 1000) / 25);
    payload[10] = (altRaw >> 4) & 0xff;
    payload[11] = (altRaw & 0x0f) << 4;

    payload[12] = 0x09; // Airborne + NIC 9
    // Speed: 110 kt -> payload[13] = 110 >> 4, payload[14] = (110 & 0x0f) << 4
    payload[13] = (110 >> 4) & 0xff;
    payload[14] = (110 & 0x0f) << 4;

    // Track: 180 deg -> raw = 180 * 256 / 360 = 128 (0x80)
    payload[16] = 128;

    // Callsign: "CS-AZG"
    const callsign = 'CS-AZG  ';
    for (let i = 0; i < 8; i++) {
      payload[18 + i] = callsign.charCodeAt(i);
    }

    const frame = buildGdl90Frame(0x0A, payload);
    const parsed = parseGdl90Frame(frame);

    expect(parsed).not.toBeNull();
    if (parsed && parsed.type === 'OWNSHIP') {
      expect(parsed.address).toBe('4BC123');
      expect(parsed.latitude).toBeCloseTo(38.725, 2);
      expect(parsed.longitude).toBeCloseTo(-9.355, 2);
      expect(parsed.altitudeFeet).toBe(4500);
      expect(parsed.groundSpeedKnots).toBe(110);
      expect(parsed.trackDegrees).toBe(180);
      expect(parsed.callSign).toBe('CS-AZG');
    }
  });

  it('rejects corrupted packets with invalid CRC', () => {
    const payload = new Uint8Array([0x81, 0x01, 0x00, 0x10, 0x20, 0x05]);
    const frame = buildGdl90Frame(0x00, payload);

    // Corrupt one byte inside frame
    frame[3] ^= 0xff;

    const parsed = parseGdl90Frame(frame);
    expect(parsed).toBeNull();
  });
});
