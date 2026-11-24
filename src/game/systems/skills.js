// Skill use: cooldowns, focus cost, aiming, and the projectiles skills launch.

import { SKILLS } from '../data/skills.js';
import { dirFromYaw } from '../entities.js';

export class Skills {
  constructor(game) {
    this.game = game;
    this.cooldowns = SKILLS.map(() => 0);
    this.shots = [];
  }

  unlocked(i) { return this.game.player.sheet.level >= SKILLS[i].unlock; }

  /** Tries to cast hotbar slot i. Aims at the target, else the cursor, else a creature close by, else straight ahead. */
  cast(i) {
    const g = this.game, p = g.player, s = SKILLS[i];
    if (!s || p.dead || p.dash) return false;
    if (!this.unlocked(i)) { g.bus.emit('log', { text: `${s.name} unlocks at level ${s.unlock}.` }); return false; }
    if (this.cooldowns[i] > 0) return false;
    if (p.focus < s.focus) { g.bus.emit('log', { text: 'Not enough focus.' }); g.bus.emit('deny'); return false; }
    const aim = this.aim();
    p.focus -= s.focus;
    this.cooldowns[i] = s.cooldown;
    p.calm = Math.min(p.calm, 2);
    s.cast(g, p, aim);
    g.bus.emit('skill', { id: s.id });
    return true;
  }

  aim() {
    const g = this.game, p = g.player;
    let tx, tz;
    const t = p.target && p.target.kind === 'monster' && !p.target.dead ? p.target : null;
    if (t) { tx = t.x; tz = t.z; }
    else if (g.controls.ground) { tx = g.controls.ground.x; tz = g.controls.ground.z; }
    else {
      // no target and no cursor (keys or a touch screen): aim at the nearest creature, if one is close
      const m = g.entities.nearest('monster', p.x, p.z, 11);
      if (m) { tx = m.x; tz = m.z; }
    }
    let dx = (tx ?? p.x) - p.x, dz = (tz ?? p.z) - p.z, d = Math.hypot(dx, dz);
    if (d < 0.2) { [dx, dz] = dirFromYaw(p.yaw); d = 1; }
    return { x: tx, z: tz, dirX: dx / d, dirZ: dz / d, target: t };
  }

  launch(shot) {
    shot.orb = this.game.fx.spawn('orb', shot.x, shot.y, shot.z, { size: 0.55, color: shot.color, hold: true });
    this.shots.push(shot);
  }

  update(dt) {
    const g = this.game, p = g.player;
    for (let i = 0; i < this.cooldowns.length; i++) this.cooldowns[i] = Math.max(0, this.cooldowns[i] - dt);
    p.potionCd = Math.max(0, p.potionCd - dt);
    if (p.mend) {
      p.hp = Math.min(p.maxHp, p.hp + p.mend.rate * dt);
      p.mend.left -= dt;
      if (p.mend.left <= 0) p.mend = null;
    }

    let w = 0;
    for (const s of this.shots) {
      s.x += s.vx * dt; s.z += s.vz * dt; s.life -= dt;
      const ground = g.world.surface(s.x, s.z);
      let hit = null, done = s.life <= 0 || ground > s.y - 0.1;
      for (const m of g.monsters) {
        if (m.dead) continue;
        if (Math.hypot(m.x - s.x, m.z - s.z) < m.radius + s.radius) { hit = m; break; }
      }
      if (!hit && !done) g.world.forEachProp(s.x, s.z, 1, (pr) => {
        if (pr.def.collide > 0 && Math.hypot(pr.x - s.x, pr.z - s.z) < pr.def.collide * pr.scale + 0.2 && s.y < pr.y + pr.def.height * pr.scale) done = true;
      });
      if (hit) {
        s.onHit(hit);
        if (s.splash) for (const m of g.monsters) {
          if (m !== hit && !m.dead && Math.hypot(m.x - s.x, m.z - s.z) < s.splash + m.radius) g.combat.strike(m, s.splashMult * p.power, 0, false);
        }
        done = true;
      }
      if (s.orb) {
        s.orb.x = s.x; s.orb.y = s.y; s.orb.z = s.z;
        if (Math.random() < 0.7) g.fx.spawn('spark', s.x, s.y, s.z, { size: 0.16, life: 0.25, color: s.color, vy: 0.8 });
        g.fx.light(s.x, s.y, s.z, 5, 0.05);
      }
      if (done) {
        if (s.orb) { s.orb.hold = false; s.orb.life = 1; }
        g.bus.emit('bolt:hit', { x: s.x, y: s.y, z: s.z });
        continue;
      }
      this.shots[w++] = s;
    }
    this.shots.length = w;
  }
}
