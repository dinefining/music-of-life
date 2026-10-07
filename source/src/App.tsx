import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Board, CELL, View, Insets } from './components/Board';
import { Dropdown } from './components/Dropdown';
import { Keys } from './components/Keys';
import { RulesCard } from './components/RulesCard';
import { InfoCard } from './components/InfoCard';
import { Engine, Mode } from './lib/engine';
import { OPENING, RULES, Rule } from './lib/life';
import { SCALES, SCALE_GROUPS, STACKS, setStack, getNoteName, noteAt, isAudible } from './lib/music';
import { audition, initAudio, setSound as applySound, setSpace, SOUND_NAMES } from './lib/audio';
import { cn } from './lib/utils';

const BPM_MIN = 40, BPM_MAX = 240;
const OCT_MIN = 1, OCT_MAX = 5;
const MODES: Mode[] = ['scan', 'arp', 'cell'];
const MODE_TIPS: Record<Mode, string> = {
  scan: 'Scanline plays every live cell',
  arp: 'Scanline plays one random cell per step',
  cell: 'Newborn cells play on each beat',
};
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Numeric field: type, ↑↓ (shift ×10) or scroll over it. */
const BpmField: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = parseInt(text, 10);
    const v = Number.isFinite(n) ? clamp(n, BPM_MIN, BPM_MAX) : value;
    onChange(v);
    setText(String(v));
  };
  return (
    <input
      id="bpm"
      className="field w-full tabular-nums outline-none"
      inputMode="numeric"
      value={text}
      onChange={(e) => setText(e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          onChange(clamp(value + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1), BPM_MIN, BPM_MAX));
        }
      }}
      onWheel={(e) => onChange(clamp(value + (e.deltaY < 0 ? 1 : -1), BPM_MIN, BPM_MAX))}
      aria-label="Tempo in beats per minute"
    />
  );
};

/** Field-style slider: the fill shows the amount; drag, click, or use ←→ when focused. */
const Slider: React.FC<{ id: string; value: number; onChange: (v: number) => void; label: string }> = ({ id, value, onChange, label }) => {
  const ref = useRef<HTMLDivElement>(null);
  const setFrom = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    onChange(clamp((clientX - r.left) / r.width, 0, 1));
  };
  return (
    <div
      id={id}
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      className="field relative w-full cursor-ew-resize overflow-hidden flex items-center touch-none"
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setFrom(e.clientX);
      }}
      onPointerMove={(e) => e.buttons && setFrom(e.clientX)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          onChange(clamp(value + (e.key === 'ArrowRight' ? 0.05 : -0.05), 0, 1));
        }
      }}
    >
      <span className="absolute inset-y-0 left-0 bg-white/15 pointer-events-none" style={{ width: `${value * 100}%` }} />
      <span className="relative tabular-nums pointer-events-none">{Math.round(value * 100)}</span>
    </div>
  );
};

export default function App() {
  const engine = useMemo(() => new Engine(), []);
  const viewRef = useRef<View>({ x: window.innerWidth / 2, y: window.innerHeight / 2 - 20, k: 1 });
  const controlsRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  // Phone panels fill the screen between the HUD and the button row: expose that frame as CSS vars.
  useLayoutEffect(() => {
    const set = () => {
      const top = Math.round((hudRef.current?.getBoundingClientRect().bottom ?? 78) + 16);
      const root = document.documentElement.style;
      root.setProperty('--frame-top', `${top}px`);
      root.setProperty('--frame-h', `calc(100dvh - ${top}px - 16px - 48px - var(--gap) - env(safe-area-inset-bottom, 0px))`);
    };
    set();
    window.addEventListener('resize', set);
    return () => window.removeEventListener('resize', set);
  }, []);

  const [playing, setPlaying] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [rootPc, setRootPc] = useState(0);
  const [octave, setOctave] = useState(3);
  const [scale, setScale] = useState('minPent');
  const [sound, setSound] = useState('mallet');
  const [nudge, setNudge] = useState(false); // 'draw first' hint when Play is pressed on an empty board
  const [mode, setMode] = useState<Mode>('scan');
  const [labels, setLabels] = useState(false);
  const [menu, setMenu] = useState(false); // control panel open?
  const [rule, setRule] = useState<Rule>(RULES.conway); // custom rules allowed
  const [rulesOpen, setRulesOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const infoBtn = useRef<HTMLButtonElement>(null);
  const closeInfo = useCallback(() => setInfoOpen(false), []);
  const rulesBtn = useRef<HTMLButtonElement>(null);
  const [stack, setStackName] = useState('3rd');
  const [space, setSpaceAmt] = useState(0.5);
  const [hud, setHud] = useState({ gen: 0, pop: 0 });

  const root = 12 * (octave + 1) + rootPc; // MIDI note at the grid origin
  engine.root = root;
  engine.scale = scale;
  engine.bpm = bpm;
  engine.setMode(mode);
  applySound(sound);
  engine.rule = rule;
  setStack(stack);
  setSpace(space);

  // Frame the pattern in whatever space the HUD and the panel leave free.
  const getInsets = useCallback((): Insets => {
    const w = window.innerWidth, h = window.innerHeight;
    const top = (hudRef.current?.getBoundingClientRect().bottom ?? 80) + 24;
    const p = controlsRef.current?.getBoundingClientRect();
    const side = w < 640 ? 16 : 48;
    if (p && p.right < w * 0.45) return { top, left: p.right + 32, right: side, bottom: 32 }; // panel sits beside
    // panel sits below; a phone-sized panel covers the board, so then just keep clear of the buttons
    if (p && h - p.top + 24 < h - top - 120) return { top, left: side, right: side, bottom: h - p.top + 24 };
    return { top, left: side, right: side, bottom: 16 + 48 + 24 };
  }, []);

  useEffect(() => {
    engine.onStop = () => setPlaying(false);
    if (engine.cells.size === 0) engine.place(OPENING); // open with a few cells drawn
  }, [engine]);

  const play = useCallback(() => {
    if (engine.cells.size === 0) {
      setNudge(true);
      window.setTimeout(() => setNudge(false), 1400);
      return;
    }
    engine.start();
    setPlaying(true);
  }, [engine]);

  const togglePlay = useCallback(() => {
    if (engine.playing) {
      engine.stop();
      setPlaying(false);
    } else play();
  }, [engine, play]);

  const clear = useCallback(() => {
    engine.clear();
    setPlaying(false);
  }, [engine]);

  const selectRoot = (pc: number) => {
    setRootPc(pc);
    engine.root = 12 * (octave + 1) + pc;
    audition(engine.root + 12);
  };
  const shiftOctave = (d: number) => {
    const o = clamp(octave + d, OCT_MIN, OCT_MAX);
    setOctave(o);
    engine.root = 12 * (o + 1) + rootPc;
    audition(engine.root + 12);
  };

  const hit = (x: number, y: number) => {
    const midi = noteAt(engine.root, engine.scale, x, y);
    if (isAudible(midi)) engine.strike(x, y, audition(midi));
  };
  const onToggle = useCallback((x: number, y: number) => {
    initAudio();
    if (engine.toggle(x, y)) hit(x, y);
  }, [engine]);
  const onPaint = useCallback((x: number, y: number) => {
    initAudio();
    if (engine.add(x, y)) hit(x, y);
  }, [engine]);
  const onGen = useCallback((gen: number, pop: number) => setHud({ gen, pop }), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'Backspace' || e.key === 'Delete') clear();
      else if (k === 'm') setMode((m) => MODES[(MODES.indexOf(m) + (e.shiftKey ? 2 : 1)) % 3]);
      else if (k === 'l') setLabels((l) => !l);
      else if (k === 'h') { setRulesOpen(false); setInfoOpen(false); setMenu((o) => !o); }
      else if (k === 'r') { setMenu(false); setInfoOpen(false); setRulesOpen((o) => !o); }
      else if (k === 'i') { setMenu(false); setRulesOpen(false); setInfoOpen((o) => !o); }
      else if (e.key === 'Escape') { setMenu(false); setRulesOpen(false); setInfoOpen(false); }
      else if (k === 'z') shiftOctave(-1);
      else if (k === 'x') shiftOctave(1);
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        selectRoot((rootPc + (e.key === 'ArrowRight' ? 1 : -1) + 12) % 12);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, clear, rootPc, octave]);

  const pops = engine.pops;
  const spark = useMemo(() => {
    if (pops.length < 2) return '';
    const max = Math.max(...pops, 1);
    const n = pops.length;
    return pops.map((p, i) => `${((i / (n - 1)) * 110).toFixed(1)},${(13 - (p / max) * 12).toFixed(1)}`).join(' ');
  }, [hud.gen, pops]);

  const pad = (n: number, w: number) => String(n).padStart(w, '0');
  const inScale = (pc: number) => SCALES[scale].includes((pc - rootPc + 12) % 12);

  return (
    <div className="fixed inset-0 bg-black text-white select-none">
      <Board engine={engine} labels={labels} viewRef={viewRef} onToggle={onToggle} onPaint={onPaint} onGen={onGen} getInsets={getInsets} />

      {/* HUD */}
      <div ref={hudRef} data-hud className="absolute top-4 left-4 sm:top-8 sm:left-8 pointer-events-none flex flex-col gap-1 tabular-nums tracking-[0.02em] text-[13px]">
        <h1 className="font-normal">Music of Life</h1>
        <div className="flex gap-x-2">
          <span>Gen {pad(hud.gen, 4)}</span>
          <span>Pop {pad(hud.pop, 3)}</span>
        </div>
        <svg width="112" height="18" className="overflow-visible mt-1" aria-hidden="true">
          <line x1="0" y1="17.5" x2="112" y2="17.5" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
          {spark && <polyline points={spark} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />}
        </svg>
      </div>


      {/* Info: button bottom-right, card unfolds above it */}
      <div
        className={cn('absolute right-4 bottom-4 sm:right-8 sm:bottom-8 flex flex-col items-end gap-[var(--gap)]', infoOpen ? 'z-30' : 'z-10')}
        style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {infoOpen && <InfoCard rule={rule} onClose={closeInfo} anchorRef={infoBtn} />}
        {/* round transport + info, bottom right */}
        <div className="flex gap-[var(--gap)]">
            <button
              onClick={togglePlay}
              aria-label={playing ? 'Pause' : 'Play'}
              title="Play / pause (Space)"
              className={cn('w-12 h-12 rounded-full flex items-center justify-center transition-colors focus:outline-none focus-visible:outline-1 focus-visible:outline-white', playing ? 'bg-[var(--accent)] hover:bg-[#4f9c2e]' : 'bg-[var(--panel)] hover:bg-[#242424]')}
            >
              {playing ? (
                <svg width="14" height="16" viewBox="0 0 16 18" aria-hidden="true"><rect x="1.5" y="0" width="4.5" height="18" fill="var(--ink)" /><rect x="10" y="0" width="4.5" height="18" fill="var(--ink)" /></svg>
              ) : (
                <svg width="16" height="18" viewBox="0 0 18 20" aria-hidden="true" className="translate-x-[1px]"><path d="M1 0 18 10 1 20z" fill="#d9d9d9" /></svg>
              )}
            </button>
          <button
            ref={infoBtn}
            onClick={() => { setMenu(false); setRulesOpen(false); setInfoOpen((o) => !o); }}
            aria-expanded={infoOpen}
            aria-controls="info"
            aria-label={infoOpen ? 'Close info' : 'How it works'}
            title={infoOpen ? 'Close (Esc)' : 'How it works (I)'}
            className={cn('relative z-10 w-12 h-12 rounded-full flex items-center justify-center transition-colors focus:outline-none focus-visible:outline-1 focus-visible:outline-white', infoOpen ? 'bg-[#383838]' : 'bg-[var(--panel)] hover:bg-[#242424]')}
          >
            {/* while info is open this same button closes it */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={infoOpen ? '#fff' : '#d9d9d9'} strokeWidth="1.25" aria-hidden="true">
              {infoOpen ? (
                <path d="M6 6l12 12M18 6L6 18" />
              ) : (
                <>
                  <path d="M12 10V19" />
                  <circle cx="12" cy="6" r="0.75" fill="#d9d9d9" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {hud.pop === 0 && !playing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 pointer-events-none text-[13px] tracking-[0.02em]">
          <span className={cn('transition-colors', nudge && 'text-[var(--accent)]')}>Plant seeds and press play</span>
        </div>
      )}

      {/* Button row; the Rules card or the Settings panel unfolds above it (one at a time) */}
      <div
        ref={controlsRef}
        className="absolute left-4 bottom-4 sm:left-8 sm:bottom-8 z-10 flex flex-col items-start gap-[var(--gap)] pointer-events-none [&>*]:pointer-events-auto"
        style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {rulesOpen && (
          <RulesCard rule={rule} onRuleChange={setRule} onClose={() => setRulesOpen(false)} anchorRef={rulesBtn} />
        )}
        {menu && (
          <div id="panel" className="panel-in w-[calc(100vw-32px)] h-[var(--frame-h)] sm:w-[var(--panel-w)] sm:h-auto overflow-y-auto overscroll-contain bg-[var(--panel)] p-4 flex flex-col gap-4" role="region" aria-label="Controls">
            <div className="grid grid-cols-[68px_1fr] items-center gap-x-2 gap-y-[var(--gap)]">
              <label htmlFor="bpm" className="label">BPM</label>
              <BpmField value={bpm} onChange={setBpm} />

              <label htmlFor="sound" className="label">Sound</label>
              <Dropdown
                id="sound"
                value={sound}
                onChange={(v) => {
                  setSound(v);
                  applySound(v);
                  if (!engine.playing) audition(engine.root + 12); // hear it while browsing
                }}
                groups={[{ items: SOUND_NAMES }]}
                livePreview
                hotkey="v"
              />

              <label htmlFor="scale" className="label">Scale</label>
              <Dropdown
                id="scale"
                value={scale}
                onChange={setScale}
                groups={SCALE_GROUPS.map((g) => ({ label: `${g.size} NOTES`, items: g.names }))}
                livePreview
                hotkey="s"
              />

              <span className="label" id="mode-label">Mode</span>
              <div className="grid grid-cols-3 gap-[var(--gap)]" role="group" aria-labelledby="mode-label">
                {MODES.map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    aria-pressed={mode === m}
                    title={MODE_TIPS[m]}
                    className={cn('field !px-0', mode === m ? '!bg-[#4a4a4a] text-white' : 'text-white/55')}
                  >
                    {m[0].toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>

              <label htmlFor="stack" className="label" title="Interval between one row and the row above">Stack</label>
              <Dropdown
                id="stack"
                value={stack}
                onChange={setStackName}
                groups={[{ items: Object.keys(STACKS) }]}
                label="Interval between rows"
              />

              <label htmlFor="space" className="label">Echo</label>
              <Slider id="space" value={space} onChange={setSpaceAmt} label="Echo amount" />

            </div>

            {/* Second group: key note + piano, set apart from the sound settings */}
            <div className="h-px bg-white/10 shrink-0" role="separator" />

            {/* On phones this group takes the rest of the panel and the piano grows into it */}
            <div className="flex-1 sm:flex-none grid grid-cols-[68px_1fr] items-stretch gap-x-2 gap-y-[var(--gap)]">
              {/* One two-line block (label, then octave), centred on the piano like every label on its field */}
              <div className="self-center flex flex-col gap-1">
                <span className="label" id="note-label">Note</span>
                <span className="flex items-center gap-1.5 text-[length:var(--field-fs)] tabular-nums" role="group" aria-labelledby="note-label">
                  <span aria-live="polite">{getNoteName(root)}</span>
                  <button onClick={() => shiftOctave(-1)} disabled={octave <= OCT_MIN} className="w-4 text-center text-[17px] leading-none hover:text-white/60 disabled:text-white/20" aria-label="Octave down (Z)" title="Octave down (Z)">−</button>
                  <button onClick={() => shiftOctave(1)} disabled={octave >= OCT_MAX} className="w-4 text-center text-[17px] leading-none hover:text-white/60 disabled:text-white/20" aria-label="Octave up (X)" title="Octave up (X)">+</button>
                </span>
              </div>
              <div className="h-full">
                <Keys rootPc={rootPc} inScale={inScale} onSelect={selectRoot} />
              </div>
            </div>

          </div>
        )}

        <div className="flex gap-[var(--gap)]">
          <button
            ref={rulesBtn}
            onClick={() => { setMenu(false); setInfoOpen(false); setRulesOpen((o) => !o); }}
            aria-expanded={rulesOpen}
            aria-controls="rules"
            aria-label="Grow your own rule"
            title="Grow your own rule (R)"
            className={cn('w-12 h-12 flex items-center justify-center transition-colors focus:outline-none focus-visible:outline-1 focus-visible:outline-white', rulesOpen ? 'bg-[#383838]' : 'bg-[var(--panel)] hover:bg-[#242424]')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={rulesOpen ? '#fff' : '#d9d9d9'} strokeWidth="1.25" aria-hidden="true">
              <path d="M3.5 7.5A9 8.5 0 0 0 12 15.5A9 8.5 0 0 0 3.5 7.5Z" />
              <path d="M20.5 3.5A9 8.5 0 0 1 12 11.5A9 8.5 0 0 1 20.5 3.5Z" />
              <path d="M12 11.5V22" />
            </svg>
          </button>
          <button
            onClick={() => { setRulesOpen(false); setInfoOpen(false); setMenu((o) => !o); }}
            aria-expanded={menu}
            aria-controls="panel"
            aria-label={menu ? 'Close settings' : 'Open settings'}
            title="Settings (H)"
            className={cn('w-12 h-12 flex items-center justify-center transition-colors focus:outline-none focus-visible:outline-1 focus-visible:outline-white', menu ? 'bg-[#383838]' : 'bg-[var(--panel)] hover:bg-[#242424]')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={menu ? '#fff' : '#d9d9d9'} strokeWidth="1.25" strokeLinejoin="round" aria-hidden="true">
              <path d="M19.38 10.19 L21.86 10.31 L21.86 13.69 L19.38 13.81 L18.50 15.94 L20.17 17.77 L17.77 20.17 L15.94 18.50 L13.81 19.38 L13.69 21.86 L10.31 21.86 L10.19 19.38 L8.06 18.50 L6.23 20.17 L3.83 17.77 L5.50 15.94 L4.62 13.81 L2.14 13.69 L2.14 10.31 L4.62 10.19 L5.50 8.06 L3.83 6.23 L6.23 3.83 L8.06 5.50 L10.19 4.62 L10.31 2.14 L13.69 2.14 L13.81 4.62 L15.94 5.50 L17.77 3.83 L20.17 6.23 L18.50 8.06Z" />
              <circle cx="12" cy="12" r="3.4" />
            </svg>
          </button>
          <button
            onClick={clear}
            aria-label="Clear board"
            title="Clear board (Backspace)"
            className="w-12 h-12 bg-[var(--panel)] hover:bg-[#242424] flex items-center justify-center transition-colors focus:outline-none focus-visible:outline-1 focus-visible:outline-white"
          >
            <svg width="18" height="20" viewBox="0 0 18 20" aria-hidden="true" fill="none" stroke="#d9d9d9" strokeWidth="1.25" strokeLinejoin="round">
              <path d="M1 4.5h16M6.5 4.5V1.5h5v3M3 4.5l1 14h10l1-14M7.5 8.5v6.5M10.5 8.5v6.5" />
            </svg>
          </button>
        </div>
      </div>

    </div>
  );
}
