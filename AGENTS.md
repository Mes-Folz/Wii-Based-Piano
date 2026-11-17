# AGENTS.md: Wii Piano

Wii-inspired dual-screen piano simulator. A PC **Host** shows the keyboard, plays audio and runs game modes. A phone/tablet **Controller** (Phase 2+) pairs over the local network and acts as a multi-touch keyboard.

## Status
- [x] **Phase 1**: single-screen piano, audio engine, self-hosted soundfonts, computer keyboard + pointer input
- [ ] **Phase 2**: implementation present; real-phone Wi-Fi pairing and reconnect check pending
- [ ] Phase 3: full multi-touch Controller, state sync Host -> Controller
- [ ] Phase 4: Tutorial Mode (MIDI parser, falling notes, Perfect/Good/Miss judge, pause/tempo/loop)
- [ ] Phase 5: Wii aesthetic polish, UI SFX, ambient loop, results screen

Build one phase at a time. Each phase must be runnable and testable before the next starts.

## Commands
```
npm install
npm run dev        # Vite on :5173 and WebSocket relay on :3000 (both reachable on LAN)
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + vite build -> dist/host and dist/controller
```

## Decisions (do not revisit without asking)
- **Transport:** WebSocket via `ws` (not Socket.IO). WebRTC only if WebSocket proves insufficient.
- **Server is a dumb relay.** It manages rooms and forwards messages. The Host is the source of truth for audio, game state and scoring.
- **Browser-first.** Node server + two web pages. Electron may wrap it later without architecture changes.
- **Fully offline on LAN.** All audio assets are self-hosted. No CDNs for anything essential (fonts are bundled via `@fontsource`).
- **Vite + TypeScript (strict) + Node.js.** Vanilla TS, no UI framework.
- **Original assets only.** Take inspiration from the Wii's style (clean whites, soft blues, glossy rounded UI) but never use Nintendo logos, fonts, music or SFX.

## Architecture rules
- **MIDI note numbers (0-127) identify keys everywhere.** Middle C = 60, A4 = 69 = 440 Hz.
- **One event shape** (`src/shared/protocol.ts`): `{t:'on', n, v}` (v is velocity 0..1) and `{t:'off', n}`. Every input source (computer keyboard, pointer, remote Controller, later MIDI songs) emits these; everything downstream consumes them. In Phase 2 the Controller sends the same objects over WebSocket (adding a timestamp).
- **The audio engine has no DOM or UI imports** (`src/host/audio/engine.ts`). It must be drivable by any input source.
- `src/shared/` is the only code both Host and Controller import. `host/` and `controller/` never import each other. Keep the controller bundle small.
- Note routing lives in one place (`handle()` in `src/host/main.ts`): audio + key highlight + readout. New inputs just call it.
- Instruments implement `Instrument` (`load`, `start` -> `Voice` with `release`). Add instruments by registering one more object with the engine.
- Keep abstractions minimal. Add them when a second use exists, not before.

## Directory layout
```
public/soundfonts/<instrument>/<midi>.mp3   self-hosted samples (88 each)
scripts/extract-soundfont.mjs               splits a MIDI.js soundfont .js into per-note mp3s
src/shared/    notes.ts (MIDI helpers), protocol.ts (NoteEvent)
src/host/      index.html, main.ts (wiring)
  audio/       engine.ts, instruments.ts (SampledInstrument, WiiSynth)
  input/       computerKeyboard.ts
  ui/          keyboard.ts (on-screen piano, pointer input)
src/styles/    main.css (Wii-style tokens + components)
vite.config.ts root = src, publicDir = ./public, alias @shared -> src/shared
```
Implemented for Phase 2: `server/index.ts`, `server/rooms.ts`, `server/network.ts`, `src/controller/`, and `src/shared/transport.ts`. Planned for later phases: `src/host/modes/{freestyle,tutorial/}`.

## Latency and audio notes
- Controller sends on `pointerdown` (never `click`); `touch-action: none` on the key surface.
- Server: `setNoDelay(true)`, no batching. Host plays on receipt, scheduled at `ctx.currentTime`.
- Tutorial judging uses Host receive time minus measured one-way delay, plus a user-adjustable calibration offset. Starting windows: Perfect +/-50 ms, Good +/-120 ms.
- Browsers need a user gesture before audio starts (the "Press to start" gate). Keep it.
- Always provide a "panic" path (`allNotesOff`) and release notes on blur, tab hide and disconnect.
- HTTPS is not required for WebSocket or Pointer Events over a LAN IP. Optional later.

## Conventions
- Strict TS, no unused locals/params. Run `npm run typecheck` before declaring done.
- Computer-keyboard mapping uses `KeyboardEvent.code` (physical position), so labels assume QWERTY.
- Sample URLs use `import.meta.env.BASE_URL`.
- UI: glossy pill buttons, Nunito, Wii blues (`--blue` #2fa8e8). Respect `prefers-reduced-motion`; keep visible focus.

## Known gaps
- No sustain pedal yet.
- Phase 1 audio and UI were built and typechecked but not yet listening-tested by the author of this file. Verify with the checklist in `README.md`.


# Phases 2-5 build instructions

## Phase 2: WebSocket pairing

**Goal:** tapping a button on the phone plays a note on the PC.

**Build**
- **Deps:** `ws`, `qrcode`, `tsx`, `@types/ws`. The server is written in TypeScript and run with `tsx`.
- **`server/`:**
  - `index.ts`: HTTP + `ws` on port 3000, with `setNoDelay(true)` and `perMessageDeflate: false`. It exposes `/api/info`, which returns the LAN IP.
  - `rooms.ts`: 4-letter codes without ambiguous letters (no I, O, 0 or 1). One host per room. The room is cleaned up shortly after the host drops.
  - `network.ts`: LAN IP detection.
- **Server rules:** it only relays. It validates message size, note range 0-127 and velocity 0..1, and rate-limits each socket.
- **`src/shared/transport.ts`:** a small interface (`send`, `onMessage`, `onStatus`) with a WebSocket implementation, so WebRTC can replace it later.
- **Protocol additions in `shared/protocol.ts`:**
  - `host` → `room {code}`
  - `join {room, clientId}` → `joined` or `error {reason}`
  - `peer {connected}` to the host
  - `ping`/`pong` for the latency HUD
  - note events relayed unchanged
- **Host:** `ui/pairing.ts` shows the QR and room code. The QR must encode the LAN IP from `/api/info`, never `localhost`. Remote note events go into the same `handle()` as local input.
- **Controller (bare-bones):** `src/controller/` with a room-code input and a few note buttons. It stores `clientId` in `sessionStorage` and reconnects with backoff. Add the controller as a second Vite entry.
- **Dev setup:** Vite on 5173 serves the pages and proxies `/ws` and `/api` to the ws server on 3000. The phone connects to `ws://<page host>/ws` over the same LAN port as the page.
- **Safety:** the Host calls `allNotesOff` when the controller disconnects.

**Test:** pair over real phone Wi-Fi, check the latency HUD (typically under 15 ms), and reconnect after the phone sleeps.

---

## Phase 3: Multi-touch controller

**Goal:** Freestyle Mode is fully playable from the phone.

**Build**
- **Shared keyboard:** move `PianoKeyboard` into `src/shared/ui/`, since the Controller is now its second user. It already tracks pointers per finger.
- **Layout:** landscape, about 2 octaves visible, with larger keys and octave shift buttons. Set `user-scalable=no`, `touch-action: none` and `user-select: none`, and block the context menu.
- **Controls:** instrument picker, octave, volume and a mode button. The controller sends `{t:'ctl', k, v}` and the Host replies with `{t:'state', instrument, mode, octave}`, so the Host is the source of truth.
- **Stuck-note protection:**
  - send `panic` on `visibilitychange`, `blur` and `pointercancel`
  - the Host releases held notes if pings stop for about 3 s
- **Feedback:** optional soft local click and `navigator.vibrate` (Android only).
- **Screen-awake:** Wake Lock needs HTTPS, so on plain HTTP over a LAN IP use a fallback or document the limit. A self-signed cert is optional.

**Test:** 5-10 simultaneous touches, sliding off keys, backgrounding the tab, and both iOS Safari and Android Chrome. iPhone Safari has no fullscreen API.

---

## Phase 4: Tutorial Mode + MIDI parser

**Goal:** a learn-a-song loop with scoring.

**Build**
- **Mode interface:** `{enter, exit, onNote, render}`. Freestyle and Tutorial both implement it, and the Host switches between them.
- **`songLoader.ts`:** `@tonejs/midi` converts `.mid` to JSON `{title, bpm, notes:[{n, t, d, v}]}` with times in seconds. Add `public/songs/index.json`.
- **`player.ts`:**
  - The song clock is derived from `audioContext.currentTime`, not `setTimeout`.
  - Support a rate multiplier (50-100%), pause/seek, and an A-B loop.
- **`fallingNotes.ts`:** a canvas aligned to the on-screen keys. Expose `getKeyRect(note)` from the keyboard. Use a 2-3 s lookahead and a hit line at the top of the keys.
- **`judge.ts`:**
  - Match each note-on to the nearest unmatched expected note of the same pitch.
  - Starting windows: Perfect ±50 ms, Good ±120 ms, otherwise Miss.
  - Track combo and score.
  - Subtract the measured one-way latency (RTT/2) plus a user-adjustable calibration offset.
- **Wait mode:** an optional gentler mode where the clock pauses until the correct key is pressed.
- **Songs:** ship 2-3 simple ones (Ode to Joy, Twinkle Twinkle, a Für Elise excerpt). Use your own arrangements or public-domain-sourced MIDI, since many MIDI files are copyrighted.
- **Tests:** add Vitest for the pure logic (judge and clock).

**Test:** no timing drift at 50% tempo, seamless loops, and fair-feeling windows.

---

## Phase 5: Wii aesthetic polish + SFX

**Goal:** it looks and sounds finished.

**Build**
- **Home screen:** channel-style menu tiles (Freestyle, Tutorial, Settings) using the design tokens in `styles/`.
- **Audio buses:** master → instrument, SFX and ambient, each with its own volume. Duck the ambient bus while notes play.
- **Sound:** an original ambient loop and UI sounds (hover, click, connect, results). Synthesize them with Web Audio or self-host the files, with no ripped Nintendo audio.
- **Effects:** key-press glow and light particles on a capped-DPR canvas, plus a results screen with rank and score.
- **Settings and states:** a settings panel (calibration, volumes, mute), a clear "connection lost" banner, and a Host fullscreen toggle.
- **Quality:** honor `prefers-reduced-motion`, keep visible focus, and hold 60 fps.
- **Packaging:** a single `npm run start` that serves the built Host, Controller and ws from one Node process. Electron stays optional.

**Test:** a mid-range phone and a modest PC, at several screen sizes.

---

Want me to start Phase 2 now, or save these instructions into `AGENTS.md` first?
