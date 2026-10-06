import { useEffect, useMemo, useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import { useTrip, useTripStore } from './store/useTripStore';
import { fetchRoute, MAPBOX_TOKEN } from './lib/mapbox';
import { segmentRoute } from './lib/segmentRoute';
import { MapView } from './components/MapView';
import { RouteCard } from './components/RouteCard';
import { PlaylistPanel } from './components/PlaylistPanel';
import { ChevronRightIcon, ListIcon } from './components/icons';
import { NoticeToast } from './components/NoticeToast';
import { initSpotifySession } from './store/spotifyActions';
import { openSharedTripFromUrl } from './store/shareActions';

// Module-level so React StrictMode's double effect doesn't run the login handshake twice.
let session: Promise<void> | null = null;

export default function App() {
  useRouteFetcher();
  useEffect(() => {
    session ??= initSpotifySession();
    // Share links work on load and when pasted into the address bar of an already-open app.
    openSharedTripFromUrl();
    window.addEventListener('hashchange', openSharedTripFromUrl);
    return () => window.removeEventListener('hashchange', openSharedTripFromUrl);
  }, []);

  const route = useTripStore((s) => s.route);
  const stops = useTrip((t) => t.stops);
  const playlist = useTrip((t) => t.playlist);
  const panelOpen = useTripStore((s) => s.panelOpen);
  const selectedKey = useTripStore((s) => s.selectedKey);
  const selectionSource = useTripStore((s) => s.selectionSource);
  const hoveredKey = useTripStore((s) => s.hoveredKey);
  const { togglePanel, select, hover } = useTripStore.getState();

  const [preview, setPreview] = useState<{ from: number; to: number } | null>(null);
  const shown = useMemo(
    () => (preview && preview.from >= 0 && preview.to >= 0 ? arrayMove(playlist, preview.from, preview.to) : playlist),
    [playlist, preview],
  );
  const segments = useMemo(() => (route ? segmentRoute(route, shown) : null), [route, shown]);

  return (
    <div className={`app${panelOpen ? ' panel-open' : ''}`}>
      {MAPBOX_TOKEN ? (
        <MapView
          route={route}
          segments={segments}
          playlist={shown}
          stops={stops}
          selectedKey={selectedKey}
          selectionSource={selectionSource}
          hoveredKey={hoveredKey}
          panelOpen={panelOpen}
          onSelect={(k) => select(k, 'map')}
          onHover={hover}
        />
      ) : (
        <MissingToken />
      )}

      <header className="brand">
        <span className="brand__mark" aria-hidden />
        Roadtripper
      </header>

      <RouteCard segments={segments} />

      <button className="panel-toggle" onClick={togglePanel} aria-expanded={panelOpen} aria-controls="playlist-panel">
        {panelOpen ? <ChevronRightIcon /> : <ListIcon />}
        <span>{panelOpen ? 'Hide' : `Playlist · ${playlist.length}`}</span>
      </button>

      <div id="playlist-panel" className="panel-wrap" hidden={!panelOpen}>
        <PlaylistPanel segments={segments} onPreview={setPreview} dragging={preview !== null} />
      </div>

      <NoticeToast />
    </div>
  );
}

/** Re-route whenever the set of placed stops changes. */
function useRouteFetcher() {
  const stops = useTrip((t) => t.stops);
  const setRouteState = useTripStore((s) => s.setRouteState);
  const points = stops.flatMap((s) => (s.coord ? [s.coord] : []));
  const key = points.map((p) => p.join(',')).join(';');

  useEffect(() => {
    if (!MAPBOX_TOKEN) return;
    if (points.length < 2) {
      setRouteState({ routeStatus: 'idle', route: null, routeError: null });
      return;
    }
    const ctrl = new AbortController();
    setRouteState({ routeStatus: 'loading', routeError: null });
    fetchRoute(points, ctrl.signal)
      .then((route) => setRouteState({ routeStatus: 'ready', route }))
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setRouteState({ routeStatus: 'error', route: null, routeError: e.message });
      });
    return () => ctrl.abort();
    // `key` captures every coordinate in `points`.
  }, [key]);
}

function MissingToken() {
  return (
    <div className="map map--missing">
      <div className="missing-token">
        <h1>Add a Mapbox token to see the map</h1>
        <p>
          Create a public token at <a href="https://account.mapbox.com/access-tokens/" target="_blank" rel="noreferrer">account.mapbox.com</a>,
          then put it in <code>.env.local</code>:
        </p>
        <pre>VITE_MAPBOX_TOKEN=pk.…</pre>
        <p className="muted">Restart the dev server afterwards. The playlist panel works without it.</p>
      </div>
    </div>
  );
}
