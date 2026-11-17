// MIDI note numbers (0-127) are the universal key identifier across the whole app.
// A4 = 69 = 440 Hz. C4 (middle C) = 60.
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const BLACK = new Set([1, 3, 6, 8, 10]);

export const midiToName = (n: number): string => `${NAMES[n % 12]}${Math.floor(n / 12) - 1}`;
export const midiToFreq = (n: number): number => 440 * 2 ** ((n - 69) / 12);
export const isBlackKey = (n: number): boolean => BLACK.has(n % 12);
