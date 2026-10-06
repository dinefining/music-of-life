export const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Scale set and names from TidalCycles (Sound.Tidal.Scales), in Tidal's order. */
export const SCALES: Record<string, number[]> = {
  // 5 notes
  minPent: [0, 3, 5, 7, 10],
  majPent: [0, 2, 4, 7, 9],
  ritusen: [0, 2, 5, 7, 9],
  egyptian: [0, 2, 5, 7, 10],
  kumai: [0, 2, 3, 7, 9],
  hirajoshi: [0, 2, 3, 7, 8],
  iwato: [0, 1, 5, 6, 10],
  chinese: [0, 4, 6, 7, 11],
  indian: [0, 4, 5, 7, 10],
  pelog: [0, 1, 3, 7, 8],
  prometheus: [0, 2, 4, 6, 11],
  scriabin: [0, 1, 4, 7, 9],
  gong: [0, 2, 4, 7, 9],
  shang: [0, 2, 5, 7, 10],
  jiao: [0, 3, 5, 8, 10],
  zhi: [0, 2, 5, 7, 9],
  yu: [0, 3, 5, 7, 10],
  // 6 notes
  whole: [0, 2, 4, 6, 8, 10],
  augmented: [0, 3, 4, 7, 8, 11],
  augmented2: [0, 1, 4, 5, 8, 9],
  hexMajor7: [0, 2, 4, 7, 9, 11],
  hexDorian: [0, 2, 3, 5, 7, 10],
  hexPhrygian: [0, 1, 3, 5, 8, 10],
  hexSus: [0, 2, 5, 7, 9, 10],
  hexMajor6: [0, 2, 4, 5, 7, 9],
  hexAeolian: [0, 3, 5, 7, 8, 10],
  // 7 notes
  major: [0, 2, 4, 5, 7, 9, 11],
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  harmonicMajor: [0, 2, 4, 5, 7, 8, 11],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],
  melodicMinorDesc: [0, 2, 3, 5, 7, 8, 10],
  melodicMajor: [0, 2, 4, 5, 7, 8, 10],
  bartok: [0, 2, 4, 5, 7, 8, 10],
  hindu: [0, 2, 4, 5, 7, 8, 10],
  todi: [0, 1, 3, 6, 7, 8, 11],
  purvi: [0, 1, 4, 6, 7, 8, 11],
  marva: [0, 1, 4, 6, 7, 9, 11],
  bhairav: [0, 1, 4, 5, 7, 8, 11],
  ahirbhairav: [0, 1, 4, 5, 7, 9, 10],
  superLocrian: [0, 1, 3, 4, 6, 8, 10],
  romanianMinor: [0, 2, 3, 6, 7, 9, 10],
  hungarianMinor: [0, 2, 3, 6, 7, 8, 11],
  neapolitanMinor: [0, 1, 3, 5, 7, 8, 11],
  enigmatic: [0, 1, 4, 6, 8, 10, 11],
  spanish: [0, 1, 4, 5, 7, 8, 10],
  leadingWhole: [0, 2, 4, 6, 8, 10, 11],
  lydianMinor: [0, 2, 4, 6, 7, 8, 10],
  neapolitanMajor: [0, 1, 3, 5, 7, 9, 11],
  locrianMajor: [0, 2, 4, 5, 6, 8, 10],
  // 8 notes
  diminished: [0, 1, 3, 4, 6, 7, 9, 10],
  diminished2: [0, 2, 3, 5, 6, 8, 9, 11],
  // 12 notes
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

export const SCALE_NAMES = Object.keys(SCALES);

/** Scale names grouped by note count, for the menu. */
export const SCALE_GROUPS: { size: number; names: string[] }[] = [...new Set(SCALE_NAMES.map((n) => SCALES[n].length))].map(
  (size) => ({ size, names: SCALE_NAMES.filter((n) => SCALES[n].length === size) }),
);

/** Playable range. Notes outside it are folded back in by whole octaves, so every cell sounds. */
export const MIDI_LOW = 33; // A1
export const MIDI_HIGH = 96; // C7

export function getNoteName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${PITCH_CLASSES[pc]}${octave}`;
}

export function getFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Grid → pitch. Rightward = +1 scale degree, upward = +STACK degrees (a third by default).
 * So vertical stacks are chords, and diagonals are melodic runs.
 */
/** Scale degrees between one row and the row above it. 0 means "one octave" (the scale's length). */
export const STACKS: Record<string, number> = { '2nd': 1, '3rd': 2, '4th': 3, '5th': 4, octave: 0 };
let rowStep = 2;
export function setStack(name: string) {
  if (name in STACKS) rowStep = STACKS[name];
}

export function noteAt(rootMidi: number, scaleName: string, x: number, y: number): number {
  const iv = SCALES[scaleName];
  const n = iv.length;
  const degree = x - (rowStep || n) * y; // screen y grows downward
  const idx = ((degree % n) + n) % n;
  const oct = Math.floor(degree / n);
  let midi = rootMidi + iv[idx] + oct * 12;
  // Fold into range: same note name, nearest playable octave.
  while (midi < MIDI_LOW) midi += 12;
  while (midi > MIDI_HIGH) midi -= 12;
  return midi;
}

export function isAudible(midi: number): boolean {
  return midi >= MIDI_LOW && midi <= MIDI_HIGH;
}
