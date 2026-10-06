// App-level (client credentials) token for catalog search by logged-out users.
// Runs server-side only: it needs SPOTIFY_CLIENT_SECRET.

interface Cached {
  access_token: string;
  expires_at: number;
}

let cached: Cached | null = null;

export async function getAppToken(clientId: string, clientSecret: string): Promise<Cached> {
  // Refresh a minute early so clients never receive a token about to expire.
  if (cached && cached.expires_at - 60_000 > Date.now()) return cached;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Spotify token request failed (${res.status})`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cached = { access_token: body.access_token, expires_at: Date.now() + body.expires_in * 1000 };
  return cached;
}
