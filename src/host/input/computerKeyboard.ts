import type { NoteEvent } from '@shared/protocol';
import { midiToName } from '@shared/notes';

// Semitone offsets from the current base note, keyed by physical key (layout-independent).
const LAYOUT: Record<string, { offset: number; label: string }> = {
  KeyZ: { offset: 0, label: 'Z' }, KeyS: { offset: 1, label: 'S' }, KeyX: { offset: 2, label: 'X' },
  KeyD: { offset: 3, label: 'D' }, KeyC: { offset: 4, label: 'C' }, KeyV: { offset: 5, label: 'V' },
  KeyG: { offset: 6, label: 'G' }, KeyB: { offset: 7, label: 'B' }, KeyH: { offset: 8, label: 'H' },
  KeyN: { offset: 9, label: 'N' }, KeyJ: { offset: 10, label: 'J' }, KeyM: { offset: 11, label: 'M' },
  KeyQ: { offset: 12, label: 'Q' }, Digit2: { offset: 13, label: '2' }, KeyW: { offset: 14, label: 'W' },
  Digit3: { offset: 15, label: '3' }, KeyE: { offset: 16, label: 'E' }, KeyR: { offset: 17, label: 'R' },
  Digit5: { offset: 18, label: '5' }, KeyT: { offset: 19, label: 'T' }, Digit6: { offset: 20, label: '6' },
  KeyY: { offset: 21, label: 'Y' }, Digit7: { offset: 22, label: '7' }, KeyU: { offset: 23, label: 'U' },
  KeyI: { offset: 24, label: 'I' }, Digit9: { offset: 25, label: '9' }, KeyO: { offset: 26, label: 'O' },
  Digit0: { offset: 27, label: '0' }, KeyP: { offset: 28, label: 'P' },
};

export const MIN_BASE = 21; // A0
export const MAX_BASE = 84; // C6

export class ComputerKeyboardInput {
  private base = 48; // C3
  private readonly held = new Map<string, number>(); // key code -> note
  private readonly onBaseChange: () => void;

  constructor(
    private readonly emit: (e: NoteEvent) => void,
    onBaseChange: () => void,
  ) {
    this.onBaseChange = onBaseChange;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.releaseAll);
  }

  get baseNote(): number { return this.base; }
  get baseName(): string { return midiToName(this.base); }

  shiftOctave(dir: 1 | -1): void {
    const next = Math.min(MAX_BASE, Math.max(MIN_BASE, this.base + dir * 12));
    if (next === this.base) return;
    this.releaseAll();
    this.base = next;
    this.onBaseChange();
  }

  /** note -> keycap label for the current octave. */
  labels(): Map<number, string> {
    return new Map(Object.values(LAYOUT).map(({ offset, label }) => [this.base + offset, label]));
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault();
      if (!e.repeat) this.shiftOctave(e.code === 'ArrowRight' ? 1 : -1);
      return;
    }
    const key = LAYOUT[e.code];
    if (!key) return;
    e.preventDefault();
    if (e.repeat || this.held.has(e.code)) return;
    const note = this.base + key.offset;
    this.held.set(e.code, note);
    this.emit({ t: 'on', n: note, v: 0.8 });
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const note = this.held.get(e.code);
    if (note === undefined) return;
    this.held.delete(e.code);
    this.emit({ t: 'off', n: note });
  };

  private readonly releaseAll = (): void => {
    for (const note of this.held.values()) this.emit({ t: 'off', n: note });
    this.held.clear();
  };
}
