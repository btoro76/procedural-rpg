// Combat rules: who hurts whom and what follows. Everything else (animation,
// particles, numbers, sound) reacts to the events emitted here.

import { xpFactor, xpToNext, derive, POINTS_PER_LEVEL } from '../stats.js';
import { rank, rollOffer } from '../data/talents.js';
import { NIGHT } from './stakes.js';

// Seconds the world is held when a blow lands (game.hold): enough to feel, too short to notice as a pause.
const HOLD = { hit: 0.03, crit: 0.06, kill: 0.07, elder: 0.13, taken: 0.05 };

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
    this.hurt(monster, 1);
  }

  /**
   * Something a monster did reaches the player: `mult` attacks' worth, less armour.
   * Returns true if it hurt. `quiet` leaves out the word when it does not (a cloud ticks often).
   */
  hurt(monster, mult = 1, quiet = false) {
    const g = this.game, p = g.player;
    if (p.dead) return false;
    if (p.invuln > 0 || Math.random() < p.dodge) { if (!quiet) g.bus.emit('miss', { target: p, text: 'Dodged' }); return false; }
    const raw = monster.atk * mult * (0.85 + Math.random() * 0.3) * (p.ward ?? 1) * (1 + NIGHT.harm * g.stakes.night());
    this.damage(p, Math.max(1, Math.round(raw * 30 / (30 + p.defense))), monster, false);
    return true;
  }

  damage(target, amount, source, crit) {
    const g = this.game;
    if (target.dead) return;
    if (target.guard) amount = Math.max(1, Math.round(amount * 0.2));        // tucked in its shell: blows glance off
    target.hp = Math.max(0, target.hp - amount);
    target.flash = 1;
    if (target.action !== 1 && !(target.ai && target.ai.state === 'special')) { target.action = 3; target.actionT = 0; target.actionDur = 0.22; }
    g.bus.emit('damage', { target, amount, crit, source });
    if (target.kind === 'monster') {
      const ai = target.ai;
      ai.target = g.player; ai.provoked = true;
      // a small shove away from the blow
      const dx = target.x - source.x, dz = target.z - source.z, d = Math.hypot(dx, dz) || 1;
      const shove = target.guard || ai.state === 'special' ? 0 : crit ? 3.2 : 1.8;      // a creature mid-move holds its ground
      ai.pushX = dx / d * shove; ai.pushZ = dz / d * shove;
      const fell = target.hp <= 0;
      if (!target.guard) g.hold(fell ? (target.elite ? HOLD.elder : HOLD.kill) : crit ? HOLD.crit : HOLD.hit);
      if (crit || (fell && target.elite)) g.camera.shake = Math.min(1, g.camera.shake + (fell && target.elite ? 0.55 : 0.32));
      if (fell) this.slay(target);
    } else if (target.kind === 'player') {
      target.calm = 0;
      const heavy = amount >= target.maxHp * 0.08;          // a cloud's sting does not stop the world; a slam does
      if (heavy) g.hold(HOLD.taken);
      g.camera.shake = Math.min(1, g.camera.shake + (heavy ? 0.5 : 0.25));
      g.look.hurt = 1;
      if (target.hp <= 0) this.fall(target);
    }
  }

  slay(m) {
    const g = this.game, p = g.player;
    m.dead = true; m.deathT = 0;
    if (p.target === m) p.target = null;
    const gained = Math.max(1, Math.round(m.xp * xpFactor(p.level, m.level) * (1 + NIGHT.xp * g.stakes.night())));
    g.bus.emit('monster:died', m);
    p.focus = Math.min(p.maxFocus, p.focus + 5 * rank(p.sheet, 'second'));
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
      s.picks = (s.picks || 0) + 1;                      // and a talent to choose
      if (!s.offer) s.offer = rollOffer(s);
      if (!s.offer) s.picks = 0;
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
