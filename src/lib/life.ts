export type Cell = { x: number; y: number; age: number };
export type Trail = { x: number; y: number; t: number };

/** How many generations a dead cell lingers as an afterimage. */
export const TRAIL_GENS = 8;
/** Age (in generations) at which a cell reaches full black. */
export const AGE_FULL = 6;

export const key = (x: number, y: number) => `${x},${y}`;

const OFFSETS = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

export function neighbours(cells: Map<string, Cell>, x: number, y: number): number {
  let n = 0;
  for (const [dx, dy] of OFFSETS) if (cells.has(key(x + dx, y + dy))) n++;
  return n;
}

/** Life-like rules in B/S notation: born with these neighbour counts, survive with those. */
export type Rule = { birth: number[]; survive: number[] };
export const RULES: Record<string, Rule> = {
  conway: { birth: [3], survive: [2, 3] }, // B3/S23: the Game of Life
  highlife: { birth: [3, 6], survive: [2, 3] }, // B36/S23: has a self-copying replicator
  seeds: { birth: [2], survive: [] }, // B2/S: every cell dies each step; explosive, twitchy
  dayNight: { birth: [3, 6, 7, 8], survive: [3, 4, 6, 7, 8] }, // B3678/S34678: symmetric blobs
  maze: { birth: [3], survive: [1, 2, 3, 4, 5] }, // B3/S12345: grows corridors, settles into walls
  lifeWithoutDeath: { birth: [3], survive: [0, 1, 2, 3, 4, 5, 6, 7, 8] }, // B3/S012345678: only grows
  twoByTwo: { birth: [3, 6], survive: [1, 2, 5] }, // B36/S125 '2x2': 2×2-block patterns stay 2×2
  move: { birth: [3, 6, 8], survive: [2, 4, 5] }, // B368/S245 'Morley' (Move): slow, high-period spaceships
};
export const RULE_NAMES = Object.keys(RULES);
/** Published names (LifeWiki / Wikipedia "Life-like cellular automaton"). */
export const RULE_LABELS: Record<string, string> = {
  conway: 'Life',
  highlife: 'HighLife',
  seeds: 'Seeds',
  dayNight: 'Day & Night',
  maze: 'Maze',
  lifeWithoutDeath: 'Life without Death',
  twoByTwo: '2x2',
  move: 'Morley',
};
/** One line on what each rule tends to do, for the rules card. */
export const RULE_NOTES: Record<string, string> = {
  conway: 'The classic Game of Life. Patterns settle, oscillate or glide away.',
  highlife: 'Like Conway, plus births at 6. Known for a pattern that copies itself.',
  seeds: 'Nothing survives. Every cell lives one step, so it flickers and explodes.',
  dayNight: 'Live and empty behave the same way. Grows smooth, symmetric blobs.',
  maze: 'Cells hardly ever die, so growth hardens into corridors and walls.',
  lifeWithoutDeath: 'Nothing ever dies. Patterns only grow, like ink spreading.',
  twoByTwo: 'Patterns built from 2×2 blocks keep evolving as 2×2 blocks.',
  move: 'Also called Move. Known for very slow, long-period spaceships.',
};
export const ruleCode = (r: Rule) => `B${r.birth.join('')}/S${r.survive.join('')}`;

/** One generation under `rule`. Returns fresh maps; the inputs are left untouched. */
export function stepLife(cells: Map<string, Cell>, trails: Map<string, Trail>, rule: Rule = RULES.conway) {
  const counts = new Map<string, { x: number; y: number; n: number }>();
  for (const c of cells.values()) {
    for (const [dx, dy] of OFFSETS) {
      const x = c.x + dx, y = c.y + dy, k = key(x, y);
      const e = counts.get(k);
      if (e) e.n++;
      else counts.set(k, { x, y, n: 1 });
    }
  }

  const next = new Map<string, Cell>();
  for (const [k, e] of counts) {
    const alive = cells.get(k);
    if (alive && rule.survive.includes(e.n)) next.set(k, { x: e.x, y: e.y, age: alive.age + 1 });
    else if (!alive && rule.birth.includes(e.n)) next.set(k, { x: e.x, y: e.y, age: 0 });
  }

  if (rule.survive.includes(0)) {
    for (const [k, c] of cells) if (!counts.has(k)) next.set(k, { ...c, age: c.age + 1 });
  }

  const nextTrails = new Map<string, Trail>();
  for (const [k, tr] of trails) {
    if (tr.t + 1 < TRAIL_GENS && !next.has(k)) nextTrails.set(k, { ...tr, t: tr.t + 1 });
  }
  for (const [k, c] of cells) {
    if (!next.has(k)) nextTrails.set(k, { x: c.x, y: c.y, t: 0 });
  }

  return { cells: next, trails: nextTrails };
}

/** Cells drawn on the board when the app opens (an R-pentomino), so Play works straight away. */
export const OPENING: [number, number][] = [[0, -1], [1, -1], [-1, 0], [0, 0], [0, 1]];
