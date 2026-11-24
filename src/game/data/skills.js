// Skills: data plus one `cast` function each. `cast(game, player, aim)` runs
// when the skill fires; aim = { x, z, dirX, dirZ, target }. The skills system
// handles cooldowns, focus and the hotbar, so adding a skill is adding a row.

import { FX_COLORS } from '../fx.js';
import { yawFromDir } from '../entities.js';
import { rank } from './talents.js';

export const SKILLS = [
  {
    id: 'cleave', name: 'Cleave', key: '1', unlock: 1, cooldown: 4, focus: 8, icon: 'cleave',
    desc: 'A wide cut that hits everything in front of you.',
    cast(g, p, aim) {
      p.yaw = yawFromDir(aim.dirX, aim.dirZ);
      p.action = 1; p.actionT = 0; p.actionDur = 0.46; p.attackCd = 0.5;
      const reach = 1 + 0.2 * rank(p.sheet, 'wide'), force = 1.7 * (1 + 0.25 * rank(p.sheet, 'rend'));
      p.pending = () => {
        g.bus.emit('swing', { entity: p, radius: 3.0 * reach, color: FX_COLORS.GOLD, heavy: true });
        g.camera.shake = Math.min(1, g.camera.shake + 0.35);
        for (const m of g.monsters) {
          if (m.dead) continue;
          const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz);
          if (d > 2.9 * reach + m.radius) continue;
          if (d > 0.6 && (dx * aim.dirX + dz * aim.dirZ) / d < -0.25) continue; // behind you
          g.combat.strike(m, force);
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
      // one mote, or two a little apart
      for (const turn of rank(p.sheet, 'twin') ? [-0.13, 0.13] : [0]) {
        const dx = aim.dirX * Math.cos(turn) - aim.dirZ * Math.sin(turn), dz = aim.dirZ * Math.cos(turn) + aim.dirX * Math.sin(turn);
        g.skills.launch({
          x: p.x + dx * 0.6, y: p.y + 0.95, z: p.z + dz * 0.6,
          vx: dx * 17, vz: dz * 17, life: 0.85, radius: 0.5,
          color: FX_COLORS.FLAME,
          onHit: (m) => g.combat.strike(m, 0.9 * p.power, 8 * p.power),
          splash: 1.6, splashMult: 0.5,
        });
      }
    },
  },
  {
    id: 'mend', name: 'Mend', key: '3', unlock: 4, cooldown: 14, focus: 16, icon: 'mend',
    desc: 'Knit your wounds: restores a third of your health over a few moments.',
    cast(g, p) {
      p.action = 2; p.actionT = 0; p.actionDur = 0.5;
      p.mend = { left: 3, rate: p.maxHp * 0.34 * p.power * (1 + 0.33 * rank(p.sheet, 'roots')) / 3 };
      g.bus.emit('heal', { entity: p });
    },
  },
  {
    id: 'step', name: 'Gale Step', key: '4', unlock: 2, cooldown: 6, focus: 8, icon: 'step',
    desc: 'Dash a short way, untouchable while you move: the way through a charge or out of a slam.',
    cast(g, p, aim) {
      p.yaw = yawFromDir(aim.dirX, aim.dirZ);
      const far = 1 + 0.25 * rank(p.sheet, 'stride');
      p.dash = { x: aim.dirX, z: aim.dirZ, speed: 26, t: 0.22 * far };
      p.action = 4; p.actionT = 0; p.actionDur = 0.24 * far;     // the lunge pose
      if (rank(p.sheet, 'gust')) {
        // whatever stands in the way of the step is cut as it passes
        const len = 26 * 0.22 * far;
        for (const m of g.monsters) {
          if (m.dead) continue;
          const mx = m.x - p.x, mz = m.z - p.z, along = mx * aim.dirX + mz * aim.dirZ;
          if (along > -0.5 && along < len + 0.8 && Math.abs(mx * aim.dirZ - mz * aim.dirX) < 1.3 + m.radius) g.combat.strike(m, 1.2);
        }
      }
      p.invuln = Math.max(p.invuln, 0.35);
      p.moveTo = null;
      g.bus.emit('dash', { x: p.x, y: p.y, z: p.z });
    },
  },
];
