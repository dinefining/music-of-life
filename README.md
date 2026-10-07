# Music of Life

Conway's Game of Life as a sequencer. Plant cells, press play, and the pattern plays itself as it grows: a scanline sweeps left to right, every live cell it crosses is a note, and after each sweep the board steps one generation, so the tune keeps changing.

## Run it

Open `index.html`. That's it: the app is plain static files (`index.html`, `app.js`, `style.css`) with no build step and nothing to install. It runs from a double-click, offline, or from any static host.

**GitHub Pages:** push this folder as a repo, then **Settings → Pages → Deploy from a branch → `main` / root**. It appears at `https://<user>.github.io/<repo>/`.

## Edit it

The editable source (React + TypeScript + Vite) lives in `source/`. After changing it, regenerate the root files:

    cd source
    npm install
    npm run dev          # live preview at http://localhost:3000
    npm run build:site   # rewrites ../index.html, ../app.js, ../style.css

## How it plays

- **Pitch:** further right is higher in the scale (+1 degree per column); further up is higher by the **stack** interval (2nd, 3rd, 4th, 5th or octave per row). Notes outside A1–C7 fold back by octaves.
- **Modes:** *Scan* plays every live cell the line crosses. *Arp* plays one random cell per step (shown red). *Cell* steps a generation every beat and arpeggiates the newborn cells.
- **Colour:** cells age from white to grey; cells on the key note are green.
- **Sounds:** mallet, sine, pluck, bell, keys, saw, chip, organ — all synthesised with Web Audio, levels matched. **Echo** blends a tempo-synced delay and reverb.
- **Scales:** the TidalCycles scale list, grouped by note count.

## Rules

The leaf button opens the rule editor. Pick a published Life-like rule as a starting point — Life (B3/S23), HighLife, Seeds, Day & Night, Maze, Life without Death, 2x2, Morley — then toggle the neighbour counts needed for **birth** and for **survival**. Animated examples underneath show what the current rule does to a single cell.

## Controls

Click a square to plant · Shift + drag to plant many · Drag to pan · Scroll to zoom

On touch: tap to plant · drag to pan · long-press, then drag to paint · pinch to zoom

| Key | | Key | |
|---|---|---|---|
| Space | Play / pause | M | Next mode (Shift + M back) |
| Backspace | Clear | S / V | Scale / sound menu |
| H | Settings | Z / X | Octave down / up |
| R | Rule editor | ← / → | Key note |
| I | Info | L | Note names |
| Esc | Close | | |

## Design system

Black canvas, JetBrains Mono throughout, dark grey panels, off-white text (`--ink`). One spacing token (`--gap: 3px`) between every field, key, example square and board cell; 16px panel padding; 32px page margins (16px on phones). Widths are measured in button steps (48px button + 3px gap): desktop panels are 6 buttons wide (303px), exactly two of the 3-button bar. Controls (fields, menus, buttons) are in caps; everything else is regular case. Fields are 30px on desktop and step up to the 48px button size on phones, where panels fill the screen between the title and the button row. Tokens live at the top of `src/index.css`.

## Where things live (in `source/`)

- `src/App.tsx` – layout, panels, keyboard shortcuts
- `src/components/Board.tsx` – canvas renderer, pan / zoom / paint, auto-framing
- `src/components/RulesCard.tsx` – rule editor and animated examples
- `src/components/InfoCard.tsx` – about panel (its letters live and die by the current rule)
- `src/components/Dropdown.tsx`, `Keys.tsx` – shared field-style dropdown and the piano
- `src/lib/engine.ts` – sequencer, lookahead scheduling on the AudioContext clock
- `src/lib/life.ts` – Life-like rules, ageing, trails
- `src/lib/music.ts` – scales and the grid → pitch mapping (`noteAt`)
- `src/lib/audio.ts` – voices, echo, reverb, compressor

Built with React, TypeScript, Vite and Tailwind.
