import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/utils';

export type Group = { label?: string; items: string[] };

interface Props {
  id: string;
  value: string;
  groups: Group[];
  onChange: (v: string) => void;
  /** Apply the highlighted item live while browsing; Esc / click-away reverts. */
  livePreview?: boolean;
  /** Extra content on the right of each row (and of the closed field). */
  renderRight?: (item: string) => React.ReactNode;
  /** Single key that opens the menu from anywhere. */
  hotkey?: string;
  /** Which way the list opens. Panel fields sit at the bottom of the screen, so 'up' is the default. */
  direction?: 'up' | 'down';
  /** 'light' = inverted field (light grey, bold dark text, solid triangle), used on the rules card. */
  variant?: 'dark' | 'light';
  /** Accessible name when there's no visible <label>. */
  label?: string;
  /** Display text for an item (ids stay as given). */
  format?: (item: string) => string;
}

/** A grey field that opens an upward list, in the panel's style. */
export const Dropdown: React.FC<Props> = ({ id, value, groups, onChange, livePreview, renderRight, hotkey, direction = 'up', variant = 'dark', label, format = (v: string) => v }) => {
  const items = groups.flatMap((g) => g.items);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(value);
  const [maxH, setMaxH] = useState(420);
  // The list is portalled to <body> and positioned against the field, so a scrolling panel can't clip it.
  const [pos, setPos] = useState<React.CSSProperties>({});
  const original = useRef(value);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const openMenu = () => {
    // Keep the list inside the page margins (16px mobile / 32px desktop), whichever way it opens.
    place();
    original.current = value;
    setHi(value);
    setOpen(true);
  };
  /**
   * Which way to open: the preferred direction if the whole list fits there,
   * otherwise whichever side of the field has more room (e.g. fields near the top of a phone panel open down).
   */
  function measure() {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return null;
    const margin = window.innerWidth < 640 ? 16 : 32;
    const gap = 3; // --gap
    const up = r.top - margin - gap;
    const down = window.innerHeight - r.bottom - margin - gap;
    const rows = items.length + groups.filter((g) => g.label).length;
    const need = Math.min(420, rows * r.height);
    const pref = direction === 'up' ? up : down;
    const dir = (pref >= need ? direction : up >= down ? 'up' : 'down') as 'up' | 'down';
    return { r, gap, dir, room: dir === 'up' ? up : down };
  }
  const [dir, setDir] = useState<'up' | 'down'>(direction);
  // keep the triangle pointing the way the list will actually open
  useLayoutEffect(() => {
    const update = () => { const m = measure(); if (m) setDir((d) => (d === m.dir ? d : m.dir)); };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  });
  function place() {
    const m = measure();
    if (!m) return;
    const { r, gap, room } = m;
    setDir(m.dir);
    setMaxH(Math.max(90, Math.min(420, room)));
    setPos(
      m.dir === 'up'
        ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + gap }
        : { left: r.left, width: r.width, top: r.bottom + gap },
    );
  }
  const commit = (v: string) => {
    onChange(v);
    original.current = v;
    setOpen(false);
  };
  const cancel = () => {
    if (livePreview) onChange(original.current);
    setOpen(false);
  };
  const move = (v: string) => {
    setHi(v);
    if (livePreview) onChange(v);
  };

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    itemRefs.current[value]?.scrollIntoView({ block: 'center' });
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !listRef.current?.contains(t)) cancel();
    };
    // the field may move (panel scroll, resize): follow it
    const follow = (e: Event) => { if (e.target !== listRef.current) place(); };
    document.addEventListener('pointerdown', away);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', follow, true);
    return () => {
      document.removeEventListener('pointerdown', away);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', follow, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) itemRefs.current[hi]?.scrollIntoView({ block: 'nearest' });
  }, [hi, open]);

  useEffect(() => {
    if (!hotkey) return;
    const onKey = (e: KeyboardEvent) => {
      if (open || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT') return;
      if (e.key.toLowerCase() === hotkey) {
        e.preventDefault();
        openMenu();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onListKey = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    const i = items.indexOf(hi);
    if (e.key === 'ArrowDown') { e.preventDefault(); move(items[Math.min(items.length - 1, i + 1)]); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(items[Math.max(0, i - 1)]); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commit(hi); }
    else if (e.key === 'Escape' || e.key.toLowerCase() === hotkey) { e.preventDefault(); cancel(); }
  };

  return (
    <div ref={rootRef} className="relative w-full min-w-0" data-menu>
      <button
        id={id}
        onClick={() => (open ? cancel() : openMenu())}
        aria-haspopup="listbox"
        aria-label={label ? `${label}: ${format(value)}` : undefined}
        aria-expanded={open}
        className={cn(
          'w-full flex items-center justify-between gap-3 text-left',
          variant === 'light'
            ? 'h-[30px] px-3 bg-[#d9d9d9] hover:bg-white text-black text-[13px] font-semibold uppercase tracking-[0.03em] transition-colors focus:outline-none focus-visible:outline-1 focus-visible:outline-white focus-visible:outline-offset-1'
            : cn('field', open && 'field-open'),
        )}
      >
        <span className="truncate">{format(value)}</span>
        <span className="flex items-center gap-2.5 shrink-0">
          {renderRight?.(value)}
          <svg
            width="8"
            height="6"
            viewBox="0 0 8 6"
            className={cn('transition-opacity', variant === 'light' ? 'text-black' : 'text-white/70', open && 'opacity-30')}
            aria-hidden="true"
          >
            {/* points the way the list opens */}
            <path d={dir === 'up' ? 'M0 6h8L4 0z' : 'M0 0h8L4 6z'} fill="currentColor" />
          </svg>
        </span>
      </button>

      {open && createPortal(
        <div
          ref={listRef}
          data-dropdown-list
          role="listbox"
          tabIndex={-1}
          aria-labelledby={id}
          aria-activedescendant={`${id}-${hi}`}
          onKeyDown={onListKey}
          onMouseLeave={() => livePreview && move(original.current)}
          style={{ maxHeight: maxH, ...pos }}
          className={cn(
            'fixed overflow-y-auto overscroll-contain z-50 text-white text-left normal-case tracking-normal focus:outline-none',
            variant === 'light'
              ? 'bg-[#d9d9d9] [scrollbar-width:thin] [scrollbar-color:rgba(0,0,0,.35)_transparent]'
              : 'bg-[var(--field)] [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,.3)_transparent]',
          )}
        >
          {groups.map((g, gi) => (
            <div key={gi} role="group" aria-label={g.label}>
              {g.label && (
                <div
                  className={cn(
                    // same height as a row, text centred; its own darker shade so it reads as a heading
                    'sticky top-0 z-10 flex items-center leading-none text-[10px] tracking-[0.14em]',
                    variant === 'light' ? 'h-[30px] px-3 bg-[#c4c4c4] text-black/55' : 'h-[var(--field-h)] px-[var(--field-px)] bg-[#1f1f1f] text-white/55',
                  )}
                >
                  {g.label}
                </div>
              )}
              {g.items.map((it) => (
                <button
                  key={it}
                  id={`${id}-${it}`}
                  ref={(el) => (itemRefs.current[it] = el)}
                  role="option"
                  aria-selected={it === original.current}
                  tabIndex={-1}
                  onMouseEnter={() => move(it)}
                  onClick={() => commit(it)}
                  className={cn(
                    'w-full flex items-center justify-between gap-3 text-left',
                    variant === 'light'
                      ? cn(
                          'h-[30px] px-3 text-[13px] font-semibold uppercase tracking-[0.03em] text-black',
                          it === original.current ? 'bg-white' : it === hi ? 'bg-[#c6c6c6]' : '',
                        )
                      : cn(
                          'h-[var(--field-h)] px-[var(--field-px)] text-[length:var(--field-fs)] font-semibold uppercase tracking-[0.04em]',
                          // selected = the same grey as a selected segmented button; hover = the field hover grey
                          it === original.current ? 'bg-[#4a4a4a] text-white' : it === hi ? 'bg-[var(--field-hover)] text-white' : 'text-white/60',
                        ),
                  )}
                >
                  <span className="truncate">{format(it)}</span>
                  {renderRight?.(it)}
                </button>
              ))}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
};
