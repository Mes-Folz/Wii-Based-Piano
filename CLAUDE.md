# CLAUDE.md: Wii Piano

Read `AGENTS.md` first; it holds the architecture, decisions, layout and roadmap. This file adds how to work on the project with Claude.

## Quick facts
- Wii-style dual-screen piano: PC Host (audio + visuals) and phone Controller (multi-touch keys) over LAN WebSocket (`ws`).
- Vite + strict TypeScript + Node. Offline-first, self-hosted samples. Phase 1 done; next is Phase 2 (ws relay + QR pairing).
- Key identity is the MIDI note number. Shared event: `{t:'on', n, v}` / `{t:'off', n}`.
- The audio engine must stay free of DOM/UI imports.

## How to work
- Build **one phase at a time**, incrementally. Stop at each phase boundary and let the user test.
- Keep instructions and replies concise. Plan briefly, then implement. Don't add features beyond the current phase.
- Don't add abstractions before a second use exists.
- Before finishing any change: `npm run typecheck` and `npm run build` must pass.
- Don't change the settled decisions in `AGENTS.md` (transport, packaging, offline audio, tooling) without asking.
- Never use Nintendo assets (logos, fonts, music, SFX).
- Be honest about what's verified: say when audio feel, latency or layout hasn't been tested on a real device.

## Where things go
- New input source -> emit `NoteEvent`, call `handle()` in `src/host/main.ts`.
- New instrument -> implement `Instrument`, register in `main.ts`, samples in `public/soundfonts/<id>/<midi>.mp3` (use `scripts/extract-soundfont.mjs`).
- Networking (Phase 2) -> `server/` plus `src/shared/transport.ts`; Controller in `src/controller/`.
- Game modes (Phase 4) -> `src/host/modes/`.

## Phase 2 starting checklist
1. `server/index.ts` (HTTP + `ws`), `rooms.ts` (4-letter codes, cleanup), `network.ts` (LAN IP).
2. Host shows QR + room code. Controller joins via `/controller?room=ABCD` or typed code and auto-rejoins using a `clientId` in `sessionStorage`.
3. `transport.ts` wrapper, ping/pong latency HUD on both sides (target under 15 ms typical).
4. Bare controller: touch piano keys firing note events. Test over real phone Wi-Fi, including reconnect after the phone sleeps.
