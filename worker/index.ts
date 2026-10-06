// Cloudflare Worker: GET → { access_token, expires_at } for logged-out Spotify search.
// The client secret lives in a Worker secret, never in the static site.
import { getAppToken } from '../server/spotifyAppToken';

interface Env {
  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_CLIENT_SECRET: string;
  /** Comma-separated origins allowed to call this endpoint. */
  ALLOWED_ORIGINS: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('Origin') ?? '';
    const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
    const cors: Record<string, string> = allowed.includes(origin)
      ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
      : {};

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } });
    if (req.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });

    try {
      const token = await getAppToken(env.SPOTIFY_CLIENT_ID, env.SPOTIFY_CLIENT_SECRET);
      return Response.json(token, { headers: { ...cors, 'Cache-Control': 'no-store' } });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 502, headers: cors });
    }
  },
};
