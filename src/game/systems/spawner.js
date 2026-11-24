// Population: keeps the land around the player stocked from each biome's
// monster table, at a level set by distance from the starting town, and lets
// distant monsters go. Beasts take after their country (a Frost Cragling, a
// Marsh Shellsnap: the biome's `variant`), ruins keep an elder of the local
// kind, and the townsfolk of nearby sites are placed here too.

import { GAME } from '../../config.js';
import { MONSTERS } from '../data/monsters.js';
import { makeEntity, pencils } from '../entities.js';
import { levelAt, scaleMonster } from '../stats.js';
import { NIGHT } from './stakes.js';

const NEAR = 26, FAR = 58, DESPAWN = 82;

// townsfolk wear their own pencils (coat, hat or hood, hair); vermilion stays the hero's
const NPC_LOOKS = {
  shop: { extra: 1, colors: [[150, 178, 120], [222, 178, 110], [122, 62, 44]] },
  bounty: { extra: 2, colors: [[84, 108, 156], [116, 156, 138], [150, 142, 132]] },
};

export class Spawner {
  constructor(game) {
    this.game = game;
    this.timer = 0;
    this.npcSites = new Set();
  }

  update(dt) {
    const g = this.game, p = g.player;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.35;

    for (const m of g.monsters) {
      if (!m.dead && Math.hypot(m.x - p.x, m.z - p.z) > DESPAWN && m.ai.state !== 'chase') m.gone = true;
    }
    g.monsters = g.monsters.filter((m) => !m.gone);

    for (const site of g.world.sites.inRange(p.x, p.z, 140)) {
      // something old lives in every ruin, and is back when you return from far away
      if (site.den && !site.denStocked && Math.hypot(site.x - p.x, site.z - p.z) < 70) {
        site.denStocked = true;
        const id = g.world.biome(site.x, site.z).monsters[0][0];
        this.spawnMonster(id, site.x + 2.5, site.z + 2.5, Math.max(1, levelAt(Math.hypot(site.x, site.z)) + 1), true);
      }
      if (this.npcSites.has(site.key)) continue;
      this.npcSites.add(site.key);
      for (const n of site.npcs) this.spawnNpc(n, site);
    }
    for (const site of g.world.sites.inRange(p.x, p.z, 400)) if (site.denStocked && Math.hypot(site.x - p.x, site.z - p.z) > 200) site.denStocked = false;

    if (g.monsters.length >= GAME.MAX_MONSTERS) return;
    // a pack at a time, somewhere in a ring around the player
    const a = Math.random() * 6.283, r = NEAR + Math.random() * (FAR - NEAR);
    const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
    if (!this.clear(x, z)) return;
    const table = g.world.biome(x, z).monsters;
    let total = 0;
    for (const row of table) total += row[1];
    let roll = Math.random() * total, id = table[0][0];
    for (const row of table) { roll -= row[1]; if (roll <= 0) { id = row[0]; break; } }
    const pack = 1 + Math.floor(Math.random() * (id === 'cragling' ? 1.5 : 3.2));
    const level = Math.max(1, levelAt(Math.hypot(x, z)) + (Math.random() < 0.3 ? 1 : 0));
    for (let i = 0; i < pack && g.monsters.length < GAME.MAX_MONSTERS; i++) {
      const ox = x + (Math.random() - 0.5) * 5, oz = z + (Math.random() - 0.5) * 5;
      if (this.clear(ox, oz)) this.spawnMonster(id, ox, oz, level, i === 0 && Math.random() < 0.05 + NIGHT.elders * g.stakes.night());
    }
  }

  clear(x, z) {
    const w = this.game.world;
    if (!w.walkable(x, z) || w.waterDepth(x, z) > 0.1) return false;
    const site = w.sites.near(x, z);
    return !(site && site.safe && Math.hypot(x - site.x, z - site.z) < site.safe + 6);
  }

  spawnMonster(id, x, z, level, elite = false) {
    const g = this.game, def = MONSTERS[id];
    const s = scaleMonster(def, level, elite);
    // the country's own coat and name
    const variant = g.world.biome(x, z).variant;
    const hide = variant ? variant.pencil : def.colors[0];
    const kindName = variant ? `${variant.prefix} ${def.name}` : def.name;
    const m = makeEntity('monster', def.archetype, {
      x, z, y: g.world.surface(x, z), yaw: Math.random() * 6.283,
      scale: def.scale * (elite ? 1.45 : 1) * (0.94 + Math.random() * 0.12), grow: 0,
      radius: def.radius * (elite ? 1.4 : 1), height: def.height * (elite ? 1.45 : 1),
      // an elder is drawn with a deeper pencil for its hide
      colors: pencils([elite ? hide.map((c, i) => c * 0.55 + [74, 77, 94][i] * 0.45) : hide, def.colors[1], def.colors[2]]),
      name: (elite ? 'Elder ' : '') + kindName, level, hp: s.maxHp, maxHp: s.maxHp, atk: s.atk, xp: s.xp,
      def, defId: id, elite, deathT: 0,
      ai: { state: 'idle', hx: x, hz: z, gx: x, gz: z, going: false, timer: Math.random() * 3, cd: 0, target: null, provoked: false, pushX: 0, pushZ: 0, struck: false },
    });
    g.entities.add(m);
    g.monsters.push(m);
    return m;
  }

  spawnNpc(n, site) {
    const g = this.game, look = NPC_LOOKS[n.role];
    // a camp's tinker dresses to their own taste
    const coat = n.id === 'tinker' ? [[176, 128, 84], [116, 156, 138], [150, 142, 132]] : look.colors;
    g.entities.add(makeEntity('npc', 'humanoid', {
      x: n.x, z: n.z, y: g.world.surface(n.x, n.z), yaw: Math.atan2(n.x - site.x, -(n.z - site.z)),
      radius: 0.45, height: 1.6, extra: look.extra, colors: pencils(coat),
      name: n.name, role: n.role,
    }));
  }
}
