/**
 * Meetily-inspired 16 kHz segmenter.
 *
 * This is intentionally a boundary experiment, not a Silero implementation:
 * native capture already supplies canonical 16 kHz PCM, so the candidate keeps
 * the existing capture and Whisper worker contracts while adopting hysteresis,
 * pre/post padding, and redemption semantics.
 */

const SAMPLE_RATE = 16_000;
const FRAME_MS = 30;
const FRAME_SAMPLES = (SAMPLE_RATE * FRAME_MS) / 1000;
const ENERGY_REFERENCE_RMS = 0.08;

export interface MeetilySpeechSegment {
  samples: Float32Array;
  durationMs: number;
  sequenceId: number;
  startMs: number;
  endMs: number;
  confidence: number;
}

export interface MeetilyVadOptions {
  positiveThreshold?: number;
  negativeThreshold?: number;
  minSpeechMs?: number;
  preSpeechPadMs?: number;
  postSpeechPadMs?: number;
  redemptionMs?: number;
  maxSegmentMs?: number;
}

interface Frame {
  samples: Float32Array;
  startMs: number;
  endMs: number;
  score: number;
}

interface PendingSpeech {
  frames: Frame[];
  startMs: number;
  positiveMs: number;
}

interface OpenSpeech {
  frames: Frame[];
  trailing: Frame[];
  startMs: number;
  silenceMs: number;
  scoreSum: number;
  scoreCount: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function frameRms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

function joinFrames(frames: Frame[]): Float32Array {
  const total = frames.reduce((sum, frame) => sum + frame.samples.length, 0);
  const output = new Float32Array(total);
  let offset = 0;
  for (const frame of frames) {
    output.set(frame.samples, offset);
    offset += frame.samples.length;
  }
  return output;
}

export class MeetilyVadProcessor {
  private readonly positiveThreshold: number;
  private readonly negativeThreshold: number;
  private readonly minSpeechFrames: number;
  private readonly preSpeechPadFrames: number;
  private readonly postSpeechPadFrames: number;
  private readonly redemptionFrames: number;
  private readonly maxSegmentMs: number;

  private remainder = new Float32Array(0);
  private audioCursorMs = 0;
  private preRoll: Frame[] = [];
  private pending: PendingSpeech | null = null;
  private open: OpenSpeech | null = null;
  private segmentIdCounter = 0;
  private sequenceIdCounter = 0;

  constructor(options: MeetilyVadOptions = {}) {
    this.positiveThreshold = options.positiveThreshold ?? 0.50;
    this.negativeThreshold = options.negativeThreshold ?? 0.35;
    this.minSpeechFrames = Math.ceil((options.minSpeechMs ?? 250) / FRAME_MS);
    this.preSpeechPadFrames = Math.ceil((options.preSpeechPadMs ?? 300) / FRAME_MS);
    this.postSpeechPadFrames = Math.ceil((options.postSpeechPadMs ?? 400) / FRAME_MS);
    this.redemptionFrames = Math.ceil((options.redemptionMs ?? 1200) / FRAME_MS);
    this.maxSegmentMs = options.maxSegmentMs ?? 14_000;
    if (this.negativeThreshold > this.positiveThreshold) {
      throw new Error('negativeThreshold must not exceed positiveThreshold');
    }
  }

  push(samples: Float32Array): MeetilySpeechSegment[] {
    if (!(samples instanceof Float32Array) || samples.length === 0) return [];

    let input = samples;
    if (this.remainder.length > 0) {
      const merged = new Float32Array(this.remainder.length + samples.length);
      merged.set(this.remainder, 0);
      merged.set(samples, this.remainder.length);
      input = merged;
      this.remainder = new Float32Array(0);
    }

    const segments: MeetilySpeechSegment[] = [];
    let offset = 0;
    while (offset + FRAME_SAMPLES <= input.length) {
      const frameSamples = input.slice(offset, offset + FRAME_SAMPLES);
      const startMs = this.audioCursorMs;
      this.audioCursorMs += FRAME_MS;
      offset += FRAME_SAMPLES;
      this.processFrame({
        samples: frameSamples,
        startMs,
        endMs: startMs + FRAME_MS,
        score: clamp(frameRms(frameSamples) / ENERGY_REFERENCE_RMS, 0, 1),
      }, segments);
    }

    if (offset < input.length) this.remainder = input.slice(offset);
    return segments;
  }

  peekOpenSegment(): { samples: Float32Array; durationMs: number } | null {
    if (!this.open || this.open.frames.length === 0) return null;
    const samples = joinFrames(this.open.frames);
    return { samples, durationMs: Math.round((samples.length / SAMPLE_RATE) * 1000) };
  }

  softCommit(): MeetilySpeechSegment | null {
    if (!this.open) return null;
    return this.emitOpenSegment();
  }

  notifySpeechEnded(): MeetilySpeechSegment[] {
    return this.flush();
  }

  flush(): MeetilySpeechSegment[] {
    const segments: MeetilySpeechSegment[] = [];
    if (this.open) {
      if (this.remainder.length > 0) {
        const startMs = this.audioCursorMs;
        const endMs = startMs + (this.remainder.length / SAMPLE_RATE) * 1000;
        this.open.trailing.push({ samples: this.remainder, startMs, endMs, score: 0 });
        this.audioCursorMs = endMs;
        this.remainder = new Float32Array(0);
      }
      const segment = this.emitOpenSegment();
      if (segment) segments.push(segment);
    }
    this.pending = null;
    this.preRoll = [];
    this.remainder = new Float32Array(0);
    return segments;
  }

  reset(): void {
    this.remainder = new Float32Array(0);
    this.audioCursorMs = 0;
    this.preRoll = [];
    this.pending = null;
    this.open = null;
    this.segmentIdCounter = 0;
    this.sequenceIdCounter = 0;
  }

  isInSpeech(): boolean { return this.open !== null; }

  currentSegmentId(): number { return this.segmentIdCounter; }

  private processFrame(frame: Frame, segments: MeetilySpeechSegment[]): void {
    if (this.open) {
      this.processOpenFrame(frame, segments);
      return;
    }

    if (frame.score >= this.positiveThreshold) {
      if (!this.pending) {
        const preRoll = this.preRoll.slice(-this.preSpeechPadFrames);
        this.pending = {
          frames: [...preRoll, frame],
          startMs: preRoll[0]?.startMs ?? frame.startMs,
          positiveMs: FRAME_MS,
        };
      } else {
        this.pending.frames.push(frame);
        this.pending.positiveMs += FRAME_MS;
      }

      if (this.pending.positiveMs >= this.minSpeechFrames * FRAME_MS) {
        const pending = this.pending;
        this.open = {
          frames: pending.frames,
          trailing: [],
          startMs: pending.startMs,
          silenceMs: 0,
          scoreSum: pending.frames.reduce((sum, item) => sum + item.score, 0),
          scoreCount: pending.frames.length,
        };
        this.pending = null;
        this.preRoll = [];
        this.segmentIdCounter++;
      }
      return;
    }

    if (this.pending) {
      if (frame.score >= this.negativeThreshold) {
        this.pending.frames.push(frame);
      } else {
        const pendingAgeMs = frame.endMs - this.pending.startMs;
        if (pendingAgeMs > this.preSpeechPadFrames * FRAME_MS) {
          this.pending = null;
          this.preRoll = [];
        }
      }
    }
    this.rememberPreRoll(frame);
  }

  private processOpenFrame(frame: Frame, segments: MeetilySpeechSegment[]): void {
    const open = this.open;
    if (!open) return;

    if (frame.score >= this.positiveThreshold) {
      if (open.trailing.length > 0) open.frames.push(...open.trailing.splice(0));
      open.frames.push(frame);
      open.silenceMs = 0;
      open.scoreSum += frame.score;
      open.scoreCount++;
      this.maybeForceCommit(segments);
      return;
    }

    open.trailing.push(frame);
    open.silenceMs += FRAME_MS;
    if (frame.score >= this.negativeThreshold) {
      open.scoreSum += frame.score;
      open.scoreCount++;
    }

    if (open.silenceMs >= this.redemptionFrames * FRAME_MS) {
      const segment = this.emitOpenSegment();
      if (segment) segments.push(segment);
      return;
    }
    this.maybeForceCommit(segments);
  }

  private maybeForceCommit(segments: MeetilySpeechSegment[]): void {
    if (!this.open) return;
    const durationMs = this.open.frames.length * FRAME_MS;
    if (durationMs < this.maxSegmentMs) return;
    const segment = this.emitOpenSegment();
    if (segment) segments.push(segment);
  }

  private emitOpenSegment(): MeetilySpeechSegment | null {
    const open = this.open;
    if (!open || open.frames.length === 0) {
      this.open = null;
      return null;
    }

    const tail = open.trailing.slice(-this.postSpeechPadFrames);
    const frames = [...open.frames, ...tail];
    const samples = joinFrames(frames);
    const last = frames[frames.length - 1];
    const segment: MeetilySpeechSegment = {
      samples,
      durationMs: Math.round((samples.length / SAMPLE_RATE) * 1000),
      sequenceId: ++this.sequenceIdCounter,
      startMs: open.startMs,
      endMs: last?.endMs ?? open.startMs,
      confidence: open.scoreCount > 0 ? open.scoreSum / open.scoreCount : 0,
    };
    this.open = null;
    this.pending = null;
    this.preRoll = [];
    return segment;
  }

  private rememberPreRoll(frame: Frame): void {
    this.preRoll.push(frame);
    if (this.preRoll.length > this.preSpeechPadFrames) {
      this.preRoll.splice(0, this.preRoll.length - this.preSpeechPadFrames);
    }
  }
}

export const MEETILY_VAD_DEFAULTS = Object.freeze({
  positiveThreshold: 0.50,
  negativeThreshold: 0.35,
  minSpeechMs: 250,
  preSpeechPadMs: 300,
  postSpeechPadMs: 400,
  redemptionMs: 1200,
  maxSegmentMs: 14_000,
});
