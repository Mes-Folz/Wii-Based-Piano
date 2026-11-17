import '@fontsource/nunito/600.css';
import '@fontsource/nunito/800.css';
import '../styles/main.css';
import QRCode from 'qrcode';

import type { NoteEvent } from '@shared/protocol';
import { midiToName } from '@shared/notes';
import { AudioEngine } from './audio/engine';
import { SampledInstrument, WiiSynth } from './audio/instruments';
import { PianoKeyboard } from './ui/keyboard';
import { ComputerKeyboardInput } from './input/computerKeyboard';
import { PianoTransport } from '@shared/transport';
import { createClientId } from '@shared/clientId';
import type { ServerMessage } from '@shared/protocol';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

// --- Audio ---------------------------------------------------------------
const engine = new AudioEngine();
const sf = `${import.meta.env.BASE_URL}soundfonts`;
engine.register(new SampledInstrument('grand-piano', 'Grand Piano', `${sf}/grand-piano`));
engine.register(new SampledInstrument('electric-piano', 'Electric Piano', `${sf}/electric-piano`));
engine.register(new WiiSynth());

// --- Note routing: every input source ends up here -------------------------
const active = new Set<number>();
function handle(e: NoteEvent): void {
  if (e.t === 'on') {
    engine.noteOn(e.n, e.v);
    keyboard.setActive(e.n, true);
    active.add(e.n);
  } else {
    engine.noteOff(e.n);
    keyboard.setActive(e.n, false);
    active.delete(e.n);
  }
  renderReadout();
}

// --- UI ----------------------------------------------------------------------
const keyboard = new PianoKeyboard($('keyboard'), 21, 108, handle); // Full 88-key piano, A0..C8
const computer = new ComputerKeyboardInput(handle, syncOctave);

const clientId = localStorage.getItem('wii-piano-client') ?? createClientId();
localStorage.setItem('wii-piano-client', clientId);
let roomCode = '';
let retryTimer: number | undefined;
let retryAttempt = 0;
const networkPicker = $<HTMLSelectElement>('network-address');
function renderPairingLink(): void {
  const address = networkPicker.value || location.hostname;
  const port = location.port ? `:${location.port}` : '';
  const link = `http://${address}${port}/controller/?room=${roomCode}`;
  $('controller-link').textContent = link;
  void QRCode.toDataURL(link, { width: 132, margin: 1 }).then((dataUrl) => {
    $<HTMLImageElement>('pair-qr').src = dataUrl;
  });
}
networkPicker.addEventListener('change', renderPairingLink);
const transport = new PianoTransport((message: ServerMessage) => {
  if (message.type === 'room') {
    retryAttempt = 0;
    roomCode = message.code;
    $('room-code').textContent = roomCode;
    void (async () => {
      const response = await fetch('/api/info');
      const data = await response.json() as { addresses: { name: string; address: string }[] };
      const addresses = data.addresses;
      if (!addresses.length) {
        $('pair-status').textContent = 'No LAN address found. Connect this computer to Wi-Fi.';
        $('controller-link').textContent = '';
        return;
      }
      networkPicker.replaceChildren(...addresses.map(({ name, address }) => {
        const option = document.createElement('option');
        option.value = address;
        option.textContent = `${name}: ${address}`;
        return option;
      }));
      const currentAddress = addresses.find(({ address }) => address === location.hostname);
      if (currentAddress) networkPicker.value = currentAddress.address;
      $('network-picker').hidden = addresses.length < 2;
      renderPairingLink();
    })();
    $('pair-status').textContent = 'Waiting for phone…';
  } else if (message.type === 'joined') {
    $('pair-status').textContent = 'Connected to room';
  } else if (message.type === 'peer') {
    $('pair-status').textContent = message.connected ? 'Controller connected' : 'Waiting for phone…';
    if (!message.connected) {
      engine.allNotesOff();
      for (const n of [...active]) handle({ t: 'off', n });
    }
  } else if (message.type === 'note') {
    handle(message.event);
  } else if (message.type === 'pong') {
    $('latency').textContent = `Latency ~${Math.round((performance.now() - message.sentAt) / 2)} ms`;
  } else if (message.type === 'error') {
    $('pair-status').textContent = message.reason;
  }
}, (status) => {
  if (status !== 'Connected') $('pair-status').textContent = status;
  if (retryTimer) window.clearTimeout(retryTimer);
  if (status.startsWith('Disconnected') || status.startsWith('Timed out')) {
    const delay = Math.min(500 * 2 ** retryAttempt, 5000);
    retryAttempt = Math.min(retryAttempt + 1, 4);
    const relayHost = location.host;
    $('pair-status').textContent = `Can't reach server at ${relayHost}; retrying in ${delay / 1000}s.`;
    retryTimer = window.setTimeout(() => transport.connect(clientId, roomCode || undefined), delay);
  }
});
transport.connect(clientId);
window.setInterval(() => transport.send({ type: 'ping', sentAt: performance.now() }), 1000);

function syncOctave(): void {
  $('oct-name').textContent = computer.baseName;
  if (window.matchMedia('(max-width: 700px)').matches) {
    const low = computer.baseNote;
    keyboard.setRange(low, Math.min(low + 24, 108));
  } else {
    keyboard.setRange(21, 108);
  }
  keyboard.setLabels(computer.labels());
  for (const note of active) keyboard.setActive(note, true);
}
syncOctave();
window.addEventListener('resize', syncOctave);

function renderReadout(): void {
  const names = [...active].sort((a, b) => a - b).map(midiToName);
  $('readout').textContent = names.length ? names.join('  ') : 'Ready';
}

$('oct-down').addEventListener('click', () => computer.shiftOctave(-1));
$('oct-up').addEventListener('click', () => computer.shiftOctave(1));
const volume = $<HTMLInputElement>('volume');
volume.addEventListener('input', () => engine.setVolume(Number(volume.value)));
volume.addEventListener('change', () => volume.blur()); // keep arrow keys for octave

// Instrument pills
let selected = 'grand-piano';
const pillBox = $('instruments');
for (const { id, name } of engine.list()) {
  const b = document.createElement('button');
  b.className = 'pill';
  b.dataset.id = id;
  b.setAttribute('role', 'radio');
  b.textContent = name;
  b.addEventListener('click', () => { b.blur(); void selectInstrument(id); });
  pillBox.append(b);
}
function markSelected(): void {
  pillBox.querySelectorAll<HTMLElement>('.pill').forEach((b) => {
    const on = b.dataset.id === selected;
    b.classList.toggle('primary', on);
    b.setAttribute('aria-checked', String(on));
  });
}

async function selectInstrument(id: string): Promise<void> {
  selected = id;
  markSelected();
  const name = engine.list().find((i) => i.id === id)?.name ?? id;
  const status = $('status');
  try {
    status.textContent = `Loading ${name}…`;
    await engine.setInstrument(id, (f) => {
      if (selected === id) status.textContent = `Loading ${name} ${Math.round(f * 100)}%`;
    });
    if (selected === id) status.textContent = '';
  } catch (err) {
    console.error(err);
    status.textContent = `Couldn't load ${name}. Check the soundfont files and try again.`;
  }
}

// --- Start gate (browsers need a user gesture before audio) ---------------
$('start-btn').addEventListener('click', async () => {
  const btn = $<HTMLButtonElement>('start-btn');
  const msg = $('start-msg');
  btn.disabled = true;
  msg.textContent = 'Loading Grand Piano…';
  try {
    await engine.start();
    await engine.setInstrument('grand-piano', (f) => {
      msg.textContent = `Loading Grand Piano ${Math.round(f * 100)}%`;
    });
    $('start').classList.add('hidden');
    markSelected();
    const i = engine.info();
    if (i) {
      $('hint-info')?.remove();
      const el = document.createElement('span');
      el.id = 'hint-info';
      el.textContent = ` Audio: ${i.sampleRate} Hz, base latency ${i.baseLatencyMs.toFixed(1)} ms.`;
      document.querySelector('.hint')?.append(el);
    }
  } catch (err) {
    console.error(err);
    msg.textContent = `Couldn't start audio: ${(err as Error).message}`;
    btn.disabled = false;
  }
});

// Safety nets: never leave a note ringing.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { engine.allNotesOff(); for (const n of [...active]) handle({ t: 'off', n }); }
});
markSelected();
