import { useEffect, useState } from 'react';
import { searchTracks } from '../lib/spotify';
import { formatTrack } from '../lib/format';
import type { Track } from '../lib/types';
import { PlusIcon, SearchIcon } from './icons';

/** Spotify catalog search; works logged out via the app-token proxy. */
export function TrackSearch({ onAdd }: { onAdd: (t: Track) => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [results, setResults] = useState<Track[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      setStatus('idle');
      return;
    }
    setStatus('loading');
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchTracks(q, ctrl.signal)
        .then((r) => {
          setResults(r);
          setActive(0);
          setStatus('done');
        })
        .catch((e: Error) => {
          if (e.name === 'AbortError') return;
          setError(e.message);
          setStatus('error');
        });
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const add = (t: Track) => {
    onAdd(t);
    setQ('');
  };

  return (
    <div className="track-search">
      <label className="track-search__field">
        <SearchIcon />
        <input
          value={q}
          placeholder="Search Spotify to add songs…"
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter' && results[active]) {
              add(results[active]);
            } else if (e.key === 'Escape') {
              setQ('');
            }
          }}
        />
      </label>
      {focused && q.trim() && (
        // While a newer query loads, the previous results stay up but dimmed so they aren't mistaken for the new ones.
        <ul className={`track-search__results${status === 'loading' ? ' is-stale' : ''}`} role="listbox" aria-busy={status === 'loading'}>
          {status === 'loading' && results.length === 0 && <li className="track-search__empty">Searching…</li>}
          {status === 'error' && <li className="track-search__empty error">{error}</li>}
          {status === 'done' && results.length === 0 && <li className="track-search__empty">No songs found</li>}
          {results.map((t, i) => (
            <li key={t.id} role="option" aria-selected={i === active} className={i === active ? 'is-active' : undefined}
              onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => add(t)}>
              {t.imageUrl ? <img className="track-search__art" src={t.imageUrl} alt="" /> : <span className="track-search__art" />}
              <span className="track-search__text">
                <span className="track__title">{t.title}</span>
                <span className="track__artist">{t.artist}</span>
              </span>
              <span className="track__dur">{formatTrack(t.durationMs)}</span>
              <PlusIcon />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
