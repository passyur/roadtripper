// Bright, distinguishable hues that read well on a dark basemap.
export const SONG_COLORS = [
  '#1db954', '#f59e0b', '#38bdf8', '#f472b6', '#a78bfa', '#facc15',
  '#fb7185', '#34d399', '#60a5fa', '#fb923c', '#c084fc', '#2dd4bf',
];

/** Pick a color that differs from both neighbours so adjacent segments never blend. */
export function pickColor(prev?: string, next?: string, seed = Math.random()): string {
  const options = SONG_COLORS.filter((c) => c !== prev && c !== next);
  return options[Math.floor(seed * options.length) % options.length];
}
