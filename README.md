# Roadtripper

Plot a playlist onto a driving route: each song is drawn as a colored stretch of road covering the part of the drive it plays over.

## Run

```bash
cp .env.example .env.local   # then fill in the keys
bun install
bun run dev                  # http://127.0.0.1:5173
bun run test
```

Node isn't required; Bun runs Vite and Vitest. Use `127.0.0.1`, not `localhost` — Spotify only accepts loopback redirect URIs in that form.

## How songs are placed

`src/lib/segmentRoute.ts` takes the Mapbox route geometry plus a travel time for every line segment (Directions `annotations=duration`, scaled to match the headline ETA), accumulates time along the line, and cuts it at each song boundary, interpolating inside a segment when a song ends mid-segment. Songs past the arrival time are flagged `afterArrival`; if the playlist runs short, the rest of the route comes back as `silence`.

## Spotify

- **Search** works logged out: `/api/spotify-token` hands the browser a client-credentials token (the secret stays server-side — Vite middleware in dev, the Cloudflare Worker in `worker/` in production). Logged-in users search with their own token.
- **Login** is Authorization Code + PKCE in the browser (`src/lib/auth.ts`). Redirect URI: `http://127.0.0.1:5173/callback` locally; add your production `https://<domain>/callback` in the Spotify dashboard when deploying.
- **Save**: drafts are created as new private playlists; imported playlists are overwritten in the new order only when you press Save. "Save to Spotify" while logged out logs in, then saves automatically.
- **Import** lists playlists you own or collaborate on — since Spotify's February 2026 API changes, apps can't read the tracks of anyone else's playlists. Podcast episodes and local files are skipped (and a save would remove them, so you're asked first).
- **Development-mode limits**: the app owner needs Spotify Premium, and anyone else who logs in must be added under *User Management* in the Spotify dashboard.

## Deploy

**Site → GitHub Pages.** `.github/workflows/pages.yml` tests, builds with `BASE_PATH=/<repo>/`, and publishes on every push to `main`. It reads these repository variables (Settings → Secrets and variables → Actions → Variables):

| Variable | Value |
| --- | --- |
| `VITE_MAPBOX_TOKEN` | Mapbox public token — restrict it to your Pages URL in the Mapbox dashboard |
| `VITE_SPOTIFY_CLIENT_ID` | Spotify client ID |
| `VITE_TOKEN_URL` | URL of the token worker below |

Add `https://<user>.github.io/<repo>/callback` as a redirect URI in the Spotify dashboard. Pages has no SPA fallback, so the workflow copies `index.html` to `404.html` to let that path load the app.

**Search token → Cloudflare Worker.** Static hosting can't keep the client secret, so `worker/` serves the client-credentials token (CORS-limited to `ALLOWED_ORIGINS` in `worker/wrangler.toml`):

```bash
cd worker
bunx wrangler login
bunx wrangler secret put SPOTIFY_CLIENT_SECRET
bunx wrangler deploy
```

## Layout

- `src/components/MapView.tsx` — Mapbox map, colored song segments, hover popups, stop pins
- `src/components/RouteCard.tsx` — origin / waypoints / destination with autocomplete and drag-to-reorder
- `src/components/PlaylistPanel.tsx` — sortable playlist (dnd-kit); the map repaints live while dragging
- `src/store/useTripStore.ts` — Zustand store, persisted to localStorage
- `src/components/SpotifyBar.tsx`, `ImportDialog.tsx` — login, save, import
- `src/lib/spotify.ts` — Spotify Web API client (post–February 2026 endpoints)
- `src/store/spotifyActions.ts` — login handshake, save, import
