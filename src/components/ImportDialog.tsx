import { useEffect, useRef, useState } from 'react';
import { getEditablePlaylists, type PlaylistSummary } from '../lib/spotify';
import { importPlaylist } from '../store/spotifyActions';
import { useTripStore } from '../store/useTripStore';
import { XIcon } from './icons';

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const user = useTripStore((s) => s.user)!;
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
    getEditablePlaylists(user).then(setPlaylists, (e: Error) => setError(e.message));
  }, [user]);

  const pick = async (p: PlaylistSummary) => {
    setLoadingId(p.id);
    try {
      await importPlaylist(p);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setLoadingId(null);
    }
  };

  const shown = playlists?.filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <dialog ref={dialog} className="import-dialog" onClose={onClose} onClick={(e) => e.target === dialog.current && onClose()}>
      <header>
        <h2>Import a playlist</h2>
        <button className="icon-button" onClick={onClose} aria-label="Close"><XIcon /></button>
      </header>
      <p className="muted">Playlists you own or collaborate on. Spotify doesn't let apps read other people's playlists.</p>
      <input className="import-dialog__filter" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} autoFocus />
      <ul className="import-dialog__list">
        {error && <li className="error">{error}</li>}
        {!playlists && !error && <li className="muted">Loading your playlists…</li>}
        {shown?.length === 0 && <li className="muted">No playlists found</li>}
        {shown?.map((p) => (
          <li key={p.id}>
            <button disabled={loadingId !== null} onClick={() => pick(p)}>
              {p.imageUrl ? <img src={p.imageUrl} alt="" /> : <span className="import-dialog__blank" />}
              <span className="import-dialog__text">
                <span className="track__title">{p.name}</span>
                <span className="track__artist">{loadingId === p.id ? 'Loading…' : `${p.total} ${p.total === 1 ? 'item' : 'items'}`}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
