import { GAME } from '../../config.js';
import { damp, dampAngle } from '../../core/math.js';
import type { Game } from '../game';
import type { Player } from '../types';
import type { Character } from '../state/character';
import type { When } from '../content/effects';
import { CLASSES } from '../content/classes';
import { HAIRS, TUNICS, pencilOf } from '../content/looks';
import { compileBuild, condsChanged } from '../rules/build';
import { baseEntity, yawFromDir } from '../entities';

const CADENCE = 10.4;
export const HORSE_SPEED = 1.7;
export const SADDLE = 0.62;
const STRIDE = 0.5;
const ROAD_BONUS = 1.25;
const TRAMPLE_SPEED = 0.6;
const NPC_NEAR = 5, NPC_FAR = 7;
const out = { x: 0, z: 0 };

export function makePlayer(game: Game, char: Character): Player {
  const cls = CLASSES[char.classId];
  const build = compileBuild({ char });
  const x = char.pos.x, z = char.pos.z;
  const p: Player = {
    ...baseEntity('player', 'humanoid'),
    kind: 'player',
    x, z, y: game.world.surface(x, z), yaw: 2.6, radius: 0.36, height: 1.6, ghost: true,
    colors: [
      char.look && TUNICS[char.look.tunic] ? pencilOf(TUNICS[char.look.tunic]) : [...cls.pencils[0]],
      [...cls.pencils[1]],
      char.look && HAIRS[char.look.hair] ? pencilOf(HAIRS[char.look.hair]) : [...cls.pencils[2]],
    ],
    extra: cls.kit,
    name: char.name, level: char.level,
    char, build,
    hp: 1, maxHp: 1, statuses: [], barrier: 0, invuln: 0,
    resource: 0,
    intent: { moveX: 0, moveZ: 0 }, target: null, pursue: false, moveTo: null, queued: null,
    cast: null, cooldowns: {}, dash: null,
    calm: 10, potionCd: 0, evadeCd: 0, safe: true, respawn: 0, dirty: false, standStill: false,
    mounted: true, rideWanted: true, thrownT: 0, rideYaw: 2.6,
  };
  p.maxHp = build.derived.maxLife;
  p.hp = Math.min(p.maxHp, char.hp);
  p.resource = Math.min(build.derived.maxResource, Math.max(0, char.resource));
  return p;
}

export class PlayerSystem {
  private readonly game: Game;
  private stuck = 0;
  private footT = 0;
  private readonly trampled = new Map<number, number>();
  private siteName = '';
  private readonly when: Record<When, boolean> = { resourceHigh: false, resourceLow: false, healthy: true, injured: false, barrier: false };

  constructor(game: Game) { this.game = game; }

  reset(): void { this.stuck = 0; this.siteName = ''; }

  recompile(force = false): void {
    const p = this.game.player;
    const w = this.when;
    const max = p.build.derived.maxResource;
    w.resourceHigh = p.resource >= max * 0.5; w.resourceLow = p.resource < max * 0.25;
    w.healthy = p.hp > p.maxHp * 0.8; w.injured = p.hp < p.maxHp * 0.35; w.barrier = p.barrier > 0;
    if (!force && !p.dirty && !condsChanged(p.build, w)) return;
    const frac = p.maxHp > 1 ? p.hp / p.maxHp : 1;
    p.build = compileBuild({ char: p.char, statuses: p.statuses, when: { ...w } });
    p.dirty = false;
    p.level = p.char.level;
    const before = p.maxHp;
    p.maxHp = p.build.derived.maxLife;
    p.hp = before > 1 && p.maxHp > before ? Math.min(p.maxHp, p.hp + (p.maxHp - before)) : Math.min(p.maxHp, Math.max(p.hp, before <= 1 ? p.maxHp * frac : p.hp));
    p.resource = Math.min(p.resource, p.build.derived.maxResource);
    this.game.bus.emit('build:changed');
  }

  toggleMount(): void {
    const g = this.game, p = g.player;
    if (p.dead) return;
    if (g.world !== g.overworld) { g.bus.emit('log', { text: 'No room for the horse down here.' }); g.bus.emit('deny'); return; }
    if (p.dash) return;
    p.rideWanted = !p.rideWanted;
    p.thrownT = 0;
    this.setMounted(p.rideWanted && !this.onFoot());
  }

  /** A heavy blow throws the rider; the horse is back under them after 1 to 5 seconds. */
  thrown(frac: number): void {
    const g = this.game, p = g.player;
    if (!p.mounted || p.dead) return;
    p.thrownT = Math.min(5, Math.max(1, 1 + (frac - 0.1) / 0.3 * 4));
    this.setMounted(false);
    p.invuln = Math.max(p.invuln, 0.35);
    g.bus.emit('miss', { target: p, text: 'Thrown!' });
  }

  /** On foot in towns, near townsfolk and below ground. */
  private onFoot(): boolean {
    const g = this.game, p = g.player;
    if (g.world !== g.overworld || p.safe) return true;
    return !!g.entities.nearest('npc', p.x, p.z, p.mounted ? NPC_NEAR : NPC_FAR);
  }

  private trample(dt: number, pace: number): void {
    const g = this.game, p = g.player;
    for (const [id, t] of this.trampled) if ((t - dt) <= 0) this.trampled.delete(id); else this.trampled.set(id, t - dt);
    const top = GAME.PLAYER_SPEED * HORSE_SPEED;
    if (pace < top * TRAMPLE_SPEED) return;
    const fx = -Math.sin(p.rideYaw), fz = Math.cos(p.rideYaw);
    for (const m of g.monsters) {
      if (m.dead || this.trampled.has(m.id)) continue;
      const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz);
      if (d > p.radius + m.radius + 0.45 || dx * fx + dz * fz < 0) continue;
      this.trampled.set(m.id, 0.9);
      const k = Math.min(1, pace / top);
      g.combat.heroHit(m, { skill: null, base: g.combat.weaponRoll() * (0.5 + 0.7 * k), element: 'physical', tags: ['melee'], fromX: p.x, fromZ: p.z, params: { knock: 6 + 6 * k }, noTriggers: true });
      g.bus.emit('swing', { entity: p, radius: 1.2, heavy: true });
    }
  }

  private setMounted(on: boolean): void {
    const g = this.game, p = g.player;
    if (p.mounted === on) return;
    p.mounted = on;
    if (on) p.rideYaw = p.yaw;
    p.radius = on ? 0.5 : 0.36;
    g.bus.emit('mount', { on });
    g.fx.spawn('ring', p.x, p.y + 0.08, p.z, { size: 1.8, life: 0.5, color: [0.69, 0.5, 0.33], ground: true, alpha: 0.8 });
  }

  drink(): boolean {
    const g = this.game, p = g.player, c = p.char;
    if (p.dead || p.potionCd > 0) return false;
    if (c.potions <= 0) { g.bus.emit('log', { text: 'No tonics left. Waystones refill them.' }); g.bus.emit('deny'); return false; }
    if (p.hp >= p.maxHp) return false;
    c.potions--;
    p.potionCd = 1.2;
    const tier = 1 + c.potionTier * 0.25;
    g.combat.healHero(p.maxHp * p.build.derived.potionHeal * tier, true);
    g.status.apply(p, 'mending', 3, p.maxHp * 0.1 * tier / 3);
    g.bus.emit('heal', { entity: p });
    g.bus.emit('drink', { item: 'tonic' });
    return true;
  }

  update(dt: number): void {
    const g = this.game, p = g.player, w = g.world, it = p.intent;
    p.flash = Math.max(0, p.flash - dt * 5);
    p.invuln = Math.max(0, p.invuln - dt);
    if (p.dead) return this.updateDead(dt);
    this.recompile();

    if (p.action) {
      p.actionT += dt / p.actionDur;
      if (p.actionT >= 1) { p.action = 0; p.actionT = 0; }
    }

    p.thrownT = Math.max(0, p.thrownT - dt);
    const foot = this.onFoot();
    this.footT = foot ? 0 : this.footT + dt;
    if (p.mounted && foot) this.setMounted(false);
    else if (!p.mounted && p.rideWanted && p.thrownT <= 0 && this.footT > 0.5 && !p.dash) this.setMounted(true);
    const road = p.mounted && w === g.overworld && w.gen.roadDist(p.x, p.z) < 2.2;

    const d = p.build.derived;
    const wet = w.waterDepth(p.x, p.z) > 0.18;
    const speed = GAME.PLAYER_SPEED * d.moveSpeed * (wet ? 0.62 : 1) * (p.mounted ? HORSE_SPEED : 1) * (road ? ROAD_BONUS : 1);
    const held = g.status.stopped(p);
    let dx = 0, dz = 0, want = false;
    const tgt = p.target && !p.target.gone && !p.target.dead ? p.target : (p.target = null);

    if (p.dash) {
      const dash = p.dash;
      dash.t -= dt;
      dx = dash.x * dash.speed; dz = dash.z * dash.speed; want = true;
      if (dash.leap && dash.total) p.lift = Math.sin(Math.max(0, 1 - dash.t / dash.total) * Math.PI) * 1.8;
      if (dash.t <= 0) { p.dash = null; p.lift = 0; g.skills.dashEnded(); }
    } else if (held) {
    } else if ((it.moveX || it.moveZ) && !p.standStill) {
      dx = it.moveX * speed; dz = it.moveZ * speed; want = true;
      p.moveTo = null; p.pursue = false; p.queued = null;
    } else if (tgt && p.pursue) {
      const dist = Math.hypot(tgt.x - p.x, tgt.z - p.z);
      let stop = 0.7;
      if (tgt.kind === 'monster') {
        const s = g.skills.skillInSlot(p.queued?.slot ?? 0);
        stop = (s ? Math.max(1.4, s.def.range) : 1.6) + tgt.radius - 0.2;
      } else if (tgt.kind === 'npc') stop = 2.3;
      if (dist > stop && !p.standStill) { dx = (tgt.x - p.x) / dist * speed; dz = (tgt.z - p.z) / dist * speed; want = true; }
    } else if (p.moveTo && !p.standStill) {
      const dist = Math.hypot(p.moveTo.x - p.x, p.moveTo.z - p.z);
      if (dist < 0.25) p.moveTo = null;
      else { const s = Math.min(speed, dist / Math.max(dt, 1e-4)); dx = (p.moveTo.x - p.x) / dist * s; dz = (p.moveTo.z - p.z) / dist * s; want = true; }
    }
    const archer = p.mounted && p.char.classId === 'strider';
    if (p.cast && !p.dash && !archer && p.cast.t < p.cast.hitAt + 0.08) { dx *= 0.2; dz *= 0.2; }

    const px = p.x, pz = p.z;
    if (want && dt > 0) {
      w.moveCircle(p.x, p.z, dx * dt, dz * dt, p.radius, out);
      p.x = out.x; p.z = out.z;
      const moved = Math.hypot(p.x - px, p.z - pz);
      if (!p.dash && moved < Math.hypot(dx, dz) * dt * 0.25) { this.stuck += dt; if (this.stuck > 0.6) { p.moveTo = null; this.stuck = 0; } } else this.stuck = 0;
      if (moved > 1e-4 && !p.cast) p.yaw = dampAngle(p.yaw, yawFromDir(p.x - px, p.z - pz), 16, dt);
      if (moved > 1e-4) p.rideYaw = dampAngle(p.rideYaw, yawFromDir(p.x - px, p.z - pz), 10, dt);
      if (!p.dash) {
        const pace = moved / Math.max(dt, 1e-4);
        const before = p.walk;
        p.walk += moved * Math.min(4.5, Math.max(1.9, CADENCE / Math.max(pace, 0.1))) * (p.mounted ? STRIDE : 1);
        const beat = p.mounted ? Math.PI * 0.5 : Math.PI;
        if (Math.floor(before / beat) !== Math.floor(p.walk / beat)) g.bus.emit('step', { entity: p, water: wet, hoof: p.mounted });
      }
    }
    const movedNow = Math.hypot(p.x - px, p.z - pz) / Math.max(dt, 1e-4);
    if (movedNow < 0.2) p.rideYaw = dampAngle(p.rideYaw, p.yaw, 4, dt);
    if (p.mounted && !p.dash) this.trample(dt, movedNow);
    p.move = damp(p.move, Math.min(1, movedNow / (GAME.PLAYER_SPEED * (p.mounted ? 1.2 : 0.8))), 14, dt);
    if (!p.dash?.leap) p.y = damp(p.y, w.surface(p.x, p.z) - (wet ? 0.12 : 0), 22, dt);

    if (tgt && !held) {
      const dist = Math.hypot(tgt.x - p.x, tgt.z - p.z);
      if (tgt.kind === 'monster') {
        const slot = p.queued?.slot ?? 0;
        const s = g.skills.skillInSlot(slot);
        const reach = (s ? Math.max(1.4, s.def.range) : 1.6) + tgt.radius + 0.15;
        if (dist <= reach && (p.pursue || !want)) {
          if (!p.cast) p.yaw = dampAngle(p.yaw, yawFromDir(tgt.x - p.x, tgt.z - p.z), 18, dt);
          if (p.queued && !p.cast && !p.dash) {
            const used = g.skills.useSlot(slot, { target: tgt, quiet: true });
            if (used && !g.settings.autoAttack) { p.queued = null; p.pursue = false; }
            if (!used && s && !g.skills.canAfford(s) && slot !== 0) p.queued = { slot: 0 };
          }
        }
      } else if (tgt.kind === 'npc' && dist <= 2.6) {
        p.yaw = yawFromDir(tgt.x - p.x, tgt.z - p.z);
        tgt.yaw = yawFromDir(p.x - tgt.x, p.z - tgt.z);
        p.target = null; p.pursue = false;
        g.bus.emit('npc:talk', tgt);
      } else if (tgt.kind === 'drop' && dist <= 1.0) {
        p.target = null; p.pursue = false;
      }
    }

    p.calm += dt;
    const rest = p.calm > 5 ? 4 : 1;
    p.hp = Math.min(p.maxHp, p.hp + d.lifeRegen * rest * dt);
    const res = p.build.cls.resource;
    if (res.regen) p.resource = Math.min(d.maxResource, p.resource + d.resourceRegen * (p.calm > 5 ? 1.6 : 1) * dt);
    if (res.decay && p.calm > res.decay[0]) p.resource = Math.max(0, p.resource - res.decay[1] * dt);

    this.visitSites();
  }

  private visitSites(): void {
    const g = this.game, p = g.player, j = p.char.journey;
    if (g.world !== g.overworld) { p.safe = false; return; }
    const site = g.world.sites.near(p.x, p.z);
    const d = site ? Math.hypot(site.x - p.x, site.z - p.z) : 1e9;
    const name = site && d < site.clear + 6 ? site.name : '';
    if (name !== this.siteName) {
      this.siteName = name;
      if (name) g.bus.emit('site:enter', { name: site.name, kind: site.kind });
    }
    if (site && site.waystone && d < 3.2) {
      const ws = j.waystone;
      if (ws.x !== site.x || ws.z !== site.z) {
        j.waystone = { x: site.x, z: site.z, name: site.name };
        p.hp = p.maxHp;
        p.char.potions = Math.max(p.char.potions, p.build.derived.potionCharges);
        g.bus.emit('attune', { x: site.x, y: g.world.surface(site.x, site.z), z: site.z, name: site.name });
      } else if (p.char.potions < p.build.derived.potionCharges && p.calm > 2) {
        p.char.potions = p.build.derived.potionCharges;
        g.bus.emit('log', { text: 'Your tonics are refilled.' });
      }
    }
    p.safe = !!(site && site.safe && d < site.safe);
  }

  private updateDead(dt: number): void {
    const g = this.game, p = g.player;
    p.grow = Math.max(0, p.grow - dt * 3);
    p.move = 0;
    p.respawn -= dt;
    g.look.fadeGoal = p.respawn < 1.2 ? 0 : 1;
    if (p.respawn <= 0) {
      if (g.world !== g.overworld) g.zones.leave(true);
      const ws = p.char.journey.waystone;
      p.x = ws.x + 2.4; p.z = ws.z + 2.4; p.y = g.world.surface(p.x, p.z);
      p.statuses = []; p.barrier = 0; p.dirty = true;
      this.recompile(true);
      p.hp = p.maxHp;
      p.resource = p.build.cls.resource.startFull ? p.build.derived.maxResource * 0.5 : 0;
      p.char.potions = Math.max(p.char.potions, p.build.derived.potionCharges);
      p.dead = false; p.grow = 1; p.invuln = 2; p.calm = 10;
      g.look.fadeGoal = 1;
      g.camera.target = [p.x, p.y + 1, p.z];
      g.fillWorld();
      g.bus.emit('player:respawn', { name: ws.name });
    }
  }
}
