import { damp, dampAngle } from '../../core/math.js';
import type { Game } from '../game';
import type { AnyEntity, EntityBase, Monster } from '../types';
import { baseEntity, pencils, yawFromDir } from '../entities';

// Marley, the hero's standard poodle. Joins at level 5 and runs herself: no commands, no menu.
// She bites weakly, points at hidden caches, harries fleeing quarry and warns of danger early.
// At zero health she backs off, tail down and silent, and keeps clear of enemies for 15 s.

export const DOG_LEVEL = 5;
const DOWN_TIME = 15;
const BITE_SHARE = 0.18, BITE_CD = 1.4;
const ALERT_R = 24, ALERT_MIN = 13, ALERT_CD = 7;
const POINT_R = 20;
const FIGHT_R = 11;
const TOWN_HEAL = 0.25, REGEN = 0.025;

export type DogMode = 'follow' | 'fight' | 'wary' | 'down' | 'alert' | 'point' | 'hunt';

export interface Dog extends EntityBase {
  hp: number; maxHp: number;
  mode: DogMode; modeT: number;
  downT: number; biteCd: number; barkCd: number;
  focusX: number; focusZ: number;
  foe: Monster | null;
  away: boolean;
}

const out = { x: 0, z: 0 };

export class Companion {
  private readonly game: Game;
  dog: Dog | null = null;
  private readonly warned = new Set<number>();
  private readonly pointed = new Set<string>();
  private scanT = 0;

  constructor(game: Game) {
    this.game = game;
    game.bus.on('levelup', ({ level }) => { if (level >= DOG_LEVEL && !this.dog) this.join(true); });
    game.bus.on('character:loaded', () => { this.dog = null; this.warned.clear(); if (game.player.char.level >= DOG_LEVEL) this.join(false); });
    game.bus.on('zone:enter', () => this.zoneChanged());
  }

  /** Marley is around, conscious and able to be fought. */
  active(): Dog | null {
    const d = this.dog;
    return d && !d.away && d.mode !== 'down' ? d : null;
  }

  private join(announce: boolean): void {
    const g = this.game, p = g.player;
    const d = { ...baseEntity('npc', 'poodle') } as Dog;
    Object.assign(d, {
      name: 'Marley', x: p.x - 2, z: p.z - 2, y: g.world.surface(p.x - 2, p.z - 2), yaw: p.yaw,
      radius: 0.32, height: 1.15, scale: 1, grow: announce ? 0 : 1,
      colors: pencils([[146, 92, 62], [116, 72, 50], [40, 30, 28]]),
      hp: 1, maxHp: 1, mode: 'follow', modeT: 0, downT: 0, biteCd: 0, barkCd: 3,
      focusX: 0, focusZ: 0, foe: null, away: g.world !== g.overworld,
    } satisfies Partial<Dog>);
    d.maxHp = d.hp = this.maxHp();
    this.dog = d;
    if (announce) {
      g.bus.emit('log', { text: 'A tall brown poodle trots up and falls in beside you. <em>Marley</em> has joined you.' });
      g.bus.emit('bark', { growl: false });
    }
  }

  private maxHp(): number { return Math.round(this.game.player.maxHp * 0.6); }

  private zoneChanged(): void {
    const g = this.game, d = this.dog, p = g.player;
    if (!d) return;
    const out = g.world !== g.overworld;
    if (out) { d.away = true; return; }
    if (d.away) {
      d.away = false;
      d.x = p.x - 1.5; d.z = p.z - 1.5; d.y = g.world.surface(d.x, d.z);
      d.mode = d.mode === 'down' ? 'down' : 'follow';
      this.say(d, 'Woof!');
      g.bus.emit('bark', { growl: false });
    }
  }

  private say(d: Dog, text: string): void { this.game.bus.emit('miss', { target: d as unknown as AnyEntity, text }); }

  /** A monster's blow lands on Marley. */
  hurt(m: Monster): void {
    const g = this.game, d = this.active();
    if (!d) return;
    if (Math.hypot(d.x - m.x, d.z - m.z) > m.def.range + m.radius + 0.6) return;
    const n = Math.max(1, Math.round(m.atk * 0.8 * (0.85 + g.rng.next() * 0.3)));
    d.hp -= n; d.flash = 1;
    this.say(d, String(n));
    if (d.hp <= 0) {
      d.hp = 0; d.mode = 'down'; d.downT = DOWN_TIME; d.foe = null; d.action = 0;
      g.bus.emit('yelp');
      for (const o of g.monsters) if (o.ai.dog) o.ai.dog = false;
    }
  }

  update(dt: number): void {
    const g = this.game, p = g.player, d = this.dog;
    if (!d) return;
    d.flash = Math.max(0, d.flash - dt * 5);
    d.grow = Math.min(1, d.grow + dt * 2);
    d.biteCd -= dt; d.barkCd -= dt; d.modeT -= dt;
    d.maxHp = this.maxHp();
    if (d.away) return;
    if (d.action) { d.actionT += dt / d.actionDur; if (d.actionT >= 1) { d.action = 0; d.actionT = 0; } }

    const far = Math.hypot(p.x - d.x, p.z - d.z);
    if (far > 45 || p.dead) {
      d.x = p.x - 2; d.z = p.z - 2; d.y = g.world.surface(d.x, d.z);
    }

    const calm = !g.monsters.some((m) => !m.dead && !m.quarry && (m.ai.state === 'chase' || m.ai.state === 'attack' || m.ai.state === 'special') && Math.hypot(m.x - p.x, m.z - p.z) < 18);
    if (d.mode === 'down') {
      d.downT -= dt;
      if (d.downT <= 0) { d.hp = Math.max(1, Math.round(d.maxHp * 0.5)); d.mode = 'follow'; }
    } else {
      d.hp = Math.min(d.maxHp, d.hp + d.maxHp * (p.safe ? TOWN_HEAL : calm ? REGEN : 0) * dt);
    }

    let tx = d.x, tz = d.z, speed = 0, face: number | null = null;
    const ride = p.mounted ? 1.15 : 1.05;
    const top = 5.4 * Math.max(1, p.build.derived.moveSpeed) * (p.mounted ? 1.7 * 1.25 : 1) * ride;

    const heel = p.mounted ? 2.6 : 1.8, side = p.mounted ? 1.75 : 2.1;
    const heelX = p.x - Math.sin(p.rideYaw + side) * heel, heelZ = p.z + Math.cos(p.rideYaw + side) * heel;

    if (d.mode === 'down') {
      // Tail down, silent, keeps away from anything close and trails the hero at a distance.
      const near = this.nearestFoe(d.x, d.z, 7);
      if (near) {
        const a = Math.hypot(d.x - near.x, d.z - near.z) || 1;
        tx = d.x + (d.x - near.x) / a * 4; tz = d.z + (d.z - near.z) / a * 4; speed = 4.2;
      } else if (far > 5) { tx = heelX; tz = heelZ; speed = Math.min(top, 4 + far * 0.4); }
    } else {
      this.scan(d, calm, dt);
      const foe = this.pickFoe(d);
      if (d.mode === 'alert' || d.mode === 'point') {
        face = yawFromDir(d.focusX - d.x, d.focusZ - d.z);
        if (d.modeT <= 0 || foe) d.mode = 'follow';
      }
      if (d.mode !== 'alert' && d.mode !== 'point') {
        const quarry = g.monsters.find((m) => m.quarry && !m.dead && Math.hypot(m.x - p.x, m.z - p.z) < 26);
        if (foe && foe.elite) {
          // Elders and bosses: circles at a distance and barks, never closes in.
          d.mode = 'wary'; d.foe = foe;
          const a = Math.atan2(d.z - foe.z, d.x - foe.x) + dt * 0.6, r = 5.5;
          tx = foe.x + Math.cos(a) * r; tz = foe.z + Math.sin(a) * r; speed = 5;
          face = yawFromDir(foe.x - d.x, foe.z - d.z);
          if (d.barkCd <= 0) { d.barkCd = 3 + g.rng.next() * 2; this.bark(d, true); }
        } else if (foe) {
          d.mode = 'fight'; d.foe = foe;
          const r = Math.hypot(foe.x - d.x, foe.z - d.z);
          if (r > foe.radius + d.radius + 0.35) { tx = foe.x; tz = foe.z; speed = top * 0.9; }
          face = yawFromDir(foe.x - d.x, foe.z - d.z);
          if (r < foe.radius + d.radius + 0.75 && d.biteCd <= 0) this.bite(d, foe);
        } else if (quarry) {
          d.mode = 'hunt'; d.foe = quarry;
          const r = Math.hypot(quarry.x - d.x, quarry.z - d.z);
          tx = quarry.x; tz = quarry.z; speed = 10;
          if (r < quarry.radius + d.radius + 0.6 && d.biteCd <= 0) {
            d.biteCd = 1.6; d.action = 1; d.actionT = 0; d.actionDur = 0.35;
            g.status.apply(quarry, 'slow', 1.6, 0.35);
          }
        } else {
          d.mode = 'follow'; d.foe = null;
          if (Math.hypot(heelX - d.x, heelZ - d.z) > 0.8) { tx = heelX; tz = heelZ; speed = Math.min(top, 2.5 + far * 1.4); }
        }
      }
    }

    const limp = d.mode === 'down' || d.hp < d.maxHp * 0.4;
    if (limp) speed = Math.min(speed, d.mode === 'down' ? 4.2 : top * 0.75);
    const dx = tx - d.x, dz = tz - d.z, dist = Math.hypot(dx, dz);
    const ox = d.x, oz = d.z;
    if (speed > 0 && dist > 0.05) {
      const step = Math.min(dist, speed * dt);
      g.world.moveCircle(d.x, d.z, dx / dist * step, dz / dist * step, d.radius, out);
      d.x = out.x; d.z = out.z;
    }
    const pd = Math.hypot(d.x - p.x, d.z - p.z), min = d.radius + p.radius + (p.mounted ? 0.45 : 0);
    if (pd < min && pd > 1e-3) { d.x += (d.x - p.x) / pd * (min - pd); d.z += (d.z - p.z) / pd * (min - pd); }
    const moved = Math.hypot(d.x - ox, d.z - oz);
    if (face !== null) d.yaw = dampAngle(d.yaw, face, 10, dt);
    else if (moved > 1e-3) d.yaw = dampAngle(d.yaw, yawFromDir(d.x - ox, d.z - oz), 10, dt);
    d.walk += moved * (limp ? 3.2 : 2.6);
    d.move = damp(d.move, Math.min(1, moved / Math.max(dt, 1e-4) / 5), 10, dt);
    d.y = damp(d.y, g.world.surface(d.x, d.z) - (g.world.waterDepth(d.x, d.z) > 0.18 ? 0.15 : 0), 18, dt);
    d.extra = (d.mode === 'down' ? 1 : 0) + (limp ? 2 : 0) + (d.mode === 'point' ? 4 : 0);
  }

  private nearestFoe(x: number, z: number, r: number): Monster | null {
    let best: Monster | null = null, bd = r;
    for (const m of this.game.monsters) {
      if (m.dead || m.quarry) continue;
      const dd = Math.hypot(m.x - x, m.z - z);
      if (dd < bd) { bd = dd; best = m; }
    }
    return best;
  }

  /** The enemy Marley should deal with: whatever is fighting the hero or her, nearest to her. */
  private pickFoe(d: Dog): Monster | null {
    const g = this.game, p = g.player;
    let best: Monster | null = null, bd = Infinity;
    for (const m of g.monsters) {
      if (m.dead || m.quarry) continue;
      const busy = m.ai.dog || ((m.ai.state === 'chase' || m.ai.state === 'attack' || m.ai.state === 'special') && Math.hypot(m.x - p.x, m.z - p.z) < FIGHT_R);
      if (!busy) continue;
      const dd = Math.hypot(m.x - d.x, m.z - d.z) + (m.elite ? 4 : 0) + (m === d.foe ? -1.5 : 0);
      if (dd < bd) { bd = dd; best = m; }
    }
    return best;
  }

  private bite(d: Dog, m: Monster): void {
    const g = this.game, p = g.player;
    d.biteCd = BITE_CD * (0.85 + g.rng.next() * 0.3);
    if (!m.elite && !m.ai.dog && g.rng.chance(0.4)) m.ai.dog = true;
    d.action = 1; d.actionT = 0; d.actionDur = 0.35;
    g.combat.heroHit(m, {
      skill: null, base: g.combat.weaponRoll() * BITE_SHARE, element: 'physical', tags: ['melee'],
      fromX: d.x, fromZ: d.z, params: {}, noTriggers: true,
    });
    // Her scuffle can stir up the rest of a pack nearby.
    for (const o of g.monsters) {
      if (o === m || o.dead || o.quarry || o.ai.state !== 'idle') continue;
      if (Math.hypot(o.x - m.x, o.z - m.z) < 5) o.ai.provoked = true;
    }
    if (!p.dead && g.rng.chance(0.2)) g.bus.emit('bark', { growl: true });
  }

  private bark(d: Dog, growl: boolean): void {
    d.action = 2; d.actionT = 0; d.actionDur = 0.5;
    this.say(d, growl ? 'Grrr!' : 'Woof!');
    this.game.bus.emit('bark', { growl });
  }

  /** Early warning of anything heading in, and caches she smells. */
  private scan(d: Dog, calm: boolean, dt: number): void {
    const g = this.game, p = g.player;
    this.scanT -= dt;
    if (this.scanT > 0) return;
    this.scanT = 0.5;
    for (const id of this.warned) if (!g.monsters.some((m) => m.id === id && !m.dead)) this.warned.delete(id);

    if (d.barkCd <= 0 && !p.safe) {
      for (const m of g.monsters) {
        if (m.dead || m.quarry || this.warned.has(m.id) || m.ai.state !== 'idle') continue;
        const r = Math.hypot(m.x - p.x, m.z - p.z);
        if (r > ALERT_R || r < ALERT_MIN) continue;
        for (const o of g.monsters) if (Math.hypot(o.x - m.x, o.z - m.z) < 7) this.warned.add(o.id);
        d.mode = 'alert'; d.modeT = 1.4; d.focusX = m.x; d.focusZ = m.z;
        d.barkCd = ALERT_CD;
        this.bark(d, m.elite);
        if (m.elite) g.bus.emit('log', { text: `<em>Marley</em> growls toward the ${compass(m.x - p.x, m.z - p.z)}.` });
        return;
      }
    }
    if (calm && d.barkCd <= 0 && g.world === g.overworld) {
      for (const f of g.world.finds.inRange(d.x, d.z, POINT_R)) {
        if (f.kind !== 'cache' || this.pointed.has(f.key) || g.world.gen.opened.has(f.key)) continue;
        this.pointed.add(f.key);
        d.mode = 'point'; d.modeT = 2.6; d.focusX = f.x; d.focusZ = f.z;
        d.barkCd = 4;
        this.bark(d, false);
        g.bus.emit('log', { text: `<em>Marley</em> is pointing ${compass(f.x - p.x, f.z - p.z)}. She smells something.` });
        return;
      }
    }
  }
}

function compass(dx: number, dz: number): string {
  const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  const a = Math.atan2(dx, -dz);
  return names[(Math.round(a / (Math.PI / 4)) + 8) % 8];
}
