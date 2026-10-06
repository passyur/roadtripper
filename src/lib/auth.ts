// Spotify Authorization Code + PKCE, entirely in the browser (no client secret involved).

export const SPOTIFY_CLIENT_ID: string | undefined = import.meta.env.VITE_SPOTIFY_CLIENT_ID || undefined;

const SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-private',
  'playlist-modify-public',
].join(' ');

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const STORE_KEY = 'roadtripper.auth';
const PKCE_KEY = 'roadtripper.pkce';

export interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

// Under the app's base path: /callback locally, /roadtripper/callback on GitHub Pages
// (served by a copy of index.html as 404.html, since Pages has no SPA fallback).
const CALLBACK_PATH = `${import.meta.env.BASE_URL}callback`;
const redirectUri = () => `${location.origin}${CALLBACK_PATH}`;

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(bytes = 48): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function login(): Promise<void> {
  if (!SPOTIFY_CLIENT_ID) throw new Error('Missing VITE_SPOTIFY_CLIENT_ID');
  const verifier = randomString(64);
  const state = randomString(16);
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));
  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES,
    state,
  });
  location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

/**
 * If we're on /callback, finish the login and clean up the URL.
 * Returns an error message when Spotify (or the state check) rejected the login.
 */
export async function completeLoginIfRedirected(): Promise<string | null> {
  if (location.pathname !== CALLBACK_PATH) return null;
  const params = new URLSearchParams(location.search);
  const pkce = JSON.parse(sessionStorage.getItem(PKCE_KEY) ?? 'null') as { verifier: string; state: string } | null;
  sessionStorage.removeItem(PKCE_KEY);
  history.replaceState(null, '', import.meta.env.BASE_URL);

  const error = params.get('error');
  if (error) return error === 'access_denied' ? 'Spotify login was cancelled' : `Spotify login failed: ${error}`;
  const code = params.get('code');
  if (!code || !pkce || params.get('state') !== pkce.state) return 'Spotify login failed: invalid state. Please try again.';

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      client_id: SPOTIFY_CLIENT_ID!,
      code_verifier: pkce.verifier,
    }),
  });
  if (!res.ok) return `Spotify login failed (${res.status})`;
  saveTokens(await res.json());
  return null;
}

function saveTokens(body: { access_token: string; refresh_token?: string; expires_in: number }, prev?: Tokens) {
  const tokens: Tokens = {
    access_token: body.access_token,
    // Spotify may omit the refresh token on refresh; keep the old one then.
    refresh_token: body.refresh_token ?? prev?.refresh_token ?? '',
    expires_at: Date.now() + body.expires_in * 1000,
  };
  localStorage.setItem(STORE_KEY, JSON.stringify(tokens));
  return tokens;
}

function readTokens(): Tokens | null {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  return readTokens() !== null;
}

export function logout(): void {
  localStorage.removeItem(STORE_KEY);
}

let refreshing: Promise<string | null> | null = null;

/** A valid user access token, refreshing if needed; null when logged out or the session can't be renewed. */
export async function getUserToken(): Promise<string | null> {
  const tokens = readTokens();
  if (!tokens) return null;
  if (tokens.expires_at - 60_000 > Date.now()) return tokens.access_token;
  refreshing ??= (async () => {
    try {
      const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: SPOTIFY_CLIENT_ID! }),
      });
      if (!res.ok) {
        logout();
        return null;
      }
      return saveTokens(await res.json(), tokens).access_token;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}
