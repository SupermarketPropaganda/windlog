/**
 * GDL-90 Data Interface Protocol Parser
 *
 * Implements Garmin / FAA GDL-90 binary protocol parsing for ADS-B / FLARM / SafeSky
 * receivers (e.g. Sentry, Stratux, SkyEcho, FlightBox).
 *
 * Key specifications:
 * - Framing: 0x7E flag byte at start and end
 * - Byte Stuffing: 0x7D 0x5E -> 0x7E, 0x7D 0x5D -> 0x7D
 * - CRC-16-CCITT (polynomial 0x1021, LSB first)
 * - Message IDs:
 *     0x00: Heartbeat
 *     0x0A: Ownship Report (Msg 10)
 *     0x0B: Ownship Geometric Altitude (Msg 11)
 *     0x14: Traffic Report (Msg 20)
 */

export interface Gdl90Heartbeat {
  msgId: 0;
  gpsPositionValid: boolean;
  batteryLow: boolean;
  utcOk: boolean;
  timestampSeconds: number;
}

export interface Gdl90TrafficReport {
  msgId: 10 | 20; // 10 = Ownship, 20 = External Traffic
  isOwnship: boolean;
  trafficAlert: boolean;
  addressType: number;
  icaoAddress: string; // 6-char hex, e.g. "4951AB"
  latitude: number;    // decimal degrees (-90 to +90)
  longitude: number;   // decimal degrees (-180 to +180)
  altitudeFt: number | null; // Pressure altitude in feet (or null if invalid)
  misc: number;
  nic: number;
  nacc: number;
  groundSpeedKt: number;
  verticalSpeedFpm: number;
  trackDeg: number;    // 0-359 degrees
  emitterCategory: number;
  callsign: string;    // e.g. "TAP123"
}

export interface Gdl90GeometricAltitude {
  msgId: 11;
  geoAltitudeFt: number;
  verticalFOM: number;
}

export type Gdl90Message =
  | Gdl90Heartbeat
  | Gdl90TrafficReport
  | Gdl90GeometricAltitude;

// Precomputed 256-entry lookup table for CRC-16-CCITT (reflected/reversed)
const CRC16_TABLE: Uint16NumberArray = new Uint16Array(256);
(function initCrcTable() {
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      if ((crc & 1) !== 0) {
        crc = (crc >>> 1) ^ 0x8408; // 0x1021 reversed
      } else {
        crc >>>= 1;
      }
    }
    CRC16_TABLE[i] = crc & 0xffff;
  }
})();

type Uint16NumberArray = Uint16Array;

/**
 * Computes GDL-90 CRC-16 over buffer slice.
 */
export function computeGdl90Crc(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0;
  for (let i = start; i < end; i++) {
    crc = (crc >>> 8) ^ CRC16_TABLE[(crc ^ bytes[i]) & 0xff];
  }
  return crc & 0xffff;
}

/**
 * Unescapes a GDL-90 frame payload (between 0x7E flags).
 * 0x7D 0x5E -> 0x7E
 * 0x7D 0x5D -> 0x7D
 */
export function unescapeGdl90Frame(raw: Uint8Array): Uint8Array {
  if (!raw || raw.length === 0) return new Uint8Array(0);

  const out = new Uint8Array(raw.length);
  let outLen = 0;
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === 0x7d && i + 1 < raw.length) {
      if (raw[i + 1] === 0x5e) {
        out[outLen++] = 0x7e;
        i += 2;
        continue;
      } else if (raw[i + 1] === 0x5d) {
        out[outLen++] = 0x7d;
        i += 2;
        continue;
      }
    }
    out[outLen++] = raw[i];
    i++;
  }
  return out.subarray(0, outLen);
}

/**
 * Escapes bytes for transmission in a GDL-90 frame.
 */
export function escapeGdl90Bytes(payload: Uint8Array): Uint8Array {
  const result: number[] = [0x7e];
  for (let i = 0; i < payload.length; i++) {
    const b = payload[i];
    if (b === 0x7e) {
      result.push(0x7d, 0x5e);
    } else if (b === 0x7d) {
      result.push(0x7d, 0x5d);
    } else {
      result.push(b);
    }
  }
  result.push(0x7e);
  return new Uint8Array(result);
}

/**
 * Parses a 24-bit angular coordinate (resolution = 180 / 2^23 degrees).
 */
function parse24BitLatLon(b0: number, b1: number, b2: number): number {
  let raw = (((b0 & 0xff) << 16) | ((b1 & 0xff) << 8) | (b2 & 0xff)) >>> 0;
  // Sign extend 24-bit to 32-bit signed
  if (raw & 0x800000) {
    raw = (raw - 0x1000000);
  }
  return raw * (180.0 / 8388608.0); // 180 / 2^23
}

/**
 * Parses a single unescaped GDL-90 message frame (including its 2-byte CRC at end).
 */
export function parseGdl90Message(frameBytes: Uint8Array): Gdl90Message | null {
  if (!frameBytes || frameBytes.length < 3) return null;

  // Validate CRC (last 2 bytes are CRC LSB, MSB)
  const dataLen = frameBytes.length - 2;
  const receivedCrc = (frameBytes[dataLen] & 0xff) | ((frameBytes[dataLen + 1] & 0xff) << 8);
  const calculatedCrc = computeGdl90Crc(frameBytes, 0, dataLen);

  if (receivedCrc !== calculatedCrc) {
    return null;
  }

  const msgId = frameBytes[0];

  switch (msgId) {
    case 0x00: { // Heartbeat
      if (dataLen < 7) return null;
      const status1 = frameBytes[1];
      const status2 = frameBytes[2];
      const timeMsb = (status2 & 0x80) !== 0 ? 1 : 0;
      const timeSec = ((timeMsb << 16) | ((frameBytes[3] & 0xff) << 8) | (frameBytes[4] & 0xff));

      return {
        msgId: 0,
        gpsPositionValid: (status1 & 0x80) !== 0,
        batteryLow: (status1 & 0x01) !== 0,
        utcOk: (status2 & 0x01) !== 0,
        timestampSeconds: timeSec,
      };
    }

    case 0x0a: // Ownship Report (Msg 10)
    case 0x14: { // Traffic Report (Msg 20)
      if (dataLen < 28) return null;

      const isOwnship = msgId === 0x0a;
      const alertByte = frameBytes[1];
      const trafficAlert = (alertByte & 0x10) !== 0;
      const addressType = alertByte & 0x0f;

      const icaoInt = (((frameBytes[2] & 0xff) << 16) | ((frameBytes[3] & 0xff) << 8) | (frameBytes[4] & 0xff)) >>> 0;
      const icaoAddress = (icaoInt & 0xffffff).toString(16).toUpperCase().padStart(6, '0');

      const lat = parse24BitLatLon(frameBytes[5], frameBytes[6], frameBytes[7]);
      const lon = parse24BitLatLon(frameBytes[8], frameBytes[9], frameBytes[10]);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
      }

      // Altitude (bits 15..4)
      const altRaw = ((frameBytes[11] & 0xff) << 4) | ((frameBytes[12] & 0xff) >> 4);
      const altitudeFt = altRaw === 0xfff ? null : altRaw * 25 - 1000;

      const misc = frameBytes[13] & 0xff;
      const nic = (frameBytes[11] & 0x0f);
      const nacc = (frameBytes[12] & 0x0f);

      // Horizontal Velocity (12 bits)
      const horizVelRaw = ((frameBytes[14] & 0xff) << 4) | ((frameBytes[15] & 0xff) >> 4);
      const groundSpeedKt = horizVelRaw === 0xfff ? 0 : horizVelRaw;

      // Vertical Velocity (12 bits signed, resolution 64 fpm; 0x800 = not available)
      let vertVelRaw = ((frameBytes[15] & 0x0f) << 8) | (frameBytes[16] & 0xff);
      let verticalSpeedFpm = 0;
      if (vertVelRaw !== 0x800) {
        if (vertVelRaw & 0x800) {
          vertVelRaw |= ~0xfff;
        }
        verticalSpeedFpm = vertVelRaw * 64;
      }

      // Track (8 bits: 360/256 deg)
      const trackDeg = Math.round(((frameBytes[17] & 0xff) * 360) / 256) % 360;

      const emitterCategory = frameBytes[18] & 0xff;

      // Callsign (8 characters, bytes 19..26, sanitized printable ASCII)
      let callsign = '';
      for (let c = 19; c < 27; c++) {
        const charCode = frameBytes[c];
        if (charCode >= 32 && charCode <= 126) {
          callsign += String.fromCharCode(charCode);
        }
      }
      callsign = callsign.trim();

      return {
        msgId,
        isOwnship,
        trafficAlert,
        addressType,
        icaoAddress,
        latitude: Math.max(-90, Math.min(90, lat)),
        longitude: Math.max(-180, Math.min(180, lon)),
        altitudeFt,
        misc,
        nic,
        nacc,
        groundSpeedKt,
        verticalSpeedFpm,
        trackDeg,
        emitterCategory,
        callsign: callsign || icaoAddress,
      };
    }

    case 0x0b: { // Ownship Geometric Altitude
      if (dataLen < 5) return null;
      let rawAlt = ((frameBytes[1] & 0xff) << 8) | (frameBytes[2] & 0xff);
      if (rawAlt & 0x8000) {
        rawAlt |= ~0xffff;
      }
      const vFOM = ((frameBytes[3] & 0xff) << 8) | (frameBytes[4] & 0xff);
      return {
        msgId: 11,
        geoAltitudeFt: rawAlt * 5,
        verticalFOM: vFOM,
      };
    }

    default:
      return null;
  }
}

/**
 * Stream framer that extracts multiple framed GDL-90 messages from an incoming byte stream.
 * Uses a zero-allocation circular/fixed backing buffer for maximum throughput.
 */
export class Gdl90StreamDecoder {
  private buffer: Uint8Array = new Uint8Array(1024);
  private bufferLen: number = 0;

  public pushBytes(incoming: Uint8Array): Gdl90Message[] {
    const messages: Gdl90Message[] = [];
    if (!incoming || !incoming.length) return messages;

    for (let i = 0; i < incoming.length; i++) {
      const b = incoming[i];

      if (b === 0x7e) {
        // Frame boundary
        if (this.bufferLen > 2) {
          const rawFrame = this.buffer.subarray(0, this.bufferLen);
          const unescaped = unescapeGdl90Frame(rawFrame);
          const parsed = parseGdl90Message(unescaped);
          if (parsed) {
            messages.push(parsed);
          }
        }
        this.bufferLen = 0;
      } else {
        // Accumulate bytes inside frame
        if (this.bufferLen < this.buffer.length) {
          this.buffer[this.bufferLen++] = b;
        } else {
          // Prevent runaway buffer if frame boundary lost (> 1024 bytes)
          this.bufferLen = 0;
        }
      }
    }

    return messages;
  }

  public reset(): void {
    this.bufferLen = 0;
  }
}

/**
 * Serializes a Traffic Report (Msg 20) or Ownship (Msg 10) into a framed GDL-90 byte buffer.
 * Useful for mocking, unit testing, and simulation feeds.
 */
export function encodeGdl90TrafficReport(report: Partial<Gdl90TrafficReport> & { icaoAddress: string }): Uint8Array {
  const msgId = report.isOwnship ? 0x0a : 0x14;
  const payload = new Uint8Array(28);

  payload[0] = msgId;
  payload[1] = (report.trafficAlert ? 0x10 : 0x00) | ((report.addressType ?? 0) & 0x0f);

  const icao = parseInt(report.icaoAddress, 16) || 0;
  payload[2] = (icao >> 16) & 0xff;
  payload[3] = (icao >> 8) & 0xff;
  payload[4] = icao & 0xff;

  // Lat / Lon with bounds clamping and NaN defense
  const safeLat = Number.isFinite(report.latitude) ? Math.max(-90, Math.min(90, report.latitude!)) : 0;
  const lat24 = Math.round((safeLat * 8388608.0) / 180.0);
  payload[5] = (lat24 >> 16) & 0xff;
  payload[6] = (lat24 >> 8) & 0xff;
  payload[7] = lat24 & 0xff;

  const safeLon = Number.isFinite(report.longitude) ? Math.max(-180, Math.min(180, report.longitude!)) : 0;
  const lon24 = Math.round((safeLon * 8388608.0) / 180.0);
  payload[8] = (lon24 >> 16) & 0xff;
  payload[9] = (lon24 >> 8) & 0xff;
  payload[10] = lon24 & 0xff;

  // Altitude
  let altRaw = 0xfff;
  if (report.altitudeFt !== null && report.altitudeFt !== undefined && Number.isFinite(report.altitudeFt)) {
    altRaw = Math.max(0, Math.min(0xffe, Math.round((report.altitudeFt + 1000) / 25)));
  }
  payload[11] = ((altRaw >> 4) & 0xff);
  payload[12] = ((altRaw & 0x0f) << 4);

  payload[13] = (report.misc ?? 0) & 0xff;

  // Ground Speed
  const safeGs = Number.isFinite(report.groundSpeedKt) ? Math.max(0, Math.min(0xffe, report.groundSpeedKt!)) : 0;
  payload[14] = (safeGs >> 4) & 0xff;
  payload[15] = ((safeGs & 0x0f) << 4);

  // Vertical Speed (res 64 fpm)
  const safeVs = Number.isFinite(report.verticalSpeedFpm) ? report.verticalSpeedFpm! : 0;
  const vsRaw = Math.max(-2047, Math.min(2047, Math.round(safeVs / 64))) & 0xfff;
  payload[15] |= (vsRaw >> 8) & 0x0f;
  payload[16] = vsRaw & 0xff;

  // Track (360/256 deg)
  const safeTrack = Number.isFinite(report.trackDeg) ? ((report.trackDeg! % 360) + 360) % 360 : 0;
  payload[17] = Math.round((safeTrack * 256) / 360) & 0xff;

  payload[18] = Number.isFinite(report.emitterCategory) ? (report.emitterCategory! & 0xff) : 1;

  // Callsign (8 chars, sanitized ASCII)
  const rawCs = (report.callsign || report.icaoAddress || 'TRAFFIC');
  let sanitizedCs = '';
  for (let i = 0; i < rawCs.length && sanitizedCs.length < 8; i++) {
    const code = rawCs.charCodeAt(i);
    sanitizedCs += (code >= 32 && code <= 126) ? rawCs[i] : '?';
  }
  const cs = sanitizedCs.padEnd(8, ' ').slice(0, 8);
  for (let i = 0; i < 8; i++) {
    payload[19 + i] = cs.charCodeAt(i);
  }

  // Calculate CRC
  const crc = computeGdl90Crc(payload, 0, payload.length);
  const withCrc = new Uint8Array(payload.length + 2);
  withCrc.set(payload, 0);
  withCrc[payload.length] = crc & 0xff;
  withCrc[payload.length + 1] = (crc >> 8) & 0xff;

  return escapeGdl90Bytes(withCrc);
}
