import React from 'react';
import { PITCH_CLASSES } from '../lib/music';
import { cn } from '../lib/utils';

interface Props {
  rootPc: number;
  inScale: (pc: number) => boolean;
  onSelect: (pc: number) => void;
}

const WHITE = [0, 2, 4, 5, 7, 9, 11];
// Sharps and the white key each one follows (index into WHITE).
const BLACK: [number, number][] = [[1, 0], [3, 1], [6, 3], [8, 4], [10, 5]];

/**
 * One octave as two rows of 30px keys (the field height), spaced with the shared --gap:
 * naturals along the bottom, sharps above, each shifted half a key so it straddles
 * the two naturals it sits between. The key note is filled with the accent; a small
 * square marks every note in the current scale.
 *
 * Layout: a 14-column grid (two columns per natural). A natural spans 2 columns;
 * a sharp also spans 2, starting one column later, which centres it on the seam.
 */
export const Keys: React.FC<Props> = ({ rootPc, inScale, onSelect }) => {
  const key = (pc: number, col: number, row: 1 | 2, black: boolean) => {
    const root = pc === rootPc;
    return (
      <button
        key={pc}
        onClick={() => onSelect(pc)}
        aria-label={`Key of ${PITCH_CLASSES[pc]}`}
        aria-pressed={root}
        style={{ gridColumn: `${col} / span 2`, gridRow: row }}
        className={cn(
          'flex items-end justify-center pb-1 transition-colors focus:outline-none focus-visible:outline-1 focus-visible:outline-white focus-visible:-outline-offset-1',
          root ? 'bg-[var(--accent)]' : black ? 'bg-[#2a2a2a] hover:bg-[#363636]' : 'bg-[#474747] hover:bg-[#555]',
        )}
      >
        <span className={cn('w-[3px] h-[3px]', inScale(pc) ? (root ? 'bg-white' : 'bg-white/60') : 'bg-transparent')} />
      </button>
    );
  };

  return (
    <div className="grid grid-cols-[repeat(14,minmax(0,1fr))] [grid-template-rows:repeat(2,var(--key-row))] gap-[var(--gap)] w-full h-full" role="group" aria-label="Key note">
      {BLACK.map(([pc, after]) => key(pc, after * 2 + 2, 1, true))}
      {WHITE.map((pc, i) => key(pc, i * 2 + 1, 2, false))}
    </div>
  );
};
