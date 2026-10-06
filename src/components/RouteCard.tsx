import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { MAX_STOPS, useTripStore } from '../store/useTripStore';
import { formatDrive, formatMiles } from '../lib/format';
import type { SegmentResult } from '../lib/segmentRoute';
import type { Stop } from '../lib/types';
import { PlaceInput } from './PlaceInput';
import { GripIcon, PlusIcon, XIcon } from './icons';

export function RouteCard({ segments }: { segments: SegmentResult | null }) {
  const stops = useTripStore((s) => s.stops);
  const route = useTripStore((s) => s.route);
  const status = useTripStore((s) => s.routeStatus);
  const error = useTripStore((s) => s.routeError);
  const addWaypoint = useTripStore((s) => s.addWaypoint);
  const moveStop = useTripStore((s) => s.moveStop);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    moveStop(stops.findIndex((s) => s.id === active.id), stops.findIndex((s) => s.id === over.id));
  };

  return (
    <section className="route-card" aria-label="Route">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}>
        <SortableContext items={stops.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <ol className="stops">
            {stops.map((s, i) => (
              <StopRow key={s.id} stop={s} index={i} count={stops.length} near={stops[i - 1]?.coord ?? stops[i + 1]?.coord ?? undefined} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      {stops.length < MAX_STOPS && (
        <button className="link-button" onClick={addWaypoint}>
          <PlusIcon /> Add stop
        </button>
      )}

      <div className="route-summary" aria-live="polite">
        {status === 'loading' && <span className="muted">Finding route…</span>}
        {status === 'error' && <span className="error">{error}</span>}
        {status === 'ready' && route && segments && (
          <>
            <Stat label="Drive" value={formatDrive(route.durationS)} />
            <Stat label="Distance" value={formatMiles(route.distanceM)} />
            <Stat label="Music" value={formatDrive(segments.musicS)} />
            <Coverage music={segments.musicS} drive={segments.routeS} />
          </>
        )}
        {status === 'idle' && <span className="muted">Pick a start and destination</span>}
      </div>
    </section>
  );
}

function StopRow({ stop, index, count, near }: { stop: Stop; index: number; count: number; near?: [number, number] }) {
  const setStop = useTripStore((s) => s.setStop);
  const removeStop = useTripStore((s) => s.removeStop);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: stop.id });

  const kind = index === 0 ? 'start' : index === count - 1 ? 'end' : 'via';
  const badge = kind === 'start' ? 'A' : kind === 'end' ? 'B' : String(index);
  const placeholder = kind === 'start' ? 'Starting point' : kind === 'end' ? 'Destination' : 'Add a stop';

  return (
    <li
      ref={setNodeRef}
      className={`stop${isDragging ? ' is-dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <button className="handle" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={`Reorder ${placeholder.toLowerCase()}`}>
        <GripIcon />
      </button>
      <span className={`stop-badge stop-badge--${kind}`}>{badge}</span>
      <PlaceInput
        label={stop.label}
        placeholder={placeholder}
        near={near}
        autoFocus={!stop.label}
        onPick={(label, coord) => setStop(stop.id, label, coord)}
      />
      {count > 2 && (
        <button className="icon-button" onClick={() => removeStop(stop.id)} aria-label={`Remove ${stop.label || 'stop'}`}>
          <XIcon />
        </button>
      )}
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
    </div>
  );
}

function Coverage({ music, drive }: { music: number; drive: number }) {
  const pct = drive > 0 ? Math.min(1, music / drive) : 0;
  const text = music >= drive ? 'Playlist covers the whole drive' : `${formatDrive(drive - music)} without music`;
  return (
    <div className="coverage" title={text}>
      <div className="coverage__bar"><div style={{ width: `${pct * 100}%` }} /></div>
      <span className="coverage__text">{text}</span>
    </div>
  );
}
