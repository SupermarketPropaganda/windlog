/**
 * FAA GDL 90 ADS-B & Avionics Protocol Decoder
 * 
 * Implements byte-level framing, unescaping, CRC-16 (CCITT), and parsing
 * for standard cockpit ADS-B/AHRS receivers (Stratux, ForeFlight Sentry,
 * Garmin GDL 39/50/52, uAvionix SkyEcho) communicating via UDP port 4000.
 */

export const GDL90_FLAG = 0x7E;
export const GDL90_ESCAPE = 0x7D;
export const GDL90_XOR_KEY = 0x20;

export type Gdl90MessageType = 'HEARTBEAT' | 'OWNSHIP' | 'GEOMETRIC_ALT' | 'TRAFFIC' | 'UNKNOWN';

export interface Gdl90Heartbeat {
  type: 'HEARTBEAT';
  gpsValid: boolean;
  uatInitialized: boolean;
  utcTimeValid: boolean;
  timeStampSeconds: number; // Seconds since UTC midnight
  messageCount: number;
}

export interface Gdl90Ownship {
  type: 'OWNSHIP';
  address: string;          // Hex ICAO 24-bit address
  latitude: number;         // Decimal degrees (-90 to +90)
  longitude: number;        // Decimal degrees (-180 to +180)
  altitudeFeet: number;     // Pressure altitude (-1,000 to +101,350 ft)
  groundSpeedKnots: number; // Ground speed in knots
  trackDegrees: number;     // True track 0-359 deg
  verticalSpeedFpm: number; // Feet per minute (-32,768 to +32,767)
  callSign: string;         // Tail / Flight identifier (e.g. "CS-AZG")
  isAirborne: boolean;
  nic: number;              // Navigation Integrity Category
}

export interface Gdl90GeometricAlt {
  type: 'GEOMETRIC_ALT';
  altitudeFeet: number;     // GPS geometric altitude
  vfomFeet: number;         // Vertical Figure of Merit
}

export interface Gdl90Traffic extends Omit<Gdl90Ownship, 'type'> {
  type: 'TRAFFIC';
}

export type Gdl90Message = Gdl90Heartbeat | Gdl90Ownship | Gdl90GeometricAlt | Gdl90Traffic;

// CRC-16 CCITT lookup table (Polynomial: 0x1021, Seed: 0x0000)
const CRC16_TABLE: Uint16Array = (() => {
  const table = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
    table[i] = crc;
  }
  return table;
})();

/**
 * Computes the standard 16-bit GDL 90 CRC over a byte sequence
 */
export function computeGdl90Crc(data: Uint8Array, length: number = data.length): number {
  let crc = 0x0000;
  for (let i = 0; i < length; i++) {
    const index = ((crc >> 8) ^ data[i]) & 0xff;
    crc = ((crc << 8) ^ CRC16_TABLE[index]) & 0xffff;
  }
  return crc;
}

/**
 * Removes GDL 90 byte-stuffing escapes (0x7D 0x5E -> 0x7E, 0x7D 0x5D -> 0x7D)
 */
export function unescapeGdl90(data: Uint8Array): Uint8Array {
  const output = new Uint8Array(data.length);
  let outIdx = 0;

  for (let i = 0; i < data.length; i++) {
    if (data[i] === GDL90_ESCAPE && i + 1 < data.length) {
      i++;
      output[outIdx++] = data[i] ^ GDL90_XOR_KEY;
    } else {
      output[outIdx++] = data[i];
    }
  }

  return output.subarray(0, outIdx);
}

/**
 * Encodes data with GDL 90 byte-stuffing escapes
 */
export function escapeGdl90(data: Uint8Array): Uint8Array {
  const output = new Uint8Array(data.length * 2);
  let outIdx = 0;

  for (let i = 0; i < data.length; i++) {
    const b = data[i];
    if (b === GDL90_FLAG || b === GDL90_ESCAPE) {
      output[outIdx++] = GDL90_ESCAPE;
      output[outIdx++] = b ^ GDL90_XOR_KEY;
    } else {
      output[outIdx++] = b;
    }
  }

  return output.subarray(0, outIdx);
}

/**
 * Decodes 24-bit signed integer (two's complement) for latitude/longitude
 */
function decodeInt24(b0: number, b1: number, b2: number): number {
  let val = (b0 << 16) | (b1 << 8) | b2;
  if ((val & 0x800000) !== 0) {
    val -= 0x1000000; // Sign extend negative
  }
  return val;
}

/**
 * Parses a raw GDL 90 frame (with or without framing 0x7E flags)
 */
export function parseGdl90Frame(rawBuffer: Uint8Array): Gdl90Message | null {
  if (!rawBuffer || rawBuffer.length < 4) return null;

  // Strip framing flags if present
  let start = 0;
  let end = rawBuffer.length;
  if (rawBuffer[start] === GDL90_FLAG) start++;
  if (rawBuffer[end - 1] === GDL90_FLAG) end--;

  const framed = rawBuffer.subarray(start, end);
  const unescaped = unescapeGdl90(framed);

  if (unescaped.length < 3) return null;

  // Verify CRC (last 2 bytes are little-endian CRC-16)
  const payloadLen = unescaped.length - 2;
  const expectedCrc = unescaped[payloadLen] | (unescaped[payloadLen + 1] << 8);
  const calculatedCrc = computeGdl90Crc(unescaped, payloadLen);

  if (expectedCrc !== calculatedCrc) {
    return null; // CRC mismatch
  }

  const msgId = unescaped[0];
  const payload = unescaped.subarray(1, payloadLen);

  // Message 0x00: Heartbeat Message
  if (msgId === 0x00 && payload.length >= 6) {
    const b1 = payload[0];
    const b2 = payload[1];
    const timeStamp = ((payload[2] & 0x80) ? 0 : 0) | ((payload[3] << 8) | payload[4]); // seconds UTC
    return {
      type: 'HEARTBEAT',
      gpsValid: (b1 & 0x80) !== 0,
      uatInitialized: (b1 & 0x01) !== 0,
      utcTimeValid: (b2 & 0x01) !== 0,
      timeStampSeconds: timeStamp,
      messageCount: payload[5],
    };
  }

  // Message 0x0A (Ownship) or 0x14 (Traffic Report)
  if ((msgId === 0x0A || msgId === 0x14) && payload.length >= 27) {
    const addr = ((payload[1] << 16) | (payload[2] << 8) | payload[3]).toString(16).toUpperCase().padStart(6, '0');

    // 24-bit Latitude and Longitude scaled: deg = val * 180 / 2^23
    const rawLat = decodeInt24(payload[4], payload[5], payload[6]);
    const rawLon = decodeInt24(payload[7], payload[8], payload[9]);
    const latitude = (rawLat * 180.0) / 8388608.0;
    const longitude = (rawLon * 180.0) / 8388608.0;

    // 12-bit altitude: resolution 25 ft, offset -1,000 ft
    const rawAlt = (payload[10] << 4) | (payload[11] >> 4);
    const altitudeFeet = rawAlt === 0xfff ? 0 : rawAlt * 25 - 1000;

    // Misc status
    const isAirborne = (payload[12] & 0x80) === 0;
    const nic = payload[12] & 0x0f;

    // Ground speed (12 bits, 1 kt resolution)
    const groundSpeedKnots = (payload[13] << 4) | (payload[14] >> 4);

    // Vertical speed (12 bits signed, 64 fpm resolution)
    let rawVs = ((payload[14] & 0x0f) << 8) | payload[15];
    if (rawVs & 0x800) rawVs -= 0x1000;
    const verticalSpeedFpm = rawVs * 64;

    // Track (8 bits, scaled 360 / 256)
    const trackDegrees = Math.round((payload[16] * 360.0) / 256.0) % 360;

    // Call sign (8 ASCII chars)
    let callSign = '';
    for (let i = 18; i < 26; i++) {
      const charCode = payload[i];
      if (charCode >= 32 && charCode <= 126) {
        callSign += String.fromCharCode(charCode);
      }
    }
    callSign = callSign.trim();

    const result = {
      address: addr,
      latitude: Number(latitude.toFixed(5)),
      longitude: Number(longitude.toFixed(5)),
      altitudeFeet,
      groundSpeedKnots,
      trackDegrees,
      verticalSpeedFpm,
      callSign: callSign || `TFC-${addr}`,
      isAirborne,
      nic,
    };

    if (msgId === 0x0A) {
      return { type: 'OWNSHIP', ...result };
    } else {
      return { type: 'TRAFFIC', ...result };
    }
  }

  // Message 0x0B: Ownship Geometric Altitude
  if (msgId === 0x0B && payload.length >= 4) {
    let rawGeoAlt = (payload[0] << 8) | payload[1];
    if (rawGeoAlt & 0x8000) rawGeoAlt -= 0x10000;
    const altitudeFeet = rawGeoAlt * 5;
    const vfomFeet = (payload[2] << 8) | payload[3];

    return {
      type: 'GEOMETRIC_ALT',
      altitudeFeet,
      vfomFeet,
    };
  }

  return null;
}

/**
 * Builds a valid binary GDL 90 packet with escaping and CRC-16 for testing and telemetry
 */
export function buildGdl90Frame(messageId: number, payload: Uint8Array): Uint8Array {
  const unescaped = new Uint8Array(1 + payload.length + 2);
  unescaped[0] = messageId;
  unescaped.set(payload, 1);

  const crc = computeGdl90Crc(unescaped, 1 + payload.length);
  unescaped[1 + payload.length] = crc & 0xff;
  unescaped[1 + payload.length + 1] = (crc >> 8) & 0xff;

  const escaped = escapeGdl90(unescaped);
  const packet = new Uint8Array(1 + escaped.length + 1);
  packet[0] = GDL90_FLAG;
  packet.set(escaped, 1);
  packet[packet.length - 1] = GDL90_FLAG;

  return packet;
}
