import type {
  BackgroundToContent,
  BackgroundToOffscreen,
  BackgroundToPopup,
  ContentToBackground,
  OffscreenToBackground,
  PopupToBackground,
  WsServerMessage,
} from '../shared/types';
import { WORKERS_URL } from '../shared/types';

// ============================================================
// 状態
// ============================================================
interface RoomState {
  roomId: string;
  memberCount: number;
  contentTabId: number | null;
}

let roomState: RoomState | null = null;

// ============================================================
// Offscreen Document の管理
// ============================================================
const OFFSCREEN_URL = chrome.runtime.getURL('offscreen/offscreen.html');

async function ensureOffscreenDocument(): Promise<void> {
  const existing = await chrome.offscreen.hasDocument();
  if (!existing) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.BLOBS],
      justification: 'WebSocket 接続を維持するための Offscreen Document',
    });
  }
}

function sendToOffscreen(message: BackgroundToOffscreen): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // Offscreen Document が準備中の場合は無視
  });
}

// ============================================================
// ルーム作成
// ============================================================
async function createRoom(): Promise<string> {
  const res = await fetch(`${WORKERS_URL}/rooms`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to create room');
  const data = (await res.json()) as { roomId: string };
  return data.roomId;
}

// ============================================================
// WebSocket 接続（Offscreen 経由）
// ============================================================
async function connectToRoom(roomId: string, tabId: number | null): Promise<void> {
  await ensureOffscreenDocument();
  roomState = { roomId, memberCount: 0, contentTabId: tabId };
  sendToOffscreen({ type: 'CONNECT', roomId });
}

// ============================================================
// Content Script へのブロードキャスト
// ============================================================
function sendToContentScript(message: BackgroundToContent): void {
  if (roomState?.contentTabId != null) {
    chrome.tabs.sendMessage(roomState.contentTabId, message).catch(() => {
      // タブが閉じられている場合は無視
    });
  }
}

// ============================================================
// Popup へのレスポンス
// ============================================================
function buildStatusResponse(): BackgroundToPopup {
  if (!roomState) {
    return { type: 'STATUS', roomId: null, memberCount: 0, shareUrl: null };
  }
  return {
    type: 'STATUS',
    roomId: roomState.roomId,
    memberCount: roomState.memberCount,
    shareUrl: null, // shareUrl は popup 側で tabUrl + roomId から生成
  };
}

// ============================================================
// メッセージハンドラ
// ============================================================
chrome.runtime.onMessage.addListener(
  (
    message: ContentToBackground | PopupToBackground | OffscreenToBackground,
    sender,
    sendResponse,
  ) => {
    handleMessage(message, sender).then(sendResponse).catch(() => sendResponse(null));
    return true; // 非同期レスポンスを使用
  },
);

async function handleMessage(
  message: ContentToBackground | PopupToBackground | OffscreenToBackground,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  // --- Offscreen からの WebSocket メッセージ ---
  if (message.type === 'WS_OPEN') {
    return null;
  }

  if (message.type === 'WS_CLOSE') {
    if (roomState) {
      roomState.memberCount = 0;
    }
    return null;
  }

  if (message.type === 'WS_MESSAGE') {
    handleWsMessage((message as { type: 'WS_MESSAGE'; payload: WsServerMessage }).payload);
    return null;
  }

  // --- Content Script からのメッセージ ---
  if (message.type === 'PLAYER_EVENT') {
    if (roomState) {
      const { event, currentTime } = message as Extract<ContentToBackground, { type: 'PLAYER_EVENT' }>;
      sendToOffscreen({
        type: 'SEND',
        payload: { type: event, currentTime },
      });
    }
    return null;
  }

  if (message.type === 'JOIN_ROOM') {
    const { roomId } = message as Extract<ContentToBackground, { type: 'JOIN_ROOM' }>;
    const tabId = sender.tab?.id ?? null;
    await connectToRoom(roomId, tabId);
    return null;
  }

  // --- Popup からのメッセージ ---
  if (message.type === 'CREATE_OR_GET_ROOM') {
    if (roomState) {
      return buildStatusResponse();
    }
    const { tabUrl } = message as Extract<PopupToBackground, { type: 'CREATE_OR_GET_ROOM' }>;
    const roomId = await createRoom();
    // Popup が開いているので tabId は content script のタブを探す
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id ?? null;
    await connectToRoom(roomId, tabId);
    // shareUrl = 現在の Prime Video URL + ?syncRoom=xxx
    const shareUrl = buildShareUrl(tabUrl, roomId);
    return {
      type: 'STATUS',
      roomId,
      memberCount: 1, // 接続直後はまず自分のみ（以降 member_count メッセージで更新）
      shareUrl,
    } satisfies BackgroundToPopup;
  }

  if (message.type === 'GET_STATUS') {
    return buildStatusResponse();
  }

  return null;
}

// ============================================================
// WebSocket サーバーメッセージの処理
// ============================================================
function handleWsMessage(payload: WsServerMessage): void {
  if (payload.type === 'member_count') {
    if (roomState) {
      roomState.memberCount = payload.count;
    }
    return;
  }

  if (payload.type === 'state_sync') {
    const msg: BackgroundToContent = payload.isPlaying
      ? { type: 'SYNC_PLAY', currentTime: payload.currentTime }
      : { type: 'SYNC_SEEK', currentTime: payload.currentTime };
    sendToContentScript(msg);
    return;
  }

  if (payload.type === 'play') {
    sendToContentScript({ type: 'SYNC_PLAY', currentTime: payload.currentTime });
    return;
  }

  if (payload.type === 'pause') {
    sendToContentScript({ type: 'SYNC_PAUSE', currentTime: payload.currentTime });
    return;
  }

  if (payload.type === 'seek') {
    sendToContentScript({ type: 'SYNC_SEEK', currentTime: payload.currentTime });
    return;
  }
}

// ============================================================
// ユーティリティ
// ============================================================
function buildShareUrl(tabUrl: string, roomId: string): string {
  try {
    const url = new URL(tabUrl);
    url.searchParams.set('syncRoom', roomId);
    return url.toString();
  } catch {
    return tabUrl;
  }
}
