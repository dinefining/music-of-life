import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Rule } from '../lib/life';
import { cn } from '../lib/utils';

interface Props {
  rule: Rule;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

/**
 * Paragraphs as runs. 'title' and 'credit' letters are never masked: the title is white and
 * turns green when you read; the credit stays white with its links always green.
 */
type Kind = 'title' | 'credit' | 'text';
type Run = { text: string; kind: Kind; href?: string };
const PARAS: Run[][] = [
  [{ text: 'Music of Life', kind: 'title' }, { text: " turns Conway's Game of Life into a sequencer.", kind: 'text' }],
  [{ text: 'Customize rules and settings, click to plant seeds, shift + drag to plant multiple, then press play to watch your forest grow.', kind: 'text' }],
  [
    { text: 'A ', kind: 'credit' },
    { text: 'maybe machine', kind: 'credit', href: 'https://ravipopat.info/maybe-machines' },
    { text: ' by ', kind: 'credit' },
    { text: 'Ravi Popat', kind: 'credit', href: 'https://ravipopat.info' },
    { text: '.', kind: 'credit' },
  ],
];
const PARA_TEXT = PARAS.map((runs) => runs.map((r) => r.text).join(''));

const TICK_MS = 340;
const AGE_FULL = 5;
const GREEN_SHARE = 0.3; // share of births that come up green, like key-note cells on the board
const EASE = 'cubic-bezier(0.45, 0, 0.2, 1)';

type Life = { age: number; green: boolean };
const GREEN = '#76f04a';
/**
 * Lay a paragraph out as pieces that are either plain text or one whole link.
 * A piece holds word fragments and the spaces between them; a space between a link and plain
 * text goes with the plain text, so a link never carries a trailing space.
 */
type Piece<T> = { href?: string; parts: (T[] | ' ')[] };
function toPieces<T extends { href?: string }>(words: T[][]): Piece<T>[] {
  const out: Piece<T>[] = [];
  words.forEach((word, wi) => {
    // split the word where the link changes ("Popat" + ".")
    const groups: T[][] = [];
    for (const c of word) {
      const g = groups[groups.length - 1];
      if (g && g[0].href === c.href) g.push(c);
      else groups.push([c]);
    }
    groups.forEach((g, gi) => {
      const href = g[0].href;
      const last = out[out.length - 1];
      const space = gi === 0 && wi > 0;
      if (last && last.href === href) {
        if (space) last.parts.push(' ');
        last.parts.push(g);
      } else {
        const piece: Piece<T> = { href, parts: [] };
        if (space) (href && last && !last.href ? last.parts : piece.parts).push(' ');
        piece.parts.push(g);
        out.push(piece);
      }
    });
  });
  return out;
}

type Ch = { ch: string; i: number; locked: boolean; kind: Kind; href?: string };

/**
 * About panel. Each letter is a cell: blocks are born over letters, live, age and die
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
    return PARAS.map((runs) => {
      const words: Ch[][] = [[]];
      for (const r of runs)
        for (const ch of r.text) {
          if (ch === ' ') { words.push([]); i++; continue; }
          words[words.length - 1].push({ ch, i: i++, kind: r.kind, href: r.href, locked: r.kind !== 'text' });
        }
      return words.filter((w) => w.length);
    });
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

  const text = (
    // Tap to pin the text readable (touch has no hover)
    <div ref={textRef} className="relative flex flex-col gap-[1.2em]" onClick={() => setPinned((p) => !p)}>
      {paras.map((words, pi) => (
        <p key={pi} aria-label={PARA_TEXT[pi]} >
          {toPieces<Ch>(words).map((piece, pi2) => {
            const body = piece.parts.map((part, k) =>
              part === ' ' ? ' ' : (
                <span key={k} className="whitespace-nowrap">
                  {part.map((c) => {
                    const life = ages.get(c.i);
                    const on = !!life && !reveal && !c.locked;
                    // young = bright, older = dimmer, like board cells
                    const kk = life ? 1 - (Math.min(life.age, AGE_FULL) / AGE_FULL) * 0.45 : 1;
                    const bg = life?.green
                      ? `rgb(${Math.round(0x76 * kk)},${Math.round(0xf0 * kk)},${Math.round(0x4a * kk)})`
                      : `rgb(${Math.round(255 * kk)},${Math.round(255 * kk)},${Math.round(255 * kk)})`;
                    const color =
                      c.kind === 'title' ? (reveal ? GREEN : '#ffffff')
                      : c.kind === 'credit' ? (c.href ? GREEN : '#ffffff')
                      : reveal ? '#ffffff' : '#7a7a7a';
                    return (
                      <span key={c.i} data-i={c.i} aria-hidden="true" className="relative transition-colors duration-300" style={{ color }}>
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
              ),
            );
            // one link per phrase ("maybe machine", "Ravi Popat"), spaces inside it included
            return piece.href ? (
              <a key={pi2} href={piece.href} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} className="hover:opacity-70 transition-opacity focus:outline-none focus-visible:underline">
                {body}
              </a>
            ) : (
              <React.Fragment key={pi2}>{body}</React.Fragment>
            );
          })}
        </p>
      ))}
    </div>
  );

  /**
   * Full-screen veil over the board (it stays faintly visible), the text centred on it with no box.
   * The info button stays put and turns into the close button, so nothing else moves.
   */
  return (
    <div
      ref={ref}
      id="info"
      role="dialog"
      aria-label="About Music of Life"
      tabIndex={-1}
      onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), onClose())}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="info-veil fixed inset-0 flex items-center justify-center px-4 sm:px-8 bg-black/85 focus:outline-none"
    >
      <div
        onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(false)}
        className="w-full max-w-[520px] max-h-[calc(100dvh-160px)] overflow-y-auto text-left text-[length:var(--info-fs)] leading-[1.6] font-medium"
      >
        {text}
      </div>
    </div>
  );
};
