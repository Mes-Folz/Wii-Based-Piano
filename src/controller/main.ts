import '../styles/main.css';
import { PianoTransport } from '@shared/transport';
import { createClientId } from '@shared/clientId';
import type { ServerMessage } from '@shared/protocol';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const roomField = $<HTMLInputElement>('room-input');
roomField.value = (params.get('room') ?? sessionStorage.getItem('wii-piano-room') ?? '').toUpperCase();
const clientId = sessionStorage.getItem('wii-piano-controller') ?? createClientId();
sessionStorage.setItem('wii-piano-controller', clientId);
const held = new Set<number>();
let room = roomField.value;
let retryTimer: number | undefined;
let retryAttempt = 0;

const transport = new PianoTransport((message: ServerMessage) => {
  if (message.type === 'joined') {
    retryAttempt = 0;
    room = message.room;
    roomField.value = room;
    sessionStorage.setItem('wii-piano-room', room);
    $('connection').textContent = `Connected · room ${room}`;
  } else if (message.type === 'peer') {
    $('connection').textContent = message.connected ? `Connected · room ${room}` : 'Host disconnected';
  } else if (message.type === 'pong') {
    $('latency').textContent = `Latency ~${Math.round((performance.now() - message.sentAt) / 2)} ms`;
  } else if (message.type === 'error') {
    $('connection').textContent = message.reason;
  }
}, (status) => {
  if (status.startsWith('Disconnected') || status.startsWith('Timed out')) releaseHeldNotes();
  if (status !== 'Connected') $('connection').textContent = status;
  if (retryTimer) window.clearTimeout(retryTimer);
  if (status.startsWith('Disconnected') || status.startsWith('Timed out')) {
    const delay = Math.min(500 * 2 ** retryAttempt, 5000);
    retryAttempt = Math.min(retryAttempt + 1, 4);
    const relayHost = location.host;
    $('connection').textContent = `Can't reach ${relayHost}. Retrying in ${delay / 1000}s; check the same Wi-Fi.`;
    retryTimer = window.setTimeout(() => connect(), delay);
  }
});

function connect(): void {
  if (room) {
    releaseHeldNotes();
    transport.connect(clientId, room);
  }
  else $('connection').textContent = 'Scan the Host QR code or enter its 4-character room code.';
}
connect();
window.setInterval(() => transport.send({ type: 'ping', sentAt: performance.now() }), 1000);

$('join-form').addEventListener('submit', (event) => {
  event.preventDefault();
  room = roomField.value.trim().toUpperCase();
  if (room.length !== 4) { $('connection').textContent = 'Enter a 4-character room code.'; return; }
  sessionStorage.setItem('wii-piano-room', room);
  connect();
});

function noteOn(note: number, element: HTMLElement): void {
  if (held.has(note)) return;
  held.add(note); element.classList.add('pressed');
  transport.send({ type: 'note', event: { t: 'on', n: note, v: 0.8 }, sentAt: performance.now() });
}
function noteOff(note: number, element: HTMLElement): void {
  if (!held.delete(note)) return;
  element.classList.remove('pressed');
  transport.send({ type: 'note', event: { t: 'off', n: note }, sentAt: performance.now() });
}
function releaseHeldNotes(): void {
  document.querySelectorAll<HTMLElement>('.remote-key').forEach((button) => noteOff(Number(button.dataset.note), button));
}
document.querySelectorAll<HTMLButtonElement>('.remote-key').forEach((button) => {
  const note = Number(button.dataset.note);
  button.addEventListener('pointerdown', (event) => { event.preventDefault(); button.setPointerCapture(event.pointerId); noteOn(note, button); });
  button.addEventListener('pointerup', () => noteOff(note, button));
  button.addEventListener('pointercancel', () => noteOff(note, button));
  button.addEventListener('lostpointercapture', () => noteOff(note, button));
});
window.addEventListener('blur', releaseHeldNotes);
document.addEventListener('visibilitychange', () => { if (document.hidden) window.dispatchEvent(new Event('blur')); });
