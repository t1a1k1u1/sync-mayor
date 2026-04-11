# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概要

Amazon Prime Video を複数人で同期視聴するための Chrome 拡張機能 + Cloudflare Workers バックエンド。npm workspaces 構成で `extension/` と `cloudflare/` の 2 パッケージを管理する。

## コマンド

### 拡張機能（extension/）

```bash
cd extension
npm run build    # esbuild でビルド（dist/ に出力）
npm run watch    # ファイル変更を監視しながらビルド
```

型チェックのみ実行する場合:
```bash
cd extension
npx tsc --noEmit
```

### Cloudflare Workers（cloudflare/）

```bash
cd cloudflare
npm run dev      # wrangler でローカル開発サーバー起動
npm run deploy   # Cloudflare にデプロイ
```

型チェックのみ:
```bash
cd cloudflare
npx tsc --noEmit
```

## アーキテクチャ

### メッセージフロー

```
Prime Video ページ (Content Script)
  ↕ chrome.runtime.sendMessage
Background Service Worker
  ↕ chrome.runtime.sendMessage
Offscreen Document（WebSocket を保持）
  ↕ WebSocket
Cloudflare Workers（SyncRoom Durable Object）
  ↕ WebSocket（broadcast）
他ユーザーの Offscreen → Background → Content Script
```

### なぜ Offscreen Document が必要か

Manifest V3 の Service Worker は非アクティブ時に停止するため、持続的な WebSocket 接続を維持できない。Offscreen Document（`src/offscreen/`）を使って WebSocket 接続を保持し、Background はメッセージの中継役に徹する。

### 各コンポーネントの役割

| ファイル | 役割 |
|---|---|
| `extension/src/shared/types.ts` | 全コンポーネント間の内部メッセージ型・WebSocket プロトコル型を一元定義 |
| `extension/src/background/service-worker.ts` | ルーム作成・Offscreen Document の管理・メッセージルーティング・再生状態のブロードキャスト |
| `extension/src/content/prime-video.ts` | `<video>` 要素へのイベントリスナー付与、リモート同期コマンドの適用。`isSyncingFromRemote` フラグでイベントループを防止 |
| `extension/src/offscreen/offscreen.ts` | WebSocket 接続の生成・維持・メッセージ送受信 |
| `extension/src/popup/popup.ts` | ルームの作成/参加状態表示・共有リンクのコピー |
| `cloudflare/src/room.ts` | `SyncRoom` Durable Object。WebSocket 接続管理・再生状態の保持・全員へのブロードキャスト |
| `cloudflare/src/index.ts` | HTTP ルーティング（`POST /rooms`, `GET /rooms/:id/ws`） |

### ルーム参加の仕組み

1. ホストが Popup を開く → `CREATE_OR_GET_ROOM` メッセージ → Background がルームを作成 → 共有 URL（`?syncRoom=<roomId>`）を返す
2. ゲストがその URL を開く → Content Script が `?syncRoom` クエリパラメータを検出 → `JOIN_ROOM` メッセージ → Background が WebSocket に接続

### デプロイ後の設定変更

Cloudflare Workers をデプロイしたら `extension/src/shared/types.ts` の `WORKERS_URL` を実際のサブドメインに更新し、拡張機能を再ビルドする。

### ビルド設定

- Background Service Worker: ESM 形式（MV3 は ESM 対応）
- Content Script・Popup・Offscreen: IIFE 形式
- ターゲット: Chrome 120+、TypeScript strict モード有効
