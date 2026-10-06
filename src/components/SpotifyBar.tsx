import { useState } from 'react';
import { SPOTIFY_CLIENT_ID } from '../lib/auth';
import { savePlaylist, signOut, startLogin } from '../store/spotifyActions';
import { useTripStore } from '../store/useTripStore';
import { ImportDialog } from './ImportDialog';
import { SpotifyIcon } from './icons';

/** Account state plus the Save / Import / New actions for the playlist. */
export function SpotifyBar() {
  const user = useTripStore((s) => s.user);
  const source = useTripStore((s) => s.source);
  const dirty = useTripStore((s) => s.dirty);
  const loadPlaylist = useTripStore((s) => s.loadPlaylist);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  if (!SPOTIFY_CLIENT_ID) return <p className="spotify-bar muted">Set VITE_SPOTIFY_CLIENT_ID to connect Spotify.</p>;

  const save = async (mode: 'update' | 'new') => {
    setSaving(true);
    await savePlaylist(mode);
    setSaving(false);
  };

  const startNew = () => {
    if (dirty && !confirm('Start a new playlist? Unsaved changes will be lost.')) return;
    loadPlaylist([], 'New roadtrip', { kind: 'draft' });
  };

  if (!user) {
    return (
      <div className="spotify-bar">
        <button className="spotify-button" onClick={() => startLogin(true)}>
          <SpotifyIcon /> Save to Spotify
        </button>
        <button className="link-button" onClick={() => startLogin(false)}>Log in</button>
        <span className="spotify-bar__hint">Log in to save this playlist or import one of yours.</span>
      </div>
    );
  }

  const onSpotify = source.kind === 'spotify';
  return (
    <div className="spotify-bar">
      {onSpotify ? (
        <>
          <button className="spotify-button" disabled={!dirty || saving} onClick={() => save('update')}>
            <SpotifyIcon /> {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </button>
          <button className="link-button" disabled={saving} onClick={() => save('new')}>Save as new</button>
        </>
      ) : (
        <button className="spotify-button" disabled={saving} onClick={() => save('new')}>
          <SpotifyIcon /> {saving ? 'Saving…' : 'Save to Spotify'}
        </button>
      )}
      <button className="link-button" onClick={() => setImporting(true)}>Import</button>
      <button className="link-button" onClick={startNew}>New</button>
      <span className="spotify-bar__user" title={`Logged in as ${user.name}`}>
        {user.imageUrl ? <img src={user.imageUrl} alt="" /> : <span className="avatar">{user.name[0]}</span>}
        <button className="link-button" onClick={signOut}>Log out</button>
      </span>
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}
