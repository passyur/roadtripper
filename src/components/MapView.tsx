import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import type { GeoJSONSource, LngLatBoundsLike } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN } from '../lib/mapbox';
import { formatDrive } from '../lib/format';
import type { SegmentResult } from '../lib/segmentRoute';
import type { LngLat, PlaylistEntry, Route, Stop } from '../lib/types';

interface Props {
  route: Route | null;
  segments: SegmentResult | null;
  /** Playlist in the order `segments` was computed from (may be a live drag preview). */
  playlist: PlaylistEntry[];
  stops: Stop[];
  selectedKey: string | null;
  selectionSource: 'list' | 'map';
  hoveredKey: string | null;
  panelOpen: boolean;
  onSelect: (key: string | null) => void;
  onHover: (key: string | null) => void;
}

type FC = GeoJSON.FeatureCollection;
const EMPTY: FC = { type: 'FeatureCollection', features: [] };
const line = (coordinates: LngLat[], properties: Record<string, unknown> = {}): GeoJSON.Feature => ({
  type: 'Feature',
  properties,
  geometry: { type: 'LineString', coordinates },
});

function bounds(coords: LngLat[]): LngLatBoundsLike {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of coords) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [[minX, minY], [maxX, maxY]];
}

/** Keep the route clear of the floating route card (left/top) and playlist panel (right/bottom). */
function padding(panelOpen: boolean) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  let p: { top: number; bottom: number; left: number; right: number };
  if (w < 720) {
    const cardBottom = document.querySelector('.route-card')?.getBoundingClientRect().bottom ?? 200;
    p = { top: cardBottom + 30, left: 30, right: 30, bottom: (panelOpen ? h * 0.5 : 0) + 60 };
  } else {
    const right = panelOpen ? Math.min(440, w * 0.45) : 80;
    // On narrower screens let the route run under the route card rather than squeezing it.
    p = { top: 70, bottom: 60, left: Math.max(40, Math.min(400, w - right - 500)), right };
  }
  // Mapbox refuses to fit at all if padding leaves no room, so always keep a minimum viewport.
  const squeeze = (a: number, b: number, size: number) => {
    const k = Math.min(1, (size - 80) / (a + b));
    return [a * k, b * k];
  };
  [p.top, p.bottom] = squeeze(p.top, p.bottom, h);
  [p.left, p.right] = squeeze(p.left, p.right, w);
  return p;
}

export function MapView(props: Props) {
  const { route, segments, playlist, stops, selectedKey, selectionSource, hoveredKey, panelOpen } = props;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [ready, setReady] = useState(false);

  // Event handlers are registered once; read current props through a ref.
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    mapboxgl.accessToken = MAPBOX_TOKEN!;
    const map = new mapboxgl.Map({
      container: container.current!,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-82.5, 40.3],
      zoom: 5,
      // The playlist panel covers the bottom-right corner, so keep attribution with the logo.
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-left');

    const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 14, className: 'song-popup' });

    map.on('load', () => {
      // Draw the route under place labels so city names stay readable.
      const firstLabel = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id;
      for (const id of ['route-full', 'route-songs', 'route-silence', 'song-ticks']) {
        map.addSource(id, { type: 'geojson', data: EMPTY });
      }
      map.addLayer(
        { id: 'route-casing', type: 'line', source: 'route-full', layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#05070a', 'line-width': 11, 'line-opacity': 0.75 } },
        firstLabel,
      );
      map.addLayer(
        { id: 'route-silence', type: 'line', source: 'route-silence', layout: { 'line-join': 'round' },
          paint: { 'line-color': '#6b7280', 'line-width': 4, 'line-dasharray': [1.2, 1.4] } },
        firstLabel,
      );
      map.addLayer(
        { id: 'route-songs', type: 'line', source: 'route-songs', layout: { 'line-join': 'round', 'line-cap': 'butt' },
          paint: { 'line-color': ['get', 'color'], 'line-width': 6 } },
        firstLabel,
      );
      map.addLayer({
        id: 'song-ticks', type: 'circle', source: 'song-ticks', minzoom: 6,
        paint: { 'circle-radius': 3.5, 'circle-color': '#f8fafc', 'circle-stroke-color': '#05070a', 'circle-stroke-width': 1.5 },
      });
      setReady(true);
    });

    map.on('mousemove', 'route-songs', (e) => {
      const key = e.features?.[0]?.properties?.key as string | undefined;
      if (!key) return;
      map.getCanvas().style.cursor = 'pointer';
      const { playlist, segments, hoveredKey, onHover } = latest.current;
      if (hoveredKey !== key) onHover(key);
      const entry = playlist.find((p) => p.key === key);
      const seg = segments?.songs.find((s) => s.key === key);
      if (!entry || !seg) return;
      popup.setLngLat(e.lngLat).setDOMContent(popupContent(entry, seg.startS, Math.min(seg.endS, segments!.routeS))).addTo(map);
    });
    map.on('mouseleave', 'route-songs', () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
      latest.current.onHover(null);
    });
    map.on('click', (e) => {
      // Clicking a song selects it; clicking anywhere else clears the selection.
      const hit = map.queryRenderedFeatures(e.point, { layers: ['route-songs'] })[0];
      const key = (hit?.properties?.key as string | undefined) ?? null;
      if (key !== latest.current.selectedKey) latest.current.onSelect(key);
    });

    return () => {
      popup.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Route + song geometry.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const src = (id: string) => map.getSource(id) as GeoJSONSource;

    src('route-full').setData(route ? { type: 'FeatureCollection', features: [line(route.coordinates)] } : EMPTY);
    if (!route || !segments) {
      for (const id of ['route-songs', 'route-silence', 'song-ticks']) src(id).setData(EMPTY);
      return;
    }
    const drawn = segments.songs.filter((s) => s.coordinates.length >= 2);
    src('route-songs').setData({
      type: 'FeatureCollection',
      features: drawn.map((s) => line(s.coordinates, { key: s.key, color: playlist[s.index]?.color ?? '#fff' })),
    });
    src('route-silence').setData(segments.silence ? { type: 'FeatureCollection', features: [line(segments.silence)] } : EMPTY);
    src('song-ticks').setData({
      type: 'FeatureCollection',
      features: drawn.slice(1).map((s) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: s.coordinates[0] } })),
    });
  }, [ready, route, segments, playlist]);

  // Frame a newly fetched route.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !route) return;
    map.fitBounds(bounds(route.coordinates), { padding: padding(latest.current.panelOpen), duration: 900 });
  }, [ready, route]);

  // Emphasise the hovered / selected song.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const is = (k: string | null) => ['==', ['get', 'key'], k ?? ''];
    map.setPaintProperty('route-songs', 'line-width', ['case', is(selectedKey), 10, is(hoveredKey), 9, 6]);
    map.setPaintProperty('route-songs', 'line-opacity', selectedKey ? ['case', is(selectedKey), 1, 0.4] : 1);
  }, [ready, selectedKey, hoveredKey]);

  // Fly to a song picked from the list.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !selectedKey || selectionSource !== 'list') return;
    const seg = latest.current.segments?.songs.find((s) => s.key === selectedKey);
    if (!seg || seg.coordinates.length < 2) return;
    map.fitBounds(bounds(seg.coordinates), { padding: padding(latest.current.panelOpen), maxZoom: 12, duration: 800 });
  }, [ready, selectedKey, selectionSource]);

  // Stop pins (A, 1, 2…, B).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const placed = stops.filter((s) => s.coord);
    const markers = placed.map((s, i) => {
      const el = document.createElement('div');
      const end = i === 0 ? 'start' : i === placed.length - 1 ? 'end' : 'via';
      el.className = `stop-pin stop-pin--${end}`;
      el.textContent = end === 'start' ? 'A' : end === 'end' ? 'B' : String(i);
      el.title = s.label;
      return new mapboxgl.Marker({ element: el }).setLngLat(s.coord!).addTo(map);
    });
    return () => markers.forEach((m) => m.remove());
  }, [ready, stops]);

  // "Music ends here" flag.
  const endsAt = segments?.musicEndsAt;
  const musicS = segments?.musicS ?? 0;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !endsAt) return;
    const el = document.createElement('div');
    el.className = 'music-ends';
    el.innerHTML = '<span class="music-ends__dot"></span><span class="music-ends__label"></span>';
    el.querySelector('.music-ends__label')!.textContent = `Music ends · ${formatDrive(musicS)}`;
    const marker = new mapboxgl.Marker({ element: el, anchor: 'left', offset: [-7, 0] }).setLngLat(endsAt).addTo(map);
    return () => {
      marker.remove();
    };
  }, [ready, endsAt?.[0], endsAt?.[1], musicS]);

  // Re-pad when the panel opens/closes so the route stays in view.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !latest.current.route) return;
    map.fitBounds(bounds(latest.current.route.coordinates), { padding: padding(panelOpen), duration: 500 });
  }, [ready, panelOpen]);

  return <div ref={container} className="map" />;
}

function popupContent(entry: PlaylistEntry, startS: number, endS: number): HTMLElement {
  const root = document.createElement('div');
  root.className = 'song-popup__body';
  const swatch = document.createElement('span');
  swatch.className = 'song-popup__swatch';
  swatch.style.background = entry.color;
  const text = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'song-popup__title';
  title.textContent = entry.title;
  const meta = document.createElement('div');
  meta.className = 'song-popup__meta';
  meta.textContent = `${entry.artist} · ${formatDrive(startS)} → ${formatDrive(endS)}`;
  text.append(title, meta);
  root.append(swatch, text);
  return root;
}
