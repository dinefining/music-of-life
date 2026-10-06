import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Rule } from '../lib/life';
import { cn } from '../lib/utils';

interface Props {
  rule: Rule;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

const PARAS = [
  "Music of Life turns Conway's Game of Life into a sequencer.",
  'Customize rules and settings, click to plant seeds, shift + drag to plant multiple, then press play to watch your forest grow.',
];
/** Never masked. */
const KEEP = 'Music of Life';

const TICK_MS = 340;
const AGE_FULL = 5;
const GREEN_SHARE = 0.3; // share of births that come up green, like key-note cells on the board
const EASE = 'cubic-bezier(0.45, 0, 0.2, 1)';

type Life = { age: number; green: boolean };

type Ch = { ch: string; i: number; locked: boolean };

/**
 * About panel, centred. Each letter is a cell: blocks are born over letters, live, age and die
 * under the current rule, the same way cells do on the board. Hover (or tap) to read it all;
 * "Music of Life" is never covered.
 */
export const InfoCard: React.FC<Props> = ({ rule, onClose, anchorRef }) => {
  const ref = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [ages, setAges] = useState<Map<number, Life>>(new Map());
  const neighbours = useRef<number[][]>([]);
  const ruleRef = useRef(rule);
  ruleRef.current = rule;

  // Split into words (kept unbreakable) of letters, each with a global index.
  const paras = useMemo(() => {
    let i = 0;
    return PARAS.map((p, pi) =>
      p.split(' ').map((w) => {
        const word: Ch[] = [...w].map((ch) => ({ ch, i: i++, locked: false }));
        i++; // the space
        return word;
      }).map((word, wi, all) => {
        // lock the letters of "Music of Life" at the start of the first paragraph
        if (pi === 0) {
          const before = all.slice(0, wi).reduce((n, w) => n + w.length + 1, 0);
          for (const c of word) c.locked = before + word.indexOf(c) < KEEP.length;
        }
        return word;
      }),
    );
  }, []);
  const cells = useMemo(() => paras.flat(2).filter((c) => !c.locked && /\S/.test(c.ch)), [paras]);

  // Build the letter grid from where the letters actually landed: rows by line, columns by x.
  useLayoutEffect(() => {
    const measure = () => {
      const root = textRef.current;
      if (!root) return;
      const els = root.querySelectorAll<HTMLElement>('[data-i]');
      const tops: number[] = [];
      const pos = new Map<number, { r: number; c: number }>();
      let cw = 0;
      els.forEach((el) => { cw += el.offsetWidth; });
      cw = cw / Math.max(1, els.length);
      els.forEach((el) => {
        const t = el.offsetTop;
        let r = tops.findIndex((x) => Math.abs(x - t) < 4);
        if (r < 0) { tops.push(t); r = tops.length - 1; }
        pos.set(Number(el.dataset.i), { r, c: Math.round(el.offsetLeft / cw) });
      });
      const at = new Map<string, number>();
      for (const c of cells) { const p = pos.get(c.i); if (p) at.set(`${p.r},${p.c}`, c.i); }
      const nb: number[][] = [];
      for (const c of cells) {
        const p = pos.get(c.i);
        const list: number[] = [];
        if (p) for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const j = at.get(`${p.r + dr},${p.c + dc}`);
          if (j !== undefined) list.push(j);
        }
        nb[c.i] = list;
      }
      neighbours.current = nb;
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (textRef.current) ro.observe(textRef.current);
    return () => ro.disconnect();
  }, [cells]);

  // Run the automaton. Text is sparse, so it gets a few random seeds whenever it thins out.
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const born = (): Life => ({ age: 0, green: Math.random() < GREEN_SHARE });
    const seed = (m: Map<number, Life>, frac: number) => {
      for (const c of cells) if (!m.has(c.i) && Math.random() < frac) m.set(c.i, born());
      return m;
    };
    setAges(seed(new Map(), 0.55));
    const id = window.setInterval(() => {
      setAges((prev) => {
        const { birth, survive } = ruleRef.current;
        const next = new Map<number, Life>();
        for (const c of cells) {
          const n = (neighbours.current[c.i] ?? []).reduce((k, j) => k + (prev.has(j) ? 1 : 0), 0);
          const cur = prev.get(c.i);
          if (cur ? survive.includes(n) : birth.includes(n)) next.set(c.i, cur ? { ...cur, age: cur.age + 1 } : born());
        }
        if (next.size < cells.length * 0.35) seed(next, 0.2);
        return next;
      });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [cells]);

  useEffect(() => {
    ref.current?.focus();
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchorRef.current?.contains(t)) return;
      if ((t as HTMLElement).tagName === 'CANVAS') e.stopPropagation();
      onClose();
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [onClose, anchorRef]);

  const reveal = hover || pinned;

  // Phones: the box fills the screen between the HUD and the button row, the close square sits
  // in its top-right corner, and the text is sized to fill the box.
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 639px)').matches);
  const [frame, setFrame] = useState({ top: 96 });
  const [fontPx, setFontPx] = useState(16);
  const boxRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const update = () => {
      setMobile(mq.matches);
      const hud = document.querySelector('[data-hud]')?.getBoundingClientRect();
      setFrame({ top: Math.round((hud?.bottom ?? 80) + 16) });
    };
    update();
    mq.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => { mq.removeEventListener('change', update); window.removeEventListener('resize', update); };
  }, []);

  // Largest size (whole px) at which the text still fits the box.
  useLayoutEffect(() => {
    if (!mobile) return;
    const fit = () => {
      const box = boxRef.current, text = textRef.current;
      if (!box || !text) return;
      let lo = 14, hi = 44;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        box.style.fontSize = `${mid}px`;
        if (text.scrollHeight <= box.clientHeight - 32 && text.scrollWidth <= text.clientWidth) lo = mid; else hi = mid - 1;
      }
      box.style.fontSize = `${lo}px`;
      setFontPx(lo);
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (boxRef.current) ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, [mobile, frame.top]);

  const closeBtn = (
    <button
      onClick={onClose}
      aria-label="Close"
      title="Close (Esc)"
      className={cn(
        'w-12 h-12 shrink-0 flex items-center justify-center group hover:bg-[#ff3b30] transition-colors focus:outline-none focus-visible:outline-1 focus-visible:outline-white',
        mobile ? 'absolute top-0 right-0 z-10 bg-[#383838]' : 'bg-[var(--panel)]',
      )}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="stroke-[#d9d9d9] group-hover:stroke-white transition-colors" strokeWidth="1.25" aria-hidden="true">
        <path d="M5.5 5.5l13 13M18.5 5.5l-13 13" />
      </svg>
    </button>
  );

  const text = (
    // Tap to pin the text readable (touch has no hover)
    <div ref={textRef} className="relative flex flex-col gap-[1em]" onClick={() => setPinned((p) => !p)}>
      {paras.map((words, pi) => (
        <p key={pi} aria-label={PARAS[pi]}>
          {/* on phones, keep the first lines clear of the close square */}
          {mobile && pi === 0 && <span className="float-right" style={{ width: 40, height: 32 }} aria-hidden="true" />}
          {words.map((word, wi) => (
            <React.Fragment key={wi}>
              <span className="whitespace-nowrap" aria-hidden="true">
                {word.map((c) => {
                  const life = ages.get(c.i);
                  const on = !!life && !reveal && !c.locked;
                  // young = bright, older = dimmer, like board cells
                  const k = life ? 1 - (Math.min(life.age, AGE_FULL) / AGE_FULL) * 0.45 : 1;
                  const bg = life?.green
                    ? `rgb(${Math.round(0x76 * k)},${Math.round(0xf0 * k)},${Math.round(0x4a * k)})`
                    : `rgb(${Math.round(255 * k)},${Math.round(255 * k)},${Math.round(255 * k)})`;
                  return (
                    <span key={c.i} data-i={c.i} className="relative transition-colors duration-300" style={{ color: c.locked ? (reveal ? '#76f04a' : '#ffffff') : reveal ? '#ffffff' : '#555555' }}>
                      {c.ch}
                      <span
                        className="absolute left-0 right-0 top-1/2 h-[1.05em] pointer-events-none"
                        style={{
                          background: bg,
                          opacity: on ? 1 : 0,
                          transform: `translateY(-50%) scale(${on ? 1 : 0.6})`,
                          transition: `opacity 420ms ${EASE}, transform 420ms ${EASE}, background-color 420ms ${EASE}`,
                        }}
                      />
                    </span>
                  );
                })}
              </span>
              {wi < words.length - 1 && ' '}
            </React.Fragment>
          ))}
        </p>
      ))}
    </div>
  );

  const typeCls = 'text-left font-medium leading-[1.4] uppercase tracking-[0.05em]';
  const dialogProps = {
    ref,
    id: 'info',
    role: 'dialog',
    'aria-label': 'About Music of Life',
    tabIndex: -1,
    onKeyDown: (e: React.KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), onClose()),
  } as const;
  const hoverProps = {
    onPointerEnter: (e: React.PointerEvent) => e.pointerType === 'mouse' && setHover(true),
    onPointerLeave: (e: React.PointerEvent) => e.pointerType === 'mouse' && setHover(false),
  };

  if (mobile) {
    return (
      <div
        {...dialogProps}
        {...hoverProps}
        className="panel-in fixed z-30 left-4 right-4 bg-[var(--panel)] focus:outline-none"
        style={{ top: frame.top, bottom: `calc(16px + 48px + var(--gap) + env(safe-area-inset-bottom, 0px))` }}
      >
        {closeBtn}
        <div ref={boxRef} className={cn('h-full overflow-hidden p-4', typeCls)} style={{ fontSize: fontPx }}>
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-8 pointer-events-none">
      {/* Close square sits above the box, right-aligned, one --gap away */}
      <div {...dialogProps} className="panel-in pointer-events-auto w-[min(480px,100%)] flex flex-col items-end gap-[var(--gap)] focus:outline-none">
        {closeBtn}
        <div
          {...hoverProps}
          className={cn(typeCls, 'w-full max-h-[calc(100dvh-64px-48px-var(--gap))] overflow-y-auto bg-[var(--panel)] p-4 text-[14px] leading-[1.55]')}
        >
          {text}
        </div>
      </div>
    </div>
  );
};
