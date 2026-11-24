// The player's body: moving, auto-attacking the chosen target, interacting,
// recovering, and coming back at a waystone. It acts on `player.intent`, which
// the Controls system fills in — so a replay, a bot or a network peer could
// drive the same code.

import { GAME, WORLD } from '../../config.js';
import { damp, dampAngle } from '../../core/math.js';
import { yawFromDir, dirFromYaw } from '../entities.js';

const SWING = 0.42, HIT_AT = 0.45, REACH = 1.55;
const CADENCE = 10.4;      // radians of stride a second: about 1.65 full cycles
const out = { x: 0, z: 0 };

export class PlayerSystem {
  constructor(game) {
    this.game = game;
    this.stuck = 0;
    this.siteName = '';
  }

  update(dt) {
    const g = this.game, p = g.player, w = g.world, it = p.intent;
    p.flash = Math.max(0, p.flash - dt * 5);
    p.invuln = Math.max(0, p.invuln - dt);
    if (p.dead) return this.updateDead(dt);

    // animation clock; the hit lands part-way through a swing
    if (p.action) {
      const before = p.actionT;
      p.actionT += dt / p.actionDur;
      if (p.action === 1 && p.pending && before < HIT_AT && p.actionT >= HIT_AT) { p.pending(); p.pending = null; }
      if (p.actionT >= 1) { p.action = 0; p.pending = null; }
    }
    p.attackCd -= dt;

    const wet = w.waterDepth(p.x, p.z) > 0.18;
    const speed = GAME.PLAYER_SPEED * (wet ? 0.62 : 1) * (p.speedMul || 1);
    let dx = 0, dz = 0, want = 0;
    const tgt = p.target && !p.target.gone && !p.target.dead ? p.target : (p.target = null);

    if (p.dash) {
      p.dash.t -= dt;
      dx = p.dash.x * p.dash.speed; dz = p.dash.z * p.dash.speed; want = 1;
      if (p.dash.t <= 0) p.dash = null;
    } else if (it.moveX || it.moveZ) {
      dx = it.moveX * speed; dz = it.moveZ * speed; want = 1;
      p.moveTo = null; p.pursue = false;
    } else if (tgt && p.pursue) {
      const d = Math.hypot(tgt.x - p.x, tgt.z - p.z);
      const stop = tgt.kind === 'monster' ? REACH + tgt.radius - 0.25 : tgt.kind === 'npc' ? 2.3 : 0.7;
      if (d > stop) { dx = (tgt.x - p.x) / d * speed; dz = (tgt.z - p.z) / d * speed; want = 1; }
    } else if (p.moveTo) {
      const d = Math.hypot(p.moveTo.x - p.x, p.moveTo.z - p.z);
      if (d < 0.25) p.moveTo = null;
      else { const s = Math.min(speed, d / dt); dx = (p.moveTo.x - p.x) / d * s; dz = (p.moveTo.z - p.z) / d * s; want = 1; }
    }
    // rooted for the first beat of a swing so blows feel planted
    if (p.action === 1 && p.actionT < 0.55 && !p.dash) { dx *= 0.25; dz *= 0.25; }

    const px = p.x, pz = p.z;
    if (want) {
      w.moveCircle(p.x, p.z, dx * dt, dz * dt, p.radius, out);
      p.x = out.x; p.z = out.z;
      const moved = Math.hypot(p.x - px, p.z - pz);
      // walking into something: give up on a click-move rather than grind against it
      if (moved < Math.hypot(dx, dz) * dt * 0.25) { this.stuck += dt; if (this.stuck > 0.6) { p.moveTo = null; this.stuck = 0; } } else this.stuck = 0;
      if (moved > 1e-4 && !(p.action === 1 && tgt)) p.yaw = dampAngle(p.yaw, yawFromDir(p.x - px, p.z - pz), 16, dt);
      // The stride: legs turn over about 1.65 times a second whatever the pace, so a
      // step is as long as the ground it covers (a stroll takes short steps, a run long
      // ones) and the feet do not slide. A dash is a single held lunge, not a run.
      if (!p.dash) {
        const pace = moved / Math.max(dt, 1e-4);
        const before = p.walk;
        p.walk += moved * Math.min(4.5, Math.max(1.9, CADENCE / Math.max(pace, 0.1)));
        if (Math.floor(before / Math.PI) !== Math.floor(p.walk / Math.PI)) g.bus.emit('step', { entity: p, water: wet });
      }
    }
    const movedNow = Math.hypot(p.x - px, p.z - pz) / Math.max(dt, 1e-4);
    p.move = damp(p.move, Math.min(1, movedNow / (GAME.PLAYER_SPEED * 0.8)), 14, dt);
    p.y = damp(p.y, w.surface(p.x, p.z) - (wet ? 0.12 : 0), 22, dt);

    // act on the target once in reach
    if (tgt) {
      const d = Math.hypot(tgt.x - p.x, tgt.z - p.z);
      if (tgt.kind === 'monster') {
        if (d <= REACH + tgt.radius + 0.15 && (p.pursue || !want)) {
          p.yaw = dampAngle(p.yaw, yawFromDir(tgt.x - p.x, tgt.z - p.z), 18, dt);
          if (p.attackCd <= 0 && !p.action) this.swing(tgt);
        }
      } else if (tgt.kind === 'npc' && d <= 2.6) {
        p.yaw = yawFromDir(tgt.x - p.x, tgt.z - p.z);
        tgt.yaw = yawFromDir(p.x - tgt.x, p.z - tgt.z);
        p.target = null; p.pursue = false;
        g.bus.emit('npc:talk', tgt);
      } else if (tgt.kind === 'drop' && d <= 1.0) {
        p.target = null; p.pursue = false;
      }
    }

    // recovery: slow in a fight, quick once things calm down
    p.calm += dt;
    const rest = p.calm > 5 ? 4 : 1;
    p.hp = Math.min(p.maxHp, p.hp + p.hpRegen * rest * dt);
    p.focus = Math.min(p.maxFocus, p.focus + p.focusRegen * (p.calm > 5 ? 1.6 : 1) * dt);

    this.visitSites(dt);
  }

  swing(tgt) {
    const g = this.game, p = g.player;
    p.action = 1; p.actionT = 0; p.actionDur = SWING;
    p.attackCd = 1 / p.attackSpeed;
    p.calm = 0;
    p.pending = () => {
      g.bus.emit('swing', { entity: p, radius: 1.75 });
      if (!tgt.dead && Math.hypot(tgt.x - p.x, tgt.z - p.z) <= REACH + tgt.radius + 0.7) g.combat.strike(tgt);
    };
  }

  /** Waystones attune by walking up to them; entering a site announces its name. */
  visitSites() {
    const g = this.game, p = g.player;
    const site = g.world.sites.near(p.x, p.z);
    const d = site ? Math.hypot(site.x - p.x, site.z - p.z) : 1e9;
    const name = site && d < site.clear + 6 ? site.name : '';
    if (name !== this.siteName) {
      this.siteName = name;
      if (name) g.bus.emit('site:enter', site);
    }
    if (site && d < 3.2) {
      const ws = p.sheet.waystone;
      if (ws.x !== site.x || ws.z !== site.z) {
        p.sheet.waystone = { x: site.x, z: site.z, name: site.name };
        p.hp = p.maxHp; p.focus = p.maxFocus;
        g.bus.emit('attune', { x: site.x, y: g.world.surface(site.x, site.z), z: site.z, name: site.name });
      }
    }
    p.safe = !!(site && site.safe && d < site.safe);
  }

  updateDead(dt) {
    const g = this.game, p = g.player;
    p.grow = Math.max(0, p.grow - dt * 3);
    p.move = 0;
    p.respawn -= dt;
    g.look.fadeGoal = p.respawn < 1.2 ? 0 : 1;
    if (p.respawn <= 0) {
      const ws = p.sheet.waystone;
      p.x = ws.x + 2.4; p.z = ws.z + 2.4; p.y = g.world.surface(p.x, p.z);
      p.hp = p.maxHp; p.focus = p.maxFocus * 0.5;
      p.dead = false; p.grow = 1; p.invuln = 2; p.calm = 10;
      g.look.fadeGoal = 1;
      g.camera.target = [p.x, p.y + 1, p.z];
      g.bus.emit('player:respawn', { name: ws.name });
    }
  }
}

export { dirFromYaw };
