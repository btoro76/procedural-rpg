// Bounties: small procedural hunting jobs from the town warden. One at a time;
// offers are rebuilt from the monsters that live in the country around the
// board, scaled to the player.

import { MONSTERS } from '../data/monsters.js';

export class Bounties {
  constructor(game) {
    this.game = game;
    this.offers = [];
  }

  /** Three fresh offers. Deterministic per number of bounties finished, so reopening the board does not reroll. */
  refresh() {
    const g = this.game, s = g.player.sheet;
    const pool = ['sproutling', 'puffcap', 'bristlehog', 'wisp', 'shellsnap', 'cragling'];
    const tier = Math.min(pool.length - 3, Math.floor(s.level / 3));
    this.offers = [0, 1, 2].map((k) => {
      const id = pool[(tier + k + s.bountiesDone) % Math.min(pool.length, tier + 4)];
      const need = 4 + k * 2 + Math.floor(s.level / 2);
      const def = MONSTERS[id];
      return {
        monster: id, name: def.name, need, have: 0,
        xp: Math.round(def.xp * need * 0.9 * (1 + s.level * 0.25)),
        glint: Math.round((10 + def.xp) * need * 0.35),
      };
    });
    return this.offers;
  }

  accept(i) {
    const s = this.game.player.sheet;
    if (s.bounty) return;
    s.bounty = { ...this.offers[i] };
    this.game.bus.emit('bounty:changed');
    this.game.bus.emit('log', { text: `Bounty taken: ${s.bounty.need} ${s.bounty.name}s.` });
  }

  abandon() {
    this.game.player.sheet.bounty = null;
    this.game.bus.emit('bounty:changed');
  }

  onKill(m) {
    const b = this.game.player.sheet.bounty;
    if (!b || b.monster !== m.defId || b.have >= b.need) return;
    b.have++;
    this.game.bus.emit('bounty:changed');
    if (b.have >= b.need) this.game.bus.emit('log', { text: 'Bounty complete. Return to Bram in Hearthmere.', big: true });
  }

  claim() {
    const g = this.game, s = g.player.sheet, b = s.bounty;
    if (!b || b.have < b.need) return false;
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
