// Bounties: jobs from the town warden, one at a time. Four kinds, so the board
// is not only "kill some of those":
//   cull    thin a kind of creature
//   gather  bring back something creatures carry (it is handed over on payment)
//   elder   slay the elder in a named ruin
//   scout   find a place nobody has reported on
// Offers are rebuilt from the journey so far (level, jobs done, what is still
// unfound round about), and are the same each time the board is opened.
// A kind is a row in KINDS: how to offer one, how to word it, and when it is done.

import { MONSTERS } from '../data/monsters.js';
import { ITEMS } from '../data/items.js';

const POOL = ['sproutling', 'puffcap', 'bristlehog', 'wisp', 'shellsnap', 'cragling'];
const GOODS = ['sprout_leaf', 'puff_spore', 'hog_bristle', 'snap_claw', 'wisp_ember', 'crag_shard'];
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const KINDS = {
  cull: {
    offer(g, s, k) {
      const tier = Math.min(POOL.length - 3, Math.floor(s.level / 3));
      const id = POOL[(tier + k + s.bountiesDone) % Math.min(POOL.length, tier + 4)], def = MONSTERS[id];
      const need = 4 + k * 2 + Math.floor(s.level / 2);
      return { monster: id, name: def.name, need, xp: Math.round(def.xp * need * 0.9 * (1 + s.level * 0.25)), glint: Math.round((10 + def.xp) * need * 0.35) };
    },
    title: (b) => `Cull ${plural(b.need, b.name)}`,
    track: (b) => `${b.name}s: ${b.have} / ${b.need}`,
  },
  gather: {
    offer(g, s, k) {
      const tier = Math.min(GOODS.length - 2, Math.floor(s.level / 3));
      const item = GOODS[(tier + k + s.bountiesDone) % Math.min(GOODS.length, tier + 3)], it = ITEMS[item];
      const need = 3 + Math.floor(s.level / 3);
      return { item, name: it.name, need, xp: Math.round(it.value * need * 2.2 * (1 + s.level * 0.2)), glint: Math.round(it.value * need * 2.5) };
    },
    title: (b) => `Bring ${plural(b.need, b.name)}`,
    track: (b) => `${b.name}s: ${b.have} / ${b.need}`,
    have: (g, b) => Math.min(b.need, g.loot.count(b.item)),
    pay: (g, b) => g.loot.remove(b.item, b.need),
  },
  elder: {
    offer(g, s) {
      const ruins = g.world.sites.inRange(0, 0, 900).filter((q) => q.den).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
      const ruin = ruins[s.bountiesDone % Math.max(1, Math.min(ruins.length, 2 + Math.floor(s.level / 2)))];
      if (!ruin) return null;
      const far = Math.hypot(ruin.x, ruin.z);
      return { key: ruin.key, x: ruin.x, z: ruin.z, place: ruin.name, need: 1, xp: Math.round(70 + far * 0.25 + s.level * 20), glint: Math.round(40 + far * 0.08 + s.level * 8) };
    },
    title: (b) => `Slay the elder in the ${b.place}`,
    track: (b) => (b.have ? 'The elder is slain' : `The elder in the ${b.place}`),
  },
  scout: {
    offer(g, s) {
      const p = g.player;
      const sites = g.world.sites.inRange(0, 0, 1100).filter((q) => !s.found[q.key]).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
      const site = sites[s.bountiesDone % Math.max(1, Math.min(sites.length, 3))];
      if (!site) return null;
      const far = Math.hypot(site.x, site.z);
      return { key: site.key, x: site.x, z: site.z, place: site.name, need: 1, xp: Math.round(30 + far * 0.2 + p.level * 8), glint: Math.round(20 + far * 0.07) };
    },
    title: (b) => `Find ${b.place} and report back`,
    track: (b) => (b.have ? `${b.place} is found` : `Find ${b.place}`),
    have: (g, b) => (g.player.sheet.found[b.key] ? 1 : 0),
  },
};

export class Bounties {
  constructor(game) {
    this.game = game;
    this.offers = [];
    this.timer = 0;
  }

  /** Three offers: a cull, then a cull or a gathering, then an elder or a scouting (a cull if neither is to be had). */
  refresh() {
    const g = this.game, s = g.player.sheet, n = s.bountiesDone;
    const make = (kind, k) => { const o = KINDS[kind].offer(g, s, k); return o ? { kind, have: 0, ...o } : null; };
    this.offers = [make('cull', 0), make(n % 2 ? 'cull' : 'gather', 1), make(n % 2 ? 'scout' : 'elder', 2) || make(n % 2 ? 'elder' : 'scout', 2) || make('cull', 2)];
    return this.offers;
  }

  /** The words for a bounty: what the board says, and what the tracker says. */
  title(b) { return KINDS[b.kind || 'cull'].title(b); }
  track(b) { return b.have >= b.need ? 'Done: return to Bram' : KINDS[b.kind || 'cull'].track(b); }

  accept(i) {
    const s = this.game.player.sheet;
    if (s.bounty || !this.offers[i]) return;
    s.bounty = { ...this.offers[i] };
    this.progress();
    this.game.bus.emit('bounty:changed');
    this.game.bus.emit('log', { text: `Bounty taken: ${this.title(s.bounty)}.` });
  }

  abandon() {
    this.game.player.sheet.bounty = null;
    this.game.bus.emit('bounty:changed');
  }

  done(b) {
    b.have = b.need;
    this.game.bus.emit('bounty:changed');
    this.game.bus.emit('log', { text: 'Bounty complete. Return to Bram in Hearthmere.', big: true });
  }

  onKill(m) {
    const b = this.game.player.sheet.bounty;
    if (!b || b.have >= b.need) return;
    if ((b.kind || 'cull') === 'cull' && b.monster === m.defId) {
      b.have++;
      if (b.have >= b.need) this.done(b); else this.game.bus.emit('bounty:changed');
    } else if (b.kind === 'elder' && m.elite && Math.hypot(m.x - b.x, m.z - b.z) < 40) this.done(b);
  }

  /** Jobs counted from what is carried or found keep step with it. */
  progress() {
    const g = this.game, b = g.player.sheet.bounty;
    const kind = b && KINDS[b.kind || 'cull'];
    if (!b || !kind.have) return;
    const have = kind.have(g, b), was = b.have;
    if (have === was) return;
    b.have = have;
    if (have >= b.need && was < b.need) this.done(b); else g.bus.emit('bounty:changed');
  }

  update(dt) {
    if ((this.timer -= dt) > 0) return;
    this.timer = 0.4;
    this.progress();
  }

  claim() {
    const g = this.game, s = g.player.sheet, b = s.bounty;
    this.progress();
    if (!b || b.have < b.need) return false;
    const kind = KINDS[b.kind || 'cull'];
    if (kind.pay) kind.pay(g, b);
    s.bounty = null;
    s.bountiesDone++;
    s.glint += b.glint;
    g.combat.grantXp(b.xp);
    g.bus.emit('bounty:claimed', b);
    g.bus.emit('bounty:changed');
    this.refresh();
    return true;
  }
}
