// Interface root: the always-on HUD (status, target, hotbar, minimap frame,
// log, toasts), the title screen, and the two sub-modules for world plates and
// panels. Reads game state each frame and listens to the event bus; the game
// never calls into the UI.

import { VIEWS } from '../config.js';
import { xpToNext, BOONS } from '../game/stats.js';
import { SKILLS } from '../game/data/skills.js';
import { ITEMS } from '../game/data/items.js';
import { clearSave } from '../game/save.js';
import { SKILL_ICONS, MENU_ICONS, ACT_ICONS, itemIcon } from './icons.js';
import { Plates } from './plates.js';
import { Panels } from './panels.js';
import { createStick, watchTouch } from './touch.js';
import { createGuide } from './guide.js';

const $ = (id) => document.getElementById(id);
const HOURS = [[5, 'Dawn'], [8, 'Morning'], [12, 'Midday'], [17, 'Afternoon'], [20, 'Dusk'], [24, 'Night']];

export function createUI(game) {
  const bus = game.bus, p = game.player;
  const plates = new Plates(game, $('plates'), $('floaters'));
  const panels = new Panels(game, $('panels'));
  const el = {
    hpBar: $('hp-bar'), foBar: $('fo-bar'), xpBar: $('xp-bar'),
    lvl: $('lvl'), glint: $('glint'), hpFill: $('hp-fill'), hpText: $('hp-text'), foFill: $('fo-fill'), foText: $('fo-text'), xpFill: $('xp-fill'),
    target: $('target'), tName: $('t-name'), tLvl: $('t-lvl'), tFill: $('t-fill'),
    zone: $('zone'), clock: $('clock'), ring: $('map-ring'), boon: $('boon'), tracker: $('tracker'), trackerText: $('tracker-text'),
    log: $('log'), toast: $('toast'), hotbar: $('hotbar'), menu: $('menu'),
  };
  const last = {};
  const set = (key, node, prop, value) => { if (last[key] !== value) { last[key] = value; node[prop] = value; } };
  const meter = (key, node, now, max) => {     // what a screen reader is told about a bar
    if (last['m' + key] === now && last['x' + key] === max) return;
    last['m' + key] = now; last['x' + key] = max;
    node.setAttribute('aria-valuenow', now); node.setAttribute('aria-valuemax', max);
  };
  const scale = (key, node, v) => { v = Math.max(0, Math.min(1, v)).toFixed(3); if (last[key] !== v) { last[key] = v; node.style.transform = `scaleX(${v})`; } };

  // ---- hotbar: four skills, then two drinks. On a touch screen the same buttons
  // sit in an arc under the right thumb, joined by an attack button and a
  // next-target button (the stylesheet does the moving).
  const slots = [];
  SKILLS.forEach((s, i) => slots.push(makeSlot(SKILL_ICONS[s.icon], s.key, s.name, () => game.skills.cast(i), `s${i}`)));
  el.hotbar.appendChild(Object.assign(document.createElement('div'), { className: 'sep' }));
  const drinks = [['tonic', 'R'], ['draught', 'F']].map(([id, key], i) => {
    const slot = makeSlot(itemIcon(ITEMS[id]), key, ITEMS[id].name, () => game.loot.use(id), `d${i}`);
    slot.count = slot.el.appendChild(Object.assign(document.createElement('span'), { className: 'count' }));
    slot.item = id;
    return slot;
  });
  const act = makeSlot(ACT_ICONS.attack + ACT_ICONS.talk, 'Space', 'Attack', () => game.controls.act(), 'act touch-only');
  makeSlot(ACT_ICONS.next, 'Tab', 'Next target', () => game.controls.cycleTarget(), 'next touch-only');
  // held down, the attack button carries the fight on to the next creature
  act.el.addEventListener('pointerdown', (e) => {
    game.input.acting = true;
    try { act.el.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) act.el.addEventListener(ev, () => (game.input.acting = false));

  function makeSlot(icon, key, title, onClick, cls) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = `slot ${cls}`; b.title = title;
    b.setAttribute('aria-label', `${title}, key ${key}`);
    b.innerHTML = `${icon}<span class="cool"></span><span class="key">${key}</span>`;
    // A finger acts the moment it lands (and a second finger still counts while the
    // other thumb holds the stick, when browsers send no click). A mouse click
    // hands the keys back to the game; a keyboard press keeps its focus.
    let touched = -1e9;
    b.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      touched = performance.now();
      game.input.any = true;
      onClick();
    });
    b.addEventListener('click', (e) => {
      if (performance.now() - touched < 800) return;
      onClick();
      if (e.detail) b.blur();
    });
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    el.hotbar.appendChild(b);
    return { el: b, cool: b.querySelector('.cool'), base: `slot ${cls}` };
  }
  const flashSlot = (slot) => { slot.el.classList.add('fired'); setTimeout(() => slot.el.classList.remove('fired'), 130); };
  bus.on('skill', (d) => flashSlot(slots[SKILLS.findIndex((s) => s.id === d.id)]));
  bus.on('drink', (d) => flashSlot(drinks.find((s) => s.item === d.item)));

  // ---- menu
  const sound = { on: true };
  for (const b of el.menu.querySelectorAll('button')) {
    const id = b.dataset.open;
    b.innerHTML = MENU_ICONS[id];
    b.addEventListener('click', (e) => { bus.emit('ui:toggle', id); if (e.detail) b.blur(); });
  }
  bus.on('ui:toggle', (id) => {
    if (id !== 'sound') return;
    sound.on = !sound.on;
    const sb = el.menu.querySelector('[data-open="sound"]');
    sb.innerHTML = MENU_ICONS[sound.on ? 'sound' : 'muted'];
    sb.setAttribute('aria-pressed', String(sound.on));
    bus.emit('sound', sound.on);
  });

  // ---- log and toast (text fades in and out; it never bounces or zooms)
  function log(html) {
    const line = document.createElement('p');
    line.innerHTML = html;
    el.log.appendChild(line);
    while (el.log.children.length > 5) el.log.firstChild.remove();
    fitLog();
    setTimeout(() => line.classList.add('old'), 5200);
    setTimeout(() => line.remove(), 6200);
  }
  // where the layout gives messages only a line or two of room, older ones leave rather than show half a slip
  function fitLog() {
    const box = el.log;
    let h = -5;
    for (const c of box.children) h += c.offsetHeight + 5;
    while (box.children.length > 1 && h > box.clientHeight + 1) { h -= box.firstChild.offsetHeight + 5; box.firstChild.remove(); }
  }
  let toastTimer = 0;
  function toast(title, sub = '', seconds = 2.8) {
    el.toast.innerHTML = `<strong>${title}</strong>${sub ? `<span>${sub}</span>` : ''}`;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), seconds * 1000);
  }
  bus.on('log', (d) => (d.big ? toast('Bounty complete', 'Return to Bram in Hearthmere') : log(d.text)));
  bus.on('pickup', (d) => { const it = ITEMS[d.item]; log(`Picked up <em>${it.name}</em>${d.n > 1 ? ` ×${d.n}` : ''}`); });
  bus.on('talent', (d) => log(`Talent taken: <em>${d.name}</em>.`));
  bus.on('levelup', (d) => { toast(`Level ${d.level}`, 'A talent to choose and points to spend, in the Character sheet.', 3.6); el.menu.querySelector('[data-open="character"]').classList.add('alert'); });
  bus.on('ui:toggle', (id) => { if (id === 'character') el.menu.querySelector('[data-open="character"]').classList.remove('alert'); });
  bus.on('site:enter', (s) => toast(s.name, s.kind === 'town' ? 'A safe hearth' : 'A waystone rests here'));
  bus.on('attune', (d) => log(`Attuned to <em>${d.name}</em>. You will return here.`));
  bus.on('player:died', () => toast('You were overcome', `Returning to ${p.sheet.waystone.name}…`, 3));
  bus.on('trade', (d) => { if (d.total) log(`Sold materials for <em>${d.total} glint</em>`); });
  bus.on('bounty:claimed', (b) => toast('Bounty paid', `+${b.xp} xp · +${b.glint} glint`));
  bus.on('monster:died', (m) => { if (m.elite) log(`You felled an <em>${m.name}</em>.`); });
  // finding things: a cache and a beacon are announced; a made place already announces itself on arrival
  bus.on('found', (d) => {
    if (d.kind === 'cache') toast('A cache', 'Left under a cairn by someone who never came back for it.', 3.2);
    else if (d.kind === 'beacon') toast(d.name, d.shown ? `${d.shown} places round about are marked on your map.` : 'Nothing new can be seen from here.', 3.6);
    else if (d.kind === 'stones') log(`Found <em>${d.name}</em>.`);
    else log(`Found <em>${d.name}</em>. ${d.count} ${d.count === 1 ? 'place' : 'places'} so far.`);
  });
  bus.on('boon', (d) => toast(d.name, `${d.desc} The stones lend it for a few minutes.`, 3.6));
  bus.on('land', (d) => {
    if (d.all) toast('The Long Walk is done', 'You have set foot in every country. The road teaches one last talent.', 5);
    else if (d.mark) { toast(`${d.count} countries walked`, 'The road teaches: a talent to choose, in the Character sheet.', 4); el.menu.querySelector('[data-open="character"]').classList.add('alert'); }
    else log(`New country: <em>${d.name}</em>. ${d.count} of ${d.total} walked.`);
  });
  bus.on('travel:arrive', (d) => log(`Travelled to <em>${d.name}</em>.`));
  el.ring.addEventListener('click', (e) => { bus.emit('ui:toggle', 'travel'); if (e.detail) el.ring.blur(); });

  // ---- layout: the picture fills the canvas's box (the window, or the top of an
  // upright phone), and the minimap frame tells the renderer where to draw the map
  function placeMap() {
    const r = el.ring.getBoundingClientRect(), c = game.canvas.getBoundingClientRect();
    const shown = !document.body.classList.contains('titled');   // no map behind the title card
    // a small map shows about as much country as a big one
    game.renderer.minimap.rect = [r.left - c.left + r.width / 2, r.top - c.top + r.height / 2, shown ? r.width / 2 - 3 : 0, 0.62 * Math.max(1, 150 / Math.max(r.width, 1))];
  }
  function layout() { game.resize(); placeMap(); fitLog(); }
  addEventListener('resize', layout);
  if (window.ResizeObserver) new ResizeObserver(layout).observe(game.canvas);

  // ---- touch: the stick, and the finger layout
  createStick(game, $('ui'));
  watchTouch(game, () => {
    $('keys-hint').textContent = 'Tap to move and fight  ·  the stick walks  ·  drag the picture to turn the view';
    panels.refresh();
    layout();
  });

  // ---- title
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  game.reducedMotion = calm;
  const hadSave = !!game.player.sheet && (game.player.sheet.level > 1 || game.player.sheet.xp > 0);
  $('btn-begin').textContent = hadSave ? 'Continue' : 'Begin';
  $('btn-begin').disabled = false;
  $('btn-begin').focus({ preventScroll: true });       // Enter starts the game
  $('btn-new').hidden = !hadSave;
  $('btn-begin').addEventListener('click', () => {
    document.body.classList.remove('titled');
    game.begin();
    layout();
    // The view this journey was last seen from, or else the usual one: low behind the hero,
    // who starts with his back to the camera. A phone's picture is small, so it stands closer.
    const [pitch, distance] = game.savedView || [VIEWS.behind[0], VIEWS.behind[1] * (game.touch ? 0.9 : 1)];
    Object.assign(game.camera.goal, { pitch, distance });
    p.yaw = Math.PI - game.camera.goal.yaw;
  });
  $('btn-new').addEventListener('click', () => { clearSave(); game.started = false; location.search = '?new'; });
  game.look.fadeGoal = 1;
  // a wide, low view of the town turns slowly behind the title
  Object.assign(game.camera.goal, { pitch: 0.3, distance: 32 });
  Object.assign(game.camera, { pitch: 0.3, distance: 32 });

  // ---- the guide: first steps and tips (a new journey starts with them)
  createGuide(game, toast, log);

  // ---- per-frame refresh
  bus.on('frame', (dt) => {
    if (game.paused && !calm) game.camera.goal.yaw += dt * 0.06; // slow orbit behind the title
    const s = p.sheet;
    set('lvl', el.lvl, 'textContent', String(s.level));
    set('glint', el.glint, 'textContent', String(s.glint));
    scale('hp', el.hpFill, p.hp / p.maxHp);
    scale('fo', el.foFill, p.focus / p.maxFocus);
    scale('xp', el.xpFill, s.xp / xpToNext(s.level));
    set('hpT', el.hpText, 'textContent', `${Math.ceil(p.hp)} / ${p.maxHp}`);
    set('foT', el.foText, 'textContent', `${Math.floor(p.focus)} / ${p.maxFocus}`);
    meter('hp', el.hpBar, Math.ceil(p.hp), p.maxHp);
    meter('fo', el.foBar, Math.floor(p.focus), p.maxFocus);
    meter('xp', el.xpBar, Math.round(s.xp / xpToNext(s.level) * 100), 100);

    const t = p.target && p.target.kind === 'monster' && !p.target.dead ? p.target : null;
    set('tHid', el.target, 'hidden', !t);
    if (t) {
      set('tName', el.tName, 'textContent', t.name);
      set('tLvl', el.tLvl, 'textContent', `Level ${t.level}`);
      scale('tHp', el.tFill, t.hp / t.maxHp);
    }

    const site = game.world.sites.near(p.x, p.z);
    const inSite = site && Math.hypot(site.x - p.x, site.z - p.z) < site.clear + 6;
    set('zone', el.zone, 'textContent', inSite ? site.name : game.biome.name);
    set('clock', el.clock, 'textContent', HOURS.find((h) => game.hour < h[0])?.[1] || 'Night');

    const boon = s.boon;
    set('boonHid', el.boon, 'hidden', !boon);
    if (boon) {
      const left = Math.max(0, Math.ceil(boon.left));
      set('boonT', el.boon, 'textContent', `${BOONS[boon.id].name} ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
    }
    if (last.boonC !== !!boon) { last.boonC = !!boon; document.body.classList.toggle('boon', !!boon); }

    const b = s.bounty;
    set('trHid', el.tracker, 'hidden', !b);
    if (b) set('trText', el.trackerText, 'textContent', game.bounties.track(b));

    SKILLS.forEach((k, i) => {
      const slot = slots[i], cd = game.skills.cooldowns[i];
      const locked = s.level < k.unlock;
      const cls = slot.base + (locked ? ' locked' : p.focus < k.focus ? ' dry' : '') + (slot.el.classList.contains('fired') ? ' fired' : '');
      set('sc' + i, slot.el, 'className', cls);
      const left = (cd / k.cooldown * 100).toFixed(0) + '%';
      if (last['cd' + i] !== left) { last['cd' + i] = left; slot.cool.style.setProperty('--left', left); }
    });
    for (const d of drinks) {
      const n = game.loot.count(d.item);
      set('dn' + d.item, d.count, 'textContent', String(n));
      const cls = d.base + (n ? '' : ' empty') + (d.el.classList.contains('fired') ? ' fired' : '');
      set('dc' + d.item, d.el, 'className', cls);
    }
    if (game.touch) {
      // the big button says what it would do: fight, or talk when only townsfolk are near
      const e = game.controls.actTarget();
      const talk = !!e && e.kind === 'npc';
      set('actC', act.el, 'className', act.base + (talk ? ' talk' : e ? '' : ' idle'));
      if (last.actL !== talk) { last.actL = talk; act.el.title = talk ? 'Talk' : 'Attack'; act.el.setAttribute('aria-label', talk ? 'Talk' : 'Attack the nearest creature'); }
    }
    plates.update(dt);
  });

  return { toast, log, panels, plates };
}
