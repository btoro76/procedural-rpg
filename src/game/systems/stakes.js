// Stakes: what the journey can lose, and what the dark is worth.
//
//  - Night. After dusk creatures notice you from farther off and hit harder,
//    elders are about more often, and everything carries more glint and
//    teaches more. `night()` is the one number the other systems read (0 by
//    day .. 1 in full night); the rules that use it are here in NIGHT.
//  - Falling. Overcome in a fight, the hero wakes at his waystone as before,
//    but a share of the glint he carried is left where he fell. Walk back and
//    it is his again; fall a second time first and it is gone.

import { makeEntity, pencils } from '../entities.js';
import { ITEMS } from '../data/items.js';

export const NIGHT = { aggro: 0.45, harm: 0.2, glint: 0.6, xp: 0.3, elders: 0.08 };   // each is added at full night
const LOSS = 0.2;      // share of carried glint left where the hero falls

export class Stakes {
  constructor(game) {
    this.game = game;
    this.dark = false;
    const s = game.player.sheet;
    if (s.satchel) this.leave(s.satchel.x, s.satchel.z, s.satchel.n, true);      // a journey resumed: it is still lying there
    game.bus.on('player:died', () => this.fall());
  }

  /** 0 by day .. 1 in full night. */
  night() { return this.game.env.night || 0; }

  /** The hero has fallen: some of his glint stays here. */
  fall() {
    const g = this.game, p = g.player, s = p.sheet;
    const lost = Math.floor(s.glint * LOSS);
    if (s.satchel) { for (const d of g.loot.drops) if (d.satchel) d.gone = true; s.satchel = null; }      // the first is not waited for
    if (lost < 1) { g.bus.emit('fallen', { lost: 0 }); return; }
    s.glint -= lost;
    s.satchel = { x: p.x, z: p.z, n: lost };
    this.leave(p.x, p.z, lost, false);
    g.bus.emit('fallen', { lost });
  }

  /** The glint lying where he fell: a drop that does not fade, and gives itself back when reached. */
  leave(x, z, n, resting) {
    const g = this.game, item = ITEMS.glint;
    const e = makeEntity('drop', 'drop', {
      x, z, y: g.world.surface(x, z), tx: x, tz: z, radius: 0.5, height: 0.8, extra: item.drop,
      colors: pencils([item.color, item.color, item.color]), scale: 1.5,
      name: `Your glint ×${n}`, item: 'glint', n, age: resting ? 1 : 0, grow: resting ? 1 : 0, rare: true, satchel: true, keep: true,
    });
    g.entities.add(e);
    g.loot.drops.push(e);
  }

  update() {
    const g = this.game, s = g.player.sheet;
    // dusk and dawn are said once each
    const dark = this.night() > 0.5;
    if (dark !== this.dark) {
      this.dark = dark;
      if (!g.paused) g.bus.emit(dark ? 'nightfall' : 'daybreak');
    }
    // picked up again
    if (s.satchel && !g.loot.drops.some((d) => d.satchel && !d.gone)) {
      const back = s.satchel.n;
      s.satchel = null;
      if (!g.player.dead) g.bus.emit('recovered', { n: back });
    }
  }
}
