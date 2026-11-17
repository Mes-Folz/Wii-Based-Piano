import type { ClientMessage, ServerMessage } from './protocol';

export class PianoTransport {
  private socket?: WebSocket;
  private connectionTimer?: number;
  private readonly timedOut = new WeakSet<WebSocket>();
  constructor(private readonly onMessage: (message: ServerMessage) => void, private readonly onStatus: (status: string) => void) {}

  connect(clientId: string, room?: string): void {
    this.disconnect();
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const query = new URLSearchParams({ clientId, ...(room ? { room } : { role: 'host' }) });
    const relayHost = location.host;
    const socket = new WebSocket(`${scheme}//${relayHost}/ws?${query}`);
    this.socket = socket;
    this.onStatus(`Connecting to ${relayHost}…`);
    this.connectionTimer = window.setTimeout(() => {
      if (this.socket === socket && socket.readyState === WebSocket.CONNECTING) {
        this.timedOut.add(socket);
        socket.close();
      }
    }, 5000);
    socket.addEventListener('open', () => {
      if (this.socket !== socket) return;
      if (this.connectionTimer) window.clearTimeout(this.connectionTimer);
      this.onStatus('Connected');
    });
    socket.addEventListener('message', (event: MessageEvent<string>) => {
      try { this.onMessage(JSON.parse(event.data) as ServerMessage); } catch { this.onStatus('Invalid server message'); }
    });
    socket.addEventListener('close', () => {
      if (this.socket !== socket) return;
      if (this.connectionTimer) window.clearTimeout(this.connectionTimer);
      this.onStatus(this.timedOut.has(socket) ? `Timed out connecting to ${relayHost}` : 'Disconnected · reconnecting…');
    });
    socket.addEventListener('error', () => { if (this.socket === socket) this.onStatus('Connection error · reconnecting…'); });
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }
  disconnect(): void {
    if (this.connectionTimer) window.clearTimeout(this.connectionTimer);
    this.connectionTimer = undefined;
    this.socket?.close();
    this.socket = undefined;
  }
}
