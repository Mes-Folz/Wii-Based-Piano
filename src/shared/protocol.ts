// The one event shape every input source produces and every consumer understands.
// Phase 1: computer keyboard + mouse/touch emit these locally.
// Phase 2: the Controller sends the same objects over WebSocket (adding a timestamp).
export interface NoteOnEvent {
  t: 'on';
  n: number; // MIDI note number
  v: number; // velocity, 0..1
}
export interface NoteOffEvent {
  t: 'off';
  n: number;
}
export type NoteEvent = NoteOnEvent | NoteOffEvent;

// Room role/code and clientId travel in the WebSocket upgrade URL to avoid
// an extra request/response before the Controller can be marked joined.
export type ClientMessage =
  | { type: 'note'; event: NoteEvent; sentAt: number }
  | { type: 'ping'; sentAt: number };
export type ServerMessage =
  | { type: 'room'; code: string; clientId: string }
  | { type: 'joined'; room: string; clientId: string }
  | { type: 'peer'; connected: boolean }
  | { type: 'note'; event: NoteEvent; sentAt: number }
  | { type: 'pong'; sentAt: number }
  | { type: 'error'; reason: string };
