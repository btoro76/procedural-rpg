// Loot and the bag: what monsters drop, picking it up by walking over it,
// using, selling, buying and wearing items.

import { ITEMS } from '../data/items.js';
import { makeEntity, pencils } from '../entities.js';
import { derive } from '../stats.js';

const BAG_SLOTS = 24;

export class Loot {
  constructor(game) {
    this.game = game;
    this.drops = [];
  }

  dropFrom(m) {
    const g = this.game;
    for (const [id, chance, range] of m.def.loot) {
      if (Math.random() > chance * (m.elite ? 2.5 : 1)) continue;
      let n = range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1));
      if (id === 'glint') n = Math.round(n * (1 + (m.level - 1) * 0.3) * (m.elite ? 4 : 1));
      const a = Math.random() * 6.283, r = 0.4 + Math.random() * 0.9;
      const item = ITEMS[id];
      const e = makeEntity('drop', 'drop', {
        x: m.x, z: m.z, y: m.y, tx: m.x + Math.cos(a) * r, tz: m.z + Math.sin(a) * r,
        radius: 0.4, height: 0.7, extra: item.drop, colors: pencils([item.color, item.color, item.color]),
        name: n > 1 ? `${item.name} ×${n}` : item.name, item: id, n, age: 0, grow: 0,
        rare: item.kind === 'charm',
      });
      g.entities.add(e);
      this.drops.push(e);
    }
  }

  update(dt) {
    const g = this.game, p = g.player;
    let w = 0;
    for (const d of this.drops) {
      d.age += dt;
      d.grow = Math.min(1, d.grow + dt * 5);
      // toss outward in a little arc, then rest
      const k = Math.min(1, d.age / 0.4);
      d.x += (d.tx - d.x) * Math.min(1, dt * 8); d.z += (d.tz - d.z) * Math.min(1, dt * 8);
      d.lift = Math.sin(k * Math.PI) * 0.6;
      d.y = g.world.surface(d.x, d.z);
      const dist = Math.hypot(d.x - p.x, d.z - p.z);
      if (d.age > 0.45 && !p.dead && dist < 2.6) { // drawn toward the player
        d.tx = p.x; d.tz = p.z;
        if (dist < 0.75 && this.take(d)) { d.gone = true; continue; }
      }
      if (d.age > 120) { d.gone = true; continue; }
      this.drops[w++] = d;
    }
    this.drops.length = w;
  }

  take(d) {
    const g = this.game, s = g.player.sheet, item = ITEMS[d.item];
    if (item.kind === 'coin') s.glint += d.n;
    else if (!this.add(d.item, d.n)) { if (!d.warned) { d.warned = true; g.bus.emit('log', { text: 'Your bag is full.' }); } return false; }
    g.bus.emit('pickup', { x: d.x, y: d.y, z: d.z, item: d.item, n: d.n, rare: d.rare });
    return true;
  }

  add(id, n) {
    const bag = this.game.player.sheet.bag;
    const stack = bag.find((b) => b.id === id);
    if (stack) stack.n += n;
    else if (bag.length >= BAG_SLOTS) return false;
    else bag.push({ id, n });
    this.game.bus.emit('bag:changed');
    return true;
  }

  count(id) { return this.game.player.sheet.bag.find((b) => b.id === id)?.n || 0; }

  remove(id, n = 1) {
    const bag = this.game.player.sheet.bag;
    const i = bag.findIndex((b) => b.id === id);
    if (i < 0 || bag[i].n < n) return false;
    bag[i].n -= n;
    if (bag[i].n <= 0) bag.splice(i, 1);
    this.game.bus.emit('bag:changed');
    return true;
  }

  /** Drink, or put on / take off a charm. */
  use(id) {
    const g = this.game, p = g.player, item = ITEMS[id];
    if (p.dead || !item) return false;
    if (item.kind === 'use') {
      if (p.potionCd > 0) return false;
      const full = item.effect === 'heal' ? p.hp >= p.maxHp : p.focus >= p.maxFocus;
      if (full || !this.remove(id)) return false;
      if (item.effect === 'heal') p.hp = Math.min(p.maxHp, p.hp + p.maxHp * item.power);
      else p.focus = Math.min(p.maxFocus, p.focus + p.maxFocus * item.power);
      p.potionCd = 1.2;
      g.bus.emit('heal', { entity: p, focus: item.effect !== 'heal' });
      g.bus.emit('drink', { item: id });
      return true;
    }
    if (item.kind === 'charm') {
      if (p.sheet.charms.length >= 2 || !this.remove(id)) { g.bus.emit('log', { text: 'You can wear two charms.' }); return false; }
      p.sheet.charms.push(id);
      derive(p);
      g.bus.emit('bag:changed');
      g.bus.emit('log', { text: `You put on the ${item.name}.` });
      return true;
    }
    return false;
  }

  unequip(index) {
    const p = this.game.player, id = p.sheet.charms[index];
    if (!id || !this.add(id, 1)) return;
    p.sheet.charms.splice(index, 1);
    derive(p);
    this.game.bus.emit('bag:changed');
  }

  sell(id, n = 1) {
    const item = ITEMS[id];
    if (!item.value || !this.remove(id, n)) return false;
    this.game.player.sheet.glint += item.value * n;
    this.game.bus.emit('trade', { sold: id, n });
    return true;
  }

  sellMaterials() {
    const s = this.game.player.sheet;
    let total = 0;
    for (const b of [...s.bag]) if (ITEMS[b.id].kind === 'mat') { total += ITEMS[b.id].value * b.n; this.remove(b.id, b.n); }
    s.glint += total;
    if (total) this.game.bus.emit('trade', { total });
    return total;
  }

  buy(id) {
    const s = this.game.player.sheet, item = ITEMS[id];
    if (s.glint < item.price) { this.game.bus.emit('log', { text: 'Not enough glint.' }); return false; }
    if (!this.add(id, 1)) { this.game.bus.emit('log', { text: 'Your bag is full.' }); return false; }
    s.glint -= item.price;
    this.game.bus.emit('trade', { bought: id });
    return true;
  }
}
