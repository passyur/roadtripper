import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlaylist, getEditablePlaylists, getPlaylistTracks, replacePlaylistItems } from './spotify';

vi.mock('./auth', () => ({ getUserToken: async () => 'user-token' }));

const track = (id: string) => ({
  id, type: 'track', uri: `spotify:track:${id}`, name: `Song ${id}`, duration_ms: 1000,
  artists: [{ name: 'A' }, { name: 'B' }], album: { images: [{ url: 'big' }, { url: 'small' }] },
});

type Call = { url: string; method: string; body?: unknown };
let calls: Call[];

function mockFetch(handler: (url: string, method: string) => unknown) {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ url, method, body: init.body ? JSON.parse(init.body as string) : undefined });
    return new Response(JSON.stringify(handler(url, method) ?? {}), { status: 200 });
  }));
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe('replacePlaylistItems', () => {
  it('replaces with the first 100 and appends the rest in order', async () => {
    mockFetch(() => ({ snapshot_id: 's' }));
    const uris = Array.from({ length: 230 }, (_, i) => `spotify:track:${i}`);
    await replacePlaylistItems('pl', uris);
    expect(calls.map((c) => c.method)).toEqual(['PUT', 'POST', 'POST']);
    expect(calls.every((c) => c.url.endsWith('/playlists/pl/items'))).toBe(true);
    expect(calls.flatMap((c) => (c.body as { uris: string[] }).uris)).toEqual(uris);
  });

  it('clears the playlist when given no tracks', async () => {
    mockFetch(() => ({ snapshot_id: 's' }));
    await replacePlaylistItems('pl', []);
    expect(calls).toEqual([{ url: expect.stringContaining('/playlists/pl/items'), method: 'PUT', body: { uris: [] } }]);
  });
});

describe('createPlaylist', () => {
  it('creates via /me/playlists then adds items in chunks', async () => {
    mockFetch((url) => (url.endsWith('/me/playlists') ? { id: 'new', name: 'Trip', external_urls: { spotify: 'https://open.spotify.com/playlist/new' } } : {}));
    const p = await createPlaylist('Trip', 'desc', Array.from({ length: 150 }, (_, i) => `u${i}`));
    expect(calls[0]).toMatchObject({ method: 'POST', body: { name: 'Trip', description: 'desc', public: false } });
    expect(calls.slice(1).map((c) => (c.body as { uris: string[] }).uris.length)).toEqual([100, 50]);
    expect(p).toMatchObject({ id: 'new', url: 'https://open.spotify.com/playlist/new', total: 150 });
  });
});

describe('getPlaylistTracks', () => {
  it('follows pagination and skips episodes, local files and removed tracks', async () => {
    mockFetch((url) =>
      url.includes('offset=50')
        ? { items: [{ is_local: true, item: { ...track('local') } }, { is_local: false, item: track('c') }], next: null }
        : {
            items: [
              { is_local: false, item: track('a') },
              { is_local: false, item: { type: 'episode' } },
              { is_local: false, item: null },
              { is_local: false, item: track('b') },
            ],
            next: 'https://api.spotify.com/v1/playlists/pl/items?offset=50&limit=50',
          },
    );
    const { tracks, skipped } = await getPlaylistTracks('pl');
    expect(tracks.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(skipped).toBe(3);
    expect(tracks[0]).toMatchObject({ artist: 'A, B', imageUrl: 'small', uri: 'spotify:track:a' });
  });
});

describe('getEditablePlaylists', () => {
  it('keeps only owned or collaborative playlists', async () => {
    const p = (id: string, owner: string, collaborative = false) => ({
      id, name: id, collaborative, owner: { id: owner }, images: null, items: { total: 3 }, external_urls: { spotify: id },
    });
    mockFetch(() => ({ items: [p('mine', 'me'), p('theirs', 'other'), p('shared', 'other', true), null], next: null }));
    const out = await getEditablePlaylists({ id: 'me', name: 'Me' });
    expect(out.map((x) => x.id)).toEqual(['mine', 'shared']);
  });
});
