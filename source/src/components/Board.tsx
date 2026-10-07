import React, { useEffect, useRef } from 'react';
import { Engine, sweepPos, colsPerStep } from '../lib/engine';
import { AGE_FULL, TRAIL_GENS, key } from '../lib/life';
import { getNoteName, noteAt, isAudible } from '../lib/music';
import { heardNow } from '../lib/audio';

export const CELL = 40;
export type View = { x: number; y: number; k: number };
/** Screen area the pattern should be framed in (px kept clear on each side). */
export type Insets = { top: number; right: number; bottom: number; left: number };

/** Same as the UI's --gap: space between cells on screen, independent of zoom. */
const GAP = 3;
const FLASH = 0.42; // seconds a struck cell takes to settle
const MORPH = 0.22; // seconds births grow in / deaths shrink out after a generation step
const IDLE_MS = 10000; // hands-off time before the camera takes over again
const FOLLOW_RATE = 1.6; // camera easing speed (per second)
const MIN_K = 0.3;
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
// Black board: newborns glow white and dim as they age, so growth fronts read brightest.
const light = (age: number) => 100 - (Math.min(age, AGE_FULL) / AGE_FULL) * 58;
const shade = (age: number) => `hsl(0 0% ${light(age).toFixed(1)}%)`;
// Cells sounding the key note use the accent green (#438a26), dimming with age the same way.
const green = (age: number) => `hsl(103 57% ${(34 * light(age) / 100 + 4).toFixed(1)}%)`;
const isKey = (midi: number, root: number) => (((midi - root) % 12) + 12) % 12 === 0;
const BG = '#000000';
const HOT = '255,59,48'; // #ff3b30, the cell ARP is playing
const HOT_FADE = 0.28; // seconds to fade back after the step
const INK = (a: number) => `rgba(255,255,255,${a.toFixed(3)})`;
const FONT = "Barlow, 'Helvetica Neue', Arial, sans-serif";

interface Props {
  engine: Engine;
  labels: boolean;
  viewRef: React.MutableRefObject<View>;
  onToggle: (x: number, y: number) => void;
  onPaint: (x: number, y: number) => void;
  onGen: (gen: number, pop: number) => void;
  getInsets: () => Insets;
}

export const Board: React.FC<Props> = ({ engine, labels, viewRef, onToggle, onPaint, onGen, getInsets }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const props = useRef({ labels, onToggle, onPaint, onGen, getInsets });
  props.current = { labels, onToggle, onPaint, onGen, getInsets };
  const lastInteract = useRef(-Infinity);
  const touched = () => (lastInteract.current = performance.now());

  // ---- render loop ------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current!;
    const g = canvas.getContext('2d')!;
    let raf = 0;
    let lastGen = -1, lastPop = -1;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let lastFrame = performance.now();
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const nowMs = performance.now();
      const dt = Math.min(0.1, (nowMs - lastFrame) / 1000);
      lastFrame = nowMs;
      const dpr = Math.min(window.devicePixelRatio || 1, 2); // 3x phones: 2x is sharp enough and much cheaper to draw
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const v = viewRef.current;
      const e = engine;
      const now = heardNow();
      const { snap, prev } = e.transitionAt(now);
      const morph = prev && !reduceMotion ? Math.min(1, Math.max(0, (now - snap.time) / MORPH)) : 1;
      if (snap.gen !== lastGen || snap.cells.size !== lastPop) {
        lastGen = snap.gen;
        lastPop = snap.cells.size;
        props.current.onGen(snap.gen, snap.cells.size);
      }

      // Camera: after IDLE_MS without input, ease the pattern back to centre,
      // zooming out (never past 1x in) so it fits with a one-cell margin.
      if (snap.cells.size && nowMs - lastInteract.current > IDLE_MS && ptrs.current.size === 0) {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const c of snap.cells.values()) {
          if (c.x < x0) x0 = c.x;
          if (c.x > x1) x1 = c.x;
          if (c.y < y0) y0 = c.y;
          if (c.y > y1) y1 = c.y;
        }
        const ins = props.current.getInsets();
        const aw = Math.max(80, w - ins.left - ins.right);
        const ah = Math.max(80, h - ins.top - ins.bottom);
        const bw = (x1 - x0 + 3) * CELL, bh = (y1 - y0 + 3) * CELL; // +1 cell margin each side
        const tk = Math.max(MIN_K, Math.min(1, aw / bw, ah / bh));
        const a = reduceMotion ? 1 : 1 - Math.exp(-dt * FOLLOW_RATE);
        const cx = ((x0 + x1) / 2) * CELL, cy = ((y0 + y1) / 2) * CELL;
        v.k += (tk - v.k) * a;
        v.x += (ins.left + aw / 2 - cx * v.k - v.x) * a;
        v.y += (ins.top + ah / 2 - cy * v.k - v.y) * a;
      }
      const s = CELL * v.k;

      // background + dot grid (screen space, endless)
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = BG;
      g.fillRect(0, 0, w, h);
      if (s >= 12) {
        g.fillStyle = INK(0.26); // grid dots
        const gx0 = Math.floor(-v.x / s) - 1, gx1 = Math.ceil((w - v.x) / s) + 1;
        const gy0 = Math.floor(-v.y / s) - 1, gy1 = Math.ceil((h - v.y) / s) + 1;
        for (let gx = gx0; gx <= gx1; gx++)
          for (let gy = gy0; gy <= gy1; gy++) g.fillRect(v.x + gx * s - 1, v.y + gy * s - 1, 2, 2);
      }

      const sweep = e.playing ? e.sweepAt(now) : null;
      const pos = sweep ? sweepPos(sweep, now) : 0;

      // sweep ruler + current-column band (behind cells)
      if (sweep) {
        g.fillStyle = INK(0.05);
        const cps = colsPerStep(sweep);
        const stepIdx = Math.floor((now - sweep.start) / sweep.stepDur);
        g.fillRect(v.x + (sweep.minX + stepIdx * cps - 0.5) * s, 0, cps * s, h);
        g.fillStyle = INK(0.4);
        for (let i = 0; i < sweep.steps; i++) {
          const sx = v.x + (sweep.minX - 0.5 + i * cps) * s;
          const tall = i % 4 === 0;
          g.fillRect(Math.round(sx) - 0.5, 0, 1, tall ? 9 : 4);
        }
      }

      // world space
      g.setTransform(dpr * v.k, 0, 0, dpr * v.k, dpr * v.x, dpr * v.y);
      const half = CELL / 2;
      const gw = GAP / v.k; // the gap in world units at this zoom
      const inner = CELL - gw; // drawn size of one cell
      const o = gw / 2; // inset from the cell's grid square

      for (const tr of snap.trails.values()) {
        g.fillStyle = INK(0.11 * (1 - tr.t / TRAIL_GENS));
        g.fillRect(tr.x * CELL - half + o, tr.y * CELL - half + o, inner, inner);
      }

      for (const c of snap.cells.values()) {
        const midi = noteAt(e.root, e.scale, c.x, c.y);
        const px = c.x * CELL - half, py = c.y * CELL - half;
        g.fillStyle = isKey(midi, e.root) ? green(c.age) : shade(c.age);
        if (c.age === 0 && morph < 1) {
          // newborn: grows from the centre
          const sz = inner * (0.3 + 0.7 * easeOut(morph));
          g.fillRect(c.x * CELL - sz / 2, c.y * CELL - sz / 2, sz, sz);
        } else g.fillRect(px + o, py + o, inner, inner);
      }

      // just died: shrinks and fades into its trail
      if (prev && morph < 1) {
        const k = easeOut(morph);
        for (const [ck, c] of prev.cells) {
          if (snap.cells.has(ck)) continue;
          const sz = inner * (1 - 0.7 * k);
          g.globalAlpha = 1 - k;
          g.fillStyle = isKey(noteAt(e.root, e.scale, c.x, c.y), e.root) ? green(c.age) : shade(c.age);
          g.fillRect(c.x * CELL - sz / 2, c.y * CELL - sz / 2, sz, sz);
        }
        g.globalAlpha = 1;
      }

      // strikes: the cell inverts when its note sounds, then settles
      const showText = s >= 26;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (const st of e.strikes) {
        const el = now - st.time;
        if (st.hold !== undefined) {
          // ARP: the playing cell is red for its whole step, then fades back.
          if (el < 0 || el > st.hold + HOT_FADE) continue;
          const a = el <= st.hold ? 1 : 1 - easeOut((el - st.hold) / HOT_FADE);
          const cx = st.x * CELL, cy = st.y * CELL;
          g.fillStyle = `rgba(${HOT},${a.toFixed(3)})`;
          g.fillRect(cx - half + o, cy - half + o, inner, inner);
          if (!reduceMotion && el <= st.hold) {
            const r = half * (1 + (el / Math.max(st.hold, 0.05)) * 0.35);
            g.strokeStyle = `rgba(${HOT},${(0.6 * (1 - el / Math.max(st.hold, 0.05))).toFixed(3)})`;
            g.lineWidth = 1 / v.k;
            g.strokeRect(cx - r, cy - r, r * 2, r * 2);
          }
          if (showText) {
            g.fillStyle = INK(a);
            g.font = `600 12px ${FONT}`;
            g.fillText(getNoteName(st.midi), cx, cy + 0.5);
          }
          continue;
        }
        if (el < 0 || el > FLASH) continue;
        const p = el / FLASH;
        const ease = Math.pow(1 - p, 3);
        const cx = st.x * CELL, cy = st.y * CELL;
        g.fillStyle = `rgba(0,0,0,${ease.toFixed(3)})`;
        g.fillRect(cx - half + 2.5, cy - half + 2.5, CELL - 5, CELL - 5);
        if (!reduceMotion) {
          const r = half * (1 + p * 0.6);
          g.strokeStyle = INK(0.45 * (1 - p));
          g.lineWidth = 1 / v.k;
          g.strokeRect(cx - r, cy - r, r * 2, r * 2);
        }
        if (showText) {
          g.fillStyle = INK(ease);
          g.font = `600 12px ${FONT}`;
          g.fillText(getNoteName(st.midi), cx, cy + 0.5);
        }
      }

      // labels: all cells (L), or just the hovered one
      if (showText) {
        g.font = `600 12px ${FONT}`;
        const hk = hoverRef.current;
        for (const c of snap.cells.values()) {
          if (!props.current.labels && key(c.x, c.y) !== hk) continue;
          const midi = noteAt(e.root, e.scale, c.x, c.y);
          g.fillStyle = !isKey(midi, e.root) && light(c.age) > 62 ? 'rgba(0,0,0,0.85)' : INK(0.92);
          g.fillText(getNoteName(midi), c.x * CELL, c.y * CELL + 0.5);
        }
        if (hk && !snap.cells.has(hk)) {
          const [hx, hy] = hk.split(',').map(Number);
          g.fillStyle = INK(0.35);
          g.fillText(getNoteName(noteAt(e.root, e.scale, hx, hy)), hx * CELL, hy * CELL + 0.5);
        }
      }

      // scanline: inverts whatever it crosses
      if (sweep) {
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        const sx = v.x + pos * s;
        g.globalCompositeOperation = 'difference';
        g.fillStyle = '#ffffff';
        g.fillRect(Math.round(sx) - 0.5, 0, 1, h);
        g.globalCompositeOperation = 'source-over';
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [engine, viewRef]);

  // ---- interaction ------------------------------------------------------
  const hoverRef = useRef<string | null>(null);
  /**
   * Pointers on the board, by id.
   * Mouse: drag pans, click toggles, Shift + drag paints.
   * Touch: drag pans, tap toggles, long-press (~0.3 s, held still) then drag paints,
   * two fingers pinch to zoom and pan.
   */
  type Ptr = {
    sx: number; sy: number; vx: number; vy: number; x: number; y: number;
    moved: boolean; role: 'tap' | 'paint' | 'pinch' | 'done'; last: [number, number] | null; timer?: number;
  };
  const ptrs = useRef(new Map<number, Ptr>());

  const cellAt = (clientX: number, clientY: number): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    const wx = (clientX - r.left - v.x) / v.k;
    const wy = (clientY - r.top - v.y) / v.k;
    return [Math.round(wx / CELL), Math.round(wy / CELL)];
  };

  // Paint every cell between the last painted cell and this one, so fast strokes leave no gaps.
  const paintTo = (p: Ptr, cell: [number, number]) => {
    const [x1, y1] = cell;
    const [x0, y0] = p.last ?? cell;
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const t = n ? i / n : 1;
      props.current.onPaint(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t));
    }
    p.last = cell;
  };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      touched();
      const v = viewRef.current;
      const r = canvas.getBoundingClientRect();
      const mx = ev.clientX - r.left, my = ev.clientY - r.top;
      const nk = Math.min(3, Math.max(0.25, v.k * Math.exp(-ev.deltaY * 0.0015)));
      v.x = mx - ((mx - v.x) * nk) / v.k;
      v.y = my - ((my - v.y) * nk) / v.k;
      v.k = nk;
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [viewRef]);

  const LONG_PRESS_MS = 300;
  const pinch = useRef<{ d: number; mx: number; my: number; vx: number; vy: number; k: number } | null>(null);
  const pinchState = () => {
    const [a, b] = [...ptrs.current.values()];
    const r = canvasRef.current!.getBoundingClientRect();
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top };
  };

  const onPointerDown = (ev: React.PointerEvent) => {
    try { canvasRef.current!.setPointerCapture(ev.pointerId); } catch { /* pointer already gone */ }
    touched();
    const v = viewRef.current;
    const p: Ptr = { sx: ev.clientX, sy: ev.clientY, x: ev.clientX, y: ev.clientY, vx: v.x, vy: v.y, moved: false, role: 'tap', last: null };
    const others = [...ptrs.current.values()];

    if (ev.pointerType === 'mouse') {
      if (ev.shiftKey) p.role = 'paint';
    } else if (others.some((o) => o.role === 'paint')) {
      p.role = 'done'; // already painting: extra fingers are ignored
    } else if (others.length === 1) {
      // second finger: pinch (zoom + pan) with the first
      const o = others[0];
      window.clearTimeout(o.timer);
      o.role = 'pinch';
      p.role = 'pinch';
    } else if (others.length > 1) {
      p.role = 'done';
    } else {
      // single finger: becomes a paint stroke if held still for a moment
      p.timer = window.setTimeout(() => {
        if (p.role !== 'tap' || p.moved) return;
        p.role = 'paint';
        navigator.vibrate?.(8);
        paintTo(p, cellAt(p.x, p.y));
      }, LONG_PRESS_MS);
    }
    ptrs.current.set(ev.pointerId, p);
    if (p.role === 'pinch') {
      const st = pinchState();
      pinch.current = { ...st, vx: v.x, vy: v.y, k: v.k };
    }
    if (p.role === 'paint') paintTo(p, cellAt(ev.clientX, ev.clientY));
  };

  const onPointerMove = (ev: React.PointerEvent) => {
    const [cx, cy] = cellAt(ev.clientX, ev.clientY);
    hoverRef.current = ev.pointerType === 'mouse' ? key(cx, cy) : null;
    const p = ptrs.current.get(ev.pointerId);
    if (!p) return;
    p.x = ev.clientX;
    p.y = ev.clientY;
    touched();
    if (p.role === 'paint') {
      paintTo(p, [cx, cy]);
      return;
    }
    if (p.role === 'pinch') {
      const pc = pinch.current;
      if (!pc || ptrs.current.size < 2) return;
      const st = pinchState();
      const v = viewRef.current;
      const nk = Math.min(3, Math.max(0.25, pc.k * (st.d / pc.d)));
      // keep the world point that was under the starting midpoint under the current midpoint
      v.x = st.mx - ((pc.mx - pc.vx) * nk) / pc.k;
      v.y = st.my - ((pc.my - pc.vy) * nk) / pc.k;
      v.k = nk;
      return;
    }
    if (p.role !== 'tap') return;
    const dx = ev.clientX - p.sx, dy = ev.clientY - p.sy;
    if (!p.moved && Math.hypot(dx, dy) > (ev.pointerType === 'mouse' ? 4 : 8)) {
      p.moved = true;
      window.clearTimeout(p.timer);
    }
    if (p.moved) {
      viewRef.current.x = p.vx + dx;
      viewRef.current.y = p.vy + dy;
      canvasRef.current!.style.cursor = 'grabbing';
    }
  };

  const endPointer = (id: number, tap?: [number, number]) => {
    const p = ptrs.current.get(id);
    ptrs.current.delete(id);
    if (!p) return;
    window.clearTimeout(p.timer);
    canvasRef.current!.style.cursor = '';
    if (p.role === 'pinch') {
      pinch.current = null;
      // the finger left behind shouldn't pan or toggle when it lifts
      for (const o of ptrs.current.values()) if (o.role === 'pinch') o.role = 'done';
    }
    if (tap && p.role === 'tap' && !p.moved) props.current.onToggle(...tap);
  };

  const onPointerUp = (ev: React.PointerEvent) => endPointer(ev.pointerId, cellAt(ev.clientX, ev.clientY));

  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full cursor-crosshair touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={(ev) => endPointer(ev.pointerId)}
      onPointerLeave={() => (hoverRef.current = null)}
      aria-label="Music of Life board. Tap a cell to toggle it, drag to pan, scroll to zoom. Paint with Shift + drag, or on touch long-press then drag. Pinch to zoom."
    />
  );
};
