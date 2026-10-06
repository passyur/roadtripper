import { Fragment } from 'react';
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { useTripStore } from '../store/useTripStore';
import { formatDrive } from '../lib/format';
import type { SegmentResult } from '../lib/segmentRoute';
import { ExternalIcon, FlagIcon } from './icons';
import { SpotifyBar } from './SpotifyBar';
import { TrackRow } from './TrackRow';
import { TrackSearch } from './TrackSearch';

interface Props {
  segments: SegmentResult | null;
  /** Live reorder preview so the map repaints while dragging; null clears it. */
  onPreview: (move: { from: number; to: number } | null) => void;
  dragging: boolean;
}

export function PlaylistPanel({ segments, onPreview, dragging }: Props) {
  const playlist = useTripStore((s) => s.playlist);
  const selectedKey = useTripStore((s) => s.selectedKey);
  const selectionSource = useTripStore((s) => s.selectionSource);
  const hoveredKey = useTripStore((s) => s.hoveredKey);
  const playlistName = useTripStore((s) => s.playlistName);
  const source = useTripStore((s) => s.source);
  const dirty = useTripStore((s) => s.dirty);
  const { addTrack, removeEntry, moveEntry, select, hover, clearPlaylist, setPlaylistName } = useTripStore.getState();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const indexOf = (id: unknown) => playlist.findIndex((e) => e.key === id);
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (over) onPreview({ from: indexOf(active.id), to: indexOf(over.id) });
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    onPreview(null);
    if (over && active.id !== over.id) moveEntry(indexOf(active.id), indexOf(over.id));
  };

  const segByKey = new Map(segments?.songs.map((s) => [s.key, s]));
  const totalMs = playlist.reduce((a, e) => a + e.durationMs, 0);
  const arrivalIndex = segments ? playlist.findIndex((e) => segByKey.get(e.key)?.afterArrival) : -1;
  const remaining = segments ? segments.routeS - segments.musicS : 0;
  const avgS = playlist.length ? totalMs / 1000 / playlist.length : 210;

  return (
    <aside className="panel" aria-label="Playlist">
      <header className="panel__header">
        <div className="panel__title">
          <input
            className="panel__name"
            value={playlistName}
            onChange={(e) => setPlaylistName(e.target.value)}
            aria-label="Playlist name"
            spellCheck={false}
          />
          <p className="muted">
            {playlist.length} {playlist.length === 1 ? 'song' : 'songs'} · {formatDrive(totalMs / 1000)} ·{' '}
            {source.kind === 'spotify' ? (
              <a href={source.url} target="_blank" rel="noreferrer" className="panel__source">
                On Spotify <ExternalIcon />
              </a>
            ) : (
              'Draft'
            )}
            {dirty && source.kind === 'spotify' && <span className="panel__dirty"> · Unsaved changes</span>}
          </p>
        </div>
        {playlist.length > 0 && (
          <button className="link-button" onClick={clearPlaylist}>Clear</button>
        )}
      </header>

      <SpotifyBar />
      <TrackSearch onAdd={addTrack} />

      <div className="panel__list">
        {playlist.length === 0 && (
          <p className="panel__empty">Search Spotify above to add songs. They'll be laid out along the route in order, starting at A.</p>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]}
          onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => onPreview(null)}>
          <SortableContext items={playlist.map((e) => e.key)} strategy={verticalListSortingStrategy}>
            <ol className="tracks">
              {playlist.map((e, i) => (
                <Fragment key={e.key}>
                  {i === arrivalIndex && !dragging && <ArrivalDivider />}
                  <TrackRow
                    entry={e}
                    position={i + 1}
                    seg={segByKey.get(e.key)}
                    selected={selectedKey === e.key}
                    hovered={hoveredKey === e.key}
                    scrollOnSelect={selectionSource === 'map'}
                    onSelect={() => select(selectedKey === e.key ? null : e.key, 'list')}
                    onHover={(on) => hover(on ? e.key : null)}
                    onRemove={() => removeEntry(e.key)}
                  />
                </Fragment>
              ))}
            </ol>
          </SortableContext>
        </DndContext>

        {segments && remaining > 0 && playlist.length > 0 && (
          <div className="music-gap">
            <strong>Music runs out at {formatDrive(segments.musicS)}</strong>
            <span>
              {formatDrive(remaining)} of road left. About {Math.ceil(remaining / avgS)} more songs would get you there.
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}

function ArrivalDivider() {
  return (
    <li className="arrival" aria-label="Arrival">
      <FlagIcon /> <span>Arrive</span>
      <span className="arrival__rule" />
      <span className="muted">after arrival</span>
    </li>
  );
}
