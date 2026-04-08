import type { BackgroundToOffscreen, OffscreenToBackground, WsServerMessage } from '../shared/types';
import { WORKERS_URL } from '../shared/types';

let ws: WebSocket | null = null;

chrome.runtime.onMessage.addListener((message: BackgroundToOffscreen) => {
  if (message.type === 'CONNECT') {
    connectWebSocket(message.roomId);
  } else if (message.type === 'SEND') {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message.payload));
    }
  } else if (message.type === 'DISCONNECT') {
    ws?.close();
    ws = null;
  }
});

function connectWebSocket(roomId: string): void {
  if (ws) {
    ws.close();
  }

  const wsUrl = WORKERS_URL.replace(/^https?:\/\//, (scheme) =>
    scheme === 'https://' ? 'wss://' : 'ws://'
  ) + `/rooms/${roomId}/ws`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    sendToBackground({ type: 'WS_OPEN' });
  };

  ws.onmessage = (event: MessageEvent<string>) => {
    try {
      const payload = JSON.parse(event.data) as WsServerMessage;
      sendToBackground({ type: 'WS_MESSAGE', payload });
    } catch {
      // 不正なメッセージは無視
    }
  };

  ws.onclose = () => {
    sendToBackground({ type: 'WS_CLOSE' });
    ws = null;
  };

  ws.onerror = () => {
    sendToBackground({ type: 'WS_CLOSE' });
    ws = null;
  };
}

function sendToBackground(message: OffscreenToBackground): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // Service Worker が停止している場合は無視
  });
}
