import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { getAppToken } from './server/spotifyAppToken.ts';

/** Serves /api/spotify-token in dev, mirroring the Cloudflare Worker in worker/. */
function spotifyTokenDev(env: Record<string, string>): Plugin {
  return {
    name: 'spotify-token-dev',
    configureServer(server) {
      server.middlewares.use('/api/spotify-token', async (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        try {
          if (!env.VITE_SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) throw new Error('Spotify credentials not configured');
          res.end(JSON.stringify(await getAppToken(env.VITE_SPOTIFY_CLIENT_ID, env.SPOTIFY_CLIENT_SECRET)));
        } catch (e) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: (e as Error).message }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    // GitHub Pages serves the app from /<repo>/; the deploy workflow sets BASE_PATH.
    base: env.BASE_PATH || '/',
    plugins: [react(), spotifyTokenDev(env)],
    server: { port: 5173, strictPort: true },
  };
});
