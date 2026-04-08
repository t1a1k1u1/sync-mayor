import { SyncRoom } from './room';

export { SyncRoom };

interface Env {
  SYNC_ROOM: DurableObjectNamespace;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    // /rooms
    // /rooms/:roomId/ws

    if (pathParts[0] !== 'rooms') {
      return json({ error: 'Not Found' }, 404);
    }

    // POST /rooms → ルーム作成
    if (request.method === 'POST' && pathParts.length === 1) {
      const roomId = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      return json({ roomId }, 201);
    }

    // GET /rooms/:roomId/ws → WebSocket アップグレード
    if (
      request.method === 'GET' &&
      pathParts.length === 3 &&
      pathParts[2] === 'ws'
    ) {
      const roomId = pathParts[1];
      const stub = env.SYNC_ROOM.get(env.SYNC_ROOM.idFromName(roomId));
      return stub.fetch(request);
    }

    return json({ error: 'Not Found' }, 404);
  },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
