import React, { useEffect, useRef, useState } from 'react';
import { Rule, RULES, RULE_NAMES, RULE_LABELS } from '../lib/life';
import { Dropdown } from './Dropdown';
import { cn } from '../lib/utils';

interface Props {
  rule: Rule;
  onRuleChange: (r: Rule) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

const EMPTY = '#3a3a3a';
const NEIGHBOUR = '#8f8f8f';
const LIVE = '#ffffff';
const BORN = '#76f04a';
const DIES = '#e03a2a';
const COUNTS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const CUSTOM = 'custom';

const same = (a: number[], b: number[]) => a.length === b.length && a.every((n, i) => n === b[i]);
/** Name of the preset this rule matches, or 'custom'. */
const presetOf = (r: Rule) => RULE_NAMES.find((n) => same(RULES[n].birth, r.birth) && same(RULES[n].survive, r.survive)) ?? CUSTOM;

// Order neighbours are filled in for an example with n of them (indices into the 3×3; 4 = centre).
const FILL = [1, 5, 6, 3, 0, 8, 2, 7];

type Outcome = 'born' | 'lives on' | 'dies';
type Example = { n: number; alive: boolean; outcome: Outcome };

/** Every birth, every survival, and the two deaths that bracket survival (too few, too many). */
function examplesFor(rule: Rule): Example[] {
  const out: Example[] = [];
  for (const n of rule.birth) out.push({ n, alive: false, outcome: 'born' });
  for (const n of rule.survive) out.push({ n, alive: true, outcome: 'lives on' });
  const deaths = COUNTS.filter((n) => !rule.survive.includes(n));
  let picks: number[];
  if (!rule.survive.length) picks = [1, 3];
  else {
    const low = Math.min(...rule.survive);
    const lonely = deaths.filter((n) => n < low).pop();
    const crowded = deaths.find((n) => n > low);
    picks = [lonely, crowded].filter((n): n is number => n !== undefined);
  }
  for (const n of picks) out.push({ n, alive: true, outcome: 'dies' });
  return out;
}

const STEP_MS = 260;
const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** One shared clock for every example so they move together. */
function useSteps() {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setT((x) => x + 1), STEP_MS);
    return () => window.clearInterval(id);
  }, []);
  return t;
}

/**
 * A 3x3 neighbourhood that plays the rule on a loop: the centre in its starting state, neighbours
 * arriving one at a time, a beat, then the centre turns into the outcome and holds.
 */
const Grid: React.FC<{ n: number; alive: boolean; outcome: Outcome; t: number }> = ({ n, alive, outcome, t }) => {
  const HOLD_START = 2, PAUSE = 2, HOLD_END = 5;
  const cycle = HOLD_START + n + PAUSE + HOLD_END;
  const k = reduced ? cycle - 1 : t % cycle;
  const shown = Math.max(0, Math.min(n, k - HOLD_START + 1));
  const done = k >= HOLD_START + n + PAUSE;
  const nb = FILL.slice(0, shown);
  const start = alive ? LIVE : EMPTY;
  const at = k - (HOLD_START + n + PAUSE); // steps since the outcome
  // a dying cell holds red for a moment, then is removed; a survivor simply stays white
  const end = outcome === 'born' ? BORN : outcome === 'lives on' ? LIVE : at < 3 ? DIES : EMPTY;
  return (
    <span className="grid grid-cols-3 gap-[var(--gap)]" aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => {
        const bg = i === 4 ? (done ? end : start) : nb.includes(i) ? NEIGHBOUR : EMPTY;
        return (
          <span
            key={i}
            className="w-[var(--ex-cell)] h-[var(--ex-cell)]"
            style={{ background: bg, transition: 'background-color 220ms cubic-bezier(0.45,0,0.2,1)' }}
          />
        );
      })}
    </span>
  );
};

/** A row of nine toggles, one per neighbour count. */
const CountRow: React.FC<{ label: string; on: number[]; tone: 'born' | 'live'; onToggle: (n: number) => void }> = ({ label, on, tone, onToggle }) => (
  <div className="flex flex-col gap-1.5">
    <span className="label" style={{ color: tone === 'born' ? BORN : 'var(--ink)' }} id={`row-${tone}`}>
      {label}
    </span>
    <div className="grid grid-cols-9 gap-[var(--gap)]" role="group" aria-labelledby={`row-${tone}`}>
      {COUNTS.map((n) => {
        const active = on.includes(n);
        return (
          <button
            key={n}
            onClick={() => onToggle(n)}
            aria-pressed={active}
            aria-label={`${n} neighbours`}
            className={cn(
              'field !px-0 tabular-nums focus:outline-none focus-visible:outline-1 focus-visible:outline-white',
              active ? '!text-black' : 'text-white/55 hover:text-white',
            )}
            style={active ? { background: tone === 'born' ? BORN : LIVE } : undefined}
          >
            {n}
          </button>
        );
      })}
    </div>
  </div>
);

/** Grow your own rule: pick a starting preset, toggle neighbour counts, see the result explained. */
export const RulesCard: React.FC<Props> = ({ rule, onRuleChange, onClose, anchorRef }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [showEx, setShowEx] = useState(false);
  const t = useSteps();

  useEffect(() => {
    ref.current?.focus();
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchorRef.current?.contains(t) || (t as Element).closest?.('[data-dropdown-list]')) return;
      // A click on the board only closes the card; it shouldn't also plant a cell.
      if ((t as HTMLElement).tagName === 'CANVAS') e.stopPropagation();
      onClose();
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [onClose, anchorRef]);

  const toggle = (key: 'birth' | 'survive', n: number) => {
    const cur = rule[key];
    const next = cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n].sort((a, b) => a - b);
    onRuleChange({ ...rule, [key]: next });
  };

  const preset = presetOf(rule);
  const examples = examplesFor(rule);

  return (
    <div
      ref={ref}
      id="rules"
      role="dialog"
      aria-label="Rule editor"
      tabIndex={-1}
      onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), onClose())}
      className={`panel-in w-[calc(100vw-32px)] h-[var(--frame-h)] sm:w-[var(--panel-w)] ${showEx ? 'sm:h-[calc(100dvh-112px-var(--gap))]' : 'sm:h-auto sm:max-h-[calc(100dvh-112px-var(--gap))]'} relative z-20 bg-[var(--panel)] p-4 flex flex-col overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,.3)_transparent] text-[13px] leading-[1.55] text-white normal-case tracking-normal text-left focus:outline-none`}
    >
      <Dropdown
        id="rule-card"
        label="Start from"
        value={preset}
        onChange={(n) => onRuleChange(RULES[n])}
        groups={[{ items: RULE_NAMES }]}
        format={(n) => RULE_LABELS[n] ?? 'Custom'}
        direction="down"
      />

      <div className="flex flex-col gap-3 mt-4">
        <CountRow label="Neighbors needed for birth" on={rule.birth} tone="born" onToggle={(n) => toggle('birth', n)} />
        <CountRow label="Neighbors needed for survival" on={rule.survive} tone="live" onToggle={(n) => toggle('survive', n)} />
      </div>
      {preset !== 'conway' && (
        <button onClick={() => onRuleChange(RULES.conway)} className="self-start mt-2 text-[11px] tracking-[0.04em] text-white/55 hover:text-white underline underline-offset-2 decoration-white/25">
          Reset to Life
        </button>
      )}

      <button
        onClick={() => setShowEx((o) => !o)}
        aria-expanded={showEx}
        aria-controls="rule-examples"
        className={cn('field shrink-0 w-full mt-4 hidden sm:flex items-center justify-between text-left', showEx && 'field-open')}
      >
        <span>{showEx ? 'Hide examples' : 'See examples'}</span>
        <svg width="8" height="6" viewBox="0 0 8 6" className={cn('text-white/70 transition-opacity', showEx && 'opacity-30')} aria-hidden="true">
          <path d="M0 0h8L4 6z" fill="currentColor" />
        </svg>
      </button>

      {/* Phones always show the examples: they fill the panel.
          Layout: a table bleeding to the panel edges, hairline rules; each row is one grid whose
          centre shows the outcome (green born, white survives, red dies) beside one sentence. */}
      <div
        id="rule-examples"
        className={cn('flex-col -mx-4 -mb-4 mt-4 border-t border-white/10', showEx ? 'flex' : 'flex sm:hidden')}
        aria-label={`${examples.length} examples`}
      >
        {examples.map((ex, i) => {
          const s = ex.n === 1 ? '' : 's';
          const sentence =
            ex.outcome === 'born'
              ? ex.n === 0 ? 'An empty cell with no neighbors comes alive' : `${ex.n} neighbor${s} around an empty cell give${ex.n === 1 ? 's' : ''} birth to a new cell`
              : ex.outcome === 'lives on'
                ? ex.n === 0 ? 'A live cell with no neighbors stays alive' : `${ex.n} neighbor${s} keep${ex.n === 1 ? 's' : ''} a live cell alive`
                : !rule.survive.length ? `With ${ex.n === 0 ? 'no' : ex.n} neighbor${s}, a live cell dies`
                : ex.n < Math.min(...rule.survive) ? `With ${ex.n === 0 ? 'no' : `only ${ex.n}`} neighbor${s}, a live cell dies of isolation`
                : `With ${ex.n} neighbors, a live cell dies of crowding`;
          return (
            <figure key={`${ex.outcome}-${ex.n}-${i}`} className="grid grid-cols-2 border-b border-white/10 last:border-b-0">
              <span className="aspect-square p-4 border-r border-white/10 flex items-center justify-center">
                <Grid n={ex.n} alive={ex.alive} outcome={ex.outcome} t={t} />
              </span>
              <figcaption className="aspect-square p-4 text-[length:var(--ex-cap-fs)] font-medium leading-[1.6]">{sentence}</figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
};
