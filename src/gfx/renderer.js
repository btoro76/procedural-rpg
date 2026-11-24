// Frame orchestration. The renderer owns the GL context, the render targets and
// the passes, and turns one "frame description" from the game into a picture:
//
//   world (raymarch, internal res)  what is where: pencil, lay, shade, pen marks
//   ink                            the contours
//   entities + effects (device res, own layer, already drawn)
//   final                          draws it all on the paper in pencil and pen
//
// It knows nothing about gameplay; the game knows nothing about GL.

import { RENDER } from '../config.js';
import { clamp } from '../core/math.js';
import { LEAF_PALETTE } from '../world/biomes.js';
import { createContext, Target } from './gl.js';
import './glsl/common.js';
import { WorldTextures } from './worldTextures.js';
import { WorldPass } from './passes/world.js';
import { EntityPass, ARCHETYPES } from './passes/entities.js';
import { FxPass } from './passes/fx.js';
import { PostChain } from './passes/post.js';
import { Minimap } from './passes/minimap.js';
import './archetypes/humanoid.js';
import './archetypes/critters.js';

export class Renderer {
  /** opts.lite: start on the lighter settings (phones and tablets). */
  constructor(canvas, world, opts = {}) {
    this.canvas = canvas;
    const { gl } = createContext(canvas);
    this.gl = gl;
    this.worldTex = new WorldTextures(gl, world);
    this.minimap = new Minimap(this.worldTex);
    this.worldPass = new WorldPass(gl);
    this.quality = opts.lite ? 'low' : 'high';
    this.worldPass.program(this.quality);
    this.toWarm = null;
    this.entityPass = new EntityPass(gl);
    this.fxPass = new FxPass(gl);
    this.post = new PostChain(gl);
    this.targets = {
      scene: new Target(gl, [{}, { filter: 'nearest', precise: true }, {}, { filter: 'nearest', precise: true }]),   // lay, gbuf, mark, sheet
      edge: new Target(gl, [{}]),
      ent: new Target(gl, [{}, { filter: 'nearest' }], true),
    };
    this.vao = gl.createVertexArray(); // attribute-less; full-screen passes use gl_VertexID
    this.leafPal = new Float32Array(LEAF_PALETTE.flat());
    this.pencil = new Float32Array(4);
    this.paperAnchor = new Float32Array(3);
    this.scale = opts.lite ? RENDER.SCALE_LITE : RENDER.SCALE_START;
    this.perf = { ema: 16.7, gpu: 0, timer: 0, calm: 0, futile: 0, lastDown: 0, hold: 0 };
    this.gpuTimer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.query = null;
    this.timing = false;
    this.size = { cssW: 1, cssH: 1, dpr: 1, width: 1, height: 1 };
    this.frameFn = (p) => this.applyFrame(p);
  }

  resize(cssW, cssH, dpr) {
    const s = this.size;
    s.cssW = cssW; s.cssH = cssH; s.dpr = dpr;
    s.width = Math.round(cssW * dpr); s.height = Math.round(cssH * dpr);
    if (this.canvas.width !== s.width || this.canvas.height !== s.height) {
      this.canvas.width = s.width; this.canvas.height = s.height;
    }
    const iw = Math.round(cssW * this.scale), ih = Math.round(cssH * this.scale);
    this.targets.scene.resize(iw, ih);
    this.targets.edge.resize(iw, ih);
    const edpr = Math.min(dpr, RENDER.ENTITY_DPR_MAX);
    this.targets.ent.resize(Math.round(cssW * edpr), Math.round(cssH * edpr));
  }

  /**
   * Nudges the world pass's resolution to hold the frame rate; the pencil
   * strokes are drawn afterwards at full resolution, so the change barely shows. Uses measured GPU time when the browser exposes it, so a
   * throttled or hidden tab (slow frames, idle GPU) never drags quality down.
   */
  adapt(dtMs) {
    const p = this.perf;
    if (dtMs > 100) return; // tab was hidden or a chunk hitch: not a GPU signal
    p.ema += (dtMs - p.ema) * 0.08;
    p.timer += dtMs;
    if (p.timer < 700) return;
    p.timer = 0;
    let next = this.scale;
    if (this.gpuTimer) {
      if (p.gpu > 19 && this.scale <= RENDER.SCALE_MIN + 0.001) this.quality = 'low';
      if (p.gpu > 13) next -= p.gpu > 20 ? 0.12 : 0.05;
      else if (p.gpu > 0 && p.gpu < 8.5) next += 0.05;
    } else if (p.ema > 21.5) {
      if (p.ema > 30 && this.scale <= RENDER.SCALE_MIN + 0.001) this.quality = 'low';
      // No GPU timer: fall back to frame intervals, but stop if lowering resolution
      // is not what speeds things up (a 30 Hz display, a throttled tab).
      if (p.lastDown && p.lastDown - p.ema < 1) { if (++p.futile >= 2) { next = RENDER.SCALE_START; p.hold = 30; } }
      else { p.futile = 0; next -= 0.06; }
      p.lastDown = p.ema;
    } else if (p.ema < 17.6 && ++p.calm >= 5) { next += 0.05; p.calm = 0; p.lastDown = 0; }
    if (p.hold > 0) { p.hold--; next = this.scale; }
    next = clamp(next, RENDER.SCALE_MIN, RENDER.SCALE_MAX);
    if (Math.abs(next - this.scale) > 0.001) {
      this.scale = next;
      this.resize(this.size.cssW, this.size.cssH, this.size.dpr);
    }
  }

  /** Compiles one not-yet-built program per call, so first sightings never hitch. True when done. */
  warm() {
    if (!this.toWarm) this.toWarm = [...ARCHETYPES.keys()];
    const id = this.toWarm.pop();
    if (id) this.entityPass.program(id);
    else this.fxPass.program();
    return !this.toWarm.length && !id;
  }

  /** Wraps a frame in a GPU timer query; results arrive a few frames later. */
  beginTiming() {
    const gl = this.gl, ext = this.gpuTimer;
    if (!ext) return;
    if (this.query) {
      if (!gl.getQueryParameter(this.query, gl.QUERY_RESULT_AVAILABLE)) return;
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
        const ms = gl.getQueryParameter(this.query, gl.QUERY_RESULT) / 1e6;
        this.perf.gpu += (ms - this.perf.gpu) * (this.perf.gpu ? 0.15 : 1);
      }
      gl.deleteQuery(this.query);
      this.query = null;
    }
    this.query = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, this.query);
    this.timing = true;
  }
  endTiming() {
    if (!this.timing) return;
    this.gl.endQuery(this.gpuTimer.TIME_ELAPSED_EXT);
    this.timing = false;
  }

  applyFrame(p) {
    const f = this.frame, c = f.camera, e = f.env;
    p.set('uCamPos', c.pos).set('uCamRight', c.right).set('uCamUp', c.up).set('uCamFwd', c.fwd).set('uTanFov', c.tan);
    p.set('uFocus', f.focus).set('uTime', f.time).set('uReveal', f.reveal);
    p.set('uSunDir', e.keyDir).set('uSunDisk', e.sunDir).set('uMoonDisk', e.moonDir);
    p.set('uNight', e.night).set('uGold', e.gold).set('uCloud', e.cloud).set('uWind', e.wind);
    p.set('uRockCol', e.rockCol).set('uLeafPal', this.leafPal);
    p.set('uLightPos', f.lightPos).set('uLightCol', f.lightCol).set('uLightCount', f.lightCount);
    p.set('uPencil', this.pencil).set('uPaperAnchor', this.paperAnchor);
  }

  /**
   * frame: { camera, env, focus[3], time, timeTwos, dpr, far, look{}, reveal, casters, casterCount,
   *          lightPos, lightCol, lightCount, batches: Map, fx: { data, count } }
   */
  render(frame) {
    const gl = this.gl, t = this.targets, s = this.size;
    this.frame = frame;
    frame.dpr = s.dpr;
    // the pencil: a pixel's world size per unit of depth, stroke pitch in pixels, boil seed, device pixel ratio
    this.pencil[0] = 2 * frame.camera.tan[1] / s.height;
    this.pencil[1] = 4.6 * s.dpr;
    this.pencil[2] = Math.floor(frame.time * 6);
    this.pencil[3] = s.dpr;
    // paper coordinates are measured from a point near the player, so the numbers stay small
    this.paperAnchor[0] = Math.floor(frame.focus[0] / 64) * 64;
    this.paperAnchor[2] = Math.floor(frame.focus[2] / 64) * 64;
    this.beginTiming();
    gl.bindVertexArray(this.vao);
    this.worldPass.render(t.scene, frame, this.worldTex, this.frameFn, this.quality);
    this.post.runInk(t, frame, this.frameFn);
    this.entityPass.render(t.ent, frame, frame.batches, this.frameFn);
    this.fxPass.render(t.ent, frame, frame.fx.data, frame.fx.count, t.scene.textures[1]);
    gl.bindVertexArray(this.vao);
    this.post.runFinal(t, frame, s.width, s.height, this.minimap, this.frameFn);
    this.endTiming();
  }
}
