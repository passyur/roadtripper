const base = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true } as const;
const stroke = { stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const GripIcon = () => (
  <svg {...base}>
    {[5, 8, 11].flatMap((y) => [6, 10].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r={1.1} fill="currentColor" />))}
  </svg>
);

export const PlusIcon = () => (
  <svg {...base}><path d="M8 3.5v9M3.5 8h9" {...stroke} /></svg>
);

export const XIcon = () => (
  <svg {...base}><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" {...stroke} /></svg>
);

export const SearchIcon = () => (
  <svg {...base}><circle cx="7" cy="7" r="4.25" {...stroke} /><path d="M10.2 10.2l3.3 3.3" {...stroke} /></svg>
);

export const ListIcon = () => (
  <svg {...base}><path d="M5.5 4.5h8M5.5 8h8M5.5 11.5h8" {...stroke} /><circle cx="2.75" cy="4.5" r=".9" fill="currentColor" /><circle cx="2.75" cy="8" r=".9" fill="currentColor" /><circle cx="2.75" cy="11.5" r=".9" fill="currentColor" /></svg>
);

export const ChevronRightIcon = () => (
  <svg {...base}><path d="M6 3.5L10.5 8 6 12.5" {...stroke} /></svg>
);

export const FlagIcon = () => (
  <svg {...base}><path d="M3.5 14V2.5M3.5 3h8.5l-2 3 2 3H3.5" {...stroke} /></svg>
);

export const SpotifyIcon = () => (
  <svg {...base}>
    <circle cx="8" cy="8" r="7" fill="currentColor" />
    <path d="M4.3 6.1c2.5-.8 5.2-.5 7.4.7M4.8 8.3c2-.6 4.2-.4 6 .6M5.3 10.4c1.6-.4 3.2-.3 4.6.5" stroke="var(--spotify-ink, #000)" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

export const ExternalIcon = () => (
  <svg {...base} width={12} height={12}><path d="M6.5 3.5h-3v9h9v-3M9 3.5h3.5V7M12.5 3.5L7.5 8.5" {...stroke} /></svg>
);
