# Wii Piano — Phase 2 (Host + phone Controller)

    npm install
    npm run dev        # Vite on :5173 and WebSocket relay on :3000; pages reachable over LAN

Samples are self-hosted in `public/soundfonts/<instrument>/<midi>.mp3` (FluidR3_GM via MIDI.js soundfonts, converted with `scripts/extract-soundfont.mjs`). No network needed at runtime.

Open the Host on the computer and press **Press to start** (remote notes are silent until this audio gate is unlocked). Scan its QR code with a phone on the same Wi-Fi, or open the shown link and enter the 4-letter room code. The Controller page is `/controller/`; press and hold its piano keys to send notes to the Host. The Controller reconnects across temporary disconnects. `npm run build` creates the production pages and `npm start` serves them with the relay on port 3000.

## Phase 1 test checklist
1. Press to start -> Grand Piano loads (progress shown), overlay closes.
2. Middle C is labelled C4 in the readout; pitch sounds correct (A4 = 440 Hz).
3. Hold 8+ keys at once: no clicks, pops or dropouts; releasing fades out cleanly.
4. Click-drag across keys (glissando); release outside the keyboard leaves no stuck note.
5. Switch Grand Piano / Electric Piano / Wii Synth mid-play; held notes stop cleanly.
6. Left/Right arrows change octave; keycap labels move; volume slider works.
7. Switch tabs while holding a key: note stops.
8. Touch a laptop/tablet screen with several fingers: multiple keys sound.

## Layout
- `src/shared/` notes helpers + the `NoteEvent` protocol (used by Host and, later, Controller)
- `src/host/audio/` engine (no DOM) + instruments
- `src/host/input/`, `src/host/ui/` computer keyboard and on-screen keys
