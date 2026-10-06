import type { LngLat, Route } from './types';

export const MAPBOX_TOKEN: string | undefined = import.meta.env.VITE_MAPBOX_TOKEN || undefined;

const API = 'https://api.mapbox.com';

interface DirectionsResponse {
  code: string;
  message?: string;
  routes: {
    duration: number;
    distance: number;
    geometry: { coordinates: LngLat[] };
    legs: { annotation?: { duration?: number[]; distance?: number[] } }[];
  }[];
}

/** Driving route through 2–25 points, with per-segment travel times for song placement. */
export async function fetchRoute(points: LngLat[], signal?: AbortSignal): Promise<Route> {
  if (!MAPBOX_TOKEN) throw new Error('Missing VITE_MAPBOX_TOKEN');
  const path = points.map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';');
  const params = new URLSearchParams({
    geometries: 'geojson',
    overview: 'full',
    annotations: 'duration,distance',
    access_token: MAPBOX_TOKEN,
  });
  const res = await fetch(`${API}/directions/v5/mapbox/driving/${path}?${params}`, { signal });
  const body = (await res.json()) as DirectionsResponse;
  if (!res.ok || body.code !== 'Ok' || !body.routes?.length) {
    throw new Error(body.message ?? (body.code === 'NoRoute' ? 'No driving route found' : `Directions failed (${res.status})`));
  }

  const r = body.routes[0];
  const coordinates = r.geometry.coordinates;
  const annotated = r.legs.flatMap((leg) => leg.annotation?.duration ?? []);
  const raw = annotated.length === coordinates.length - 1 ? annotated : distanceProportional(coordinates, r.duration);

  // Annotations omit turn/intersection penalties, so scale them to match the headline ETA.
  const sum = raw.reduce((a, b) => a + b, 0);
  const scale = sum > 0 ? r.duration / sum : 1;
  return {
    coordinates,
    segmentDurations: raw.map((d) => d * scale),
    durationS: r.duration,
    distanceM: r.distance,
  };
}

/** Fallback when annotations don't line up with the geometry: spread time by distance. */
function distanceProportional(coords: LngLat[], totalS: number): number[] {
  const d = coords.slice(1).map((c, i) => haversine(coords[i], c));
  const total = d.reduce((a, b) => a + b, 0) || 1;
  return d.map((x) => (x / total) * totalS);
}

function haversine([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(a));
}

export interface Place {
  id: string;
  name: string;
  detail: string;
  coord: LngLat;
}

interface GeocodeResponse {
  features: {
    id: string;
    geometry: { coordinates: LngLat };
    properties: { name: string; full_address?: string; place_formatted?: string };
  }[];
}

/** Autocomplete search (Mapbox Geocoding v6), biased toward `near` when given. */
export async function searchPlaces(query: string, near?: LngLat, signal?: AbortSignal): Promise<Place[]> {
  if (!MAPBOX_TOKEN || query.trim().length < 2) return [];
  const params = new URLSearchParams({
    q: query,
    autocomplete: 'true',
    limit: '5',
    access_token: MAPBOX_TOKEN,
  });
  if (near) params.set('proximity', `${near[0]},${near[1]}`);
  const res = await fetch(`${API}/search/geocode/v6/forward?${params}`, { signal });
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  const body = (await res.json()) as GeocodeResponse;
  return body.features.map((f) => ({
    id: f.id,
    name: f.properties.name,
    detail: f.properties.place_formatted ?? f.properties.full_address ?? '',
    coord: f.geometry.coordinates,
  }));
}
