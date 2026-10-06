import { useEffect, useState } from 'react';
import { decodeTrip, encodeTrip, SHARE_PREFIX, shareKey, shareUrl } from '../lib/share';
import { notify, notifyError } from './useNotice';
import { activeTrip, useTripStore } from './useTripStore';

/** If the URL carries a shared trip, add it (or switch to the copy already open) and clean the URL. */
export async function openSharedTripFromUrl(): Promise<void> {
  if (!location.hash.startsWith(SHARE_PREFIX)) return;
  const data = location.hash.slice(SHARE_PREFIX.length);
  history.replaceState(null, '', location.pathname + location.search);

  const trip = await decodeTrip(data);
  if (!trip) {
    notifyError("That share link couldn't be read. It may have been cut off when it was copied.");
    return;
  }
  const key = await shareKey(data);
  const state = useTripStore.getState();
  const existing = state.trips.find((t) => t.shareKey === key);
  if (existing) {
    state.switchTrip(existing.id);
    notify(`Opened “${existing.name}”, which you'd already added from this link`);
    return;
  }
  state.addTrip({
    name: trip.name,
    stops: trip.stops.length >= 2 ? trip.stops.map((s, i) => ({ id: String(i), ...s })) : undefined,
    tracks: trip.tracks,
    shareKey: key,
  });
  notify(`Added shared trip “${trip.name}”`);
}

/**
 * Copy (or, on phones, share) a prebuilt link. Must run synchronously inside the click handler:
 * Safari only allows clipboard writes and the share sheet during the user's gesture, so the link
 * is encoded ahead of time (see useShareLink) rather than after the click.
 */
export function shareLink(url: string, title: string): void {
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    navigator.share({ title, url }).catch((e: Error) => {
      if (e.name !== 'AbortError') manualCopy(url); // AbortError = share sheet dismissed
    });
    return;
  }
  if (!navigator.clipboard) return manualCopy(url);
  navigator.clipboard.writeText(url).then(
    () => notify('Link copied. Anyone with it can open this trip.'),
    () => manualCopy(url),
  );
}

/** Last resort when the browser refuses clipboard access: let the user copy it themselves. */
function manualCopy(url: string): void {
  prompt('Copy this link to share the trip:', url);
}

/** Keeps a share link for the active trip encoded and ready, so clicking Share needs no async work. */
export function useShareLink(): string | null {
  const trip = useTripStore(activeTrip);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    setUrl(null);
    const t = setTimeout(() => {
      encodeTrip(trip.name, trip.stops, trip.playlist)
        .then((data) => current && setUrl(shareUrl(data)))
        .catch(notifyError);
    }, 150);
    return () => {
      current = false;
      clearTimeout(t);
    };
  }, [trip.name, trip.stops, trip.playlist]);
  return url;
}
