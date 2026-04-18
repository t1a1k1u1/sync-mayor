import type { BackgroundToPopup, PopupToBackground } from '../shared/types';

const PRIME_VIDEO_PATTERNS = [
  /^https:\/\/www\.amazon\.co\.jp\/gp\/video\/detail\//,
  /^https:\/\/www\.amazon\.com\/gp\/video\/detail\//,
  /^https:\/\/www\.primevideo\.com\/detail\//,
];

function isPrimeVideoUrl(url: string): boolean {
  return PRIME_VIDEO_PATTERNS.some((pattern) => pattern.test(url));
}

async function getCurrentTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ?? null;
}

function sendToBackground(message: PopupToBackground): Promise<BackgroundToPopup | null> {
  return chrome.runtime.sendMessage(message) as Promise<BackgroundToPopup | null>;
}

function updateUI(status: BackgroundToPopup, shareUrl: string | null): void {
  const notPrimeVideo = document.getElementById('not-prime-video');
  const roomPanel = document.getElementById('room-panel');
  const memberCount = document.getElementById('member-count');
  const copyFeedback = document.getElementById('copy-feedback');
  const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement;

  if (!notPrimeVideo || !roomPanel || !memberCount || !copyFeedback || !copyBtn) return;

  notPrimeVideo.classList.add('hidden');
  roomPanel.classList.remove('hidden');

  memberCount.textContent = `接続中: ${status.memberCount} 人`;

  const url = shareUrl ?? status.shareUrl;
  copyBtn.onclick = async () => {
    if (url) {
      await navigator.clipboard.writeText(url);
      copyFeedback.classList.add('visible');
      setTimeout(() => copyFeedback.classList.remove('visible'), 2000);
    }
  };
}

async function main(): Promise<void> {
  const tab = await getCurrentTab();
  const tabUrl = tab?.url ?? '';

  const notPrimeVideo = document.getElementById('not-prime-video');
  const roomPanel = document.getElementById('room-panel');

  if (!isPrimeVideoUrl(tabUrl)) {
    notPrimeVideo?.classList.remove('hidden');
    roomPanel?.classList.add('hidden');
    return;
  }

  // 既存のルーム状態を確認
  const status = await sendToBackground({ type: 'GET_STATUS' });

  if (status?.roomId) {
    // すでにルームに参加済み → shareUrl を再構築して表示
    const shareUrl = buildShareUrl(tabUrl, status.roomId);
    updateUI(status, shareUrl);
    return;
  }

  // ルームを作成してリンクをコピー
  const created = await sendToBackground({ type: 'CREATE_OR_GET_ROOM', tabUrl });
  if (created) {
    updateUI(created, created.shareUrl);
  }
}

function buildShareUrl(tabUrl: string, roomId: string): string {
  try {
    const url = new URL(tabUrl);
    url.searchParams.set('syncRoom', roomId);
    return url.toString();
  } catch {
    return tabUrl;
  }
}

main().catch(console.error);
