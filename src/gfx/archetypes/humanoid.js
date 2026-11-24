// Chibi humanoid: the player and townsfolk. Variant (eExtra) picks the kit:
//   0 wayfarer (sword + scarf)   1 merchant (broad hat + apron)   2 warden (hood + staff)
// Pencils: A tunic, B accent (scarf / hat / hood), C hair.

import { registerArchetype } from '../passes/entities.js';

registerArchetype({
  id: 'humanoid', boundY: 0.8, boundR: 1.08, steps: 60,
  glsl: /* glsl */ `
vec3 hHip, hChest, hHead, hHandL, hHandR, hFootL, hFootR, hBlade;

void entPose() {
  float w = ePose.x, act = ePose.y, at = ePose.z, mv = ePose.w;
  float s = sin(w), c = cos(w);
  float idle = sin(uTime * 2.0 + eLook.x * 6.28);
  // Walk and run are two different cycles. A walk rises as the legs pass under the
  // body. A run sinks onto the planted foot and is thrown clear of the ground with
  // the feet wide apart, leans into it, lifts the knees and pumps the arms. The
  // stride (see systems/player.js) is long enough that twelve drawings a second
  // show every stage of it.
  float run = smoothstep(0.8, 1.0, mv);
  float apart = s * s;                                       // 1 with the feet wide, 0 as they pass
  float bob = mix(abs(c) * 0.05, apart * 0.15 - 0.04, run) * mv + 0.01 * idle * (1.0 - mv);
  float lean = mv * mix(0.05, 0.14, run);
  hHip = vec3(0.0, 0.47 + bob, 0.0);
  hChest = hHip + vec3(0.0, 0.27 - 0.015 * run, lean);
  hHead = hChest + vec3(0.0, 0.43 - 0.01 * run, lean * 0.6 - 0.02 * run * apart);
  // a foot swings forward lifted and comes back planted; in a run the lift starts
  // early (the heel kicks up behind) and both feet leave the ground at full stretch
  float reach = 0.4 * mv;
  float lift = mix(0.1, 0.25, run) * min(1.0, mv * 1.5);
  float air = run * mv * apart * 0.11;
  float early = 0.6 * run;
  hFootL = vec3(-0.12, 0.07 + max(cos(w - early), 0.0) * lift + air, s * reach - 0.05 * run);
  hFootR = vec3(0.12, 0.07 + max(-cos(w - early), 0.0) * lift + air, -s * reach - 0.05 * run);
  // arms swing against the legs, hands rising as they come forward; the sword arm swings shorter
  float pump = mix(0.2, 0.32, run) * mv;
  float rise = 0.09 * run * mv;
  hHandL = hChest + vec3(-0.3 + 0.04 * run, -0.24 + 0.01 * idle + rise * max(-s, 0.0), -s * pump + 0.02);
  hHandR = hChest + vec3(0.3 - 0.03 * run, -0.24 + 0.01 * idle + rise * max(s, 0.0), s * pump * 0.7 + 0.02);
  hBlade = normalize(vec3(0.25, 0.85 - 0.2 * run, 0.45 - 0.5 * run));
  if (act > 0.5 && act < 1.5) {
    // swing: wind up over the right shoulder, cut across the front, recover
    float wind = smoothstep(0.0, 0.22, at), cut = smoothstep(0.22, 0.5, at), rec = smoothstep(0.62, 1.0, at);
    float ang = mix(mix(0.4, 2.2, wind), -1.1, cut);
    float lift = wind * (1.0 - cut);
    vec3 strike = hChest + vec3(sin(ang) * 0.46, 0.12 + 0.28 * lift, cos(ang) * 0.46);
    hBlade = normalize(mix(normalize(vec3(sin(ang), 0.25 + 0.6 * lift, cos(ang))), hBlade, rec));
    hHandR = mix(strike, hHandR, rec);
    hChest.x += 0.04 * (cut - rec);
    hHead.z += 0.04 * cut * (1.0 - rec);
  } else if (act > 1.5 && act < 2.5) {
    float k = sin(saturate(at) * PI);
    hHandL = mix(hHandL, hChest + vec3(-0.16, 0.12, 0.38), k);
    hHandR = mix(hHandR, hChest + vec3(0.16, 0.12, 0.38), k);
    hBlade = normalize(mix(hBlade, vec3(0.0, 0.5, 0.86), k));
  } else if (act > 2.5 && act < 3.5) {
    float k = 1.0 - at;
    hChest.z -= 0.08 * k; hHead.z -= 0.14 * k;
    hHandL.y += 0.1 * k; hHandR.y += 0.1 * k;
  } else if (act > 3.5 && act < 4.5) {
    // a dash is one held drawing: a long low lunge, arms and blade trailing
    hHip = vec3(0.0, 0.4, 0.0);
    hChest = hHip + vec3(0.0, 0.24, 0.17);
    hHead = hChest + vec3(0.0, 0.4, 0.13);
    hFootL = vec3(-0.11, 0.09, 0.46);
    hFootR = vec3(0.11, 0.24, -0.5);
    hHandL = hChest + vec3(-0.27, -0.08, -0.34);
    hHandR = hChest + vec3(0.3, -0.14, -0.3);
    hBlade = normalize(vec3(0.2, 0.22, -0.95));
  }
}

float entMap(vec3 p, out float mat) {
  vec3 hp = p - hHead;
  float d = length(hp) - 0.33;
  mat = 0.0;

  float hair = length(hp - vec3(0.0, 0.035, -0.035)) - 0.365;
  hair = max(hair, hp.z * 0.85 - hp.y * 0.55 - 0.17 - 0.025 * sin(hp.x * 24.0));
  hair = smin(hair, length(hp - vec3(0.02, 0.33, -0.1)) - 0.09, 0.1);
  float accent = 1e3, wood = 1e3, metal = 1e3, glow = 1e3;
  if (eExtra < 0.5) {
    hair = smin(hair, sdCapsule(hp, vec3(0.0, 0.05, -0.3), vec3(0.0, -0.2, -0.42 - 0.05 * ePose.w), 0.07), 0.08);
    // scarf: a ring at the neck and a tail that trails behind
    vec3 neck = hChest + vec3(0.0, 0.15, 0.0);
    accent = sdTorusY(p - neck, 0.13, 0.06);
    float sway = sin(uTime * 3.0 + eLook.x * 9.0);
    vec3 ta = neck + vec3(0.06, 0.0, -0.13);
    vec3 tb = ta + vec3(0.05 + 0.05 * sway, -0.14 + 0.1 * ePose.w, -0.26 - 0.14 * ePose.w);
    accent = smin(accent, sdTaper(p, ta, tb, 0.055, 0.035), 0.05);
    metal = sdTaper(p, hHandR + hBlade * 0.1, hHandR + hBlade * 0.82, 0.042, 0.014);
    vec3 side = normalize(cross(hBlade, vec3(0.0, 0.0, 1.0)) + 1e-3);
    wood = min(sdCapsule(p, hHandR - hBlade * 0.07, hHandR + hBlade * 0.08, 0.03),
               sdCapsule(p, hHandR + hBlade * 0.1 - side * 0.1, hHandR + hBlade * 0.1 + side * 0.1, 0.028));
  } else if (eExtra < 1.5) {
    accent = min(sdCylinder(hp - vec3(0.0, 0.2, 0.0), 0.52, 0.045), sdConeUp(hp - vec3(0.0, 0.2, 0.0), 0.27, 0.3) - 0.02);
    accent = min(accent, sdRoundBox(p - hChest - vec3(0.0, -0.16, 0.13), vec3(0.15, 0.2, 0.04), 0.03));
  } else {
    float hood = length(hp - vec3(0.0, 0.03, -0.05)) - 0.4;
    hood = max(hood, hp.z * 0.9 - hp.y * 0.35 - 0.2);
    accent = smin(hood, sdTaper(p, hChest + vec3(0.0, 0.12, -0.08), hHip + vec3(0.0, -0.2, -0.16), 0.2, 0.26), 0.1);
    vec3 st = hHandR + vec3(0.02, 0.0, 0.05);
    wood = sdCapsule(p, st - vec3(0.0, 0.62, 0.0), st + vec3(0.0, 0.85, 0.0), 0.03);
    glow = length(p - st - vec3(0.0, 0.95, 0.0)) - 0.09;
  }
  if (hair < d) { d = hair; mat = 1.0; }

  float tunic = sdTaper(p, hHip + vec3(0.0, -0.07, 0.0), hChest + vec3(0.0, 0.04, 0.0), 0.215, 0.15);
  tunic = min(tunic, sdTaper(p, hChest + vec3(-0.17, 0.05, 0.0), hHandL, 0.068, 0.055));
  tunic = min(tunic, sdTaper(p, hChest + vec3(0.17, 0.05, 0.0), hHandR, 0.068, 0.055));
  if (tunic < d) { d = tunic; mat = 2.0; }
  float hands = min(length(p - hHandL), length(p - hHandR)) - 0.072;
  if (hands < d) { d = hands; mat = 0.0; }
  float legs = min(sdCapsule(p, hHip + vec3(-0.1, -0.06, 0.0), hFootL + vec3(0.0, 0.06, 0.0), 0.075),
                   sdCapsule(p, hHip + vec3(0.1, -0.06, 0.0), hFootR + vec3(0.0, 0.06, 0.0), 0.075));
  if (legs < d) { d = legs; mat = 3.0; }
  float boots = min(length((p - hFootL - vec3(0.0, 0.0, 0.04)) * vec3(1.0, 1.25, 0.72)),
                    length((p - hFootR - vec3(0.0, 0.0, 0.04)) * vec3(1.0, 1.25, 0.72))) - 0.095;
  boots *= 0.75;
  if (boots < d) { d = boots; mat = 4.0; }
  if (accent < d) { d = accent; mat = 5.0; }
  if (metal < d) { d = metal; mat = 6.0; }
  if (wood < d) { d = wood; mat = 7.0; }
  if (glow < d) { d = glow; mat = 8.0; }
  return d;
}

void entSurf(vec3 p, float mat, inout Surf s) {
  int m = int(mat + 0.5);
  if (m == 0) {
    // skin is the paper itself with a breath of apricot
    s.albedo = P_APRICOT; s.cover = 0.1; s.wrap = 0.35;
    vec3 f = p - hHead;
    if (f.z > 0.05 && length(f) < 0.36) {
      float blink = step(0.965, fract(uTime * 0.27 + eLook.x));
      // tall dot eyes under a level lid: a steady look, not a cute one
      float side = f.x < 0.0 ? -1.0 : 1.0;
      vec2 e = vec2(f.x - side * 0.125, f.y + 0.015);
      vec2 sz = vec2(0.05, mix(0.085, 0.012, blink)) * (1.0 + 0.06 * side);
      float eye = smoothstep(1.0, 0.85, length(e / sz)) * step(e.y, 0.052);
      float glint = smoothstep(0.024, 0.014, length(e - vec2(-0.016, 0.03))) * (1.0 - blink);
      float lid = penLine(e.y - 0.058) * step(abs(e.x), 0.072);
      float mouth = penLine(f.y + 0.118 + f.x * f.x * 1.5) * step(abs(f.x), 0.034);
      s.ink = max(lid, mouth);
      // blush is a few rose ticks, rationed
      vec2 c = vec2(abs(f.x) - 0.205, f.y + 0.095);
      float ticks = smoothstep(0.3, 0.1, abs(fract((c.x * 0.9 + c.y * 0.45) * 46.0) - 0.5)) * step(length(c * vec2(1.0, 1.7)), 0.055);
      if (ticks > 0.1) { s.albedo = P_ROSE; s.cover = ticks * 0.85; }
      if (eye > 0.3) { s.albedo = INK_BLACK; s.cover = 1.0 - glint; s.solid = 1.0; s.ink = 0.0; }
    }
  } else if (m == 1) {
    float streak = vnoise(vec2(atan(p.x - hHead.x, p.z - hHead.z) * 5.0, p.y * 3.0));
    s.albedo = eColC; s.cover = mix(0.78, 0.95, streak);
    s.ink = smoothstep(0.12, 0.0, abs(fract(streak * 3.0) - 0.5)) * 0.55;       // locks of hair
  } else if (m == 2) {
    s.albedo = eColA; s.cover = 0.84;
    float belt = abs(p.y - hHip.y - 0.1) - 0.03;
    if (belt < 0.0) { s.albedo = P_UMBER; s.cover = 0.95; }
    s.ink = penLine(belt) * 0.9;
    // the skirt of the tunic falls in pleats
    float skirt = step(p.y, hHip.y + 0.06);
    s.ink = max(s.ink, skirt * penLine((abs(fract(atan(p.x, p.z) * 2.2) - 0.5)) / 2.2 * 0.2) * 0.6);
    float hem = step(p.y - hHip.y, -0.045);
    s.cover = mix(s.cover, 0.12, hem);                                          // a pale hem: bare paper
  } else if (m == 3) { s.albedo = P_TAN; s.cover = 0.62; }
  else if (m == 4) { s.albedo = P_BARK; s.cover = 0.85; }
  else if (m == 5) {
    s.albedo = eColB; s.cover = 0.86;
    if (eExtra > 0.5 && eExtra < 1.5 && p.y < hChest.y) { s.albedo = P_CREAM; s.cover = 0.14; }   // the trader's apron
  } else if (m == 6) { s.albedo = P_SLATE; s.cover = 0.1; s.ink = 0.0; }        // steel is paper with one cool touch
  else if (m == 7) { s.albedo = P_BARK; s.cover = 0.8; }
  else { s.albedo = P_SKY; s.cover = 0.1; s.glow = 1.0; }
}
`,
});
