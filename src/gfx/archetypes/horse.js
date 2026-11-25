import { registerArchetype } from '../passes/entities.js';
import { glsl } from '../shaderlib.js';

// The hero's horse. Drawn under the rider at the same place and yaw.
// Colours: eColA coat, eColB saddle blanket, eColC mane, tail and hooves.
registerArchetype({
  id: 'horse', boundY: 0.78, boundR: 1.3, steps: 64,
  glsl: glsl`
float rBob, rNod, rSway;
const vec3 BARREL_C = vec3(0.0, 0.86, -0.02);
const vec3 BARREL_R = vec3(0.235, 0.25, 0.56);
const vec3 NECK_A = vec3(0.0, 0.98, 0.4);

void entPose() {
  float mv = ePose.w, w = ePose.x;
  rBob = abs(sin(w)) * 0.05 * mv + 0.008 * sin(uTime * 1.8 + eLook.x * 6.0);
  rNod = 0.06 * sin(uTime * 0.9 + eLook.x * 5.0) * (1.0 - mv) + 0.07 * sin(w * 2.0) * mv - 0.08 * mv;
  rSway = sin(uTime * 2.3 + eLook.x * 7.0) * 0.06 * (1.0 - mv) + sin(w) * 0.04 * mv;
}

vec3 hoofAt(float sx, float sz) {
  float w = ePose.x, mv = ePose.w;
  float ph = sin(w) * sx * sz;
  float lift = max(cos(w) * sx * sz, 0.0) * mv;
  return vec3(0.13 * sx, 0.06 + lift * 0.17, 0.4 * sz + ph * 0.27 * mv);
}

float legOf(vec3 p, float sx, float sz, out float hoof) {
  vec3 ft = hoofAt(sx, sz);
  float lift = ft.y - 0.06;
  vec3 hip = vec3(0.13 * sx, 0.7 + rBob, 0.4 * sz);
  vec3 knee = mix(hip, ft, 0.5) + vec3(0.0, lift * 0.25, (sz > 0.0 ? 0.04 : -0.05) + lift * (sz > 0.0 ? 0.35 : -0.25));
  float upper = sdTaper(p, hip, knee, sz > 0.0 ? 0.085 : 0.1, 0.05);
  float lower = sdTaper(p, knee, ft + vec3(0.0, 0.05, 0.0), 0.042, 0.036);
  hoof = sdTaper(p, ft + vec3(0.0, -0.045, 0.01), ft + vec3(0.0, 0.035, 0.0), 0.058, 0.046);
  return smin(upper, lower, 0.035);
}

vec3 headSpace(vec3 p) {
  vec3 q = p - NECK_A;
  q.zy = rot2(rNod) * q.zy;
  return q + NECK_A;
}

float entMap(vec3 p, out float mat) {
  float sx = p.x < 0.0 ? -1.0 : 1.0, sz = p.z < 0.0 ? -1.0 : 1.0;
  float hoof;
  float legs = legOf(p, sx, sz, hoof);

  vec3 b = p; b.y -= rBob;
  float body = sdEllipsoid(b - BARREL_C, BARREL_R);
  body = smin(body, length(b - vec3(0.0, 0.86, 0.34)) - 0.235, 0.12);
  body = smin(body, length((b - vec3(0.0, 0.9, -0.36)) / vec3(1.05, 1.0, 1.0)) - 0.25, 0.12);
  float d = smin(body, legs, 0.06);

  vec3 h = headSpace(b);
  float neck = sdTaper(h, NECK_A, vec3(0.0, 1.33, 0.66), 0.16, 0.095);
  float head = sdTaper(h, vec3(0.0, 1.37, 0.68), vec3(0.0, 1.16, 0.95), 0.112, 0.078);
  head = smin(head, length(h - vec3(0.0, 1.37, 0.66)) - 0.11, 0.05);
  d = smin(d, smin(neck, head, 0.07), 0.08);
  vec3 ea = vec3(abs(h.x), h.y, h.z);
  float ears = sdTaper(ea, vec3(0.055, 1.44, 0.63), vec3(0.075, 1.56, 0.6), 0.036, 0.01);
  d = min(d, ears);
  mat = 0.0;

  float wave = 0.012 * sin(h.y * 40.0 + eLook.x * 6.0);
  float mane = sdTaper(h, vec3(0.0, 1.05, 0.31), vec3(0.0, 1.43, 0.6), 0.058, 0.05) - wave;
  float forelock = sdTaper(h, vec3(0.0, 1.47, 0.64), vec3(0.0, 1.38, 0.76), 0.04, 0.02);
  mane = min(mane, forelock);
  vec3 tb = b - vec3(0.0, 1.0, -0.6);
  float tail = sdTaper(b, vec3(0.0, 1.0, -0.6), vec3(rSway, 0.48, -0.8 - 0.05 * ePose.w), 0.05, 0.085) - 0.01 * sin(tb.y * 30.0);
  float hair = min(mane, tail);
  if (hair < d) { d = hair; mat = 1.0; }
  if (hoof < d) { d = hoof; mat = 2.0; }

  float blanket = max(sdEllipsoid(b - BARREL_C, BARREL_R + vec3(0.022)), max(0.95 - b.y, abs(b.z + 0.03) - 0.24));
  if (blanket < d) { d = blanket; mat = 3.0; }
  float pommel = length((b - vec3(0.0, 1.13, 0.15)) / vec3(1.2, 0.9, 0.8)) - 0.055;
  float cantle = sdTaper(b, vec3(-0.11, 1.12, -0.18), vec3(0.11, 1.12, -0.18), 0.04, 0.04);
  float seat = min(pommel, cantle);
  if (seat < d) { d = seat; mat = 4.0; }
  return d * 0.9;
}

void entSurf(vec3 p, float mat, inout Surf s) {
  int m = int(mat + 0.5);
  vec3 b = p; b.y -= rBob;
  if (m == 1) {
    s.albedo = eColC; s.cover = 0.92;
    s.ink = smoothstep(0.12, 0.0, abs(fract(vnoise(vec2(p.y * 9.0, p.z * 9.0 + p.x * 20.0)) * 3.0) - 0.5)) * 0.55;
    return;
  }
  if (m == 2) { s.albedo = INK_DARK; s.cover = 0.92; return; }
  if (m == 3) {
    s.albedo = eColB; s.cover = 0.88;
    float edge = 0.97 - b.y;
    s.ink = max(penLine(edge + 0.012) * 0.85, penLine(abs(b.z + 0.03) - 0.215) * 0.6);
    if (edge > -0.035) { s.albedo = P_CREAM; s.cover = 0.3; }
    return;
  }
  if (m == 4) { s.albedo = P_UMBER; s.cover = 0.9; return; }

  s.albedo = eColA; s.wrap = 0.3;
  float belly = smoothstep(0.7, 0.6, b.y) * step(abs(b.z), 0.5);
  float lowLeg = smoothstep(0.32, 0.22, p.y);
  s.cover = mix(0.84, 0.55, belly);
  if (lowLeg > 0.5) { s.albedo = mix(eColA, eColC, 0.6); s.cover = 0.9; }
  s.ink = step(0.8, vnoise(p.xz * 22.0 + p.y * 14.0)) * 0.35 * (1.0 - belly);

  vec3 h = headSpace(b);
  if (h.y > 1.12 && h.z > 0.6) {
    vec3 e = vec3(abs(h.x) - 0.085, h.y - 1.38, h.z - 0.75);
    float eye = smoothstep(0.03, 0.022, length(e.yz));
    float glint = smoothstep(0.012, 0.006, length(e.yz - vec2(0.01, -0.006)));
    vec2 n = vec2(abs(h.x) - 0.045, h.z - 0.95);
    float nostril = smoothstep(0.025, 0.016, length(vec2(n.x, h.y - 1.17))) * step(0.9, h.z);
    float muzzle = smoothstep(0.88, 0.92, h.z + (1.3 - h.y) * 0.3);
    if (muzzle > 0.5) { s.albedo = mix(eColA, eColC, 0.5); s.cover = 0.75; }
    float blaze = smoothstep(0.035, 0.02, abs(h.x)) * step(0.0, h.z - 0.72) * step(h.y, 1.42) * step(0.5, fract(eLook.x * 7.0));
    if (blaze > 0.5) { s.albedo = P_CREAM; s.cover = 0.15; }
    float strap = penLine(h.z - 0.86 + (h.y - 1.25) * 0.4) * step(1.18, h.y) * step(h.y, 1.36);
    s.ink = max(s.ink, strap * 0.9);
    if (max(eye * step(0.06, abs(h.x)), nostril) > 0.5) { s.albedo = INK_BLACK; s.cover = 1.0 - glint * eye; s.solid = 1.0; s.ink = 0.0; }
  }
}
`,
});
