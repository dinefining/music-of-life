import { Cell, Trail, Rule, RULES, key, neighbours, stepLife } from './life';
import { initAudio, ctx, voice, setEcho } from './audio';
import { noteAt, isAudible } from './music';

export type Snapshot = { time: number; gen: number; cells: Map<string, Cell>; trails: Map<string, Trail> };
/**
 * One pass of the scanline across the pattern = one generation.
 * Each step is a 16th note. Narrow patterns get one column per step (no padding);
 * patterns wider than a bar are squeezed into MAX_STEPS so a generation never takes longer than one bar.
 */
export type Sweep = { start: number; minX: number; cols: number; steps: number; stepDur: number };
export type Mode = 'scan' | 'arp' | 'cell';
/** A cell sounding. `hold` (seconds) marks an ARP hit: drawn red for that long. */
export type Strike = { x: number; y: number; time: number; midi: number; hold?: number };

const LOOKAHEAD = 0.12; // seconds scheduled ahead of the audio clock
const MAX_VOICES = 6; // per step
export const MAX_STEPS = 16; // one bar

/** Which step a column (0-based within the sweep) sounds on. */
export const stepOf = (sw: Sweep, i: number) => (sw.cols > sw.steps ? Math.floor((i * sw.steps) / sw.cols) : i);
/** Columns the scanline travels per step. */
export const colsPerStep = (sw: Sweep) => (sw.cols > sw.steps ? sw.cols / sw.steps : 1);
/** Scanline position in grid columns at time t: runs from the left edge of the leftmost
 *  cell (minX - 0.5) to the right edge of the rightmost (minX + cols - 0.5), entering
 *  each column exactly when it sounds. */
export const sweepPos = (sw: Sweep, t: number) =>
  sw.minX - 0.5 + Math.min(sw.cols, ((t - sw.start) / sw.stepDur) * colsPerStep(sw));

/**
 * The sequencer. Audio is scheduled slightly ahead on the AudioContext clock;
 * every visual event (generation change, scanline position, cell strike) is
 * timestamped on that same clock, so the renderer shows exactly what you hear.
 */
export class Engine {
  cells = new Map<string, Cell>();
  trails = new Map<string, Trail>();
  gen = 0;
  root = 48;
  scale = 'minPent';
  bpm = 120;
  rule: Rule = RULES.conway;
  /** scan: scanline plays every live cell, one generation per sweep.
   *  arp:  same scanline, but each step plays ONE random live cell from its column(s).
   *  cell: one generation per beat, only newborn cells play, as an arpeggio. */
  mode: Mode = 'scan';
  playing = false;

  snapshots: Snapshot[] = [];
  sweeps: Sweep[] = [];
  strikes: Strike[] = [];
  pops: number[] = [];
  onStop: (() => void) | null = null;

  private timer: number | null = null;
  private sweep: Sweep | null = null;
  private step = 0;
  private nextTime = 0;

  constructor() {
    this.resetSnapshots();
  }

  private resetSnapshots() {
    this.snapshots = [{ time: -Infinity, gen: this.gen, cells: this.cells, trails: this.trails }];
  }

  snapshotAt(t: number): Snapshot {
    let s = this.snapshots[0];
    for (const x of this.snapshots) if (x.time <= t) s = x;
    return s;
  }

  /** The snapshot showing at t, plus the one before it (for birth/death transitions). */
  transitionAt(t: number): { snap: Snapshot; prev: Snapshot | null } {
    let idx = 0;
    for (let i = 0; i < this.snapshots.length; i++) if (this.snapshots[i].time <= t) idx = i;
    return { snap: this.snapshots[idx], prev: idx > 0 ? this.snapshots[idx - 1] : null };
  }

  sweepAt(t: number): Sweep | null {
    for (let i = this.sweeps.length - 1; i >= 0; i--) {
      const s = this.sweeps[i];
      if (t >= s.start && t < s.start + s.steps * s.stepDur) return s;
    }
    return null;
  }

  has(x: number, y: number) {
    return this.cells.has(key(x, y));
  }

  /** Returns true if a cell was added. */
  toggle(x: number, y: number): boolean {
    const k = key(x, y);
    if (this.cells.delete(k)) return false;
    this.cells.set(k, { x, y, age: 0 });
    this.trails.delete(k);
    return true;
  }

  add(x: number, y: number): boolean {
    if (this.has(x, y)) return false;
    return this.toggle(x, y);
  }

  place(cells: [number, number][], cx = 0, cy = 0) {
    for (const [dx, dy] of cells) this.add(cx + dx, cy + dy);
  }

  strike(x: number, y: number, time: number) {
    this.strikes.push({ x, y, time, midi: noteAt(this.root, this.scale, x, y) });
  }

  clear() {
    this.stop();
    this.cells = new Map();
    this.trails = new Map();
    this.gen = 0;
    this.pops = [];
    this.strikes = [];
    this.resetSnapshots();
  }

  setMode(m: Mode) {
    if (m === this.mode) return;
    const crossesCell = m === 'cell' || this.mode === 'cell';
    this.mode = m;
    if (crossesCell) {
      this.sweep = null; // abandon the sweep in progress
      this.sweeps = [];
    } // scan <-> arp share the scanline, so the sweep just carries on

  }

  start() {
    if (this.playing) return;
    const c = initAudio();
    this.playing = true;
    this.sweep = null;
    this.nextTime = c.currentTime + 0.06;
    this.resetSnapshots();
    this.timer = window.setInterval(() => this.tick(), 25);
    this.tick();
  }

  stop() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    const wasPlaying = this.playing;
    this.playing = false;
    this.sweep = null;
    this.sweeps = [];
    this.resetSnapshots();
    if (wasPlaying) this.onStop?.();
  }

  private tick() {
    const c = ctx();
    if (!c || !this.playing) return;
    // Tab was throttled: skip ahead instead of firing a burst of stale notes.
    if (this.nextTime < c.currentTime - 0.2) {
      this.nextTime = c.currentTime + 0.05;
      this.sweep = null;
    }
    while (this.playing && this.nextTime < c.currentTime + LOOKAHEAD) {
      if (this.mode === 'cell') {
        this.cellBeat(this.nextTime);
        continue;
      }
      if (!this.sweep && !this.beginSweep(this.nextTime)) {
        this.stop();
        return;
      }
      const sw = this.sweep!;
      this.playStep(sw, this.step, this.nextTime);
      this.step++;
      this.nextTime += sw.stepDur;
      if (this.step >= sw.steps) {
        this.advance(this.nextTime);
        this.sweep = null;
      }
    }
  }

  private beginSweep(t: number): boolean {
    if (this.cells.size === 0) return false;
    let minX = Infinity, maxX = -Infinity;
    for (const c of this.cells.values()) {
      if (c.x < minX) minX = c.x;
      if (c.x > maxX) maxX = c.x;
    }
    const cols = maxX - minX + 1;
    // One step per column, leftmost cell to rightmost cell, no padding; squeezed to one bar if wider.
    const steps = Math.min(cols, MAX_STEPS);
    const stepDur = 60 / this.bpm / 4;
    this.sweep = { start: t, minX, cols, steps, stepDur };
    this.sweeps.push(this.sweep);
    if (this.sweeps.length > 4) this.sweeps.shift();
    this.step = 0;
    setEcho(stepDur * 3); // dotted-eighth echo
    return true;
  }

  private playStep(sw: Sweep, step: number, t: number) {
    const hits: Cell[] = [];
    for (const c of this.cells.values()) {
      const i = c.x - sw.minX;
      if (i >= 0 && i < sw.cols && stepOf(sw, i) === step) hits.push(c);
    }
    if (!hits.length) return;

    if (this.mode === 'arp') {
      const audible = hits.filter((c) => isAudible(noteAt(this.root, this.scale, c.x, c.y)));
      if (!audible.length) return;
      const c = audible[Math.floor(Math.random() * audible.length)];
      const midi = noteAt(this.root, this.scale, c.x, c.y);
      const pan = sw.cols > 1 ? ((c.x - sw.minX) / (sw.cols - 1)) * 1.4 - 0.7 : 0;
      const nb = neighbours(this.cells, c.x, c.y);
      voice(midi, t, nb === 3 ? 0.95 : 0.8, pan, Math.max(0.6, sw.stepDur * 8));
      this.strikes.push({ x: c.x, y: c.y, time: t, midi, hold: sw.stepDur });
      if (this.strikes.length > 600) this.strikes = this.strikes.slice(-300);
      return;
    }

    let notes = hits
      .map((c) => ({ c, midi: noteAt(this.root, this.scale, c.x, c.y) }))
      .filter((n) => isAudible(n.midi))
      .sort((a, b) => a.midi - b.midi)
      .filter((n, i, arr) => i === 0 || arr[i - 1].midi !== n.midi);

    if (notes.length > MAX_VOICES) {
      const picked = [];
      for (let i = 0; i < MAX_VOICES; i++) picked.push(notes[Math.round((i * (notes.length - 1)) / (MAX_VOICES - 1))]);
      notes = picked;
    }

    const g = 1 / Math.sqrt(Math.max(1, notes.length));
    const dur = Math.max(0.5, sw.stepDur * 7);

    for (const n of notes) {
      const pan = sw.cols > 1 ? ((n.c.x - sw.minX) / (sw.cols - 1)) * 1.4 - 0.7 : 0;
      const nb = neighbours(this.cells, n.c.x, n.c.y);
      const vel = (nb === 3 ? 1 : nb === 2 ? 0.8 : 0.6) * g;
      voice(n.midi, t, vel, pan, dur);
    }
    // Every audible cell on this step flashes, even ones merged into a shared voice.
    for (const c of hits) {
      const midi = noteAt(this.root, this.scale, c.x, c.y);
      if (isAudible(midi)) this.strikes.push({ x: c.x, y: c.y, time: t, midi });
    }
    if (this.strikes.length > 600) this.strikes = this.strikes.slice(-300);
  }

  /** CELL mode: step the board on the beat, then arpeggiate the births across it in 32nds. */
  private cellBeat(t: number) {
    if (this.cells.size === 0) {
      this.stop();
      return;
    }
    const beat = 60 / this.bpm;
    setEcho(beat * 0.75);
    this.advance(t);
    this.nextTime = t + beat;

    let births = [...this.cells.values()]
      .filter((c) => c.age === 0)
      .sort((a, b) => a.x - b.x || a.y - b.y);
    const SLOTS = 8;
    if (births.length > SLOTS) {
      const picked = [];
      for (let i = 0; i < SLOTS; i++) picked.push(births[Math.round((i * (births.length - 1)) / (SLOTS - 1))]);
      births = picked;
    }
    let minX = Infinity, maxX = -Infinity;
    for (const c of this.cells.values()) {
      minX = Math.min(minX, c.x);
      maxX = Math.max(maxX, c.x);
    }
    births.forEach((c, i) => {
      const midi = noteAt(this.root, this.scale, c.x, c.y);
      if (!isAudible(midi)) return;
      const at = t + (i * beat) / SLOTS;
      const pan = maxX > minX ? ((c.x - minX) / (maxX - minX)) * 1.4 - 0.7 : 0;
      voice(midi, at, 0.85, pan, Math.max(0.5, beat * 1.5));
      this.strikes.push({ x: c.x, y: c.y, time: at, midi });
    });
    if (this.strikes.length > 600) this.strikes = this.strikes.slice(-300);
  }

  private advance(t: number) {
    const r = stepLife(this.cells, this.trails, this.rule);
    this.cells = r.cells;
    this.trails = r.trails;
    this.gen++;
    this.pops.push(this.cells.size);
    if (this.pops.length > 96) this.pops.shift();
    this.snapshots.push({ time: t, gen: this.gen, cells: this.cells, trails: this.trails });
    if (this.snapshots.length > 6) this.snapshots.shift();
  }
}
