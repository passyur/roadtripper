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

/** Where a trip's playlist lives: only in this browser, or in the user's Spotify account. */
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

/** A route and the playlist laid along it. Trips persist in this browser; only playlists sync to Spotify. */
export interface Trip {
  id: string;
  name: string;
  stops: Stop[];
  playlist: PlaylistEntry[];
  source: PlaylistSource;
  /** Playlist edits not yet saved to Spotify (stop edits aren't stored on Spotify, so they don't count). */
  dirty: boolean;
  /** Set on trips opened from a share link, so opening the same link again reuses them. */
  shareKey?: string;
  updatedAt: number;
}

export function makeTrip(partial: Partial<Trip> = {}): Trip {
  // Ignore explicitly-undefined fields so callers can pass optional values straight through.
  const given = Object.fromEntries(Object.entries(partial).filter(([, v]) => v !== undefined));
  return {
    id: uid(),
    name: 'New roadtrip',
    stops: [stop(), stop()],
    playlist: [],
    source: { kind: 'draft' },
    dirty: false,
    updatedAt: Date.now(),
    ...given,
  };
}

const demoTrip = () =>
  makeTrip({
    name: 'Chicago → D.C. Roadtrip',
    stops: [stop('Chicago, Illinois', [-87.6298, 41.8781]), stop('Washington, District of Columbia', [-77.0369, 38.9072])],
    playlist: toEntries(DEMO_PLAYLIST),
  });

interface TripState {
  trips: Trip[];
  activeId: string;

  route: Route | null;
  routeStatus: RouteStatus;
  routeError: string | null;
  user: SpotifyUser | null;

  panelOpen: boolean;
  selectedKey: string | null;
  /** Where the selection came from: list clicks fly the map to the song, map clicks don't. */
  selectionSource: 'list' | 'map';
  hoveredKey: string | null;

  // Active trip: route
  setStop: (id: string, label: string, coord: LngLat | null) => void;
  addWaypoint: () => void;
  removeStop: (id: string) => void;
  moveStop: (from: number, to: number) => void;
  setRouteState: (s: Pick<TripState, 'routeStatus'> & Partial<Pick<TripState, 'route' | 'routeError'>>) => void;

  // Active trip: playlist
  addTrack: (track: Track) => void;
  removeEntry: (key: string) => void;
  moveEntry: (from: number, to: number) => void;
  clearPlaylist: () => void;
  setName: (name: string) => void;
  /** Takes the trip id because saves are async and the user may have switched trips meanwhile. */
  markSaved: (tripId: string, source: PlaylistSource) => void;

  // Trip list
  switchTrip: (id: string) => void;
  /** Adds a trip and makes it active. Pass playlist tracks as plain Tracks; they get keys and colors here. */
  addTrip: (t: { name: string; stops?: Stop[]; tracks?: Track[]; source?: PlaylistSource; shareKey?: string }) => void;
  duplicateTrip: (id: string) => void;
  deleteTrip: (id: string) => void;

  setUser: (user: SpotifyUser | null) => void;
  togglePanel: () => void;
  select: (key: string | null, source?: 'list' | 'map') => void;
  hover: (key: string | null) => void;
}

export const activeTrip = (s: Pick<TripState, 'trips' | 'activeId'>): Trip =>
  s.trips.find((t) => t.id === s.activeId) ?? s.trips[0];

/** Select from the active trip. */
export const useTrip = <T,>(selector: (t: Trip) => T): T => useTripStore((s) => selector(activeTrip(s)));

/** Fresh ids for stops so copies never share identity with the original. */
const cloneStops = (stops: Stop[]) => stops.map((s) => ({ ...s, id: uid() }));

export const useTripStore = create<TripState>()(
  persist(
    (set) => {
      /** Apply a change to the active trip. */
      const patch = (fn: (t: Trip) => Partial<Trip>) =>
        set((s) => {
          const current = activeTrip(s);
          return { trips: s.trips.map((t) => (t.id === current.id ? { ...t, ...fn(t), updatedAt: Date.now() } : t)) };
        });
      const resetView = { selectedKey: null, hoveredKey: null };
      const first = demoTrip();

      return {
        trips: [first],
        activeId: first.id,

        route: null,
        routeStatus: 'idle',
        routeError: null,
        user: null,

        panelOpen: true,
        selectedKey: null,
        selectionSource: 'list',
        hoveredKey: null,

        setStop: (id, label, coord) => patch((t) => ({ stops: t.stops.map((x) => (x.id === id ? { ...x, label, coord } : x)) })),
        addWaypoint: () =>
          patch((t) => {
            if (t.stops.length >= MAX_STOPS) return {};
            const stops = [...t.stops];
            stops.splice(stops.length - 1, 0, stop());
            return { stops };
          }),
        removeStop: (id) => patch((t) => (t.stops.length <= 2 ? {} : { stops: t.stops.filter((x) => x.id !== id) })),
        moveStop: (from, to) => patch((t) => ({ stops: arrayMove(t.stops, from, to) })),
        setRouteState: (p) => set(p),

        addTrack: (track) =>
          patch((t) => ({
            playlist: [...t.playlist, { ...track, key: uid(), color: pickColor(t.playlist.at(-1)?.color) }],
            dirty: true,
          })),
        removeEntry: (key) => {
          patch((t) => ({ playlist: fixAdjacentColors(t.playlist.filter((e) => e.key !== key)), dirty: true }));
          set((s) => (s.selectedKey === key ? { selectedKey: null } : {}));
        },
        moveEntry: (from, to) => patch((t) => ({ playlist: fixAdjacentColors(arrayMove(t.playlist, from, to)), dirty: true })),
        clearPlaylist: () => {
          patch(() => ({ playlist: [], dirty: true }));
          set(resetView);
        },
        setName: (name) => patch((t) => ({ name, dirty: t.source.kind === 'spotify' ? name !== t.source.savedName || t.dirty : t.dirty })),
        markSaved: (tripId, source) =>
          set((s) => ({ trips: s.trips.map((t) => (t.id === tripId ? { ...t, source, dirty: false, updatedAt: Date.now() } : t)) })),

        switchTrip: (id) => set((s) => (s.trips.some((t) => t.id === id) ? { activeId: id, ...resetView } : {})),
        addTrip: ({ name, stops, tracks = [], source, shareKey }) => {
          const trip = makeTrip({
            name,
            stops: stops ? cloneStops(stops) : undefined,
            playlist: toEntries(tracks),
            source,
            shareKey,
          });
          set((s) => ({ trips: [...s.trips, trip], activeId: trip.id, ...resetView }));
        },
        duplicateTrip: (id) =>
          set((s) => {
            const orig = s.trips.find((t) => t.id === id);
            if (!orig) return {};
            // The copy is a draft: two trips saving over one Spotify playlist would clobber each other.
            const copy = makeTrip({
              name: `${orig.name} (copy)`,
              stops: cloneStops(orig.stops),
              playlist: orig.playlist.map((e) => ({ ...e, key: uid() })),
            });
            const at = s.trips.indexOf(orig) + 1;
            return { trips: [...s.trips.slice(0, at), copy, ...s.trips.slice(at)], activeId: copy.id, ...resetView };
          }),
        deleteTrip: (id) =>
          set((s) => {
            const rest = s.trips.filter((t) => t.id !== id);
            if (rest.length === 0) {
              const blank = makeTrip();
              return { trips: [blank], activeId: blank.id, ...resetView };
            }
            if (s.activeId !== id) return { trips: rest };
            const next = [...rest].sort((a, b) => b.updatedAt - a.updatedAt)[0];
            return { trips: rest, activeId: next.id, ...resetView };
          }),

        setUser: (user) => set({ user }),
        togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
        select: (key, source = 'list') => set({ selectedKey: key, selectionSource: source }),
        hover: (key) => set({ hoveredKey: key }),
      };
    },
    {
      name: 'roadtripper',
      version: 3,
      partialize: (s) => ({ trips: s.trips, activeId: s.activeId, panelOpen: s.panelOpen }),
      migrate: migrateTripState,
    },
  ),
);

/** Exported for tests. */
export function migrateTripState(persisted: unknown, version: number) {
  const old = (persisted ?? {}) as Record<string, unknown>;
  // v1 playlists came from a mock catalog with no Spotify URIs, so they can't be saved; keep only the route.
  if (version < 2) {
    const trip = demoTrip();
    if (Array.isArray(old.stops)) trip.stops = old.stops as Stop[];
    return { trips: [trip], activeId: trip.id, panelOpen: old.panelOpen ?? true };
  }
  // v2 held a single route + playlist; it becomes the first trip.
  if (version < 3) {
    const trip = makeTrip({
      name: (old.playlistName as string) ?? 'My roadtrip',
      stops: (old.stops as Stop[]) ?? undefined,
      playlist: (old.playlist as PlaylistEntry[]) ?? [],
      source: (old.source as PlaylistSource) ?? { kind: 'draft' },
      dirty: Boolean(old.dirty),
    });
    return { trips: [trip], activeId: trip.id, panelOpen: old.panelOpen ?? true };
  }
  return old;
}
