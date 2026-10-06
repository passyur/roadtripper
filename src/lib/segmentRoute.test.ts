import { describe, expect, it } from 'vitest';
import { segmentRoute } from './segmentRoute';
import type { LngLat } from './types';

// Straight line along the x-axis: 0 → 10 → 20 → 30, 60s per segment (180s total).
const route = {
  coordinates: [[0, 0], [10, 0], [20, 0], [30, 0]] as LngLat[],
  segmentDurations: [60, 60, 60],
};
const song = (key: string, seconds: number) => ({ key, durationMs: seconds * 1000 });

describe('segmentRoute', () => {
  it('splits exactly on vertices when boundaries line up', () => {
    const r = segmentRoute(route, [song('a', 60), song('b', 120)]);
    expect(r.songs[0].coordinates).toEqual([[0, 0], [10, 0]]);
    expect(r.songs[1].coordinates).toEqual([[10, 0], [20, 0], [30, 0]]);
    expect(r.silence).toBeNull();
    expect(r.musicEndsAt).toBeNull();
  });

  it('interpolates inside a segment', () => {
    const r = segmentRoute(route, [song('a', 90), song('b', 90)]);
    expect(r.songs[0].coordinates).toEqual([[0, 0], [10, 0], [15, 0]]);
    expect(r.songs[1].coordinates).toEqual([[15, 0], [20, 0], [30, 0]]);
    expect(r.songs[0]).toMatchObject({ startS: 0, endS: 90 });
    expect(r.songs[1]).toMatchObject({ startS: 90, endS: 180 });
  });

  it('handles a song shorter than one segment', () => {
    const r = segmentRoute(route, [song('a', 30), song('b', 15)]);
    expect(r.songs[0].coordinates).toEqual([[0, 0], [5, 0]]);
    expect(r.songs[1].coordinates).toEqual([[5, 0], [7.5, 0]]);
  });

  it('marks where the music runs out and returns the silent remainder', () => {
    const r = segmentRoute(route, [song('a', 75)]);
    expect(r.musicEndsAt).toEqual([12.5, 0]);
    expect(r.silence).toEqual([[12.5, 0], [20, 0], [30, 0]]);
    expect(r.musicS).toBe(75);
    expect(r.routeS).toBe(180);
  });

  it('clips the song playing at arrival and flags songs after arrival', () => {
    const r = segmentRoute(route, [song('a', 150), song('b', 60), song('c', 60)]);
    expect(r.songs[1]).toMatchObject({ cutByArrival: true, afterArrival: false });
    expect(r.songs[1].coordinates).toEqual([[25, 0], [30, 0]]);
    expect(r.songs[2]).toMatchObject({ afterArrival: true, coordinates: [] });
    expect(r.silence).toBeNull();
  });

  it('treats a song ending exactly at arrival as not cut', () => {
    const r = segmentRoute(route, [song('a', 180), song('b', 10)]);
    expect(r.songs[0].cutByArrival).toBe(false);
    expect(r.songs[1].afterArrival).toBe(true);
  });

  it('returns the whole route as silence for an empty playlist', () => {
    const r = segmentRoute(route, []);
    expect(r.songs).toEqual([]);
    expect(r.silence).toEqual(route.coordinates);
    expect(r.musicEndsAt).toBeNull();
  });

  it('copes with zero-duration segments (e.g. duplicated waypoint vertices)', () => {
    const r = segmentRoute(
      { coordinates: [[0, 0], [10, 0], [10, 0], [20, 0]], segmentDurations: [60, 0, 60] },
      [song('a', 60), song('b', 60)],
    );
    expect(r.songs[0].coordinates.at(-1)).toEqual([10, 0]);
    expect(r.songs[1].coordinates[0]).toEqual([10, 0]);
    expect(r.songs[1].coordinates.at(-1)).toEqual([20, 0]);
  });

  it('keeps every song boundary continuous', () => {
    const durations = [37, 41, 12, 55, 23];
    const r = segmentRoute(route, durations.map((d, i) => song(String(i), d)));
    for (let i = 1; i < r.songs.length; i++) {
      expect(r.songs[i].coordinates[0]).toEqual(r.songs[i - 1].coordinates.at(-1));
    }
  });

  it('rejects mismatched duration arrays', () => {
    expect(() => segmentRoute({ coordinates: route.coordinates, segmentDurations: [1] }, [])).toThrow();
  });
});
