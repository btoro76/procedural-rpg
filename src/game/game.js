// The game: owns the world, the entities and the ordered list of systems, and
// runs the frame. Systems talk through `game.bus` events and shared state on
// `game`; none of them imports another. To add a feature, write a system with
// an update(dt) and add it to the list below.

import { GAME } from '../config.js';
import { DEVICE } from '../core/device.js';
import { damp } from '../core/math.js';
import { EventBus } from '../core/events.js';
import { Input } from '../core/input.js';
import { World } from '../world/world.js';
import { Renderer } from '../gfx/renderer.js';
import { Camera } from '../gfx/camera.js';
import { Entities, makeEntity, pencils } from './entities.js';
import { createEnv, updateEnv } from './environment.js';
import { derive, newPlayerSheet } from './stats.js';
import { Fx } from './fx.js';
import { View } from './view.js';
import { Controls } from './systems/controls.js';
import { PlayerSystem } from './systems/player.js';
import { MonsterAI } from './systems/ai.js';
import { Combat } from './systems/combat.js';
import { Skills } from './systems/skills.js';
import { Spawner } from './systems/spawner.js';
import { Loot } from './systems/loot.js';
import { Bounties } from './systems/bounties.js';
import { Tutorial } from './systems/tutorial.js';
import { Hazards } from './systems/hazards.js';
import { Discover } from './systems/discover.js';
import { Stakes } from './systems/stakes.js';
import { loadSave, writeSave } from './save.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.touch = DEVICE.touch;      // fingers are the way in: the interface lays itself out for thumbs
    this.bus = new EventBus();
    this.input = new Input(canvas);
    const save = loadSave();
    this.seed = save?.seed ?? GAME.SEED;
    this.world = new World(this.seed);
    this.renderer = new Renderer(canvas, this.world, { lite: DEVICE.touch });
    this.camera = new Camera();
    this.env = createEnv();
    this.hour = save?.hour ?? GAME.START_HOUR;
    this.savedView = Array.isArray(save?.view) ? save.view : null;      // the view the journey was last seen from
    this.entities = new Entities();
    this.monsters = [];
    this.look = { hurt: 0, fade: 0, fadeGoal: 1 };   // fade: how far the page has been drawn in
    this.paused = true;      // until the title screen is dismissed
    this.time = 0;
    this.saveTimer = 8;

    const sheet = save?.sheet ?? newPlayerSheet();
    const px = save?.x ?? 3.5, pz = save?.z ?? 6.5;
    this.player = this.entities.add(makeEntity('player', 'humanoid', {
      x: px, z: pz, y: this.world.surface(px, pz), yaw: 2.6, radius: 0.36, height: 1.6, ghost: true,
      colors: pencils([[214, 70, 52], [84, 108, 156], [122, 62, 44]]),   // vermilion tunic, slate scarf, umber hair
      name: 'Wayfarer', sheet,
      intent: { moveX: 0, moveZ: 0 }, target: null, pursue: false, moveTo: null,
      attackCd: 0, calm: 10, invuln: 0, potionCd: 0, pending: null, dash: null, mend: null, safe: true,
    }));
    derive(this.player);
    this.player.hp = Math.min(this.player.maxHp, save?.hp ?? 1e9);
    this.player.focus = Math.min(this.player.maxFocus, save?.focus ?? 1e9);
    this.biome = this.world.biome(px, pz);

    this.fx = new Fx(this);
    this.combat = new Combat(this);
    this.loot = new Loot(this);
    this.skills = new Skills(this);
    this.bounties = new Bounties(this);
    this.controls = new Controls(this);
    this.spawner = new Spawner(this);
    this.view = new View(this);
    // order matters: intent -> bodies -> consequences -> population
    this.tutorial = new Tutorial(this);
    this.hazards = new Hazards(this);
    this.discover = new Discover(this);
    this.stakes = new Stakes(this);
    this.systems = [this.controls, new PlayerSystem(this), new MonsterAI(this), this.hazards, this.skills, this.loot, this.spawner, this.discover, this.bounties, this.stakes, this.tutorial, this.fx];
    this.bounties.refresh();

    this.camera.target = [px, this.player.y + 1, pz];
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('beforeunload', () => this.save());
    // fill the whole window of world data before the first frame
    while (this.renderer.worldTex.update(px, pz, 16) > 0);
  }

  /** The picture is whatever box the page gives the canvas: the whole window, or the top of a phone held upright. */
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.renderer.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)), Math.min(devicePixelRatio || 1, 2));
  }

  start() {
    let last = performance.now();
    const tick = (now) => {
      requestAnimationFrame(tick);
      const ms = now - last;
      last = now;
      this.frame(Math.min(ms / 1000, 0.05), ms);
    };
    requestAnimationFrame(tick);
  }

  frame(dt, ms) {
    const p = this.player, w = this.world;
    this.time += dt;
    if (!this.paused) this.hour = (this.hour + dt * 24 / GAME.DAY_SECONDS) % 24;
    for (const s of this.systems) s.update(dt);
    this.entities.sweep();
    this.bus.emit('frame', dt);

    this.biome = w.biome(p.x, p.z);
    updateEnv(this.env, this.hour, this.biome.rock);
    // the weather drifts: skies clear and cloud over by the hour and the country
    this.env.cloud = 0.36 + 0.24 * Math.sin(this.time / 83 + p.x * 0.002) * Math.cos(this.time / 131 + p.z * 0.0017);
    this.look.hurt = Math.max(0, this.look.hurt - dt * 2.2);
    this.look.fade = damp(this.look.fade, this.look.fadeGoal, 3, dt);

    this.renderer.worldTex.update(p.x, p.z, 2);
    w.prune(p.x, p.z);
    this.camera.still = this.reducedMotion;      // no screen shake for those who ask for less motion
    this.camera.update(dt, [p.x, p.y + 1.0, p.z], this.renderer.size.cssW / this.renderer.size.cssH, (x, z) => w.surface(x, z));
    if (!this.warmed) this.warmed = this.renderer.warm();
    this.renderer.adapt(ms);
    this.renderer.render(this.view.build(this.time));
    this.input.endFrame();

    this.saveTimer -= dt;
    if (this.saveTimer <= 0) { this.saveTimer = 8; this.save(); }
  }

  save() {
    const p = this.player;
    if (this.paused && !this.started) return;
    const c = this.camera.goal;
    writeSave({ seed: this.seed, hour: this.hour, x: p.x, z: p.z, hp: p.hp, focus: p.focus, sheet: p.sheet, view: [c.pitch, c.distance] });
  }

  /** Called by the title screen. */
  begin() {
    this.started = true;
    this.paused = false;
    this.bus.emit('begin');
  }
}
