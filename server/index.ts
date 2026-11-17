import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { WebSocket, WebSocketServer } from 'ws';
import { createRoom, findRoom, removeSocket, roomForSocket, type Room } from './rooms';
import { getNetworkInfo } from './network';
import { createServer as createViteServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const production = process.argv.includes('--production');
const vite = production ? null : await createViteServer({ configFile: path.join(root, 'vite.config.ts') });
if (vite) await vite.listen();

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.woff': 'font/woff', '.woff2': 'font/woff2', '.png': 'image/png',
};

const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === '/api/info') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(getNetworkInfo()));
    return;
  }
  if (!production) {
    res.writeHead(404).end('Not found');
    return;
  }

  let pathname: string;
  try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end('Bad path'); return; }
  if (pathname === '/') pathname = '/host/index.html';
  if (pathname === '/host' || pathname === '/host/') pathname = '/host/index.html';
  if (pathname === '/controller' || pathname === '/controller/') pathname = '/controller/index.html';
  const base = path.resolve(root, 'dist');
  const file = path.resolve(base, `.${pathname}`);
  const relative = path.relative(base, file);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': contentTypes[path.extname(file)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end('Not found'); }
});

const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 1024 });
server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url || '/', 'http://localhost').pathname !== '/ws') { socket.destroy(); return; }
  (socket as Socket).setNoDelay(true);
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

function send(socket: WebSocket | null | undefined, message: unknown): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function notifyPeer(room: Room, role: 'host' | 'controller', connected: boolean): void {
  send(role === 'host' ? room.host : room.controller, { type: 'peer', connected });
}

const rate = new WeakMap<WebSocket, { started: number; count: number }>();
wss.on('connection', (ws, req) => {
  const params = new URL(req.url || '/', 'http://localhost').searchParams;
  const clientId = params.get('clientId') || '';
  const requestedRoom = params.get('room');

  if (requestedRoom) {
    const room = findRoom(requestedRoom);
    if (!room) send(ws, { type: 'error', reason: 'Room not found. Check the code and try again.' });
    else if (clientId && clientId === room.clientId) {
      if (room.host && room.host !== ws) room.host.close();
      room.host = ws;
      send(ws, { type: 'room', code: room.code, clientId: room.clientId });
      if (room.controller) notifyPeer(room, 'controller', true);
    } else {
      if (room.controller && room.controller !== ws) room.controller.close();
      room.controller = ws;
      room.controllerId = clientId;
      send(ws, { type: 'joined', room: room.code, clientId });
      notifyPeer(room, 'host', true);
      notifyPeer(room, 'controller', true);
    }
  } else if (params.get('role') === 'host' && clientId) {
    const room = createRoom(ws, clientId);
    send(ws, { type: 'room', code: room.code, clientId: room.clientId });
    if (room.controller) notifyPeer(room, 'controller', true);
  } else {
    send(ws, { type: 'error', reason: 'A room code is required.' });
  }

  ws.on('message', (raw) => {
    const now = Date.now();
    let window = rate.get(ws);
    if (!window || now - window.started >= 1000) { window = { started: now, count: 0 }; rate.set(ws, window); }
    if (++window.count > 120) { ws.close(1008, 'Rate limit exceeded'); return; }

    let message: { type?: string; sentAt?: number; event?: { t?: string; n?: number; v?: number } };
    try { message = JSON.parse(raw.toString()) as typeof message; }
    catch { send(ws, { type: 'error', reason: 'Invalid message.' }); return; }

    if (message.type === 'ping' && Number.isFinite(message.sentAt)) {
      send(ws, { type: 'pong', sentAt: message.sentAt });
      return;
    }
    if (message.type !== 'note') return;
    const event = message.event;
    if (!event || (event.t !== 'on' && event.t !== 'off') || !Number.isInteger(event.n) || event.n! < 0 || event.n! > 127) return;
    if (event.t === 'on' && (!Number.isFinite(event.v) || event.v! < 0 || event.v! > 1)) return;
    const room = roomForSocket(ws);
    if (room?.controller === ws) send(room.host, { type: 'note', event, sentAt: message.sentAt });
  });

  ws.on('close', () => {
    const removed = removeSocket(ws);
    if (removed) notifyPeer(removed.room, removed.role === 'host' ? 'controller' : 'host', false);
  });
});

server.listen(3000, '0.0.0.0', () => console.log(`Wii Piano relay ${production ? 'serving' : 'listening'} at http://localhost:3000`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await vite?.close();
    wss.close();
    server.close(() => process.exit(0));
  });
}
