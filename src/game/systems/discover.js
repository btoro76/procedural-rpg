// Reasons to walk: what is out there, and what reaching it gives.
//  - the first visit to any made place is noted and rewarded;
//  - a cache under a cairn is opened once, for glint and goods;
//  - a ring of standing stones lends a boon for a few minutes;
//  - a beacon marks the places round about on the map;
//  - a waystone, once attuned, can be travelled to from anywhere when no fight is on.
// What has been found lives on the journey's sheet (found, known, ways, boon), so it is saved with it.

import { BOONS, derive, levelAt } from '../stats.js';
import { BIOMES } from '../../world/biomes.js';
import { rollOffer } from '../data/talents.js';

const CHARMS = ['charm_might', 'charm_grace', 'charm_vigor', 'charm_mind'];
// The Long Walk: the journey's one long errand is to set foot in every country.
// At each of these counts the road teaches a talent.
const WALK_MARKS = [4, 8, BIOMES.length];
const MATS = ['sprout_leaf', 'puff_spore', 'hog_bristle', 'wisp_ember', 'crag_shard', 'snap_claw'];

export class Discover {
  constructor(game) {
    this.game = game;
    this.timer = 0;
    this.trip = null;          // a journey between waystones in progress
    this.lead = null;          // the nearest made place not yet found: the map points to it
    const s = game.player.sheet;
    s.found = s.found || {}; s.known = s.known || {}; s.boon = s.boon || null; s.lands = s.lands || {};
    if (!s.ways || !s.ways.length) s.ways = [{ x: 0, z: 0, name: 'Hearthmere' }];
    if (s.waystone && !s.ways.some((w) => w.x === s.waystone.x && w.z === s.waystone.z)) s.ways.push({ ...s.waystone });
    for (const key in s.found) if (key[0] === 'f') game.world.gen.opened.add(key);       // chests already opened stay open
    game.bus.on('attune', (d) => {
      if (!s.ways.some((w) => w.x === d.x && w.z === d.z)) s.ways.push({ x: d.x, z: d.z, name: d.name });
    });
    game.bus.on('player:respawn', () => { this.trip = null; });
  }

  /** The next count of countries at which the Long Walk gives something, or 0 when it is done. */
  nextMark() {
    const n = Object.keys(this.game.player.sheet.lands).length;
    return WALK_MARKS.find((m) => m > n) || 0;
  }

  /** A country walked in for the first time. */
  land(biome) {
    const g = this.game, s = g.player.sheet;
    const first = Object.keys(s.lands).length === 0;
    s.lands[biome.id] = 1;
    const n = Object.keys(s.lands).length;
    if (first) return;                              // where the journey begins needs no announcement
    const mark = WALK_MARKS.includes(n);
    if (mark) {
      s.picks = (s.picks || 0) + 1;
      if (!s.offer) s.offer = rollOffer(s);
      if (!s.offer) s.picks = 0;
    }
    g.combat.grantXp(10 + n * 6);
    g.bus.emit('land', { name: biome.name, count: n, total: BIOMES.length, mark, all: n === BIOMES.length });
  }

  /** How many places and finds this journey has reached. */
  count() { return Object.keys(this.game.player.sheet.found).length; }

  note(key, x, z) {
    const g = this.game, s = g.player.sheet;
    s.found[key] = 1;
    delete s.known[key];
    g.combat.grantXp(6 + levelAt(Math.hypot(x, z)) * 4);
  }

  /** Begins travel to the i-th attuned waystone. False (with a word why) if it cannot be done now. */
  travel(i) {
    const g = this.game, p = g.player, way = p.sheet.ways[i];
    if (!way || p.dead || this.trip) return false;
    if (p.calm < 4) { g.bus.emit('log', { text: 'Not in the middle of a fight.' }); g.bus.emit('deny'); return false; }
    this.trip = { way, t: 0, moved: false };
    g.look.fadeGoal = 0;
    g.bus.emit('travel', { name: way.name });
    return true;
  }

  update(dt) {
    const g = this.game, p = g.player, s = p.sheet, w = g.world;
    // ---- travelling: the page empties, the hero is elsewhere, the page fills in
    if (this.trip) {
      const t = this.trip;
      t.t += dt;
      if (!t.moved && t.t > 0.55) {
        t.moved = true;
        p.x = t.way.x + 2.4; p.z = t.way.z + 2.4; p.y = w.surface(p.x, p.z);
        Object.assign(p, { target: null, pursue: false, moveTo: null, dash: null });
        g.camera.target = [p.x, p.y + 1, p.z];
        g.hazards.clear();
        while (g.renderer.worldTex.update(p.x, p.z, 16) > 0);
        g.look.fadeGoal = 1;
        g.bus.emit('travel:arrive', { x: p.x, y: p.y, z: p.z, name: t.way.name });
      }
      if (t.t > 1.3) this.trip = null;
      return;
    }
    if (g.paused || p.dead) return;
    // ---- a boon wears off
    if (s.boon) {
      s.boon.left -= dt;
      if (s.boon.left <= 0) { g.bus.emit('log', { text: `${BOONS[s.boon.id].name} fades.` }); s.boon = null; derive(p); }
    }
    if ((this.timer -= dt) > 0) return;
    this.timer = 0.25;

    // ---- the Long Walk: a country counts once the hero is well inside it
    const biome = w.biome(p.x, p.z);
    if (!s.lands[biome.id]) this.land(biome);

    // ---- made places: noted the first time the hero stands in one
    let lead = null, best = 1e9;
    for (const site of w.sites.inRange(p.x, p.z, 420)) {
      const d = Math.hypot(site.x - p.x, site.z - p.z);
      if (!s.found[site.key]) {
        if (d < Math.max(6, site.plaza || 0) + 3) { this.note(site.key, site.x, site.z); g.bus.emit('found', { kind: site.kind, name: site.name, count: this.count() }); }
        else if (d < best) { best = d; lead = site; }
      }
    }
    this.lead = lead;

    // ---- finds
    for (const f of w.finds.inRange(p.x, p.z, 8)) {
      const d = Math.hypot(f.x - p.x, f.z - p.z);
      if (f.kind === 'cache' && d < 2.3 && !s.found[f.key]) this.open(f);
      else if (f.kind === 'stones' && d < 3.4) this.bless(f);
      else if (f.kind === 'beacon' && d < 4.2 && !s.found[f.key]) this.survey(f);
    }
  }

  /** A cache: glint, a drink or two, something off the local beasts, now and then a charm. */
  open(f) {
    const g = this.game, s = g.player.sheet, lvl = levelAt(Math.hypot(f.x, f.z));
    const y = g.world.surface(f.x, f.z);
    const give = (item, n) => {
      if (item === 'glint') s.glint += n; else if (!g.loot.add(item, n)) return;
      g.bus.emit('pickup', { x: f.x, y, z: f.z, item, n, rare: item.startsWith('charm') });
    };
    const roll = (k) => { const v = Math.sin((f.i * 127.1 + f.j * 311.7 + k * 74.7)) * 43758.5453; return v - Math.floor(v); };
    give('glint', Math.round(14 + lvl * 7 + roll(1) * 12));
    give(roll(2) < 0.6 ? 'tonic' : 'draught', 1);
    give(MATS[Math.floor(roll(3) * MATS.length)], 2 + Math.floor(roll(4) * 2));
    if (roll(5) < 0.14) give(CHARMS[Math.floor(roll(6) * CHARMS.length)], 1);
    this.note(f.key, f.x, f.z);
    const [cx, cz] = g.world.openFind(f);
    g.renderer.worldTex.refresh(cx, cz);
    g.bus.emit('found', { kind: 'cache', name: 'A cache', count: this.count(), x: f.x, y, z: f.z });
  }

  /** Standing stones: the first visit is noted; whenever the hero has no boon, they lend one. */
  bless(f) {
    const g = this.game, p = g.player, s = p.sheet;
    if (!s.found[f.key]) { this.note(f.key, f.x, f.z); g.bus.emit('found', { kind: 'stones', name: f.name, count: this.count() }); }
    if (s.boon) return;
    const ids = Object.keys(BOONS), id = ids[Math.abs(f.i * 3 + f.j * 5 + this.count()) % ids.length];
    s.boon = { id, left: BOONS[id].seconds };
    derive(p);
    if (id === 'hale') p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.2);
    g.bus.emit('boon', { id, name: BOONS[id].name, desc: BOONS[id].desc, entity: p });
  }

  /** A beacon: the made places and finds round about are marked on the map. */
  survey(f) {
    const g = this.game, s = g.player.sheet;
    this.note(f.key, f.x, f.z);
    const near = [...g.world.sites.inRange(f.x, f.z, 520), ...g.world.finds.inRange(f.x, f.z, 300)]
      .filter((o) => !s.found[o.key])
      .sort((a, b) => Math.hypot(a.x - f.x, a.z - f.z) - Math.hypot(b.x - f.x, b.z - f.z)).slice(0, 6);
    for (const o of near) s.known[o.key] = [o.x, o.z, o.name];
    g.bus.emit('found', { kind: 'beacon', name: f.name, count: this.count(), shown: near.length });
  }
}
