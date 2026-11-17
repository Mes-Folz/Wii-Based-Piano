// One-time tool: split a MIDI.js soundfont (base64 JS) into per-note mp3 files named by MIDI number.
// Usage: node scripts/extract-soundfont.mjs <input.js> <outDir>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const [, , input, outDir] = process.argv;
const NAMES = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
mkdirSync(outDir, { recursive: true });
const src = readFileSync(input, 'utf8');
let count = 0;
for (const m of src.matchAll(/"([A-G][b]?)(-?\d)":\s*"data:audio\/mp3;base64,([^"]+)"/g)) {
  const midi = (Number(m[2]) + 1) * 12 + NAMES[m[1]];
  writeFileSync(`${outDir}/${midi}.mp3`, Buffer.from(m[3], 'base64'));
  count++;
}
console.log(`${count} samples -> ${outDir}`);
