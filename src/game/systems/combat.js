// Combat rules: who hurts whom and what follows. Everything else (animation,
// particles, numbers, sound) reacts to the events emitted here.

import { xpFactor, xpToNext, derive, POINTS_PER_LEVEL } from '../stats.js';

export class Combat {
  constructor(game) {
    this.game = game;
  }

  /** Player hits a monster. mult scales weapon damage; flat adds on top. */
  strike(target, mult = 1, flat = 0, canCrit = true) {
    const p = this.game.player;
    if (!target || target.dead) return;
    const crit = canCrit && Math.random() < p.crit;
    let amount = (p.attack * mult + flat) * (0.9 + Math.random() * 0.2) * (crit ? 1.65 : 1);
    this.damage(target, Math.max(1, Math.round(amount)), p, crit);
  }

  /** A monster's blow lands on the player (unless dodged or out of reach). */
  maul(monster) {
    const g = this.game, p = g.player;
    if (p.dead || p.invuln > 0) return;
    if (Math.hypot(p.x - monster.x, p.z - monster.z) > monster.def.range + monster.radius + 0.55) {
      g.bus.emit('miss', { target: p, text: 'Dodged' });
      return;
    }
    if (Math.random() < p.dodge) { g.bus.emit('miss', { target: p, text: 'Dodged' }); return; }
    const raw = monster.atk * (0.85 + Math.random() * 0.3);
    const amount = Math.max(1, Math.round(raw * 30 / (30 + p.defense)));
    this.damage(p, amount, monster, false);
  }

  damage(target, amount, source, crit) {
    const g = this.game;
    if (target.dead) return;
    target.hp = Math.max(0, target.hp - amount);
    target.flash = 1;
    if (target.action !== 1) { target.action = 3; target.actionT = 0; target.actionDur = 0.22; }
    g.bus.emit('damage', { target, amount, crit, source });
    if (target.kind === 'monster') {
      const ai = target.ai;
      ai.target = g.player; ai.provoked = true;
      // a small shove away from the blow
      const dx = target.x - source.x, dz = target.z - source.z, d = Math.hypot(dx, dz) || 1;
      ai.pushX = dx / d * (crit ? 3.2 : 1.8); ai.pushZ = dz / d * (crit ? 3.2 : 1.8);
      if (target.hp <= 0) this.slay(target);
    } else if (target.kind === 'player') {
      target.calm = 0;
      g.camera.shake = Math.min(1, g.camera.shake + 0.5);
      g.look.hurt = 1;
      if (target.hp <= 0) this.fall(target);
    }
  }

  slay(m) {
    const g = this.game, p = g.player;
    m.dead = true; m.deathT = 0;
    if (p.target === m) p.target = null;
    const gained = Math.max(1, Math.round(m.xp * xpFactor(p.level, m.level)));
    g.bus.emit('monster:died', m);
    g.loot.dropFrom(m);
    this.grantXp(gained);
    g.bounties.onKill(m);
  }

  grantXp(n) {
    const g = this.game, s = g.player.sheet;
    s.xp += n;
    g.bus.emit('xp', { amount: n });
    while (s.xp >= xpToNext(s.level)) {
      s.xp -= xpToNext(s.level);
      s.level++;
      s.points += POINTS_PER_LEVEL;
      derive(g.player);
      g.player.hp = g.player.maxHp; g.player.focus = g.player.maxFocus;
      g.bus.emit('levelup', { level: s.level });
    }
  }

  fall(p) {
    const g = this.game;
    p.dead = true; p.respawn = 3.2; p.target = null; p.moveTo = null;
    g.bus.emit('player:died', {});
  }
}
