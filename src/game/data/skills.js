// Skills: data plus one `cast` function each. `cast(game, player, aim)` runs
// when the skill fires; aim = { x, z, dirX, dirZ, target }. The skills system
// handles cooldowns, focus and the hotbar, so adding a skill is adding a row.

import { FX_COLORS } from '../fx.js';
import { yawFromDir } from '../entities.js';

export const SKILLS = [
  {
    id: 'cleave', name: 'Cleave', key: '1', unlock: 1, cooldown: 4, focus: 8, icon: 'cleave',
    desc: 'A wide cut that hits everything in front of you.',
    cast(g, p, aim) {
      p.yaw = yawFromDir(aim.dirX, aim.dirZ);
      p.action = 1; p.actionT = 0; p.actionDur = 0.46; p.attackCd = 0.5;
      p.pending = () => {
        g.bus.emit('swing', { entity: p, radius: 3.0, color: FX_COLORS.GOLD, heavy: true });
        g.camera.shake = Math.min(1, g.camera.shake + 0.35);
        for (const m of g.monsters) {
          if (m.dead) continue;
          const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz);
          if (d > 2.9 + m.radius) continue;
          if (d > 0.6 && (dx * aim.dirX + dz * aim.dirZ) / d < -0.25) continue; // behind you
          g.combat.strike(m, 1.7);
        }
      };
    },
  },
  {
    id: 'bolt', name: 'Ember Bolt', key: '2', unlock: 1, cooldown: 2.6, focus: 10, icon: 'bolt',
    desc: 'Hurl a mote of fire that bursts on the first thing it meets.',
    cast(g, p, aim) {
      p.yaw = yawFromDir(aim.dirX, aim.dirZ);
      p.action = 2; p.actionT = 0; p.actionDur = 0.36;
      g.skills.launch({
        x: p.x + aim.dirX * 0.6, y: p.y + 0.95, z: p.z + aim.dirZ * 0.6,
        vx: aim.dirX * 17, vz: aim.dirZ * 17, life: 0.85, radius: 0.5,
        color: FX_COLORS.FLAME,
        onHit: (m) => g.combat.strike(m, 0.9 * p.power, 8 * p.power),
        splash: 1.6, splashMult: 0.5,
      });
    },
  },
  {
    id: 'mend', name: 'Mend', key: '3', unlock: 3, cooldown: 14, focus: 16, icon: 'mend',
    desc: 'Knit your wounds: restores a third of your health over a few moments.',
    cast(g, p) {
      p.action = 2; p.actionT = 0; p.actionDur = 0.5;
      p.mend = { left: 3, rate: p.maxHp * 0.34 * p.power / 3 };
      g.bus.emit('heal', { entity: p });
    },
  },
  {
    id: 'step', name: 'Gale Step', key: '4', unlock: 5, cooldown: 6, focus: 8, icon: 'step',
    desc: 'Dash a short way, untouchable while you move.',
    cast(g, p, aim) {
      p.yaw = yawFromDir(aim.dirX, aim.dirZ);
      p.dash = { x: aim.dirX, z: aim.dirZ, speed: 26, t: 0.22 };
      p.invuln = Math.max(p.invuln, 0.35);
      p.moveTo = null;
      g.bus.emit('dash', { x: p.x, y: p.y, z: p.z });
    },
  },
];
