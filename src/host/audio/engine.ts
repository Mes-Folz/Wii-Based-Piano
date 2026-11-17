// Pure Web Audio. No DOM, no UI imports: this module can be driven by any input source.
import type { Instrument, Voice } from './instruments';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = 0.8;
  private readonly instruments = new Map<string, Instrument>();
  private current: Instrument | null = null;
  private readonly voices = new Map<number, Voice>();
  private loadToken = 0;

  register(instrument: Instrument): void {
    this.instruments.set(instrument.id, instrument);
  }

  list(): Array<{ id: string; name: string }> {
    return [...this.instruments.values()].map(({ id, name }) => ({ id, name }));
  }

  /** Must be called from a user gesture (click / keypress). Safe to call repeatedly. */
  async start(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.knee.value = 20;
      limiter.ratio.value = 4;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(limiter).connect(this.ctx.destination);
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  /** The most recent call wins if the user switches quickly. */
  async setInstrument(id: string, onProgress?: (f: number) => void): Promise<void> {
    const inst = this.instruments.get(id);
    if (!inst) throw new Error(`Unknown instrument: ${id}`);
    if (!this.ctx) throw new Error('Call start() first');
    const token = ++this.loadToken;
    await inst.load(this.ctx, onProgress);
    if (token !== this.loadToken) return;
    this.allNotesOff();
    this.current = inst;
  }

  noteOn(note: number, velocity = 0.8): void {
    if (!this.ctx || !this.master || !this.current) return;
    this.voices.get(note)?.release(this.ctx.currentTime);
    this.voices.set(note, this.current.start(this.ctx, note, velocity, this.master, this.ctx.currentTime));
  }

  noteOff(note: number): void {
    if (!this.ctx) return;
    this.voices.get(note)?.release(this.ctx.currentTime);
    this.voices.delete(note);
  }

  /** Panic button: also the safety net for stuck notes in later phases. */
  allNotesOff(): void {
    for (const note of [...this.voices.keys()]) this.noteOff(note);
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  info(): { sampleRate: number; baseLatencyMs: number; outputLatencyMs: number } | null {
    if (!this.ctx) return null;
    return {
      sampleRate: this.ctx.sampleRate,
      baseLatencyMs: this.ctx.baseLatency * 1000,
      outputLatencyMs: ((this.ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0) * 1000,
    };
  }
}
