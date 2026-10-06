import { useEffect, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { formatDrive, formatTrack } from '../lib/format';
import type { SongSegment } from '../lib/segmentRoute';
import type { PlaylistEntry } from '../lib/types';
import { GripIcon, XIcon } from './icons';

interface Props {
  entry: PlaylistEntry;
  position: number;
  seg?: SongSegment;
  selected: boolean;
  hovered: boolean;
  scrollOnSelect: boolean;
  onSelect: () => void;
  onHover: (on: boolean) => void;
  onRemove: () => void;
}

export function TrackRow({ entry, position, seg, selected, hovered, scrollOnSelect, onSelect, onHover, onRemove }: Props) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: entry.key });
  const rowRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (selected && scrollOnSelect) rowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected, scrollOnSelect]);

  const cls = ['track', selected && 'is-selected', hovered && 'is-hovered', isDragging && 'is-dragging', seg?.afterArrival && 'is-after']
    .filter(Boolean)
    .join(' ');

  return (
    <li
      ref={(el) => {
        setNodeRef(el);
        rowRef.current = el;
      }}
      className={cls}
      style={{ transform: CSS.Translate.toString(transform), transition, '--song': entry.color } as React.CSSProperties}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <button className="handle" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={`Reorder ${entry.title}`}>
        <GripIcon />
      </button>
      <button className="track__main" onClick={onSelect} aria-pressed={selected}>
        <span className="track__swatch" aria-hidden />
        {entry.imageUrl ? (
          <img className="track__art" src={entry.imageUrl} alt="" />
        ) : (
          <span className="track__art track__art--blank" aria-hidden>{position}</span>
        )}
        <span className="track__text">
          <span className="track__title">{entry.title}</span>
          <span className="track__artist">{entry.artist}</span>
        </span>
        <span className="track__times">
          <span className="track__at">
            {seg ? (seg.afterArrival ? 'after arrival' : `@ ${formatDrive(seg.startS)}`) : ''}
          </span>
          <span className="track__dur">{formatTrack(entry.durationMs)}</span>
        </span>
      </button>
      <button className="icon-button track__remove" onClick={onRemove} aria-label={`Remove ${entry.title}`}>
        <XIcon />
      </button>
      {seg?.cutByArrival && <span className="track__note">You arrive during this song</span>}
    </li>
  );
}
