import type { BackgroundToContent, ContentToBackground } from '../shared/types';

// ============================================================
// 状態
// ============================================================
let video: HTMLVideoElement | null = null;
let isSyncingFromRemote = false;
let seekDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// ============================================================
// URL からルームIDを検出して参加
// ============================================================
function checkAndJoinRoom(): void {
  const roomId = new URLSearchParams(location.search).get('syncRoom');
  if (roomId) {
    const msg: ContentToBackground = { type: 'JOIN_ROOM', roomId };
    chrome.runtime.sendMessage(msg).catch(() => {
      // Service Worker がまだ起動中の場合は無視
    });
  }
}

// ============================================================
// プレイヤーへのイベントリスナー付与
// ============================================================
function attachToVideo(el: HTMLVideoElement): void {
  if (el.dataset.syncMayorAttached === 'true') return;
  el.dataset.syncMayorAttached = 'true';
  video = el;

  el.addEventListener('play', () => {
    if (isSyncingFromRemote) return;
    sendPlayerEvent('play', el.currentTime);
  });

  el.addEventListener('pause', () => {
    if (isSyncingFromRemote) return;
    sendPlayerEvent('pause', el.currentTime);
  });

  el.addEventListener('seeked', () => {
    if (isSyncingFromRemote) return;
    // 連続シーク（スクラブ）をデバウンス
    if (seekDebounceTimer !== null) clearTimeout(seekDebounceTimer);
    seekDebounceTimer = setTimeout(() => {
      sendPlayerEvent('seek', el.currentTime);
      seekDebounceTimer = null;
    }, 300);
  });
}

function sendPlayerEvent(event: 'play' | 'pause' | 'seek', currentTime: number): void {
  const msg: ContentToBackground = { type: 'PLAYER_EVENT', event, currentTime };
  chrome.runtime.sendMessage(msg).catch(() => {});
}

// ============================================================
// MutationObserver でプレイヤーの挿入を監視
// ============================================================
function observePlayer(): void {
  const existing = document.querySelector('video');
  if (existing instanceof HTMLVideoElement) {
    attachToVideo(existing);
  }

  const observer = new MutationObserver(() => {
    const el = document.querySelector('video');
    if (el instanceof HTMLVideoElement) {
      attachToVideo(el);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

// ============================================================
// リモートからの同期メッセージを受信
// ============================================================
chrome.runtime.onMessage.addListener((message: BackgroundToContent) => {
  if (!video) return;

  isSyncingFromRemote = true;

  try {
    if (message.type === 'SYNC_PLAY') {
      video.currentTime = message.currentTime;
      video.play().catch(() => {
        // 自動再生ポリシーによって拒否される場合がある
      });
    } else if (message.type === 'SYNC_PAUSE') {
      video.currentTime = message.currentTime;
      video.pause();
    } else if (message.type === 'SYNC_SEEK') {
      video.currentTime = message.currentTime;
    }
  } finally {
    // イベント発火後にフラグを解除（余裕を持って 200ms）
    setTimeout(() => {
      isSyncingFromRemote = false;
    }, 200);
  }
});

// ============================================================
// エントリポイント
// ============================================================
checkAndJoinRoom();
observePlayer();
