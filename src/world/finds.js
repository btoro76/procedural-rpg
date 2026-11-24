// Finds are the small things between the made places: a chest under a cairn,
// a ring of stones that lends a boon, a watch tower whose fire can be seen
// over the trees. One may stand in each cell of a coarse grid, where the land
// is dry and no site is near; which kind, where in the cell and what it is
// called all come from the seed. They give the wilds somewhere to go.
//
// A find kind is a row here: what to build (props, each in its own 4x4 prop
// cell: the centre snaps to a cell's middle and companions sit one cell away)
// and a name. What happens when the hero reaches one is the game's business
// (game/systems/discover.js).

import { WORLD } from '../config.js';
import { hash01 } from '../core/rng.js';
import { placeName } from './sites.js';

const F = 96;                 // one cell of the finds grid
const C = WORLD.CELL;

export const FIND_KINDS = {
  cache: {
    weight: 5, clear: 4.5,
    name: () => 'Cache',
    build: (x, z, r) => [{ id: 'chest', x, z, rot: r(1) * 6.28 }, { id: 'cairn', x: x + (r(2) < 0.5 ? C : -C), z: z + (r(3) < 0.5 ? C : 0), rot: r(4) * 6.28, scale: 1.25 }],
  },
  stones: {
    weight: 3, clear: 7,
    name: (n) => `${n} Stones`,
    build: (x, z, r) => [{ id: 'crystal', x, z, rot: r(1) * 6.28, scale: 1.3 },
      { id: 'stone', x: x + C, z: z + C, rot: 0.8, seed: r(2), scale: 0.62 }, { id: 'stone', x: x - C, z: z + C, rot: -0.8, seed: r(3), scale: 0.62 },
      { id: 'stone', x, z: z - C, rot: 3.14, seed: r(4), scale: 0.62 }],
  },
  beacon: {
    weight: 2, clear: 8,
    name: (n) => `${n} Beacon`,
    build: (x, z, r) => [{ id: 'beacon', x, z, rot: r(1) * 6.28 }, { id: 'signpost', x: x + C, z: z + C, rot: r(2) * 6.28 }],
  },
};
const TOTAL = Object.values(FIND_KINDS).reduce((n, k) => n + k.weight, 0);

export function createFinds(seed, height, sites) {
  const cache = new Map();

  function findAt(i, j) {
    const key = 'f' + i + ',' + j;
    if (cache.has(key)) return cache.get(key);
    let find = null;
    if (hash01(i, j, seed + 701) < 0.62) {
      // somewhere in the middle of the cell, on the middle of a prop cell
      const x = (Math.floor((i + 0.2 + 0.6 * hash01(i, j, seed + 702)) * F / C) + 0.5) * C;
      const z = (Math.floor((j + 0.2 + 0.6 * hash01(i, j, seed + 703)) * F / C) + 0.5) * C;
      const h = height(x, z), site = sites.near(x, z);
      const flat = Math.abs(height(x + 3, z) - h) < 1.2 && Math.abs(height(x, z + 3) - h) < 1.2;
      if (h > 1.4 && h < 15 && flat && !(site && Math.hypot(site.x - x, site.z - z) < site.clear + 16)) {
        let roll = hash01(i, j, seed + 704) * TOTAL, kind = 'cache';
        for (const id in FIND_KINDS) { roll -= FIND_KINDS[id].weight; if (roll <= 0) { kind = id; break; } }
        const def = FIND_KINDS[kind];
        const rand = (k) => hash01(i * 5 + k, j * 11 - k, seed + 710 + k);
        find = { key, kind, x, z, i, j, clear: def.clear, name: def.name(placeName(i + 400, j - 300, seed)), structures: def.build(x, z, rand) };
      }
    }
    cache.set(key, find);
    return find;
  }

  return {
    findAt,
    /** The only find that can stand near this point. */
    near: (x, z) => findAt(Math.floor(x / F), Math.floor(z / F)),
    /** Every find within `range` of (x, z). */
    inRange(x, z, range) {
      const out = [];
      for (let i = Math.floor((x - range) / F); i <= Math.floor((x + range) / F); i++) for (let j = Math.floor((z - range) / F); j <= Math.floor((z + range) / F); j++) {
        const f = findAt(i, j);
        if (f && Math.hypot(f.x - x, f.z - z) <= range) out.push(f);
      }
      return out;
    },
  };
}
