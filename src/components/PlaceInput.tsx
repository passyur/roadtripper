import { useEffect, useId, useRef, useState } from 'react';
import { searchPlaces, type Place } from '../lib/mapbox';
import type { LngLat } from '../lib/types';

interface Props {
  label: string;
  placeholder: string;
  near?: LngLat;
  autoFocus?: boolean;
  onPick: (label: string, coord: LngLat) => void;
}

export function PlaceInput({ label, placeholder, near, autoFocus, onPick }: Props) {
  const [text, setText] = useState(label);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  const [active, setActive] = useState(0);
  const [error, setError] = useState(false);
  const listId = useId();
  const typed = useRef(false);

  useEffect(() => setText(label), [label]);

  useEffect(() => {
    if (!typed.current) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchPlaces(text, near, ctrl.signal)
        .then((r) => {
          setResults(r);
          setActive(0);
          setError(false);
        })
        .catch((e) => {
          if (e.name !== 'AbortError') setError(true);
        });
    }, 220);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // `near` only biases results; don't re-query when it changes.
  }, [text]);

  const pick = (p: Place) => {
    const full = p.detail ? `${p.name}, ${p.detail}` : p.name;
    typed.current = false;
    setText(full);
    setOpen(false);
    setResults([]);
    onPick(full, p.coord);
  };

  const showList = open && (results.length > 0 || error);

  return (
    <div className="place-input">
      <input
        value={text}
        placeholder={placeholder}
        autoFocus={autoFocus}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        onChange={(e) => {
          typed.current = true;
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={(e) => {
          e.target.select();
          setOpen(true);
        }}
        onBlur={() => {
          // Abandoning an edit restores the last pick (suggestion clicks don't blur; see onMouseDown).
          setOpen(false);
          typed.current = false;
          setText(label);
          setResults([]);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && results[active]) {
            e.preventDefault();
            pick(results[active]);
          } else if (e.key === 'Escape') {
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {showList && (
        <ul className="place-input__list" id={listId} role="listbox">
          {error && <li className="place-input__empty">Search unavailable</li>}
          {results.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'is-active' : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(p)}
            >
              <span className="place-input__name">{p.name}</span>
              <span className="place-input__detail">{p.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
