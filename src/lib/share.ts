import type { LngLat, Stop, Track } from './types';

// A shared trip travels entirely in the URL fragment (never sent to a server): compressed JSON
// with each song's metadata, because Spotify no longer lets apps batch-look-up tracks or read
// other people's playlists. The decoder treats the fragment as untrusted input.

export const SHARE_PREFIX = '#trip=';
const IMAGE_BASE = 'https://i.scdn.co/image/';

const LIMITS = {
  stops: 25,
  tracks: 1000,
  text: 300,
  inflatedBytes: 1_000_000,
  durationMs: 6 * 60 * 60 * 1000,
};

type StopTuple = [label: string, lng: number, lat: number];
type TrackTuple = [id: string, title: string, artist: string, durationMs: number, image?: string];
interface Payload {
  v: 1;
  n: string;
  s: StopTuple[];
  t: TrackTuple[];
}

export interface SharedTrip {
  name: string;
  stops: { label: string; coord: LngLat }[];
  tracks: Track[];
}

export async function encodeTrip(name: string, stops: Stop[], tracks: Track[]): Promise<string> {
  const round = (x: number) => Math.round(x * 1e5) / 1e5; // ~1 m
  const payload: Payload = {
    v: 1,
    n: name,
    s: stops.flatMap((s) => (s.coord ? [[s.label, round(s.coord[0]), round(s.coord[1])] as StopTuple] : [])),
    t: tracks.map((t) => {
      const image = t.imageUrl?.startsWith(IMAGE_BASE) ? t.imageUrl.slice(IMAGE_BASE.length) : undefined;
      return image ? [t.id, t.title, t.artist, t.durationMs, image] : [t.id, t.title, t.artist, t.durationMs];
    }),
  };
  return toBase64Url(await deflate(new TextEncoder().encode(JSON.stringify(payload))));
}

export function shareUrl(data: string): string {
  return `${location.origin}${import.meta.env.BASE_URL}${SHARE_PREFIX}${data}`;
}

/** Parses a share fragment; returns null for anything malformed, oversized or unexpected. */
export async function decodeTrip(data: string): Promise<SharedTrip | null> {
  try {
    const json = new TextDecoder().decode(await inflate(fromBase64Url(data), LIMITS.inflatedBytes));
    return validate(JSON.parse(json));
  } catch {
    return null;
  }
}

/** Short stable fingerprint, so opening the same link twice reuses the trip it created. */
export async function shareKey(data: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data)));
  return Array.from(digest.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

const isText = (x: unknown): x is string => typeof x === 'string' && x.length <= LIMITS.text;
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

function validate(p: unknown): SharedTrip | null {
  if (!p || typeof p !== 'object') return null;
  const { v, n, s, t } = p as Record<string, unknown>;
  if (v !== 1 || !isText(n) || !Array.isArray(s) || !Array.isArray(t)) return null;
  if (s.length > LIMITS.stops || t.length > LIMITS.tracks) return null;

  const stops: SharedTrip['stops'] = [];
  for (const x of s) {
    if (!Array.isArray(x) || x.length !== 3) return null;
    const [label, lng, lat] = x;
    if (!isText(label) || !isNum(lng) || !isNum(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) return null;
    stops.push({ label, coord: [lng, lat] });
  }

  const tracks: Track[] = [];
  for (const x of t) {
    if (!Array.isArray(x) || x.length < 4 || x.length > 5) return null;
    const [id, title, artist, durationMs, image] = x;
    if (typeof id !== 'string' || !/^[A-Za-z0-9]{22}$/.test(id)) return null;
    if (!isText(title) || !isText(artist)) return null;
    if (!Number.isInteger(durationMs) || durationMs <= 0 || durationMs > LIMITS.durationMs) return null;
    // Only ever load cover art from Spotify's CDN, never an arbitrary URL from the link.
    if (image !== undefined && (typeof image !== 'string' || !/^[0-9a-f]{40}$/.test(image))) return null;
    tracks.push({
      id,
      uri: `spotify:track:${id}`,
      title,
      artist,
      durationMs,
      imageUrl: image ? IMAGE_BASE + image : undefined,
    });
  }

  return { name: n.trim() || 'Shared trip', stops, tracks };
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Inflate with a size cap so a tiny link can't expand into something huge. */
async function inflate(bytes: Uint8Array, maxBytes: number): Promise<Uint8Array> {
  const reader = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('Shared trip is too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
