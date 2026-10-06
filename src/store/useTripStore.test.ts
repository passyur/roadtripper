import { beforeEach, describe, expect, it } from 'vitest';
import { activeTrip, migrateTripState, useTripStore, type Trip } from './useTripStore';

const store = () => useTripStore.getState();
const active = () => activeTrip(store());
const track = (id: string) => ({ id, uri: `spotify:track:${id}`, title: id, artist: 'A', durationMs: 1000 });

beforeEach(() => {
  // Start every test from a single blank trip.
  const s = store();
  s.addTrip({ name: 'base' });
  for (const t of store().trips.filter((t) => t.id !== active().id)) store().deleteTrip(t.id);
});

describe('trips', () => {
  it('upgrades a v2 single-trip state into the first trip, keeping everything', () => {
    const v2 = {
      stops: [{ id: 's1', label: 'Chicago', coord: [-87.6, 41.9] }, { id: 's2', label: 'D.C.', coord: [-77, 38.9] }],
      playlist: [{ ...track('a'), key: 'k', color: '#fff' }],
      playlistName: 'My mix',
      source: { kind: 'spotify', id: 'pl', url: 'u', savedName: 'My mix', skipped: 0 },
      dirty: true,
      panelOpen: false,
    };
    const out = migrateTripState(v2, 2) as { trips: Trip[]; activeId: string; panelOpen: boolean };
    expect(out.trips).toHaveLength(1);
    expect(out.activeId).toBe(out.trips[0].id);
    expect(out.trips[0]).toMatchObject({ name: 'My mix', dirty: true, stops: v2.stops, playlist: v2.playlist, source: v2.source });
    expect(out.panelOpen).toBe(false);
  });

  it('edits only the active trip', () => {
    store().addTrack(track('a'));
    const first = active().id;
    store().addTrip({ name: 'second' });
    store().addTrack(track('b'));
    expect(store().trips.find((t) => t.id === first)!.playlist.map((e) => e.id)).toEqual(['a']);
    expect(active().playlist.map((e) => e.id)).toEqual(['b']);
  });

  it('keeps the playlist when stops change', () => {
    store().addTrack(track('a'));
    const before = active().playlist;
    store().setStop(active().stops[0].id, 'Somewhere', [1, 2]);
    expect(active().playlist).toBe(before);
    expect(active().dirty).toBe(true); // from addTrack, not from the stop edit
  });

  it('duplicates as an unlinked draft so two trips never save over one Spotify playlist', () => {
    store().markSaved(active().id, { kind: 'spotify', id: 'pl', url: 'u', savedName: 'base', skipped: 0 });
    store().addTrack(track('a'));
    const orig = active();
    store().duplicateTrip(orig.id);
    const copy = active();
    expect(copy.id).not.toBe(orig.id);
    expect(copy.source).toEqual({ kind: 'draft' });
    expect(copy.playlist.map((e) => e.id)).toEqual(['a']);
    expect(copy.playlist[0].key).not.toBe(orig.playlist[0].key);
    expect(copy.stops[0].id).not.toBe(orig.stops[0].id);
  });

  it('marks the saved trip, even after switching away mid-save', () => {
    const saving = active().id;
    store().addTrack(track('a'));
    store().addTrip({ name: 'other' });
    store().markSaved(saving, { kind: 'spotify', id: 'pl', url: 'u', savedName: 'base', skipped: 0 });
    expect(store().trips.find((t) => t.id === saving)).toMatchObject({ dirty: false, source: { kind: 'spotify', id: 'pl' } });
    expect(active().source).toEqual({ kind: 'draft' });
  });

  it('switches to the most recently edited trip when the active one is deleted', () => {
    const a = active().id;
    store().addTrip({ name: 'b' });
    const b = active().id;
    store().addTrip({ name: 'c' });
    store().switchTrip(a);
    store().addTrack(track('x')); // a is now most recent
    store().switchTrip(b);
    store().deleteTrip(b);
    expect(active().id).toBe(a);
  });

  it('never leaves the list empty', () => {
    store().deleteTrip(active().id);
    expect(store().trips).toHaveLength(1);
    expect(active().name).toBe('New roadtrip');
  });
});
