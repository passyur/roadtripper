/** 3:07 for track lengths. */
export function formatTrack(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "2h 05m" / "14m" / "45s" for positions along the drive. */
export function formatDrive(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export function formatMiles(meters: number): string {
  return `${Math.round(meters / 1609.344).toLocaleString()} mi`;
}
