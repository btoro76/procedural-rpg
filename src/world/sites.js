// Sites are the made places in an otherwise wild world: the starting town,
// wayside shrines, travellers' camps, old ruins, farms. They sit on the
// crossings of the road lattice, and which kind stands where, what it is
// called and how it is laid out all come from the seed.
//
// A site kind is a function that returns what to flatten, pave and build;
// register more kinds here and the generator, minimap and game pick them up.
// Structures must not share a 4x4 prop cell (the generator warns if they do);
// lattice points fall on cell corners, so layouts can be checked on paper.

import { WORLD } from '../config.js';
import { hash01 } from '../core/rng.js';

const L = WORLD.ROAD_L;
const kinds = new Map();

/**
 * build(ctx) -> { name, r, fade, h, plaza, ground, clear, safe, structures[], npcs[], den? } or null
 *   ctx: { x, z, i, j, natural, biome, name, rand(k) }     ground: 'cobble' | 'dirt'
 */
export function registerSiteKind(id, build, weight = 1, suits = null) {
  kinds.set(id, { build, weight, suits });
}

/** Rotation that turns a prop's local +z toward a target point. */
export const faceToward = (px, pz, tx, tz) => Math.atan2(-(tx - px), tz - pz);

// Place names are made, not listed: a root and an ending.
const ROOTS = ['Ald', 'Bram', 'Cor', 'Dun', 'Eld', 'Fen', 'Gar', 'Hal', 'Ith', 'Kel', 'Lor', 'Mar', 'Nor', 'Oak', 'Pen', 'Quil', 'Ros', 'Sel', 'Tor', 'Ul', 'Ver', 'Wyn', 'Ash', 'Brin', 'Cal', 'Thorn'];
const ENDS = ['wick', 'stead', 'mere', 'holt', 'ford', 'combe', 'garth', 'low', 'den', 'by', 'rest', 'hollow', 'well', 'moor', 'reach'];
export function placeName(i, j, seed) {
  return ROOTS[Math.floor(hash01(i, j, seed + 601) * ROOTS.length)] + ENDS[Math.floor(hash01(i, j, seed + 602) * ENDS.length)];
}

export function createSites(seed, naturalHeight, biomeIdAt) {
  const cache = new Map();

  function siteAt(i, j) {
    const key = i + ',' + j;
    if (cache.has(key)) return cache.get(key);
    const x = i * L, z = j * L;
    const natural = naturalHeight(x, z);
    const biome = biomeIdAt(x, z, natural);
    let kind = null;
    if (i === 0 && j === 0) kind = 'town';
    else if (hash01(i, j, seed + 501) < 0.82) {
      // a weighted draw among the kinds that suit this country
      const pool = [...kinds].filter(([id, k]) => id !== 'town' && (!k.suits || k.suits.includes(biome)));
      let roll = hash01(i, j, seed + 503) * pool.reduce((n, [, k]) => n + k.weight, 0);
      for (const [id, k] of pool) { roll -= k.weight; if (roll <= 0) { kind = id; break; } }
    }
    let site = null;
    if (kind) {
      const rand = (k) => hash01(i * 7 + k, j * 13 - k, seed + 510 + k);
      site = kinds.get(kind).build({ x, z, i, j, natural, biome, name: placeName(i, j, seed), rand });
      if (site) Object.assign(site, { kind, x, z, i, j, key, ground: site.ground || 'cobble' });
    }
    cache.set(key, site);
    return site;
  }

  return {
    siteAt,
    /** The only site that can influence this point (sites are far apart). */
    near: (x, z) => siteAt(Math.round(x / L), Math.round(z / L)),
    /** Every site whose lattice point lies within `range` of (x, z). */
    inRange(x, z, range) {
      const out = [];
      const i0 = Math.floor((x - range) / L), i1 = Math.ceil((x + range) / L);
      const j0 = Math.floor((z - range) / L), j1 = Math.ceil((z + range) / L);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const s = siteAt(i, j);
        if (s && Math.hypot(s.x - x, s.z - z) <= range) out.push(s);
      }
      return out;
    },
  };
}

const dry = (c) => c.natural > 1.6 && c.natural < 15;   // not drowned, not on a mountainside

// ------------------------------------------------------------------ town

registerSiteKind('town', ({ x, z }) => {
  const structures = [{ id: 'waystone', x, z, rot: 0 }];
  for (let k = 0; k < 4; k++) {
    for (const off of [-18, 18]) {
      const a = (45 + k * 90 + off) * Math.PI / 180;
      const hx = x + Math.cos(a) * 19.5, hz = z + Math.sin(a) * 19.5;
      structures.push({ id: 'house', x: hx, z: hz, rot: faceToward(hx, hz, x, z), seed: (k * 2 + (off > 0 ? 1 : 0)) / 8 + 0.05 });
    }
    const la = (45 + k * 90) * Math.PI / 180;
    structures.push({ id: 'lamp', x: x + Math.cos(la) * 12.5, z: z + Math.sin(la) * 12.5, rot: 0 });
  }
  structures.push({ id: 'stall', x: x + 9.5, z: z - 4.5, rot: faceToward(x + 9.5, z - 4.5, x, z), seed: 0.2 });
  structures.push({ id: 'stall', x: x - 9.5, z: z - 4.5, rot: faceToward(x - 9.5, z - 4.5, x, z), seed: 0.8 });
  structures.push({ id: 'well', x: x - 6.5, z: z + 8.5, rot: 0.4 });
  return {
    name: 'Hearthmere', r: 26, fade: 22, h: 3.0, plaza: 13.5, clear: 27, safe: 30,
    structures,
    npcs: [
      { id: 'merchant', name: 'Odette', role: 'shop', x: x + 10.36, z: z - 4.91 },
      { id: 'warden', name: 'Bram', role: 'bounty', x: x - 10.36, z: z - 4.91 },
    ],
  };
});

// ------------------------------------------------------------------ shrine: a waystone in a ring of standing stones

registerSiteKind('shrine', (c) => {
  if (!dry(c)) return null;
  const { x, z } = c;
  const structures = [{ id: 'waystone', x, z, rot: c.rand(1) * 6.28 }];
  for (let k = 0; k < 4; k++) {
    if (c.rand(10 + k) < 0.2) continue;                     // a stone has fallen here and there
    const a = (45 + k * 90) * Math.PI / 180;
    const sx = x + Math.cos(a) * 7.2, sz = z + Math.sin(a) * 7.2;
    structures.push({ id: 'stone', x: sx, z: sz, rot: faceToward(sx, sz, x, z), seed: c.rand(20 + k) });
  }
  structures.push({ id: 'signpost', x: x + 6.4, z: z + 1.6, rot: c.rand(2) * 6.28 });
  return { name: `${c.name} Shrine`, r: 9.5, fade: 10, h: c.natural, plaza: 4.6, clear: 10.5, safe: 0, structures, npcs: [] };
}, 3);

// ------------------------------------------------------------------ camp: tents round a fire, and a tinker who trades

registerSiteKind('camp', (c) => {
  if (!dry(c)) return null;
  const { x, z } = c;
  const structures = [{ id: 'campfire', x, z, rot: c.rand(1) * 6.28 }];
  const corners = [[6, 6], [-6, 6], [6, -6], [-6, -6]];
  const skip = Math.floor(c.rand(2) * 4);
  corners.forEach(([dx, dz], k) => {
    if (k === skip) { structures.push({ id: 'stump', x: x + dx * 0.9, z: z + dz * 0.9, rot: c.rand(30 + k) * 6.28, seed: c.rand(40 + k) }); return; }
    structures.push({ id: 'tent', x: x + dx, z: z + dz, rot: faceToward(x + dx, z + dz, x, z) + Math.PI / 2, seed: c.rand(20 + k) });
  });
  structures.push({ id: 'signpost', x: x + 1.6, z: z + 6.6, rot: c.rand(3) * 6.28 });
  const [nx, nz] = corners[skip];
  return {
    name: `${c.name} Camp`, r: 11, fade: 9, h: c.natural, plaza: 3.2, ground: 'dirt', clear: 12, safe: 14,
    structures,
    npcs: [{ id: 'tinker', name: `${c.name.slice(0, 3)}a the Tinker`, role: 'shop', x: x + nx * 0.45, z: z + nz * 0.45 }],
  };
}, 2);

// ------------------------------------------------------------------ ruin: a broken ring of columns, and something old living in it

registerSiteKind('ruin', (c) => {
  if (!dry(c)) return null;
  const { x, z } = c;
  const structures = [{ id: 'cairn', x, z, rot: c.rand(1) * 6.28, scale: 1.3 }];
  for (let k = 0; k < 8; k++) {
    if (c.rand(10 + k) < 0.3) continue;                     // gone
    const a = (22.5 + k * 45) * Math.PI / 180;
    structures.push({ id: 'pillar', x: x + Math.cos(a) * 7, z: z + Math.sin(a) * 7, rot: c.rand(20 + k) * 6.28, seed: c.rand(30 + k) });
  }
  return { name: `Ruins of ${c.name}`, r: 10.5, fade: 10, h: c.natural, plaza: 8.6, clear: 12, safe: 0, den: true, structures, npcs: [] };
}, 2);

// ------------------------------------------------------------------ farm: a house, a windmill, ricks and a scarecrow

registerSiteKind('farm', (c) => {
  if (!dry(c) || c.natural > 9) return null;
  const { x, z } = c;
  const flip = c.rand(1) < 0.5 ? 1 : -1;                    // mirrored now and then
  const at = (dx, dz) => [x + dx * flip, z + dz];
  const [hx, hz] = at(-7, -7), [wx, wz] = at(8, -8);
  const structures = [
    { id: 'house', x: hx, z: hz, rot: faceToward(hx, hz, x, z), seed: c.rand(2) },
    { id: 'windmill', x: wx, z: wz, rot: faceToward(wx, wz, x, z), seed: c.rand(3) },
    { id: 'scarecrow', x: at(-8, 7)[0], z: at(-8, 7)[1], rot: c.rand(4) * 6.28, seed: c.rand(5) },
    { id: 'signpost', x: at(2.2, 6.4)[0], z: at(2.2, 6.4)[1], rot: c.rand(6) * 6.28 },
  ];
  for (const [k, [dx, dz]] of [[6.5, 6], [10.5, 10], [6, 10.5]].entries()) {
    const [px, pz] = at(dx, dz);
    structures.push({ id: 'haystack', x: px, z: pz, rot: c.rand(10 + k) * 6.28, seed: c.rand(20 + k), scale: 0.85 + 0.3 * c.rand(30 + k) });
  }
  return { name: `${c.name} Farm`, r: 13, fade: 10, h: c.natural, plaza: 5, ground: 'dirt', clear: 14.5, safe: 16, structures, npcs: [] };
}, 2, ['meadow', 'wheat', 'amberwood', 'birchwood', 'grove']);
