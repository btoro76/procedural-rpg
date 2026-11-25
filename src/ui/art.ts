import type { ItemInstance } from '../game/rules/items';
import type { ClassId, Rarity, Vec3 } from '../game/types';
import { BASE } from '../game/content/items';
import { CLASSES } from '../game/content/classes';
import { RARITY_COLORS, type ColorVision } from '../settings/settings';

const INK = '#3b2414';
const STEEL = ['#f4f6f9', '#c3cad4', '#7f8999'];
const IRON = ['#b6bcc6', '#7c8594', '#4f5662'];
const WOOD = ['#d9a96e', '#a5713f', '#6a4322'];
const LEATHER = ['#c08a62', '#8a5a3c', '#5a3824'];
const GOLD = ['#f8e08a', '#d8a835', '#8f6412'];
const DYES = ['#b84a3a', '#4f6c9e', '#5e8c4e', '#c49434', '#885478', '#469696', '#4a4d5e', '#c8b48a'];

type Rand = () => number;
interface Kit { id: string; r: Rand; rc: string; rarity: Rarity; cloth: string[]; trim: string[]; gem: string }

function rng(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

const pick = <T,>(r: Rand, list: T[]): T => list[Math.floor(r() * list.length)];

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k))).toString(16).padStart(2, '0');
  return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

const tone = (hex: string): string[] => [shade(hex, 0.38), hex, shade(hex, -0.38)];
const hexOf = (v: Vec3): string => '#' + v.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
const isFancy = (r: Rarity) => r === 'legendary' || r === 'unique';

function defs(k: Kit): string {
  const g = (name: string, c: string[]) => `<linearGradient id="${k.id}${name}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset="0.5" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></linearGradient>`;
  const glow = k.rarity === 'common' ? 0 : k.rarity === 'magic' ? 0.24 : k.rarity === 'rare' ? 0.32 : 0.46;
  return `<defs>`
    + `<pattern id="${k.id}h" width="3.2" height="3.2" patternUnits="userSpaceOnUse" patternTransform="rotate(28)"><line x1="0" y1="0" x2="0" y2="3.2" stroke="${INK}" stroke-width="0.8"/></pattern>`
    + `<radialGradient id="${k.id}bg" cx="0.5" cy="0.46" r="0.62"><stop offset="0" stop-color="${k.rc}" stop-opacity="${glow}"/><stop offset="0.7" stop-color="${k.rc}" stop-opacity="${glow * 0.3}"/><stop offset="1" stop-color="${k.rc}" stop-opacity="0"/></radialGradient>`
    + g('s', STEEL) + g('i', IRON) + g('w', WOOD) + g('l', LEATHER) + g('c', k.cloth) + g('t', k.trim) + g('g', tone(k.gem))
    + `</defs>`;
}

const fills = (k: Kit) => ({
  steel: `url(#${k.id}s)`, iron: `url(#${k.id}i)`, wood: `url(#${k.id}w)`, leather: `url(#${k.id}l)`,
  cloth: `url(#${k.id}c)`, trim: `url(#${k.id}t)`, gem: `url(#${k.id}g)`,
});

function shape(k: Kit, d: string, fill: string, hatch = 0.3, width = 2): string {
  return `<path d="${d}" fill="${fill}"/>`
    + (hatch ? `<path d="${d}" fill="url(#${k.id}h)" opacity="${hatch}"/>` : '')
    + `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
}

const line = (d: string, w = 1.4, color = INK, op = 1) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`;

const disc = (k: Kit, cx: number, cy: number, rad: number, fill: string, hatch = 0.25, width = 2) =>
  shape(k, `M${cx - rad} ${cy}a${rad} ${rad} 0 1 0 ${rad * 2} 0a${rad} ${rad} 0 1 0 ${-rad * 2} 0z`, fill, hatch, width);

const gemAt = (k: Kit, cx: number, cy: number, rad: number) =>
  shape(k, `M${cx} ${cy - rad}L${cx + rad} ${cy}L${cx} ${cy + rad}L${cx - rad} ${cy}Z`, fills(k).gem, 0.1, 1.4)
  + line(`M${cx - rad * 0.45} ${cy - rad * 0.15}l${rad * 0.35} ${-rad * 0.35}`, 1.1, '#fff', 0.9);

function backdrop(k: Kit, w = 100, h = 100): string {
  let s = `<rect x="0" y="0" width="${w}" height="${h}" rx="8" fill="#f6f0e1"/><rect x="0" y="0" width="${w}" height="${h}" rx="8" fill="url(#${k.id}bg)"/>`;
  if (isFancy(k.rarity)) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, r0 = 30, r1 = i % 2 ? 40 : 46;
      s += line(`M${w / 2 + Math.cos(a) * r0} ${h / 2 + Math.sin(a) * r0}L${w / 2 + Math.cos(a) * r1} ${h / 2 + Math.sin(a) * r1}`, 1.4, k.rc, 0.35);
    }
  }
  return s + `<ellipse cx="${w / 2}" cy="${h - 11}" rx="${w * 0.27}" ry="3.6" fill="${INK}" opacity="0.13"/>`;
}

function sword(k: Kit, big: boolean): string {
  const f = fills(k), r = k.r;
  const w = (big ? 7.5 : 5.5) + r() * 2, tip = big ? 6 : 14, gy = big ? 64 : 62;
  let s = shape(k, `M${50 - w} ${gy}L${50 - w * 0.85} ${tip + 12}L50 ${tip}L${50 + w * 0.85} ${tip + 12}L${50 + w} ${gy}Z`, f.steel, 0.16);
  s += line(`M50 ${gy - 4}L50 ${tip + 14}`, 1.2, INK, 0.5) + line(`M${50 - w * 0.5} ${gy - 6}L${50 - w * 0.42} ${tip + 16}`, 1, '#fff', 0.85);
  const guard = Math.floor(r() * 3);
  if (guard === 0) s += shape(k, `M33 ${gy}h34v6h-34z`, f.trim, 0.25);
  else if (guard === 1) s += shape(k, `M30 ${gy - 3}q20 14 40 0l-2 7q-18 8 -36 0z`, f.trim, 0.25);
  else s += shape(k, `M30 ${gy - 6}l8 6h24l8 -6l-3 11h-34z`, f.trim, 0.25);
  const gl = big ? 22 : 16;
  s += shape(k, `M46.5 ${gy + 6}h7v${gl}h-7z`, f.leather, 0.2);
  for (let y = gy + 9; y < gy + 6 + gl; y += 4) s += line(`M46.5 ${y}l7 2`, 1);
  const py = gy + 6 + gl + 4;
  s += r() < 0.5 ? disc(k, 50, py, 4.5, f.trim) : shape(k, `M50 ${py - 6}l5 6l-5 6l-5 -6z`, f.trim, 0.2);
  if (k.rarity !== 'common' && k.rarity !== 'magic') s += gemAt(k, 50, gy + 3, 3.5);
  return s;
}

function dagger(k: Kit): string {
  const f = fills(k), r = k.r;
  const w = 5 + r() * 2;
  let s = shape(k, `M${50 - w} 60L${50 - w * 0.6} 30Q50 14 ${50 + w * 0.6} 30L${50 + w} 60Z`, f.steel, 0.16);
  s += line('M50 58L50 30', 1.2, INK, 0.5) + line(`M${50 - w * 0.4} 56L${50 - w * 0.3} 32`, 1, '#fff', 0.85);
  s += r() < 0.5 ? shape(k, 'M37 60h26v5h-26z', f.trim, 0.2) : shape(k, 'M36 57q14 10 28 0l-2 7q-12 6 -24 0z', f.trim, 0.2);
  s += shape(k, 'M47 65h6v16h-6z', f.leather, 0.2) + line('M47 69l6 2M47 74l6 2M47 79l6 2', 1);
  s += disc(k, 50, 85, 4, f.trim);
  if (k.rarity !== 'common') s += gemAt(k, 50, 62.5, 3);
  return s;
}

function axe(k: Kit, big: boolean): string {
  const f = fills(k), r = k.r;
  const top = big ? 10 : 22;
  let s = shape(k, `M47 ${top}h6v${90 - top}h-6z`, f.wood, 0.25);
  for (let y = 74; y < 88; y += 4) s += line(`M47 ${y}l6 2`, 1);
  const kind = big ? 2 : Math.floor(r() * 2);
  if (kind === 0) s += shape(k, 'M52 24q20 -8 26 6q-1 14 -7 24q-9 -7 -19 -9z', f.steel, 0.18) + line('M72 28q4 11 -1 21', 1.1, '#fff', 0.85);
  else if (kind === 1) s += shape(k, 'M52 22q18 -10 28 6q3 12 -4 24q-7 -9 -24 -11z', f.steel, 0.18) + line('M76 30q2 9 -2 17', 1.1, '#fff', 0.85);
  else s += shape(k, 'M53 14q22 -8 28 8q2 14 -6 26q-8 -8 -22 -10zM47 14q-22 -8 -28 8q-2 14 6 26q8 -8 22 -10z', f.steel, 0.18)
    + line('M76 20q4 10 -1 20M24 20q-4 10 1 20', 1.1, '#fff', 0.85);
  s += shape(k, `M45.5 ${top - 2}h9v9h-9z`, f.trim, 0.2);
  if (isFancy(k.rarity)) s += gemAt(k, 50, top + 3, 3);
  return s;
}

function mace(k: Kit): string {
  const f = fills(k), r = k.r;
  let s = shape(k, 'M47 34h6v56h-6z', f.wood, 0.25) + line('M47 76l6 2M47 80l6 2M47 84l6 2', 1);
  const kind = Math.floor(r() * 3);
  if (kind === 0) {
    let d = '';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, b = a + Math.PI / 8;
      d += `${i ? 'L' : 'M'}${50 + Math.cos(a) * 18} ${24 + Math.sin(a) * 18}L${50 + Math.cos(b) * 9} ${24 + Math.sin(b) * 9}`;
    }
    s += shape(k, d + 'Z', f.steel, 0.18);
  } else if (kind === 1) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      s += shape(k, `M${50 + Math.cos(a - 0.28) * 11} ${24 + Math.sin(a - 0.28) * 11}L${50 + Math.cos(a) * 20} ${24 + Math.sin(a) * 20}L${50 + Math.cos(a + 0.28) * 11} ${24 + Math.sin(a + 0.28) * 11}Z`, f.steel, 0.1, 1.4);
    }
    s += disc(k, 50, 24, 12, f.iron);
  } else {
    s += disc(k, 50, 24, 14, f.iron);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; s += disc(k, 50 + Math.cos(a) * 8.5, 24 + Math.sin(a) * 8.5, 2.2, f.trim, 0, 1.2); }
    s += line('M42 16q4 -4 9 -4', 1.2, '#fff', 0.8);
  }
  s += shape(k, 'M44.5 34h11v5h-11z', f.trim, 0.2);
  return s;
}

function staff(k: Kit): string {
  const f = fills(k), r = k.r;
  let s = shape(k, 'M48 26h5l-1 68h-3z', f.wood, 0.25) + line('M50.5 40q1 20 0 50', 1, INK, 0.3);
  s += shape(k, 'M46.5 36h8v7h-8z', f.cloth, 0.2) + line('M48 43q-4 8 -2 14M53 43q3 6 2 12', 1.4, k.cloth[1]);
  const kind = Math.floor(r() * 3);
  if (kind === 0) s += line('M44 28q-7 -10 2 -17M57 28q7 -10 -2 -17', 4.4) + line('M44 28q-7 -10 2 -17M57 28q7 -10 -2 -17', 2.4, WOOD[1]) + disc(k, 50.5, 16, 7.5, f.gem, 0.1) + line('M47 13q3 -2 6 0', 1.2, '#fff', 0.9);
  else if (kind === 1) s += shape(k, 'M50.5 2l8 14l-8 12l-8 -12z', f.gem, 0.1) + line('M50.5 4v22M43.5 16h14', 0.9, INK, 0.35) + shape(k, 'M44.5 26h12l-2 5h-8z', f.trim, 0.2);
  else s += line('M51 28q14 -4 10 -16q-4 -10 -14 -6q-8 4 -2 10q4 3 6 -1', 5) + line('M51 28q14 -4 10 -16q-4 -10 -14 -6q-8 4 -2 10q4 3 6 -1', 2.8, WOOD[1]) + disc(k, 52, 13, 3.6, f.gem, 0, 1.4);
  return s;
}

function wand(k: Kit): string {
  const f = fills(k), r = k.r;
  let s = shape(k, 'M48 36h4l-0.5 54h-3z', f.wood, 0.25) + shape(k, 'M47 74h6v14h-6z', f.leather, 0.2) + line('M47 78l6 2M47 83l6 2', 1);
  if (r() < 0.5) {
    let d = '';
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, rad = i % 2 ? 6 : 14; d += `${i ? 'L' : 'M'}${50 + Math.cos(a) * rad} ${24 + Math.sin(a) * rad}`; }
    s += shape(k, d + 'Z', f.gem, 0.1);
  } else s += shape(k, 'M50 9l7 14l-7 13l-7 -13z', f.gem, 0.1) + shape(k, 'M45 34h10l-2 4h-6z', f.trim, 0.2);
  for (let i = 0; i < 3; i++) { const a = r() * Math.PI * 2; s += disc(k, 50 + Math.cos(a) * 20, 24 + Math.sin(a) * 18, 1.6, k.gem, 0, 0.8); }
  return s;
}

function bow(k: Kit): string {
  const f = fills(k), r = k.r;
  const cx = 70 + r() * 10, gx = 20 + cx / 2;
  const limb = `M40 8Q${cx} 50 40 92`;
  let s = line('M40 8L40 92', 1.5, INK, 0.95);
  s += line(limb, 9.6) + line(limb, 6.4, WOOD[1]) + line(limb, 2, WOOD[0], 0.9);
  s += line('M40 8q6 -5 12 -4M40 92q6 5 12 4', 4.4) + line('M40 8q6 -5 12 -4M40 92q6 5 12 4', 2, WOOD[2]);
  s += shape(k, `M${gx - 5} 42h10v16h-10z`, f.leather, 0.25) + line(`M${gx - 5} 46l10 2M${gx - 5} 51l10 2M${gx - 5} 56l10 2`, 1);
  if (k.rarity !== 'common') s += line('M47 22q4 6 6 12M47 78q4 -6 6 -12', 1.8, k.trim[1]);
  if (isFancy(k.rarity)) s += gemAt(k, gx, 50, 3.5);
  return s;
}

function shield(k: Kit, kind = Math.floor(k.r() * 3), emblem = Math.floor(k.r() * 5)): string {
  const f = fills(k);
  const d = kind === 0 ? 'M22 16h56v28q0 30 -28 44q-28 -14 -28 -44z' : kind === 1 ? 'M50 12a38 38 0 1 0 0.01 0z' : 'M50 8l28 18q0 40 -28 66q-28 -26 -28 -66z';
  let s = shape(k, d, f.cloth, 0.22, 2.4);
  s += `<path d="${d}" fill="none" stroke="${k.trim[1]}" stroke-width="4.5" transform="translate(50 50) scale(0.88) translate(-50 -50)"/>`;
  s += `<path d="${d}" fill="none" stroke="${INK}" stroke-width="1" opacity="0.6" transform="translate(50 50) scale(0.8) translate(-50 -50)"/>`;
  const c = k.trim[0];
  if (emblem === 0) s += shape(k, 'M32 54l18 -14l18 14l-4 6l-14 -10l-14 10z', c, 0.15, 1.4);
  else if (emblem === 1) s += shape(k, 'M46 26h8v18h16v8h-16v22h-8v-22h-16v-8h16z', c, 0.15, 1.4);
  else if (emblem === 2) {
    s += disc(k, 50, 48, 9, c, 0.1, 1.6);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; s += line(`M${50 + Math.cos(a) * 12} ${48 + Math.sin(a) * 12}L${50 + Math.cos(a) * 18} ${48 + Math.sin(a) * 18}`, 2.2); }
  } else if (emblem === 3) s += shape(k, 'M50 30l5 12l13 1l-10 8l3 13l-11 -7l-11 7l3 -13l-10 -8l13 -1z', c, 0.15, 1.4);
  else s += shape(k, 'M50 26q16 14 9 30q-3 8 -9 10q-6 -2 -9 -10q-7 -16 9 -30z', '#f09e4a', 0.12, 1.4) + shape(k, 'M50 42q7 7 3 14q-1 4 -3 5q-2 -1 -3 -5q-4 -7 3 -14z', '#ffe08a', 0, 1.1);
  if (kind === 1) s += disc(k, 50, 50, 5, f.steel, 0, 1.6);
  return s;
}

function focus(k: Kit): string {
  const f = fills(k);
  const arms = 'M40 74q-18 -16 -10 -42q2 -6 6 -8M60 74q18 -16 10 -42q-2 -6 -6 -8';
  let s = line(arms, 5.4) + line(arms, 3, k.trim[1]);
  s += shape(k, 'M36 74q14 -10 28 0l-4 14h-20z', f.trim, 0.25);
  s += disc(k, 50, 47, 16, f.gem, 0.1);
  s += line('M42 41q7 -9 16 -2', 1.6, '#fff', 0.85) + line('M39 54q11 8 22 0', 1, INK, 0.35);
  for (let i = 0; i < 4; i++) { const a = -Math.PI / 2 + (i - 1.5) * 0.6; s += line(`M${50 + Math.cos(a) * 20} ${47 + Math.sin(a) * 20}l${Math.cos(a) * 5} ${Math.sin(a) * 5}`, 1.6, k.gem, 0.8); }
  return s;
}

function quiver(k: Kit): string {
  const f = fills(k), r = k.r;
  let s = '';
  for (let i = 0; i < 4; i++) {
    const x = 42 + i * 6 + r() * 2;
    s += line(`M${x} 30L${x - 3} 10`, 1.8, WOOD[2]);
    s += shape(k, `M${x - 3} 10l-4 -3l1 9zM${x - 3} 10l4 -3l-1 9z`, i % 2 ? k.cloth[1] : '#d64634', 0.1, 1);
  }
  s += shape(k, 'M36 28h30l-4 62h-22z', f.leather, 0.25, 2.2) + shape(k, 'M35 25h32v7h-32z', f.trim, 0.2);
  s += line('M40 46h22M41 72h19', 1.4, INK, 0.55) + line('M66 32q16 22 -2 56', 2.6, LEATHER[2]);
  if (k.rarity !== 'common') s += disc(k, 51, 59, 4, f.trim, 0, 1.4);
  return s;
}

function helm(k: Kit): string {
  const f = fills(k), r = k.r;
  const kind = k.rarity === 'common' ? 0 : k.rarity === 'magic' ? (r() < 0.5 ? 0 : 1) : r() < 0.3 ? 1 : 2;
  if (kind === 0) {
    return shape(k, 'M24 78q-4 -46 26 -60q30 14 26 60l-11 4q-2 -28 -15 -32q-13 4 -15 32z', f.cloth, 0.25, 2.2)
      + line('M50 18q-6 20 0 32', 1.2, INK, 0.4)
      + shape(k, 'M28 76q22 12 44 0l-2 9q-20 9 -40 0z', f.cloth, 0.35)
      + line('M36 30q-6 14 -6 30', 1.1, '#fff', 0.5);
  }
  if (kind === 1) {
    return shape(k, 'M24 62q0 -40 26 -42q26 2 26 42z', f.leather, 0.25, 2.2) + shape(k, 'M20 60h60v8h-60z', f.leather, 0.35)
      + line('M50 20v40M36 26q-4 14 -4 34M64 26q4 14 4 34', 1.2, INK, 0.5) + disc(k, 50, 40, 4, f.trim, 0, 1.4);
  }
  let s = shape(k, 'M24 68q-2 -46 26 -50q28 4 26 50l-8 12h-36z', f.steel, 0.16, 2.2);
  s += shape(k, 'M47 40h6v36h-6z', f.iron, 0.2) + shape(k, 'M27 46h46v6h-46z', f.trim, 0.2) + line('M34 59h10M56 59h10', 3.4);
  s += line('M34 26q-6 10 -6 22', 1.2, '#fff', 0.8);
  if (isFancy(k.rarity)) s += shape(k, 'M30 24l6 -14l6 10l8 -14l8 14l6 -10l6 14q-20 -6 -40 0z', f.trim, 0.2) + gemAt(k, 50, 32, 4);
  return s;
}

function chest(k: Kit, robe: boolean): string {
  const f = fills(k), r = k.r;
  if (robe) {
    let s = shape(k, 'M36 12q14 8 28 0l14 14l-6 10l-4 -4v60h-36v-60l-4 4l-6 -10z', f.cloth, 0.25, 2.2);
    s += shape(k, 'M42 12q8 14 16 0l-4 22h-8z', shade(k.cloth[1], -0.3), 0.3);
    s += shape(k, 'M32 52h36v7h-36z', f.trim, 0.2) + line('M50 59v33', 1.4, INK, 0.5) + line('M34 90h32', 2.6, k.trim[1]);
    s += line('M40 66q-2 12 0 22M60 66q2 12 0 22', 1, INK, 0.35);
    return s;
  }
  const kind = Math.floor(r() * 3);
  let s = shape(k, 'M34 14l8 -4q8 6 16 0l8 4l14 12l-6 14l-6 -4v52h-40v-52l-6 4l-6 -14z', kind === 2 ? f.steel : f.leather, 0.25, 2.2);
  s += shape(k, 'M42 10q8 10 16 0l-2 8q-6 6 -12 0z', f.cloth, 0.2, 1.4);
  if (kind === 0) for (let y = 26; y < 66; y += 8) s += line(`M46 ${y}l8 4M54 ${y}l-8 4`, 1.4);
  else if (kind === 1) for (let y = 30; y < 68; y += 10) for (let x = 36; x < 66; x += 8) s += disc(k, x, y, 1.6, f.trim, 0, 1);
  else for (let y = 30; y < 68; y += 9) s += line(`M30 ${y}q20 4 40 0`, 1.2, INK, 0.6);
  s += shape(k, 'M28 70h44v7h-44z', f.leather, 0.3) + shape(k, 'M46.5 69h7v9h-7z', f.trim, 0.1, 1.2);
  s += line('M32 20q-4 4 -8 10', 1.1, '#fff', 0.6);
  return s;
}

function gloves(k: Kit): string {
  const f = fills(k), plated = k.rarity !== 'common' && k.r() < 0.5;
  let s = shape(k, 'M32 88v-30l-4 -16q0 -6 5 -4l5 14v-30q1 -6 6 -5l2 26v-30q2 -5 6 -4l1 30l2 -26q3 -5 6 -3l-1 28l4 -18q4 -4 6 1l-4 28l-4 14v25z', plated ? f.steel : f.leather, 0.25, 2.2);
  s += shape(k, 'M29 72h36v18h-36z', f.cloth, 0.25) + line('M29 81h36', 1, INK, 0.5);
  if (plated) s += line('M38 50l18 2M37 58l20 1', 1.4, INK, 0.6);
  if (k.rarity !== 'common') s += disc(k, 47, 81, 3, f.trim, 0, 1.2);
  return s;
}

function legs(k: Kit): string {
  const f = fills(k);
  let s = shape(k, 'M30 16h40l4 76h-16l-8 -52l-8 52h-16z', f.cloth, 0.25, 2.2);
  s += shape(k, 'M29 13h42v9h-42z', f.leather, 0.3) + shape(k, 'M46 13h8v9h-8z', f.trim, 0.1, 1.2);
  s += line('M40 26l-4 60M60 26l4 60', 1, INK, 0.3);
  if (k.rarity !== 'common') s += shape(k, 'M30 52h14v11h-14zM56 52h14v11h-14z', f.steel, 0.16, 1.4);
  return s;
}

function boots(k: Kit): string {
  const f = fills(k), r = k.r;
  let s = shape(k, 'M34 10h22v52l20 12q4 4 0 10h-46l-2 -10z', f.leather, 0.25, 2.2);
  s += shape(k, 'M28 84h50v6h-50z', f.iron, 0.2);
  s += shape(k, 'M32 9h26v12h-26z', r() < 0.5 ? f.cloth : f.leather, 0.3);
  s += line('M36 40h18M36 50h18', 2.2, k.trim[2]) + disc(k, 52, 40, 2, f.trim, 0, 1) + disc(k, 52, 50, 2, f.trim, 0, 1);
  s += line('M38 24q-2 16 0 34', 1.1, '#fff', 0.55);
  return s;
}

function amulet(k: Kit): string {
  const f = fills(k), r = k.r;
  let s = line('M20 8Q50 70 80 8', 2.8) + line('M20 8Q50 70 80 8', 1.4, k.trim[0]);
  const kind = Math.floor(r() * 3);
  if (kind === 0) s += shape(k, 'M50 38q15 18 0 46q-15 -28 0 -46z', f.trim, 0.2) + gemAt(k, 50, 62, 7);
  else if (kind === 1) s += disc(k, 50, 62, 16, f.trim) + disc(k, 50, 62, 9, f.gem, 0.1, 1.6) + line('M45 57q3 -3 7 -2', 1.1, '#fff', 0.9);
  else s += shape(k, 'M50 40l15 22l-15 22l-15 -22z', f.trim, 0.2) + gemAt(k, 50, 62, 7);
  s += disc(k, 50, 39, 2.6, f.trim, 0, 1.2);
  return s;
}

function ring(k: Kit): string {
  const f = fills(k), r = k.r;
  const band = (w: number, c: string, extra = '') => `<ellipse cx="50" cy="62" rx="24" ry="16" fill="none" stroke="${c}" stroke-width="${w}" ${extra}/>`;
  let s = band(11, INK) + band(7, k.trim[1]) + band(2, k.trim[0], r() < 0.5 ? 'stroke-dasharray="4 3"' : '');
  s += shape(k, 'M39 48h22l-3 -9h-16z', f.trim, 0.2) + gemAt(k, 50, 35, 9);
  return s;
}

const BIG = 'translate(50 50) scale(1.1) translate(-50 -50)';

const DRAW: Record<string, (k: Kit) => string> = {
  sword: (k) => `<g transform="rotate(38 50 50) translate(0 -2) ${BIG}">${sword(k, false)}</g>`,
  greatsword: (k) => `<g transform="rotate(38 50 50) translate(0 -3) scale(1 0.95)">${sword(k, true)}</g>`,
  dagger: (k) => `<g transform="rotate(38 50 50) ${BIG}">${dagger(k)}</g>`,
  axe: (k) => `<g transform="rotate(32 50 50)">${axe(k, false)}</g>`,
  greataxe: (k) => `<g transform="rotate(32 50 50)">${axe(k, true)}</g>`,
  mace: (k) => `<g transform="rotate(32 50 50) ${BIG}">${mace(k)}</g>`,
  staff: (k) => `<g transform="rotate(30 50 50)">${staff(k)}</g>`,
  wand: (k) => `<g transform="rotate(34 50 50) ${BIG}">${wand(k)}</g>`,
  bow: (k) => `<g transform="rotate(30 50 50) translate(2 0)">${bow(k)}</g>`,
  quiver: (k) => `<g transform="rotate(14 50 50)">${quiver(k)}</g>`,
  shield: (k) => shield(k),
  chest: (k) => chest(k, false),
  robe: (k) => chest(k, true),
  focus, helm, gloves, legs, boots, amulet, ring,
};

function drawingOf(base: string): string {
  const b = BASE[base];
  if (!b) return 'ring';
  if (b.slot === 'chest') return b.id === 'robe' ? 'robe' : 'chest';
  if (b.slot === 'weapon' || b.slot === 'offhand') return b.type ?? 'sword';
  return b.slot;
}

const cache = new Map<string, string>();

export function itemArt(it: ItemInstance, vision: ColorVision, tag = ''): string {
  const key = `${it.uid}|${it.base}|${it.rarity}|${vision}|${tag}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = rng(hash(it.uid + it.base));
  const rc = RARITY_COLORS[vision][it.rarity];
  const k: Kit = {
    id: 'a' + hash(key).toString(36), r, rc, rarity: it.rarity,
    cloth: it.rarity === 'unique' ? tone('#7a3e6e') : tone(pick(r, DYES)),
    trim: isFancy(it.rarity) ? GOLD : it.rarity === 'rare' ? tone('#c9a447') : IRON,
    gem: it.rarity === 'common' ? '#b9c1cc' : rc,
  };
  const svg = `<svg viewBox="0 0 100 100" aria-hidden="true">${defs(k)}${backdrop(k)}${(DRAW[drawingOf(it.base)] ?? DRAW.ring)(k)}</svg>`;
  if (cache.size > 800) cache.clear();
  cache.set(key, svg);
  return svg;
}

function flame(k: Kit, x: number, y: number, s: number): string {
  return `<g transform="translate(${x} ${y}) scale(${s})">`
    + shape(k, 'M0 -26q16 12 11 26q-3 8 -11 10q-8 -2 -11 -10q-5 -14 11 -26z', '#f09e4a', 0.12, 1.6)
    + shape(k, 'M0 -10q7 7 4 13q-1 4 -4 5q-3 -1 -4 -5q-3 -6 4 -13z', '#ffe08a', 0, 1.2)
    + `</g>`;
}

const CLASS_ART: Record<ClassId, (k: Kit) => string> = {
  warden: (k) => `<g transform="translate(20 -2) rotate(-32 50 50)">${sword(k, false)}</g>`
    + `<g transform="translate(10 18) scale(0.72)">${shield(k, 0, 4)}</g>`
    + flame(k, 100, 76, 0.7),
  emberwright: (k) => {
    let s = `<g transform="translate(6 2) rotate(-14 50 50)">${staff(k)}</g>`;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.4, x = 78 + Math.cos(a) * 22, y = 44 + Math.sin(a) * 26;
      s += i % 2 ? shape(k, `M${x} ${y - 5}l3.4 5l-3.4 5l-3.4 -5z`, '#a8cce8', 0.1, 1.2) : disc(k, x, y, 3.4, '#f09e4a', 0, 1.4);
    }
    return s + flame(k, 78, 54, 0.62);
  },
  strider: (k) => {
    let s = `<g transform="translate(18 0) rotate(-6 50 50)">${bow(k)}</g>`;
    s += line('M28 50L104 50', 2.2, WOOD[2]) + shape(k, 'M104 50l-9 -5v10z', STEEL[1], 0.1, 1.4) + shape(k, 'M28 50l-7 -5l3 5l-3 5z', '#d64634', 0.1, 1.2);
    s += shape(k, 'M90 84q4 -14 18 -14q-2 14 -18 14z', '#79a65f', 0.2, 1.4) + line('M90 84l12 -9', 1, INK, 0.6);
    return s;
  },
};

export function classArt(id: ClassId): string {
  const p = CLASSES[id].pencils;
  const k: Kit = { id: 'c' + id, r: rng(hash(id)), rc: hexOf(p[0]), rarity: 'legendary', cloth: tone(hexOf(p[0])), trim: GOLD, gem: hexOf(p[1]) };
  return `<svg viewBox="0 0 120 100" aria-hidden="true">${defs(k)}${backdrop(k, 120, 100)}${CLASS_ART[id](k)}</svg>`;
}
