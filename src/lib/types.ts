export type LngLat = [number, number];

/** A song as the app knows it. Spotify fields (uri, imageUrl) are optional until step 5. */
export interface Track {
  id: string;
  uri?: string;
  title: string;
  artist: string;
  durationMs: number;
  imageUrl?: string;
}

/** A track placed in the playlist. `key` is unique per entry so the same song can appear twice. */
export interface PlaylistEntry extends Track {
  key: string;
  color: string;
}

export interface Stop {
  id: string;
  label: string;
  coord: LngLat | null;
}

export interface Route {
  coordinates: LngLat[];
  /** Seconds to travel each line segment; length === coordinates.length - 1. */
  segmentDurations: number[];
  durationS: number;
  distanceM: number;
}
