import type { WebSocket } from 'ws';

export interface Room {
  code: string;
  host: WebSocket | null;
  clientId: string;
  controller: WebSocket | null;
  controllerId: string | null;
  touched: number;
}

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const rooms = new Map<string, Room>();

function makeCode(): string {
  let value: string;
  do {
    value = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  } while (rooms.has(value));
  return value;
}

export function createRoom(host: WebSocket, clientId: string): Room {
  const existing = [...rooms.values()].find((room) => room.clientId === clientId && !room.host);
  if (existing) {
    existing.host = host;
    existing.touched = Date.now();
    return existing;
  }
  const room: Room = { code: makeCode(), host, clientId, controller: null, controllerId: null, touched: Date.now() };
  rooms.set(room.code, room);
  return room;
}

export function findRoom(code: string): Room | undefined {
  const room = rooms.get(code.toUpperCase());
  if (room) room.touched = Date.now();
  return room;
}

export function roomForSocket(socket: WebSocket): Room | undefined {
  return [...rooms.values()].find((room) => room.host === socket || room.controller === socket);
}

export function removeSocket(socket: WebSocket): { room: Room; role: 'host' | 'controller' } | undefined {
  for (const room of rooms.values()) {
    if (room.host === socket) {
      room.host = null;
      room.touched = Date.now();
      return { room, role: 'host' };
    }
    if (room.controller === socket) {
      room.controller = null;
      room.controllerId = null;
      room.touched = Date.now();
      return { room, role: 'controller' };
    }
  }
  return undefined;
}

setInterval(() => {
  const cutoff = Date.now() - 5 * 60_000;
  for (const [code, room] of rooms) if (!room.host && room.touched < cutoff) rooms.delete(code);
}, 60_000).unref();
