import { midiToFreq } from '@shared/notes';

export interface Voice {
  release(when: number): void;
}

export interface Instrument {
  readonly id: string;
  readonly name: string;
  /** Idempotent. Resolves when the instrument is ready to play. */
  load(ctx: AudioContext, onProgress?: (fraction: number) => void): Promise<void>;
  start(ctx: AudioContext, note: number, velocity: number, dest: AudioNode, when: number): Voice;
}

const velocityToGain = (v: number): number => Math.max(0.05, v) ** 1.5;

/** Plays pre-recorded per-note mp3 samples, named <midi>.mp3, from a self-hosted folder. */
export class SampledInstrument implements Instrument {
  private buffers = new Map<number, AudioBuffer>();
  private loading: Promise<void> | null = null;

  constructor(
    readonly id: string,
    readonly name: string,
    private readonly baseUrl: string,
    private readonly range: readonly [number, number] = [21, 108],
  ) {}

  load(ctx: AudioContext, onProgress?: (f: number) => void): Promise<void> {
    this.loading ??= this.fetchAll(ctx, onProgress).catch((err) => {
      this.loading = null; // allow retry
      throw err;
    });
    return this.loading;
  }

  private async fetchAll(ctx: AudioContext, onProgress?: (f: number) => void): Promise<void> {
    const [lo, hi] = this.range;
    const total = hi - lo + 1;
    let done = 0;
    const jobs: Promise<void>[] = [];
    for (let n = lo; n <= hi; n++) {
      jobs.push(
        (async () => {
          const res = await fetch(`${this.baseUrl}/${n}.mp3`);
          if (!res.ok) throw new Error(`Missing sample ${n} (${res.status})`);
          this.buffers.set(n, await ctx.decodeAudioData(await res.arrayBuffer()));
          onProgress?.(++done / total);
        })(),
      );
    }
    await Promise.all(jobs);
  }

  start(ctx: AudioContext, note: number, velocity: number, dest: AudioNode, when: number): Voice {
    // Use the exact sample if present; otherwise pitch-shift the nearest one.
    let src = note;
    if (!this.buffers.has(note)) {
      src = [...this.buffers.keys()].reduce((a, b) => (Math.abs(b - note) < Math.abs(a - note) ? b : a));
    }
    const node = ctx.createBufferSource();
    node.buffer = this.buffers.get(src)!;
    node.playbackRate.value = 2 ** ((note - src) / 12);
    const gain = ctx.createGain();
    gain.gain.value = velocityToGain(velocity);
    node.connect(gain).connect(dest);
    node.start(when);
    node.onended = () => gain.disconnect();
    return {
      release(t) {
        gain.gain.setTargetAtTime(0, t, 0.07);
        node.stop(t + 0.6);
      },
    };
  }
}

/** Soft, bell-like oscillator voice. No assets, loads instantly. */
export class WiiSynth implements Instrument {
  readonly id = 'wii-synth';
  readonly name = 'Wii Synth';

  load(): Promise<void> {
    return Promise.resolve();
  }

  start(ctx: AudioContext, note: number, velocity: number, dest: AudioNode, when: number): Voice {
    const f = midiToFreq(note);
    const peak = velocityToGain(velocity) * 0.5;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, when);
    out.gain.linearRampToValueAtTime(peak, when + 0.006);
    out.gain.setTargetAtTime(peak * 0.5, when + 0.006, 0.3);
    out.connect(dest);

    const partials: Array<[OscillatorType, number, number]> = [
      ['sine', 1, 1],
      ['triangle', 2, 0.3],
      ['sine', 4, 0.1],
    ];
    const oscs = partials.map(([type, mult, level]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mult;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(out);
      o.start(when);
      return o;
    });
    oscs[0]!.onended = () => out.disconnect();

    return {
      release(t) {
        out.gain.setTargetAtTime(0, t, 0.06);
        oscs.forEach((o) => o.stop(t + 0.5));
      },
    };
  }
}
