import { useEffect, useRef, useState } from 'react';
import { activeTrip, useTripStore, type Trip } from '../store/useTripStore';
import { formatDrive } from '../lib/format';
import { CheckIcon, ChevronDownIcon, CopyIcon, PlusIcon, TrashIcon, XIcon } from './icons';

const place = (label: string) => label.split(',')[0] || '…';

function routeSummary(t: Trip): string {
  const placed = t.stops.filter((s) => s.coord);
  if (placed.length < 2) return 'No route yet';
  const via = placed.length > 2 ? ` via ${placed.length - 2}` : '';
  return `${place(placed[0].label)} → ${place(placed.at(-1)!.label)}${via}`;
}

/** Dropdown for switching between trips, plus New / Duplicate / Delete. */
export function TripMenu() {
  const trips = useTripStore((s) => s.trips);
  const current = useTripStore(activeTrip);
  const { switchTrip, addTrip, duplicateTrip, deleteTrip, clearPlaylist } = useTripStore.getState();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  const remove = () => {
    const note =
      current.source.kind === 'spotify'
        ? ' The playlist on Spotify is not affected.'
        : ' It was never saved to Spotify, so this can’t be undone.';
    if (confirm(`Delete “${current.name}” from this browser?${note}`)) deleteTrip(current.id);
  };

  return (
    <div className="trip-menu" ref={root}>
      <button className="trip-menu__toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu"
        aria-label={`Switch trip (${trips.length} trips)`} title="Your trips">
        <ChevronDownIcon />
        {trips.length > 1 && <span className="trip-menu__count">{trips.length}</span>}
      </button>
      {open && (
        <div className="trip-menu__popover" role="menu">
          <div className="trip-menu__heading">Your trips</div>
          <ul className="trip-menu__list">
            {[...trips].sort((a, b) => b.updatedAt - a.updatedAt).map((t) => {
              const ms = t.playlist.reduce((a, e) => a + e.durationMs, 0);
              return (
                <li key={t.id}>
                  <button role="menuitemradio" aria-checked={t.id === current.id} onClick={run(() => switchTrip(t.id))}
                    className={t.id === current.id ? 'is-active' : undefined}>
                    <span className="trip-menu__check">{t.id === current.id && <CheckIcon />}</span>
                    <span className="trip-menu__text">
                      <span className="trip-menu__name">{t.name || 'Untitled trip'}</span>
                      <span className="trip-menu__meta">
                        {routeSummary(t)} · {t.playlist.length} songs · {formatDrive(ms / 1000)}
                      </span>
                    </span>
                    <span className="trip-menu__tags">
                      {t.shareKey && <span className="tag">Shared</span>}
                      {t.source.kind === 'spotify' && <span className="tag tag--spotify">Spotify</span>}
                      {t.dirty && t.source.kind === 'spotify' && <span className="dot" title="Unsaved changes" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="trip-menu__actions">
            <button role="menuitem" onClick={run(() => addTrip({ name: 'New roadtrip', stops: current.stops }))}>
              <PlusIcon /> New trip on this route
            </button>
            <button role="menuitem" onClick={run(() => duplicateTrip(current.id))}>
              <CopyIcon /> Duplicate this trip
            </button>
            {current.playlist.length > 0 && (
              <button role="menuitem" onClick={run(() => confirm(`Remove all songs from “${current.name}”?`) && clearPlaylist())}>
                <XIcon /> Clear this playlist
              </button>
            )}
            <button role="menuitem" className="danger" onClick={run(remove)}>
              <TrashIcon /> Delete this trip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
