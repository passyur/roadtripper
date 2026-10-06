import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { arrayMove } from '@dnd-kit/sortable';
import { pickColor } from '../lib/colors';
import { DEMO_PLAYLIST } from '../lib/demoPlaylist';
import type { SpotifyUser } from '../lib/spotify';
import type { LngLat, PlaylistEntry, Route, Stop, Track } from '../lib/types';

export const MAX_STOPS = 25; // Mapbox Directions limit

const uid = () => Math.random().toString(36).slice(2, 10);

const stop = (label = '', coord: LngLat | null = null): Stop => ({ id: uid(), label, coord });

function toEntries(tracks: Track[]): PlaylistEntry[] {
  const out: PlaylistEntry[] = [];
  for (const track of tracks) {
    out.push({ ...track, key: uid(), color: pickColor(out.at(-1)?.color) });
  }
  return out;
}

/** After a reorder, re-color only entries that now touch a same-colored neighbour. */
function fixAdjacentColors(list: PlaylistEntry[]): PlaylistEntry[] {
  return list.map((e, i, arr) => {
    const prev = i > 0 ? arr[i - 1].color : undefined;
    return e.color === prev ? { ...e, color: pickColor(prev, arr[i + 1]?.color) } : e;
  });
}

export type RouteStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Where the playlist being edited lives: only in this browser, or in the user's Spotify account. */
export type PlaylistSource =
  | { kind: 'draft' }
  | {
      kind: 'spotify';
      id: string;
      url: string;
      /** Name as last saved, to detect renames. */
      savedName: string;
      /** Episodes / local files in the Spotify playlist that we can't show; a save would drop them. */
      skipped: number;
    };

interface TripState {
  stops: Stop[];
  route: Route | null;
  routeStatus: RouteStatus;
  routeError: string | null;

  playlist: PlaylistEntry[];
  playlistName: string;
  source: PlaylistSource;
  /** Edits not yet saved to Spotify. */
  dirty: boolean;
  user: SpotifyUser | null;

  panelOpen: boolean;
  selectedKey: string | null;
  /** Where the selection came from: list clicks fly the map to the song, map clicks don't. */
  selectionSource: 'list' | 'map';
  hoveredKey: string | null;

  setStop: (id: string, label: string, coord: LngLat | null) => void;
  addWaypoint: () => void;
  removeStop: (id: string) => void;
  moveStop: (from: number, to: number) => void;
  setRouteState: (s: Pick<TripState, 'routeStatus'> & Partial<Pick<TripState, 'route' | 'routeError'>>) => void;

  addTrack: (track: Track) => void;
  removeEntry: (key: string) => void;
  moveEntry: (from: number, to: number) => void;
  clearPlaylist: () => void;
  setPlaylistName: (name: string) => void;
  loadPlaylist: (tracks: Track[], name: string, source: PlaylistSource) => void;
  markSaved: (source: PlaylistSource) => void;
  setUser: (user: SpotifyUser | null) => void;

  togglePanel: () => void;
  select: (key: string | null, source?: 'list' | 'map') => void;
  hover: (key: string | null) => void;
}

export const useTripStore = create<TripState>()(
  persist(
    (set) => ({
      stops: [stop('Chicago, Illinois', [-87.6298, 41.8781]), stop('Washington, District of Columbia', [-77.0369, 38.9072])],
      route: null,
      routeStatus: 'idle',
      routeError: null,

      playlist: toEntries(DEMO_PLAYLIST),
      playlistName: 'Chicago → D.C. Roadtrip',
      source: { kind: 'draft' },
      dirty: false,
      user: null,

      panelOpen: true,
      selectedKey: null,
      selectionSource: 'list',
      hoveredKey: null,

      setStop: (id, label, coord) =>
        set((s) => ({ stops: s.stops.map((x) => (x.id === id ? { ...x, label, coord } : x)) })),
      addWaypoint: () =>
        set((s) => {
          if (s.stops.length >= MAX_STOPS) return s;
          const stops = [...s.stops];
          stops.splice(stops.length - 1, 0, stop());
          return { stops };
        }),
      removeStop: (id) =>
        set((s) => (s.stops.length <= 2 ? s : { stops: s.stops.filter((x) => x.id !== id) })),
      moveStop: (from, to) => set((s) => ({ stops: arrayMove(s.stops, from, to) })),
      setRouteState: (patch) => set(patch),

      addTrack: (track) =>
        set((s) => {
          const color = pickColor(s.playlist.at(-1)?.color);
          return { playlist: [...s.playlist, { ...track, key: uid(), color }], dirty: true };
        }),
      removeEntry: (key) =>
        set((s) => ({
          playlist: fixAdjacentColors(s.playlist.filter((e) => e.key !== key)),
          selectedKey: s.selectedKey === key ? null : s.selectedKey,
          dirty: true,
        })),
      moveEntry: (from, to) =>
        set((s) => ({ playlist: fixAdjacentColors(arrayMove(s.playlist, from, to)), dirty: true })),
      clearPlaylist: () => set({ playlist: [], selectedKey: null, dirty: true }),
      setPlaylistName: (playlistName) => set({ playlistName, dirty: true }),
      loadPlaylist: (tracks, playlistName, source) =>
        set({ playlist: toEntries(tracks), playlistName, source, dirty: false, selectedKey: null, hoveredKey: null }),
      markSaved: (source) => set({ source, dirty: false }),
      setUser: (user) => set({ user }),

      togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
      select: (key, source = 'list') => set({ selectedKey: key, selectionSource: source }),
      hover: (key) => set({ hoveredKey: key }),
    }),
    {
      name: 'roadtripper',
      version: 2,
      partialize: (s) => ({
        stops: s.stops,
        playlist: s.playlist,
        playlistName: s.playlistName,
        source: s.source,
        dirty: s.dirty,
        panelOpen: s.panelOpen,
      }),
      // v1 playlists came from a mock catalog with no Spotify URIs, so they can't be saved; start fresh.
      migrate: (persisted, version) => {
        const state = persisted as Partial<TripState>;
        if (version < 2) return { stops: state.stops, panelOpen: state.panelOpen } as TripState;
        return state as TripState;
      },
    },
  ),
);
