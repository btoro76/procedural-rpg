// Monster behaviour: a small state machine per monster.
//   idle   wander near home; notice the player if this kind is aggressive
//   chase  close in; give up at the end of the leash
//   attack wind up, strike at a fixed point in the animation, recover
//   home   walk back and mend
//   special the creature's own move (specials.js): warned on the ground, answered by moving
// A new behaviour (fleeing, pack tactics) is a new state here; a new move is an entry in specials.js.

import { damp, dampAngle } from '../../core/math.js';
import { yawFromDir } from '../entities.js';
import { SPECIALS } from './specials.js';

const LEASH = 24, HIT_AT = 0.5;
const out = { x: 0, z: 0 };

export class MonsterAI {
  constructor(game) {
    this.game = game;
  }

  update(dt) {
    const g = this.game, p = g.player;
    const mons = g.monsters;
    for (let i = 0; i < mons.length; i++) {
      const m = mons[i];
      m.flash = Math.max(0, m.flash - dt * 5);
      if (m.dead) {
        m.deathT += dt;
        m.grow = Math.max(0, 1 - m.deathT * 3.2);
        if (m.deathT > 0.4) m.gone = true;
        continue;
      }
      m.grow = Math.min(1, m.grow + dt * 3);
      if (m.action) {
        m.actionT += dt / m.actionDur;
        if (m.actionT >= 1) m.action = 0;
      }
      const ai = m.ai, def = m.def, sp = def.special;
      ai.cd -= dt;
      ai.scd = (ai.scd ?? 1 + Math.random() * 2.5) - dt;       // the special is never the opening move
      let dx = 0, dz = 0;
      const toP = Math.hypot(p.x - m.x, p.z - m.z);
      const fromHome = Math.hypot(m.x - ai.hx, m.z - ai.hz);
      const fair = !p.dead && !p.safe;

      if (ai.stun > 0) {
        // winded after a missed charge: stands there, open
        ai.stun -= dt;
      } else if (ai.state === 'idle') {
        ai.timer -= dt;
        if (ai.timer <= 0) {
          ai.timer = 2 + Math.random() * 5;
          if (Math.random() < 0.7) {
            const a = Math.random() * 6.283, r = 1.5 + Math.random() * 5;
            ai.gx = ai.hx + Math.cos(a) * r; ai.gz = ai.hz + Math.sin(a) * r; ai.going = true;
          }
        }
        if (ai.going) {
          const d = Math.hypot(ai.gx - m.x, ai.gz - m.z);
          if (d < 0.3) ai.going = false;
          else { dx = (ai.gx - m.x) / d * def.speed * 0.4; dz = (ai.gz - m.z) / d * def.speed * 0.4; }
        }
        if (fair && ((def.aggro > 0 && toP < def.aggro * (m.elite ? 1.3 : 1)) || ai.provoked)) { ai.state = 'chase'; ai.target = p; g.bus.emit('monster:alert', m); }
      } else if (ai.state === 'chase') {
        const reach = def.range + m.radius * 0.5;
        if (!fair || fromHome > LEASH) { ai.state = 'home'; ai.provoked = false; }
        else if (def.keep && toP < def.keep[1]) {
          // a shooter keeps its distance: backs off when crowded, drifts sideways otherwise
          const away = toP < def.keep[0] ? -0.75 : 0, side = (m.id % 2 ? 1 : -1) * 0.35;
          dx = ((p.x - m.x) * away - (p.z - m.z) * side) / toP * def.speed;
          dz = ((p.z - m.z) * away + (p.x - m.x) * side) / toP * def.speed;
        }
        else if (toP > reach * 0.9) { dx = (p.x - m.x) / toP * def.speed; dz = (p.z - m.z) / toP * def.speed; }
        if (sp && ai.state === 'chase' && ai.scd <= 0 && toP >= sp.min && toP <= sp.max && (!sp.below || m.hp < m.maxHp * sp.below)) {
          ai.state = 'special';
          ai.sp = SPECIALS[sp.kind].begin(g, m, sp);
          g.bus.emit('monster:special', m);
        } else
        if (toP <= reach && ai.cd <= 0 && ai.state === 'chase') {
          ai.state = 'attack'; ai.struck = false;
          m.action = 1; m.actionT = 0; m.actionDur = def.attackTime;
          g.bus.emit('telegraph', { x: m.x, y: m.y, z: m.z, r: def.range + m.radius + 0.4, t: def.attackTime * HIT_AT });
        }
        m.yaw = dampAngle(m.yaw, yawFromDir(p.x - m.x, p.z - m.z), 9, dt);
      } else if (ai.state === 'attack') {
        if (!ai.struck && m.actionT >= HIT_AT) { ai.struck = true; g.combat.maul(m); g.bus.emit('monster:strike', m); }
        if (m.action !== 1) { ai.state = 'chase'; ai.cd = def.cooldown * (0.8 + Math.random() * 0.4); }
      } else if (ai.state === 'special') {
        const mv = SPECIALS[sp.kind].update(g, m, sp, ai.sp, dt);
        dx = mv.dx; dz = mv.dz;
        if (mv.done) {
          ai.state = 'chase'; ai.sp = null;
          ai.scd = sp.every * (m.elite ? 0.6 : 1) * (0.85 + Math.random() * 0.3);
          ai.cd = Math.max(ai.cd, 0.6);
        }
      } else if (ai.state === 'home') {
        m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.25 * dt);
        if (fromHome < 1.2) { ai.state = 'idle'; ai.timer = 1; }
        else { dx = (ai.hx - m.x) / fromHome * def.speed; dz = (ai.hz - m.z) / fromHome * def.speed; }
      }

      // knockback decays quickly
      if (ai.pushX || ai.pushZ) {
        dx += ai.pushX; dz += ai.pushZ;
        const k = Math.exp(-9 * dt);
        ai.pushX *= k; ai.pushZ *= k;
        if (Math.abs(ai.pushX) + Math.abs(ai.pushZ) < 0.05) ai.pushX = ai.pushZ = 0;
      }
      // keep a little personal space from other monsters and from the player
      for (let j = 0; j < mons.length; j++) {
        const o = mons[j];
        if (o === m || o.dead) continue;
        const ox = m.x - o.x, oz = m.z - o.z, d = Math.hypot(ox, oz), min = m.radius + o.radius;
        if (d < min && d > 1e-3) { dx += ox / d * (min - d) * 4; dz += oz / d * (min - d) * 4; }
      }
      const pd = m.radius + p.radius;
      if (toP < pd && toP > 1e-3 && !p.dead) { dx += (m.x - p.x) / toP * (pd - toP) * 6; dz += (m.z - p.z) / toP * (pd - toP) * 6; }

      const mx = m.x, mz = m.z;
      if (dx || dz) {
        g.world.moveCircle(m.x, m.z, dx * dt, dz * dt, m.radius, out);
        m.x = out.x; m.z = out.z;
      }
      const moved = Math.hypot(m.x - mx, m.z - mz);
      if (ai.state !== 'chase' && ai.state !== 'attack' && ai.state !== 'special' && moved > 1e-4 && !ai.pushX) m.yaw = dampAngle(m.yaw, yawFromDir(m.x - mx, m.z - mz), 8, dt);
      m.walk += moved * def.stride;
      m.move = damp(m.move, Math.min(1, moved / Math.max(dt, 1e-4) / (def.speed * 0.5)), 10, dt);
      m.y = damp(m.y, g.world.surface(m.x, m.z), 18, dt);
    }
  }
}
