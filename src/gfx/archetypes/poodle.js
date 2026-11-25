import { registerArchetype } from '../passes/entities.js';
import { glsl } from '../shaderlib.js';

// Marley: a tall brown standard poodle.
// eExtra bits: 1 tail down (hurt, out of the fight), 2 limping, 4 pointing.
// Actions: 1 bite (head lunges), 2 bark (head up).
// Colours: eColA coat, eColB deeper coat shadow, eColC nose, eyes and nails.
registerArchetype({
  id: 'poodle', boundY: 0.62, boundR: 0.85, steps: 56,
  glsl: glsl`
float dBob, dHeadZ, dHeadY, dTail, dLimp;
bool dBit(float b) { return mod(floor(eExtra / b + 0.01), 2.0) > 0.5; }

void entPose() {
  float mv = ePose.w, w = ePose.x;
  bool down = dBit(1.0);
  dLimp = dBit(2.0) ? 1.0 : 0.0;
  dBob = abs(sin(w)) * 0.035 * mv + 0.006 * sin(uTime * 2.2 + eLook.x * 5.0) - (down ? 0.05 : 0.0);
  dHeadZ = 0.0; dHeadY = down ? -0.12 : 0.0;
  dTail = down ? -1.0 : 0.25 * sin(uTime * (mv > 0.3 ? 9.0 : 4.5) + eLook.x * 3.0);
}

vec3 dFoot(float sx, float sz) {
  float w = ePose.x, mv = ePose.w;
  float ph = sin(w) * sx * sz;
  float lift = max(cos(w) * sx * sz, 0.0) * mv;
  if (sx > 0.0 && sz > 0.0) lift *= 1.0 + dLimp * 1.4;
  if (dBit(4.0) && sx < 0.0 && sz > 0.0) return vec3(-0.07, 0.3, 0.27);
  return vec3(0.075 * sx, 0.035 + lift * 0.1, 0.19 * sz + ph * 0.14 * mv);
}

float dLeg(vec3 p, float sx, float sz, out float pom) {
  vec3 ft = dFoot(sx, sz);
  vec3 hip = vec3(0.075 * sx, 0.56 + dBob, 0.2 * sz);
  vec3 knee = mix(hip, ft, 0.5) + vec3(0.0, 0.0, sz > 0.0 ? 0.015 : -0.05);
  if (dBit(4.0) && sx < 0.0 && sz > 0.0) knee = hip + vec3(0.0, -0.12, 0.1);
  float leg = smin(sdTaper(p, hip, knee, sz > 0.0 ? 0.06 : 0.075, 0.042), sdTaper(p, knee, ft, 0.04, 0.032), 0.03);
  pom = length((p - ft - vec3(0.0, 0.05, 0.0)) / vec3(1.0, 1.15, 1.0)) - 0.062;
  return leg;
}

float curls(vec3 p) { return 0.012 * sin(p.x * 70.0) * sin(p.y * 64.0) * sin(p.z * 68.0); }

float entMap(vec3 p, out float mat) {
  float act = floor(ePose.y + 0.5), at = clamp(ePose.z, 0.0, 1.0);
  float sx = p.x < 0.0 ? -1.0 : 1.0, sz = p.z < 0.0 ? -1.0 : 1.0;
  float pom;
  float legs = dLeg(p, sx, sz, pom);

  vec3 b = p; b.y -= dBob;
  float body = sdEllipsoid(b - vec3(0.0, 0.62, -0.01), vec3(0.12, 0.14, 0.27));
  body = smin(body, length(b - vec3(0.0, 0.63, 0.15)) - 0.14, 0.08);
  float d = smin(body, legs, 0.04);

  vec3 h = b;
  h.y -= dHeadY;
  float lunge = act > 0.5 && act < 1.5 ? sin(at * 3.14159) * 0.08 : 0.0;
  float lift = act > 1.5 && act < 2.5 ? sin(at * 3.14159) * 0.06 : 0.0;
  h.z -= lunge; h.y -= lift;
  float neck = sdTaper(b, vec3(0.0, 0.7, 0.2), vec3(0.0, 0.92 + dHeadY + lift, 0.31 + lunge), 0.08, 0.065);
  float skull = sdEllipsoid(h - vec3(0.0, 0.98, 0.35), vec3(0.075, 0.08, 0.09));
  float muzzle = sdTaper(h, vec3(0.0, 0.97, 0.4), vec3(0.0, 0.94, 0.53), 0.045, 0.032);
  float head = smin(skull, muzzle, 0.03);
  d = smin(d, smin(neck, head, 0.04), 0.05);
  mat = 0.0;

  float topknot = length((h - vec3(0.0, 1.07, 0.33)) / vec3(1.0, 0.9, 1.0)) - 0.085 + curls(h);
  vec3 ea = vec3(abs(h.x), h.y, h.z);
  float ears = sdTaper(ea, vec3(0.075, 1.0, 0.33), vec3(0.09, 0.83, 0.34), 0.04, 0.058) + curls(h);
  float tailBase = sdTaper(b, vec3(0.0, 0.7, -0.24), mix(vec3(0.0, 0.92, -0.3), vec3(0.0, 0.5, -0.32), max(-dTail, 0.0)) + vec3(dTail * 0.08 * step(0.0, dTail), 0.0, 0.0), 0.03, 0.025);
  vec3 tipC = mix(vec3(dTail * 0.08, 0.96, -0.31), vec3(0.0, 0.45, -0.33), max(-dTail, 0.0));
  float tailPom = length(b - tipC) - 0.06 + curls(b);
  float fluff = min(min(topknot, ears), min(min(tailBase, tailPom), pom + curls(p)));
  if (fluff < d) { d = fluff; mat = 1.0; }
  float hips = length((b - vec3(0.0, 0.64, -0.17)) / vec3(1.0, 1.0, 0.9)) - 0.13 + curls(b);
  float chestFluff = length(b - vec3(0.0, 0.66, 0.18)) - 0.15 + curls(b);
  float coat = min(hips, chestFluff);
  d = smin(d, coat, 0.03);
  return d * 0.85;
}

void entSurf(vec3 p, float mat, inout Surf s) {
  vec3 b = p; b.y -= dBob;
  vec3 h = b; h.y -= dHeadY;
  s.albedo = eColA; s.wrap = 0.35;
  float curl = vnoise(p.xz * 34.0 + p.y * 28.0);
  s.cover = mat > 0.5 ? 0.92 : 0.86;
  s.ink = step(0.72, curl) * 0.45;
  if (curl < 0.3) s.albedo = eColB;
  // Eyes and nose.
  vec3 e = vec3(abs(h.x) - 0.05, h.y - 1.0, h.z - 0.42);
  float eye = smoothstep(0.02, 0.013, length(e));
  float nose = smoothstep(0.03, 0.02, length(h - vec3(0.0, 0.95, 0.55)));
  if (max(eye, nose) > 0.5) { s.albedo = eColC; s.cover = 1.0; s.solid = 1.0; s.ink = 0.0; }
}
`,
});
