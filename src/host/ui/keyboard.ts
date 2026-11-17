import type { NoteEvent } from '@shared/protocol';
import { isBlackKey, midiToName } from '@shared/notes';

/** On-screen piano. Renders keys, shows active/label state, emits NoteEvents from pointer input. */
export class PianoKeyboard {
  private readonly keys = new Map<number, HTMLElement>();
  private readonly pointers = new Map<number, number>(); // pointerId -> note being held

  constructor(
    private readonly root: HTMLElement,
    private low: number,
    private high: number,
    private readonly emit: (e: NoteEvent) => void,
  ) {
    this.build();
    root.addEventListener('pointerdown', this.onDown);
    root.addEventListener('pointermove', this.onMove);
    root.addEventListener('pointerup', this.onUp);
    root.addEventListener('pointercancel', this.onUp);
    root.addEventListener('lostpointercapture', this.onUp);
  }

  setActive(note: number, active: boolean): void {
    this.keys.get(note)?.classList.toggle('active', active);
  }

  setRange(low: number, high: number): void {
    if (low === this.low && high === this.high) return;
    for (const note of this.pointers.values()) this.emit({ t: 'off', n: note });
    this.pointers.clear();
    this.low = low;
    this.high = high;
    this.keys.clear();
    this.build();
  }

  setLabels(labels: Map<number, string>): void {
    for (const [note, el] of this.keys) el.dataset.label = labels.get(note) ?? '';
  }

  private build(): void {
    const whites: number[] = [];
    for (let n = this.low; n <= this.high; n++) if (!isBlackKey(n)) whites.push(n);
    const w = 100 / whites.length;
    this.root.style.setProperty('--white-w', `${w}%`);
    this.root.replaceChildren();

    const frag = document.createDocumentFragment();
    whites.forEach((n) => frag.append(this.makeKey(n, 'white')));
    let whiteIndex = -1;
    for (let n = this.low; n <= this.high; n++) {
      if (!isBlackKey(n)) { whiteIndex++; continue; }
      const el = this.makeKey(n, 'black');
      el.style.left = `${(whiteIndex + 1) * w}%`;
      frag.append(el);
    }
    this.root.append(frag);
  }

  private makeKey(note: number, kind: 'white' | 'black'): HTMLElement {
    const el = document.createElement('div');
    el.className = `key ${kind}`;
    el.dataset.note = String(note);
    el.dataset.noteName = midiToName(note);
    this.keys.set(note, el);
    return el;
  }

  private noteAt(x: number, y: number): { note: number; velocity: number } | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('.key');
    if (!el || !this.root.contains(el)) return null;
    const r = el.getBoundingClientRect();
    const velocity = 0.35 + 0.65 * Math.min(1, Math.max(0, (y - r.top) / r.height)); // lower on key = louder
    return { note: Number(el.dataset.note), velocity };
  }

  private readonly onDown = (e: PointerEvent): void => {
    const hit = this.noteAt(e.clientX, e.clientY);
    if (!hit) return;
    e.preventDefault();
    this.root.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, hit.note);
    this.emit({ t: 'on', n: hit.note, v: hit.velocity });
  };

  private readonly onMove = (e: PointerEvent): void => {
    const current = this.pointers.get(e.pointerId);
    if (current === undefined) return;
    const hit = this.noteAt(e.clientX, e.clientY);
    if (hit?.note === current) return;
    this.emit({ t: 'off', n: current });
    if (hit) {
      this.pointers.set(e.pointerId, hit.note);
      this.emit({ t: 'on', n: hit.note, v: hit.velocity });
    } else {
      this.pointers.delete(e.pointerId);
    }
  };

  private readonly onUp = (e: PointerEvent): void => {
    const current = this.pointers.get(e.pointerId);
    if (current === undefined) return;
    this.pointers.delete(e.pointerId);
    this.emit({ t: 'off', n: current });
  };
}
