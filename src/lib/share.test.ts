import { describe, expect, it } from 'vitest';
import { decodeTrip, encodeTrip, shareKey } from './share';
import { DEMO_PLAYLIST } from './demoPlaylist';
import type { Stop } from './types';

const stops: Stop[] = [
  { id: 'a', label: 'Chicago, Illinois', coord: [-87.6298, 41.8781] },
  { id: 'w', label: '', coord: null }, // unfinished waypoint: dropped
  { id: 'b', label: 'Washington, District of Columbia', coord: [-77.0369, 38.9072] },
];

async function encodeRaw(payload: unknown): Promise<string> {
  const stream = new Blob([JSON.stringify(payload)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const goodTrack = ['7jIFGkTBIK1UwWaEXMW2Nh', 'Life Is A Highway', 'Tom Cochrane', 266080];
const goodStops = [['A', -87.6, 41.8], ['B', -77, 38.9]];

describe('share links', () => {
  it('round-trips name, placed stops and track metadata', async () => {
    const data = await encodeTrip('Chicago → D.C. Roadtrip', stops, DEMO_PLAYLIST);
    const trip = await decodeTrip(data);
    expect(trip?.name).toBe('Chicago → D.C. Roadtrip');
    expect(trip?.stops).toEqual([
      { label: 'Chicago, Illinois', coord: [-87.6298, 41.8781] },
      { label: 'Washington, District of Columbia', coord: [-77.0369, 38.9072] },
    ]);
    expect(trip?.tracks).toEqual(DEMO_PLAYLIST);
  });

  it('keeps the demo playlist link reasonably short', async () => {
    const data = await encodeTrip('Chicago → D.C. Roadtrip', stops, DEMO_PLAYLIST);
    expect(data).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(data.length).toBeLessThan(2500);
  });

  it('gives the same key for the same link and different keys otherwise', async () => {
    const a = await encodeTrip('x', stops, DEMO_PLAYLIST);
    const b = await encodeTrip('y', stops, DEMO_PLAYLIST);
    expect(await shareKey(a)).toBe(await shareKey(a));
    expect(await shareKey(a)).not.toBe(await shareKey(b));
  });

  it('accepts a minimal valid payload', async () => {
    const trip = await decodeTrip(await encodeRaw({ v: 1, n: ' ', s: goodStops, t: [goodTrack] }));
    expect(trip?.name).toBe('Shared trip');
    expect(trip?.tracks[0]).toMatchObject({ uri: 'spotify:track:7jIFGkTBIK1UwWaEXMW2Nh', imageUrl: undefined });
  });

  it.each([
    ['garbage', async () => 'not-a-real-link!!'],
    ['wrong version', async () => encodeRaw({ v: 2, n: 'x', s: goodStops, t: [] })],
    ['non-Spotify track id', async () => encodeRaw({ v: 1, n: 'x', s: goodStops, t: [['../../evil', 't', 'a', 1000]] })],
    ['arbitrary image URL', async () => encodeRaw({ v: 1, n: 'x', s: goodStops, t: [[...goodTrack, 'https://evil.example/x.png']] })],
    ['negative duration', async () => encodeRaw({ v: 1, n: 'x', s: goodStops, t: [['7jIFGkTBIK1UwWaEXMW2Nh', 't', 'a', -5]] })],
    ['out-of-range coordinate', async () => encodeRaw({ v: 1, n: 'x', s: [['A', 500, 0]], t: [] })],
    ['too many stops', async () => encodeRaw({ v: 1, n: 'x', s: Array(26).fill(['A', 0, 0]), t: [] })],
    ['overlong text', async () => encodeRaw({ v: 1, n: 'x'.repeat(1000), s: goodStops, t: [] })],
    ['decompression bomb', async () => encodeRaw({ v: 1, n: 'x', s: goodStops, t: [], pad: 'a'.repeat(2_000_000) })],
  ])('rejects %s', async (_, make) => {
    expect(await decodeTrip(await make())).toBeNull();
  });
});
