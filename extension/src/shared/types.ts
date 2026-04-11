// ============================================================
// Workers URL（デプロイ後に更新する）
// ============================================================
export const WORKERS_URL = 'https://sync-mayor.koishi-t81.workers.dev';

// ============================================================
// Extension 内部メッセージ: Content Script → Background
// ============================================================
export type ContentToBackground =
  | { type: 'PLAYER_EVENT'; event: 'play' | 'pause' | 'seek'; currentTime: number }
  | { type: 'JOIN_ROOM'; roomId: string }
  | { type: 'GET_STATUS' };

// ============================================================
// Extension 内部メッセージ: Background → Content Script
// ============================================================
export type BackgroundToContent =
  | { type: 'SYNC_PLAY'; currentTime: number }
  | { type: 'SYNC_PAUSE'; currentTime: number }
  | { type: 'SYNC_SEEK'; currentTime: number };

// ============================================================
// Extension 内部メッセージ: Popup → Background
// ============================================================
export type PopupToBackground =
  | { type: 'CREATE_OR_GET_ROOM'; tabUrl: string }
  | { type: 'GET_STATUS' };

// ============================================================
// Extension 内部メッセージ: Background → Popup
// ============================================================
export type BackgroundToPopup = {
  type: 'STATUS';
  roomId: string | null;
  memberCount: number;
  shareUrl: string | null;
};

// ============================================================
// Extension 内部メッセージ: Background ↔ Offscreen Document
// ============================================================
export type BackgroundToOffscreen =
  | { type: 'CONNECT'; roomId: string }
  | { type: 'SEND'; payload: WsClientMessage }
  | { type: 'DISCONNECT' };

export type OffscreenToBackground =
  | { type: 'WS_MESSAGE'; payload: WsServerMessage }
  | { type: 'WS_OPEN' }
  | { type: 'WS_CLOSE' };

// ============================================================
// WebSocket プロトコル: Extension → Cloudflare
// ============================================================
export type WsClientMessage =
  | { type: 'play'; currentTime: number }
  | { type: 'pause'; currentTime: number }
  | { type: 'seek'; currentTime: number }
  | { type: 'ping' };

// ============================================================
// WebSocket プロトコル: Cloudflare → Extension
// ============================================================
export type WsServerMessage =
  | { type: 'play'; currentTime: number }
  | { type: 'pause'; currentTime: number }
  | { type: 'seek'; currentTime: number }
  | { type: 'state_sync'; isPlaying: boolean; currentTime: number }
  | { type: 'member_count'; count: number }
  | { type: 'pong' };
