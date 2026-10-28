/**
 * Live In-Flight ATC & Radio Comms Audio Transcription Service
 *
 * Captures spoken pilot/controller transmissions via Web Speech API (SpeechRecognition),
 * tracks the active frequency in use, extracts key flight instructions (QNH, Squawk,
 * Runway, Altitude), and maintains a chronological cockpit review log.
 */

export interface ExtractedAviationData {
  qnh?: number;
  squawk?: string;
  runway?: string;
  altitudeFt?: number;
}

export interface AtcTranscriptItem {
  id: string;
  timestamp: number;        // UTC epoch ms
  frequency: string;        // e.g. "120.305 MHz"
  station: string;          // e.g. "Cascais Tower"
  speaker: 'ATC' | 'PILOT';
  text: string;
  isPinned?: boolean;
  extracted?: ExtractedAviationData;
}

export type TranscriptListener = (items: AtcTranscriptItem[]) => void;
export type InterimSpeechListener = (text: string) => void;

const STORAGE_KEY = 'gustlog_atc_transcripts_v1';

const SPOKEN_DIGITS: Record<string, string> = {
  zero: '0',
  oh: '0',
  wun: '1',
  one: '1',
  too: '2',
  two: '2',
  tree: '3',
  three: '3',
  fower: '4',
  four: '4',
  fife: '5',
  five: '5',
  six: '6',
  seven: '7',
  ait: '8',
  eight: '8',
  niner: '9',
  nine: '9',
  decimal: '.',
  point: '.',
  dot: '.',
};

/**
 * Normalizes spoken phonetic words (e.g. "two niner niner two" -> "2992")
 * and collapses adjacent single-digit sequences.
 */
function normalizeSpokenPhraseology(text: string): string {
  let res = text.replace(
    /\b(zero|oh|wun|one|too|two|tree|three|fower|four|fife|five|six|seven|ait|eight|niner|nine|decimal|point|dot)\b/gi,
    (w) => SPOKEN_DIGITS[w.toLowerCase()] ?? w
  );

  let prev = '';
  while (res !== prev) {
    prev = res;
    res = res.replace(/(?<=\b\d+)\s+(?=\d\b)/g, '');
    res = res.replace(/(?<=\b\d+)\s*\.\s*(?=\d+\b)/g, '.');
  }

  return res;
}

export class AtcTranscriberService {
  private static seqCounter: number = 0;
  private recognition: any = null;
  private isListening: boolean = false;
  private items: AtcTranscriptItem[] = [];
  private listeners: Set<TranscriptListener> = new Set();
  private interimListeners: Set<InterimSpeechListener> = new Set();

  private activeFreq: string = '120.305 MHz';
  private activeStation: string = 'Cascais Tower';
  private pilotCallsign: string = 'CS-DXB';

  constructor() {
    this.items = this.loadStoredItems();
    this.initSpeechRecognition();
  }

  public setFrequency(freq: string, station: string): void {
    this.activeFreq = freq;
    this.activeStation = station;
  }

  public setCallsign(callsign: string): void {
    this.pilotCallsign = callsign.toUpperCase();
  }

  public getFrequency(): { freq: string; station: string } {
    return { freq: this.activeFreq, station: this.activeStation };
  }

  public getItems(): AtcTranscriptItem[] {
    return [...this.items];
  }

  public subscribe(listener: TranscriptListener): () => void {
    this.listeners.add(listener);
    listener(this.getItems());
    return () => this.listeners.delete(listener);
  }

  public onInterimSpeech(listener: InterimSpeechListener): () => void {
    this.interimListeners.add(listener);
    return () => this.interimListeners.delete(listener);
  }

  private notify(): void {
    const copy = this.getItems();
    for (const l of this.listeners) {
      l(copy);
    }
    this.persistItems();
  }

  private initSpeechRecognition(): void {
    if (typeof window === 'undefined') return;

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      return;
    }

    try {
      this.recognition = new SpeechRecognitionClass();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onresult = (event: any) => {
        let interimText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const transcript = res[0]?.transcript?.trim();
          if (res.isFinal) {
            if (transcript) {
              this.addTranscript(transcript);
            }
          } else {
            interimText += transcript + ' ';
          }
        }

        for (const il of this.interimListeners) {
          il(interimText.trim());
        }
      };

      this.recognition.onerror = () => {
        // keep listening resilience
      };

      this.recognition.onend = () => {
        if (this.isListening) {
          try {
            this.recognition?.start();
          } catch {}
        }
      };
    } catch {
      this.recognition = null;
    }
  }

  public startListening(): boolean {
    if (!this.recognition) return false;
    try {
      this.recognition.start();
      this.isListening = true;
      return true;
    } catch {
      this.isListening = true;
      return false;
    }
  }

  public stopListening(): void {
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
    }
    for (const il of this.interimListeners) {
      il('');
    }
  }

  public getIsListening(): boolean {
    return this.isListening;
  }

  public isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return Boolean(
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    );
  }

  /**
   * Adds a speech transcript entry to the log.
   */
  public addTranscript(text: string, overrideSpeaker?: 'ATC' | 'PILOT'): AtcTranscriptItem {
    const trimmed = text.trim();
    if (!trimmed) throw new Error('Empty transcript text');

    const speaker = overrideSpeaker || this.detectSpeaker(trimmed);
    const extracted = this.extractAviationData(trimmed);

    const item: AtcTranscriptItem = {
      id: `atc_${Date.now()}_${++AtcTranscriberService.seqCounter}_${Math.random().toString(36).substring(2, 8)}`,
      timestamp: Date.now(),
      frequency: this.activeFreq,
      station: this.activeStation,
      speaker,
      text: trimmed,
      extracted,
    };

    this.items.unshift(item);
    if (this.items.length > 100) {
      this.items = this.items.slice(0, 100);
    }

    this.notify();
    return item;
  }

  public togglePin(id: string): void {
    const item = this.items.find((i) => i.id === id);
    if (item) {
      item.isPinned = !item.isPinned;
      this.notify();
    }
  }

  public toggleSpeaker(id: string): void {
    const item = this.items.find((i) => i.id === id);
    if (item) {
      item.speaker = item.speaker === 'ATC' ? 'PILOT' : 'ATC';
      this.notify();
    }
  }

  public deleteItem(id: string): void {
    this.items = this.items.filter((i) => i.id !== id);
    this.notify();
  }

  public clearAll(): void {
    this.items = [];
    this.notify();
  }

  /**
   * Intelligently classifies speaker as ATC or PILOT based on aviation phraseology.
   */
  public detectSpeaker(text: string): 'ATC' | 'PILOT' {
    // Strip HTML/script tags and normalize non-alphanumeric punctuation
    const clean = text
      .replace(/<[^>]*>/g, ' ')
      .replace(/[^\w\s-]/g, ' ')
      .trim()
      .toUpperCase();

    // Pilot readbacks typically end with the pilot's callsign: '..., CS-DXB'
    const endsWithCallsign = new RegExp(`(?:^|\\s)${this.pilotCallsign}\\s*$`).test(clean);
    if (endsWithCallsign && !clean.startsWith(this.pilotCallsign)) {
      return 'PILOT';
    }

    // Check for pilot's own initial transmissions or requests
    if (clean.includes(this.pilotCallsign)) {
      if (
        clean.startsWith(this.pilotCallsign) &&
        (clean.includes('REQUEST') ||
          clean.includes('READY') ||
          clean.includes('REPORTING') ||
          clean.includes('ROGER') ||
          clean.includes('WILCO'))
      ) {
        return 'PILOT';
      }
      if (
        clean.includes('REQUEST') ||
        clean.includes('READY') ||
        clean.includes('INBOUND') ||
        clean.includes('WITH YOU')
      ) {
        return 'PILOT';
      }
    }

    // Classic ATC instructions
    const atcTriggers = [
      'CLEARED',
      'HOLD SHORT',
      'SQUAWK',
      'CONTACT',
      'RADAR CONTACT',
      'WIND',
      'REPORT',
      'IDENT',
      'DESCEND',
      'CLIMB',
      'MAINTAIN',
      'TURN LEFT',
      'TURN RIGHT',
      'LINE UP AND WAIT',
      'DIRECT TO',
      'EXPECT',
    ];

    for (const trig of atcTriggers) {
      if (clean.includes(trig)) return 'ATC';
    }

    // Classic pilot transmissions
    const pilotTriggers = [
      'REQUEST',
      'READY FOR DEPARTURE',
      'WILCO',
      'ROGER',
      'WITH YOU',
      'ESTABLISHED',
      'GO AROUND',
      'PASSING',
      'INBOUND',
    ];

    for (const trig of pilotTriggers) {
      if (clean.includes(trig)) return 'PILOT';
    }

    // Default to ATC in case of uncertainty so pilot notices clearances
    return 'ATC';
  }

  /**
   * Extracts critical aviation numbers: QNH, Squawk, Runway, and Altitude.
   */
  public extractAviationData(text: string): ExtractedAviationData {
    const result: ExtractedAviationData = {};
    const normalized = normalizeSpokenPhraseology(text);

    // 1. QNH / Altimeter setting (e.g. "QNH 1013", "QNH 992", "altimeter 29.92", "altimeter 2992", "QNH 1O13")
    const qnhMatch = normalized.match(/(?:QNH|altimeter)\s*([0-9a-zA-Z.]+)/i);
    if (qnhMatch) {
      let rawVal = qnhMatch[1].trim();
      // Heal common OCR/STT letter substitutions (O/o -> 0, l/I -> 1)
      rawVal = rawVal.replace(/[oO]/g, '0').replace(/[lI]/g, '1');

      if (/^\d{3,4}$/.test(rawVal)) {
        const intVal = parseInt(rawVal, 10);
        // Valid aviation barometric pressure range (hPa): 850 to 1080
        if (intVal >= 850 && intVal <= 1080) {
          result.qnh = intVal;
        } else if (intVal >= 2800 && intVal <= 3200) {
          // inHg altimeter format without decimal (e.g. 2992 -> 29.92 inHg -> 1013 hPa)
          const inHg = intVal / 100;
          const hpa = Math.round(inHg * 33.8638866667);
          if (hpa >= 850 && hpa <= 1080) {
            result.qnh = hpa;
          }
        }
      } else if (/^\d{2}\.\d{1,2}$/.test(rawVal)) {
        // inHg altimeter format with decimal (e.g. 29.92 inHg -> 1013 hPa)
        const inHg = parseFloat(rawVal);
        if (inHg >= 25.0 && inHg <= 33.0) {
          const hpa = Math.round(inHg * 33.8638866667);
          if (hpa >= 850 && hpa <= 1080) {
            result.qnh = hpa;
          }
        }
      }
    }

    // 2. Transponder Squawk code (strictly 4 octal digits: 0-7, e.g. "squawk 7000", "transponder 7700")
    const squawkMatch = normalized.match(/(?:squawk|transponder)\s*([0-9a-zA-Z]+)/i);
    if (squawkMatch) {
      let code = squawkMatch[1].trim().replace(/[oO]/g, '0');
      // Must be exactly 4 octal digits (0 to 7). Non-octal (8, 9) or invalid lengths are rejected.
      if (/^[0-7]{4}$/.test(code)) {
        result.squawk = code;
      }
    }

    // 3. Assigned Runway (e.g. "runway 03", "rwy 21L", "runway 36 right", "rwy 35C", "runway 3" -> "03")
    const rwyMatch = normalized.match(
      /(?:runway|rwy)\s*([0-9]{1,2})\s*(left|right|center|centre|[lrc])?\b/i
    );
    if (rwyMatch) {
      const rwyNum = parseInt(rwyMatch[1], 10);
      // Valid runways in aviation are strictly 01 to 36
      if (rwyNum >= 1 && rwyNum <= 36) {
        const paddedNum = rwyNum.toString().padStart(2, '0');
        let suffix = '';
        if (rwyMatch[2]) {
          const s = rwyMatch[2].toUpperCase();
          if (s === 'LEFT' || s === 'L') suffix = 'L';
          else if (s === 'RIGHT' || s === 'R') suffix = 'R';
          else if (s === 'CENTER' || s === 'CENTRE' || s === 'C') suffix = 'C';
        }
        result.runway = `${paddedNum}${suffix}`;
      }
    }

    // 4. Altitude / Flight Level (e.g. "FL 065", "FL100", "climb to 4500 feet", "descend and maintain 2000")
    // 4a. Check Flight Level first (FL 065 -> 6500, FL100 -> 10000)
    const flMatch = normalized.match(/(?:flight\s*level|FL)\s*([0-9]{2,3})\b/i);
    if (flMatch) {
      const flVal = parseInt(flMatch[1], 10);
      if (flVal >= 10 && flVal <= 600) {
        result.altitudeFt = flVal * 100;
      }
    }

    // 4b. If no Flight Level matched, check altitudes in feet
    if (result.altitudeFt === undefined) {
      const altMatch = normalized.match(
        /(?:climb(?:\s+and\s+maintain|\s+to)?|descend(?:\s+and\s+maintain|\s+to)?|maintain|at)\s*(?:to\s*)?(-?[0-9]{3,5})\s*(?:feet|ft)?\b/i
      );
      if (altMatch) {
        const alt = parseInt(altMatch[1], 10);
        // Valid aviation altitude: strictly positive (500 ft to 60,000 ft). Discard negative altitudes.
        if (alt >= 500 && alt <= 60000) {
          result.altitudeFt = alt;
        }
      }
    }

    return result;
  }

  /**
   * Generates realistic simulated ATC / Pilot radio exchanges for offline cockpit training.
   */
  public simulateSampleExchange(type: 'CLEARANCE' | 'HANDOFF' | 'APPROACH'): void {
    switch (type) {
      case 'CLEARANCE':
        this.addTranscript(
          `${this.pilotCallsign}, cleared to enter Cascais CTR via Sierra 1, maintain 2500 feet, QNH 1019, squawk 7000.`,
          'ATC'
        );
        setTimeout(() => {
          this.addTranscript(
            `Cleared to enter Cascais CTR via Sierra 1, maintain 2500 feet, QNH 1019, squawk 7000, ${this.pilotCallsign}.`,
            'PILOT'
          );
        }, 1200);
        break;

      case 'HANDOFF':
        this.addTranscript(
          `${this.pilotCallsign}, leaving Lisbon TMA, contact Lisboa Information on 119.105, good day.`,
          'ATC'
        );
        setTimeout(() => {
          this.addTranscript(
            `Contact Lisboa Information 119.105, thanks for the service, ${this.pilotCallsign}.`,
            'PILOT'
          );
        }, 1200);
        break;

      case 'APPROACH':
        this.addTranscript(
          `${this.pilotCallsign}, wind 330 at 11 knots, runway 35 cleared to land.`,
          'ATC'
        );
        setTimeout(() => {
          this.addTranscript(
            `Runway 35 cleared to land, ${this.pilotCallsign}.`,
            'PILOT'
          );
        }, 1000);
        break;
    }
  }

  private loadStoredItems(): AtcTranscriptItem[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (item) =>
          item &&
          typeof item === 'object' &&
          typeof item.id === 'string' &&
          typeof item.text === 'string'
      );
    } catch {
      return [];
    }
  }

  private persistItems(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
    } catch {}
  }
}
