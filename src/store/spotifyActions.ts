import { completeLoginIfRedirected, isLoggedIn, login, logout } from '../lib/auth';
import { createPlaylist, getMe, getPlaylistTracks, renamePlaylist, replacePlaylistItems, type PlaylistSummary } from '../lib/spotify';
import { notify, notifyError } from './useNotice';
import { useTripStore } from './useTripStore';

const PENDING_SAVE = 'roadtripper.saveAfterLogin';

/** Run once on startup: finish a login redirect, load the user, and resume a save that needed login. */
export async function initSpotifySession(): Promise<void> {
  const loginError = await completeLoginIfRedirected();
  if (loginError) {
    sessionStorage.removeItem(PENDING_SAVE);
    notifyError(loginError);
    return;
  }
  if (!isLoggedIn()) return;
  try {
    useTripStore.getState().setUser(await getMe());
  } catch (e) {
    notifyError(e);
    return;
  }
  if (sessionStorage.getItem(PENDING_SAVE)) {
    sessionStorage.removeItem(PENDING_SAVE);
    await savePlaylist('new');
  }
}

export function startLogin(thenSave = false): void {
  if (thenSave) sessionStorage.setItem(PENDING_SAVE, '1');
  login().catch(notifyError);
}

export function signOut(): void {
  logout();
  useTripStore.getState().setUser(null);
}

/**
 * 'update' overwrites the imported/previously-saved Spotify playlist with the current order;
 * 'new' always creates a new private playlist.
 */
export async function savePlaylist(mode: 'update' | 'new'): Promise<boolean> {
  const { playlist, playlistName, source, stops, markSaved } = useTripStore.getState();
  const uris = playlist.flatMap((e) => (e.uri ? [e.uri] : []));
  const name = playlistName.trim() || 'Roadtrip';

  try {
    if (mode === 'update' && source.kind === 'spotify') {
      if (
        source.skipped > 0 &&
        !confirm(
          `This Spotify playlist has ${source.skipped} podcast episode(s) or local file(s) that Roadtripper can't show. ` +
            'Saving will remove them from the playlist. Continue?',
        )
      ) {
        return false;
      }
      await replacePlaylistItems(source.id, uris);
      if (name !== source.savedName) await renamePlaylist(source.id, name);
      markSaved({ ...source, savedName: name, skipped: 0 });
      notify('Saved to Spotify', { link: { href: source.url, label: 'Open' } });
    } else {
      const ends = stops.filter((s) => s.coord).map((s) => s.label.split(',')[0]);
      const description = ends.length >= 2 ? `${ends[0]} → ${ends.at(-1)}, planned with Roadtripper` : 'Planned with Roadtripper';
      const created = await createPlaylist(name, description, uris);
      markSaved({ kind: 'spotify', id: created.id, url: created.url, savedName: name, skipped: 0 });
      notify(`Created “${name}” in your Spotify library`, { link: { href: created.url, label: 'Open' } });
    }
    return true;
  } catch (e) {
    notifyError(e);
    return false;
  }
}

export async function importPlaylist(p: PlaylistSummary): Promise<void> {
  const { tracks, skipped } = await getPlaylistTracks(p.id);
  useTripStore.getState().loadPlaylist(tracks, p.name, { kind: 'spotify', id: p.id, url: p.url, savedName: p.name, skipped });
  notify(
    skipped
      ? `Imported “${p.name}”. ${skipped} podcast episode(s) or local file(s) aren't shown.`
      : `Imported “${p.name}”`,
  );
}
