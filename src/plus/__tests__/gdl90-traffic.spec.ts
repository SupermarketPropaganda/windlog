import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  computeGdl90Crc,
  unescapeGdl90Frame,
  escapeGdl90Bytes,
  parseGdl90Message,
  Gdl90StreamDecoder,
  encodeGdl90TrafficReport,
} from '../gdl90-parser';
import { TrafficService } from '../traffic-service';

describe('GDL-90 Protocol Parser & Framing Engine', () => {
  it('computes and verifies CRC-16-CCITT for GDL-90 messages', () => {
    // Sample heartbeat message payload
    const payload = new Uint8Array([0x00, 0x81, 0x01, 0x12, 0x34, 0x00, 0x05]);
    const crc = computeGdl90Crc(payload, 0, payload.length);
    expect(crc).toBeGreaterThan(0);
    expect(crc).toBeLessThanOrEqual(0xffff);
  });

  it('escapes and unescapes GDL-90 byte stuffing flags correctly', () => {
    const raw = new Uint8Array([0x10, 0x7e, 0x20, 0x7d, 0x30]);
    const escaped = escapeGdl90Bytes(raw);

    // Starts and ends with 0x7E
    expect(escaped[0]).toBe(0x7e);
    expect(escaped[escaped.length - 1]).toBe(0x7e);

    // Inner 0x7E should be 0x7D 0x5E, inner 0x7D should be 0x7D 0x5D
    const inner = escaped.slice(1, -1);
    const unescaped = unescapeGdl90Frame(inner);
    expect(Array.from(unescaped)).toEqual(Array.from(raw));
  });

  it('encodes and decodes an ADS-B Traffic Report (Msg 20) with accurate fields', () => {
    const reportData = {
      isOwnship: false,
      trafficAlert: false,
      icaoAddress: '4951AB',
      callsign: 'CS-DXB',
      latitude: 38.7255,
      longitude: -9.3551,
      altitudeFt: 4500,
      groundSpeedKt: 120,
      trackDeg: 180,
      verticalSpeedFpm: -500,
    };

    const framedBytes = encodeGdl90TrafficReport(reportData);
    expect(framedBytes[0]).toBe(0x7e);
    expect(framedBytes[framedBytes.length - 1]).toBe(0x7e);

    const decoder = new Gdl90StreamDecoder();
    const messages = decoder.pushBytes(framedBytes);

    expect(messages.length).toBe(1);
    const msg = messages[0];
    expect(msg.msgId).toBe(20);

    if (msg.msgId === 20) {
      expect(msg.icaoAddress).toBe('4951AB');
      expect(msg.callsign).toBe('CS-DXB');
      expect(msg.latitude).toBeCloseTo(38.7255, 2);
      expect(msg.longitude).toBeCloseTo(-9.3551, 2);
      expect(msg.altitudeFt).toBe(4500);
      expect(msg.groundSpeedKt).toBe(120);
      expect(msg.trackDeg).toBe(180);
      expect(Math.abs(msg.verticalSpeedFpm - -500)).toBeLessThan(64); // within 64 fpm resolution
    }
  });

  it('rejects corrupted messages with bad CRC', () => {
    const reportData = {
      isOwnship: false,
      icaoAddress: '4951AB',
      latitude: 38.7,
      longitude: -9.3,
    };
    const framed = encodeGdl90TrafficReport(reportData);

    // Corrupt one payload byte
    const inner = unescapeGdl90Frame(framed.slice(1, -1));
    inner[5] ^= 0xff; // corrupt lat byte

    const result = parseGdl90Message(inner);
    expect(result).toBeNull();
  });
});

describe('TrafficService Target Management & Proximity Engine', () => {
  let service: TrafficService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new TrafficService();
    service.setOwnship(38.725, -9.355, 3500, 105, 60);
  });

  afterEach(() => {
    service.destroy();
    vi.useRealTimers();
  });

  it('ingests external GDL-90 traffic reports and calculates relative distance and bearing', () => {
    let capturedTargets: any[] = [];
    service.subscribe((targets) => {
      capturedTargets = targets;
    });

    const targetFrame = encodeGdl90TrafficReport({
      isOwnship: false,
      icaoAddress: '495101',
      callsign: 'CS-TGL',
      latitude: 38.745,
      longitude: -9.355,
      altitudeFt: 3800,
      groundSpeedKt: 95,
      trackDeg: 240,
      verticalSpeedFpm: 0,
    });

    service.ingestBytes(targetFrame);

    expect(capturedTargets.length).toBe(1);
    const target = capturedTargets[0];
    expect(target.icaoAddress).toBe('495101');
    expect(target.callsign).toBe('CS-TGL');
    expect(target.distanceNm).toBeGreaterThan(0.5);
    expect(target.distanceNm).toBeLessThan(2.0);
    expect(target.relativeAltFt).toBe(300); // 3800 - 3500
    expect(target.isThreat).toBe(true);     // within 3 NM and +/- 1000 ft
  });

  it('triggers threat alert listener when traffic is within threat zone', () => {
    const threatSpy = vi.fn();
    service.onThreatAlert(threatSpy);

    const threatFrame = encodeGdl90TrafficReport({
      isOwnship: false,
      icaoAddress: '495102',
      callsign: 'N172SP',
      latitude: 38.730,
      longitude: -9.350,
      altitudeFt: 3600,
      groundSpeedKt: 110,
      trackDeg: 180,
    });

    service.ingestBytes(threatFrame);

    expect(threatSpy).toHaveBeenCalled();
    expect(threatSpy.mock.calls[0][0].callsign).toBe('N172SP');
    expect(threatSpy.mock.calls[0][0].isThreat).toBe(true);
  });

  it('simulates realistic traffic targets when simulation is enabled', () => {
    let currentTargets: any[] = [];
    service.subscribe((targets) => {
      currentTargets = targets;
    });

    service.startSimulation();
    expect(service.isSimulating()).toBe(true);
    expect(currentTargets.length).toBe(3);

    service.stopSimulation();
    expect(service.isSimulating()).toBe(false);
    expect(currentTargets.length).toBe(0);
  });
});
