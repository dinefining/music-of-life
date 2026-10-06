import { getFrequency } from './music';

let _ctx: AudioContext | null = null;
let bus: GainNode;
let delay: DelayNode;
let dSend: GainNode;
let rSend: GainNode;
let fb: GainNode;
let dry: GainNode;
let space = 0.5;

export function ctx() {
  return _ctx;
}

function impulse(c: AudioContext, seconds: number, decay: number) {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export function initAudio() {
  if (!_ctx) {
    const c = new (window.AudioContext || (window as any).webkitAudioContext)({ latencyHint: 'interactive' });
    _ctx = c;

    // Glue: gentle compression so dense columns don't clip.
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    comp.connect(c.destination);

    bus = c.createGain();
    bus.gain.value = 0.6;
    dry = c.createGain();
    bus.connect(dry).connect(comp);

    // Tempo-synced echo (time set per sweep), darkened and thinned in the loop.
    delay = c.createDelay(2);
    delay.delayTime.value = 0.375;
    fb = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 180;
    dSend = c.createGain();
    bus.connect(dSend).connect(delay);
    delay.connect(lp).connect(hp);
    hp.connect(fb).connect(delay);
    hp.connect(comp);

    // Small synthetic room.
    const verb = c.createConvolver();
    verb.buffer = impulse(c, 4, 2);
    rSend = c.createGain();
    bus.connect(rSend).connect(verb).connect(comp);
    applySpace(c.currentTime, true);
  }
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

/** Audio-clock time corrected for output latency: "what you are hearing now". */
export function heardNow(): number {
  if (!_ctx) return Infinity;
  const lat = (_ctx as any).outputLatency || _ctx.baseLatency || 0;
  return _ctx.currentTime - lat;
}

/**
 * ECHO amount, 0..1. One knob drives the whole wet chain so the range is obvious:
 * 0 = completely dry; 0.5 = a few beat-synced repeats in a room; 1 = long trails
 * (feedback ~0.7, many repeats), a big reverb, and the dry note pulled back a little.
 */
function applySpace(t: number, immediate = false) {
  const v = space;
  const set = (p: AudioParam, x: number) => (immediate ? p.setValueAtTime(x, t) : p.setTargetAtTime(x, t, 0.08));
  set(dSend.gain, 0.95 * v);
  set(fb.gain, 0.08 + 0.62 * v); // repeats: ~1 at 0, ~3 at 0.5, ~10 at 1
  set(rSend.gain, 1.1 * v * v + 0.15 * v); // reverb grows faster near the top
  set(dry.gain, 1 - 0.3 * v * v);
}

export function setSpace(v: number) {
  space = Math.max(0, Math.min(1, v));
  if (_ctx) applySpace(_ctx.currentTime);
}

export function setEcho(seconds: number) {
  if (!_ctx) return;
  delay.delayTime.setTargetAtTime(Math.min(seconds, 1.9), _ctx.currentTime, 0.05);
}

// ---- voices ---------------------------------------------------------------
// Every sound is synthesized live. Levels are matched by offline RMS measurement (±1.5 dB of mallet). A preset builds one note into `out` (already panned),
// shapes its own envelope, and returns the time the note is fully silent.

type Ctx = { c: AudioContext; out: AudioNode; f: number; t: number; vel: number; dur: number };
type Preset = { label: string; build: (v: Ctx) => number };

const osc = (c: AudioContext, type: OscillatorType, freq: number, t: number, end: number, detuneCents = 0) => {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detuneCents;
  o.start(t);
  o.stop(end);
  return o;
};
const gain = (c: AudioContext, v: number) => {
  const g = c.createGain();
  g.gain.value = v;
  return g;
};
/** Fast attack, exponential-style decay. */
const perc = (c: AudioContext, t: number, peak: number, attack: number, decay: number) => {
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setTargetAtTime(0, t + attack, decay);
  return g;
};

export const SOUNDS: Record<string, Preset> = {
  // Soft triangle mallet with an octave overtone and a sub (the original voice).
  mallet: {
    label: 'mallet',
    build: ({ c, out, f, t, vel, dur }) => {
      const end = t + dur * 1.8;
      const env = perc(c, t, 0.3 * vel, 0.006, dur / 4);
      env.connect(out);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 0.8;
      lp.frequency.setValueAtTime(Math.min(f * 7, 10000), t);
      lp.frequency.exponentialRampToValueAtTime(Math.max(f * 1.3, 220), t + dur * 0.7);
      lp.connect(env);
      osc(c, 'triangle', f, t, end).connect(lp);
      osc(c, 'sine', f * 2.002, t, end).connect(gain(c, 0.22)).connect(lp);
      if (f > 110) osc(c, 'sine', f / 2, t, end).connect(gain(c, 0.28)).connect(env);
      return end;
    },
  },
  // Pure sine with a whisper of 2nd harmonic. Soft and round.
  sine: {
    label: 'sine',
    build: ({ c, out, f, t, vel, dur }) => {
      const end = t + dur * 2;
      const env = perc(c, t, 0.24 * vel, 0.012, dur / 3);
      env.connect(out);
      osc(c, 'sine', f, t, end).connect(env);
      osc(c, 'sine', f * 2, t, end).connect(gain(c, 0.07)).connect(env);
      return end;
    },
  },
  // Bright detuned saw through a snapping resonant filter. Short and percussive.
  pluck: {
    label: 'pluck',
    build: ({ c, out, f, t, vel, dur }) => {
      const d = Math.min(dur, 0.9);
      const end = t + d * 1.4;
      const env = perc(c, t, 0.3 * vel, 0.002, d / 6);
      env.connect(out);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 3;
      lp.frequency.setValueAtTime(Math.min(f * 14, 14000), t);
      lp.frequency.exponentialRampToValueAtTime(Math.max(f * 1.5, 180), t + 0.14);
      lp.connect(env);
      osc(c, 'sawtooth', f, t, end).connect(lp);
      osc(c, 'sawtooth', f, t, end, 9).connect(gain(c, 0.5)).connect(lp);
      return end;
    },
  },
  // FM bell: inharmonic modulator (3.5:1) whose brightness dies away. Long ring.
  bell: {
    label: 'bell',
    build: ({ c, out, f, t, vel, dur }) => {
      const ring = Math.max(1.2, dur * 2.2);
      const end = t + ring * 1.3;
      const env = perc(c, t, 0.18 * vel, 0.002, ring / 3.5);
      env.connect(out);
      const car = osc(c, 'sine', f, t, end);
      const mod = osc(c, 'sine', f * 3.5, t, end);
      const idx = c.createGain();
      idx.gain.setValueAtTime(f * 5, t);
      idx.gain.exponentialRampToValueAtTime(f * 0.3, t + ring * 0.6);
      mod.connect(idx).connect(car.frequency);
      car.connect(env);
      return end;
    },
  },
  // Electric-piano-ish FM (1:1) with a quick bright "tine" at the start.
  keys: {
    label: 'keys',
    build: ({ c, out, f, t, vel, dur }) => {
      const end = t + dur * 2;
      const env = perc(c, t, 0.24 * vel, 0.004, dur / 3);
      env.connect(out);
      const car = osc(c, 'sine', f, t, end);
      const mod = osc(c, 'sine', f, t, end);
      const idx = c.createGain();
      idx.gain.setValueAtTime(f * 2.2, t);
      idx.gain.setTargetAtTime(f * 0.15, t, 0.12);
      mod.connect(idx).connect(car.frequency);
      car.connect(env);
      const tine = perc(c, t, 0.05 * vel, 0.001, 0.04);
      osc(c, 'sine', f * 7, t, t + 0.3).connect(tine).connect(out);
      return end;
    },
  },
  // Three detuned saws, slow-ish attack, gentle filter. Wide and pad-like.
  saw: {
    label: 'saw',
    build: ({ c, out, f, t, vel, dur }) => {
      const end = t + dur * 2.2;
      const env = perc(c, t, 0.145 * vel, 0.035, dur / 2);
      env.connect(out);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 1;
      lp.frequency.setValueAtTime(Math.min(f * 4, 8000), t);
      lp.frequency.exponentialRampToValueAtTime(Math.max(f * 1.6, 300), t + dur);
      lp.connect(env);
      for (const cents of [-9, 0, 9]) osc(c, 'sawtooth', f, t, end, cents).connect(lp);
      return end;
    },
  },
  // 8-bit square: instant on, short tail, a touch of pitch drop at the start.
  chip: {
    label: 'chip',
    build: ({ c, out, f, t, vel, dur }) => {
      const d = Math.min(dur, 0.7);
      const end = t + d * 1.2;
      const env = perc(c, t, 0.24 * vel, 0.001, d / 7);
      env.connect(out);
      const o = osc(c, 'square', f, t, end);
      o.frequency.setValueAtTime(f * 1.03, t);
      o.frequency.linearRampToValueAtTime(f, t + 0.02);
      o.connect(env);
      return end;
    },
  },
  // Drawbar organ: four sine partials, flat sustain, quick release.
  organ: {
    label: 'organ',
    build: ({ c, out, f, t, vel, dur }) => {
      const hold = Math.max(0.15, dur * 0.45);
      const end = t + hold + 0.12;
      const env = c.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.11 * vel, t + 0.012);
      env.gain.setValueAtTime(0.11 * vel, t + hold);
      env.gain.linearRampToValueAtTime(0, t + hold + 0.1);
      env.connect(out);
      [[1, 1], [2, 0.6], [3, 0.35], [4, 0.22]].forEach(([h, g]) => osc(c, 'sine', f * h, t, end).connect(gain(c, g)).connect(env));
      return end;
    },
  },
};
export const SOUND_NAMES = Object.keys(SOUNDS);

let currentSound = 'mallet';
export function setSound(name: string) {
  if (SOUNDS[name]) currentSound = name;
}

export function voice(midi: number, t: number, vel: number, pan: number, dur: number) {
  const c = _ctx;
  if (!c) return;
  const panner = c.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  panner.connect(bus);
  const end = SOUNDS[currentSound].build({ c, out: panner, f: getFrequency(midi), t, vel, dur });
  // Free the graph once the note has rung out.
  const timer = c.createConstantSource();
  timer.start(t);
  timer.stop(end + 0.05);
  timer.onended = () => panner.disconnect();
}

/** Immediate one-shot for clicks and piano presses. */
export function audition(midi: number) {
  const c = initAudio();
  voice(midi, c.currentTime + 0.01, 0.8, 0, 0.7);
  return c.currentTime + 0.01;
}
