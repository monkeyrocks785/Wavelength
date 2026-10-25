/**
 * Web Audio engines.
 *
 * GuestEngine — receives the relayed stream, then runs it through
 *   source → delay (alignment trim) → gain (volume) → analyser → speakers.
 * The delay node is how every listener lands on the exact same millisecond:
 * each device adds (target − own network latency) of extra delay, so all
 * listeners are phase-locked to the session's alignment target.
 */

export class GuestEngine {
  ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private delay: DelayNode | null = null;
  private gain: GainNode | null = null;
  analyser: AnalyserNode | null = null;
  private volume = 0.9;
  private streamId: string | null = null;

  /** Must be called from a user gesture. */
  ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      this.delay = this.ctx.createDelay(1.5);
      this.delay.delayTime.value = 0;
      this.gain = this.ctx.createGain();
      this.gain.gain.value = this.volume;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.82;
      this.delay.connect(this.gain);
      this.gain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  async resume(): Promise<void> {
    this.ensure();
    if (this.ctx && this.ctx.state !== "running") {
      try {
        await this.ctx.resume();
      } catch {
        /* retry on next gesture */
      }
    }
  }

  attach(stream: MediaStream): void {
    if (!this.streamIsNew(stream)) return;
    this.ensure();
    if (!this.ctx || !this.delay) return;
    if (this.source) {
      try {
        this.source.disconnect();
      } catch {
        /* noop */
      }
    }
    this.source = this.ctx.createMediaStreamSource(stream);
    this.source.connect(this.delay);
  }

  private streamIsNew(stream: MediaStream): boolean {
    if (this.streamId === stream.id && this.source) return false;
    this.streamId = stream.id;
    return true;
  }

  get attached(): boolean {
    return this.source !== null;
  }

  get running(): boolean {
    return this.ctx?.state === "running";
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx && this.gain) {
      this.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
    }
  }

  /** Smooth the alignment delay so retunes never click. */
  setDelayMs(ms: number): void {
    if (this.ctx && this.delay) {
      const clamped = Math.max(0, Math.min(1200, ms)) / 1000;
      this.delay.delayTime.setTargetAtTime(clamped, this.ctx.currentTime, 0.25);
    }
  }

  getDelayMs(): number {
    return this.delay ? this.delay.delayTime.value * 1000 : 0;
  }

  dispose(): void {
    try {
      this.source?.disconnect();
      this.ctx?.close();
    } catch {
      /* noop */
    }
    this.ctx = null;
    this.source = null;
    this.streamId = null;
  }
}

/**
 * MeterTap — analyse a stream without routing it to the speakers.
 * Used by the host to meter the broadcast mix (avoiding double playback).
 */
export class MeterTap {
  ctx: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private streamId: string | null = null;

  attach(stream: MediaStream): void {
    if (this.streamId === stream.id) return;
    this.streamId = stream.id;
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
    }
    if (this.source) {
      try {
        this.source.disconnect();
      } catch {
        /* noop */
      }
    }
    this.source = this.ctx.createMediaStreamSource(stream);
    this.source.connect(this.analyser!);
  }

  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state !== "running") {
      try {
        await this.ctx.resume();
      } catch {
        /* noop */
      }
    }
  }

  dispose(): void {
    try {
      this.source?.disconnect();
      this.ctx?.close();
    } catch {
      /* noop */
    }
    this.ctx = null;
    this.source = null;
    this.streamId = null;
  }
}

/**
 * DelayedMonitor — theatre mode: the host hears their own film through the
 * same alignment delay as the picture buffer, so host + guests + picture
 * all land on one millisecond.
 */
export class DelayedMonitor {
  private engine = new GuestEngine();

  attach(stream: MediaStream): void {
    this.engine.attach(stream);
  }

  async resume(): Promise<void> {
    await this.engine.resume();
  }

  setDelayMs(ms: number): void {
    this.engine.setDelayMs(ms);
  }

  setVolume(v: number): void {
    this.engine.setVolume(v);
  }

  get analyser(): AnalyserNode | null {
    return this.engine.analyser;
  }

  get attached(): boolean {
    return this.engine.attached;
  }

  dispose(): void {
    this.engine.dispose();
  }
}
