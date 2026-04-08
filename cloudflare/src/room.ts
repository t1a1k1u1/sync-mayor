export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  updatedAt: number;
}

export class SyncRoom implements DurableObject {
  private connections = new Set<WebSocket>();
  private playbackState: PlaybackState = {
    isPlaying: false,
    currentTime: 0,
    updatedAt: Date.now(),
  };

  constructor(
    private readonly state: DurableObjectState,
    _env: unknown,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.state.acceptWebSocket(server);

    this.connections.add(server);

    // 参加時に現在の再生状態を補正して送信
    const correctedTime = this.getCorrectedTime();
    const stateSync = JSON.stringify({
      type: 'state_sync',
      isPlaying: this.playbackState.isPlaying,
      currentTime: correctedTime,
    });
    server.send(stateSync);

    // 全員に人数を通知
    this.broadcastMemberCount();

    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message !== 'string') return;

    let parsed: { type: string; currentTime?: number };
    try {
      parsed = JSON.parse(message) as { type: string; currentTime?: number };
    } catch {
      return;
    }

    const currentTime = parsed.currentTime ?? 0;

    if (parsed.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong' }));
      return;
    }

    if (parsed.type === 'play' || parsed.type === 'pause' || parsed.type === 'seek') {
      this.playbackState = {
        isPlaying: parsed.type === 'play',
        currentTime,
        updatedAt: Date.now(),
      };
      // 送信元以外にブロードキャスト
      const outgoing = JSON.stringify({ type: parsed.type, currentTime });
      for (const conn of this.connections) {
        if (conn !== ws) {
          try {
            conn.send(outgoing);
          } catch {
            // 切断済みの接続は無視
          }
        }
      }
    }
  }

  webSocketClose(ws: WebSocket): void {
    this.connections.delete(ws);
    this.broadcastMemberCount();
  }

  webSocketError(ws: WebSocket): void {
    this.connections.delete(ws);
    this.broadcastMemberCount();
  }

  private getCorrectedTime(): number {
    if (!this.playbackState.isPlaying) {
      return this.playbackState.currentTime;
    }
    const elapsed = (Date.now() - this.playbackState.updatedAt) / 1000;
    return this.playbackState.currentTime + elapsed;
  }

  private broadcastMemberCount(): void {
    const count = this.connections.size;
    const msg = JSON.stringify({ type: 'member_count', count });
    for (const conn of this.connections) {
      try {
        conn.send(msg);
      } catch {
        // 切断済みは無視
      }
    }
  }
}
