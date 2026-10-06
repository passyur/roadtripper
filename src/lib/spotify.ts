import { getUserToken } from './auth';
import type { Track } from './types';

// Endpoint shapes follow Spotify's February 2026 Web API changes:
// playlist contents live at /playlists/{id}/items with each entry's track under `item`.
const API = 'https://api.spotify.com/v1';

export class SpotifyError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

// Dev: Vite middleware. Production: the Cloudflare Worker in worker/ (static hosting can't keep the secret).
const TOKEN_URL: string = import.meta.env.VITE_TOKEN_URL || '/api/spotify-token';

let appToken: { access_token: string; expires_at: number } | null = null;

/** Token for catalog reads: the user's when logged in, otherwise an app token from our proxy. */
async function catalogToken(): Promise<string> {
  const user = await getUserToken();
  if (user) return user;
  if (!appToken || appToken.expires_at - 30_000 < Date.now()) {
    const res = await fetch(TOKEN_URL);
    const body = await res.json();
    if (!res.ok) throw new SpotifyError(body.error ?? 'Search is unavailable', res.status);
    appToken = body;
  }
  return appToken!.access_token;
}

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const token = init.token ?? (await getUserToken());
  if (!token) throw new SpotifyError('Log in with Spotify first', 401);
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new SpotifyError(describeError(res.status, body?.error?.message), res.status);
  return body as T;
}

function describeError(status: number, message?: string): string {
  if (status === 403) {
    return message?.toLowerCase().includes('premium')
      ? 'Spotify requires the app owner to have Premium for development-mode apps.'
      : "Spotify refused the request. If you're not the app owner, ask them to add your account under User Management in the Spotify dashboard.";
  }
  if (status === 429) return 'Spotify is rate-limiting requests. Try again in a moment.';
  return message ?? `Spotify request failed (${status})`;
}

interface SpotifyTrack {
  id: string;
  type: 'track';
  uri: string;
  name: string;
  duration_ms: number;
  is_local?: boolean;
  artists: { name: string }[];
  album: { images: { url: string }[] };
}

function toTrack(t: SpotifyTrack): Track {
  return {
    id: t.id,
    uri: t.uri,
    title: t.name,
    artist: t.artists.map((a) => a.name).join(', '),
    durationMs: t.duration_ms,
    // Images are sorted largest-first; the smallest (64px) is plenty for list rows.
    imageUrl: t.album.images.at(-1)?.url,
  };
}

/** Catalog search. Spotify caps `limit` at 10 for development-mode apps. */
export async function searchTracks(query: string, signal?: AbortSignal): Promise<Track[]> {
  const q = query.trim();
  if (!q) return [];
  const params = new URLSearchParams({ q, type: 'track', limit: '10' });
  const body = await call<{ tracks: { items: SpotifyTrack[] } }>(`/search?${params}`, { token: await catalogToken(), signal });
  return body.tracks.items.filter(Boolean).map(toTrack);
}

export interface SpotifyUser {
  id: string;
  name: string;
  imageUrl?: string;
}

export async function getMe(): Promise<SpotifyUser> {
  const me = await call<{ id: string; display_name: string | null; images?: { url: string }[] }>('/me');
  return { id: me.id, name: me.display_name ?? me.id, imageUrl: me.images?.at(-1)?.url };
}

export interface PlaylistSummary {
  id: string;
  name: string;
  imageUrl?: string;
  total: number;
  url: string;
}

interface Paged<T> {
  items: T[];
  next: string | null;
}

async function* pages<T>(first: string): AsyncGenerator<T[]> {
  let next: string | null = first;
  while (next) {
    const page: Paged<T> = await call<Paged<T>>(next);
    yield page.items;
    next = page.next;
  }
}

/** Playlists whose tracks we can read and edit: ones the user owns or collaborates on. */
export async function getEditablePlaylists(me: SpotifyUser): Promise<PlaylistSummary[]> {
  type P = {
    id: string;
    name: string;
    collaborative: boolean;
    owner: { id: string };
    images: { url: string }[] | null;
    items?: { total: number };
    tracks?: { total: number };
    external_urls: { spotify: string };
  };
  const out: PlaylistSummary[] = [];
  for await (const page of pages<P | null>('/me/playlists?limit=50')) {
    for (const p of page) {
      if (!p || (p.owner.id !== me.id && !p.collaborative)) continue;
      out.push({
        id: p.id,
        name: p.name,
        imageUrl: p.images?.at(-1)?.url,
        total: p.items?.total ?? p.tracks?.total ?? 0,
        url: p.external_urls.spotify,
      });
    }
  }
  return out;
}

export interface LoadedPlaylist {
  tracks: Track[];
  /** Episodes and local files: can't be placed on the route and would be dropped by a save. */
  skipped: number;
}

export async function getPlaylistTracks(id: string): Promise<LoadedPlaylist> {
  type Item = { is_local: boolean; item: SpotifyTrack | { type: 'episode' } | null; track?: SpotifyTrack | null };
  const tracks: Track[] = [];
  let skipped = 0;
  for await (const page of pages<Item>(`/playlists/${id}/items?limit=50`)) {
    for (const entry of page) {
      const t = entry.item ?? entry.track;
      if (!t || entry.is_local || t.type !== 'track') skipped++;
      else tracks.push(toTrack(t as SpotifyTrack));
    }
  }
  return { tracks, skipped };
}

const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Overwrite a playlist's contents with `uris`, in order (Spotify accepts 100 per request). */
export async function replacePlaylistItems(id: string, uris: string[]): Promise<void> {
  const [first = [], ...rest] = chunks(uris, 100);
  await call(`/playlists/${id}/items`, { method: 'PUT', body: JSON.stringify({ uris: first }) });
  for (const chunk of rest) {
    await call(`/playlists/${id}/items`, { method: 'POST', body: JSON.stringify({ uris: chunk }) });
  }
}

export async function createPlaylist(name: string, description: string, uris: string[]): Promise<PlaylistSummary> {
  const p = await call<{ id: string; name: string; external_urls: { spotify: string } }>('/me/playlists', {
    method: 'POST',
    body: JSON.stringify({ name, description, public: false }),
  });
  for (const chunk of chunks(uris, 100)) {
    await call(`/playlists/${p.id}/items`, { method: 'POST', body: JSON.stringify({ uris: chunk }) });
  }
  return { id: p.id, name: p.name, total: uris.length, url: p.external_urls.spotify };
}

export async function renamePlaylist(id: string, name: string): Promise<void> {
  await call(`/playlists/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
}
