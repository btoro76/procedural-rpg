// Character maths in one place: what the four attributes do, how much
// experience a level costs, how monsters scale. Balance changes happen here.

import { ITEMS } from './data/items.js';

export const ATTRIBUTES = [
  { id: 'might', name: 'Might', hint: 'Hits harder.' },
  { id: 'grace', name: 'Grace', hint: 'Faster swings, more critical hits and dodges.' },
  { id: 'vigor', name: 'Vigor', hint: 'More health, quicker recovery, tougher skin.' },
  { id: 'mind', name: 'Mind', hint: 'More focus and stronger skills.' },
];

export const xpToNext = (level) => Math.round(36 * Math.pow(level, 1.55));
export const POINTS_PER_LEVEL = 3;

export function newPlayerSheet() {
  return {
    level: 1, xp: 0, points: 0, glint: 20,
    base: { might: 5, grace: 5, vigor: 5, mind: 5 },
    charms: [],           // equipped charm item ids (max 2)
    bag: [{ id: 'tonic', n: 3 }, { id: 'draught', n: 1 }],
    waystone: { x: 0, z: 0, name: 'Hearthmere' },
    bounty: null, bountiesDone: 0,
  };
}

/** Recomputes everything derived from level, attributes and charms onto the player entity. */
export function derive(player) {
  const s = player.sheet;
  const a = { ...s.base };
  for (const id of s.charms) for (const k in ITEMS[id].stats) a[k] += ITEMS[id].stats[k];
  player.attr = a;
  player.level = s.level;
  player.maxHp = Math.round(70 + a.vigor * 11 + s.level * 9);
  player.maxFocus = Math.round(30 + a.mind * 6 + s.level * 2);
  player.attack = 7 + a.might * 1.7 + s.level * 1.3;
  player.attackSpeed = Math.min(2.3, 1.2 + a.grace * 0.022);
  player.crit = Math.min(0.5, 0.04 + a.grace * 0.006);
  player.dodge = Math.min(0.3, a.grace * 0.005);
  player.defense = a.vigor * 0.5 + s.level * 0.4;
  player.power = 1 + a.mind * 0.045;
  player.hpRegen = 0.5 + a.vigor * 0.09;
  player.focusRegen = 1.6 + a.mind * 0.13;
  player.hp = Math.min(player.hp, player.maxHp);
  player.focus = Math.min(player.focus ?? 0, player.maxFocus);
}

/** How strong the wilds are at a distance from the starting town. */
export const levelAt = (dist) => 1 + Math.floor(Math.max(0, dist - 60) / 95);

export function scaleMonster(def, level, elite) {
  const k = level - 1;
  return {
    maxHp: Math.round(def.hp * (1 + 0.3 * k) * (elite ? 3 : 1)),
    atk: def.atk * (1 + 0.2 * k) * (elite ? 1.5 : 1),
    xp: Math.round(def.xp * (1 + 0.38 * k) * (elite ? 4 : 1)),
  };
}

/** Less experience from prey far below your level. */
export const xpFactor = (playerLevel, monsterLevel) => Math.max(0.1, Math.min(1.2, 1 - (playerLevel - monsterLevel - 2) * 0.2));
