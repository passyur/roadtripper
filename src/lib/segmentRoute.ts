import type { LngLat } from './types';

export interface SegmentInput {
  coordinates: LngLat[];
  segmentDurations: number[];
}

export interface SongInput {
  key: string;
  durationMs: number;
}

export interface SongSegment {
  key: string;
  index: number;
  /** Seconds after departure the song starts / ends (unclipped by arrival). */
  startS: number;
  endS: number;
  /** Portion of the route driven during this song; empty when the song plays after arrival. */
  coordinates: LngLat[];
  /** Song starts before arrival but is still playing when you arrive. */
  cutByArrival: boolean;
  afterArrival: boolean;
}

export interface SegmentResult {
  songs: SongSegment[];
  /** Route driven after the music runs out (null when the playlist covers the drive). */
  silence: LngLat[] | null;
  musicEndsAt: LngLat | null;
  routeS: number;
  musicS: number;
}

/**
 * Lays a playlist end-to-end along a route by drive time, splitting the route
 * line at each song boundary (interpolating inside a segment when needed).
 */
export function segmentRoute(route: SegmentInput, songs: SongInput[]): SegmentResult {
  const { coordinates, segmentDurations } = route;
  if (coordinates.length < 2 || segmentDurations.length !== coordinates.length - 1) {
    throw new Error('segmentDurations must have exactly one entry per line segment');
  }

  const cum = new Float64Array(coordinates.length);
  for (let i = 0; i < segmentDurations.length; i++) {
    cum[i + 1] = cum[i] + Math.max(0, segmentDurations[i]);
  }
  const routeS = cum[cum.length - 1];

  // Last segment index j with cum[j] <= t, clamped to [0, n-2].
  const segmentAt = (t: number): number => {
    let lo = 0;
    let hi = cum.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cum[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const pointAt = (t: number, j: number): LngLat => {
    const span = cum[j + 1] - cum[j];
    const f = span > 0 ? Math.min(1, Math.max(0, (t - cum[j]) / span)) : 1;
    const [x0, y0] = coordinates[j];
    const [x1, y1] = coordinates[j + 1];
    return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
  };

  const slice = (t0: number, t1: number): LngLat[] => {
    const j0 = segmentAt(t0);
    const j1 = segmentAt(t1);
    const out: LngLat[] = [pointAt(t0, j0)];
    for (let i = j0 + 1; i <= j1; i++) {
      if (cum[i] > t0 && cum[i] < t1) out.push(coordinates[i]);
    }
    out.push(pointAt(t1, j1));
    return out;
  };

  const result: SongSegment[] = [];
  let t = 0;
  songs.forEach((song, index) => {
    const startS = t;
    const endS = t + Math.max(0, song.durationMs) / 1000;
    t = endS;
    const afterArrival = startS >= routeS;
    result.push({
      key: song.key,
      index,
      startS,
      endS,
      coordinates: afterArrival ? [] : slice(startS, Math.min(endS, routeS)),
      cutByArrival: !afterArrival && endS > routeS,
      afterArrival,
    });
  });

  const musicS = t;
  const runsOut = musicS < routeS;
  return {
    songs: result,
    silence: runsOut ? slice(musicS, routeS) : null,
    musicEndsAt: runsOut && songs.length > 0 ? pointAt(musicS, segmentAt(musicS)) : null,
    routeS,
    musicS,
  };
}
