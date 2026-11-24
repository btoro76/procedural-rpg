// Windows: character sheet, bag, trader, bounty board, help. Each is a render
// function that rebuilds its body from game state; clicks call game systems.
// Everything in here is reachable by mouse.

import { ATTRIBUTES, BOONS, derive, xpToNext } from '../game/stats.js';
import { ITEMS, SHOP_STOCK } from '../game/data/items.js';
import { SKILLS } from '../game/data/skills.js';
import { TALENTS, rank, takeTalent } from '../game/data/talents.js';
import { RECIPES } from '../game/data/items.js';
import { VIEWS } from '../config.js';
import { BIOMES } from '../world/biomes.js';
import { itemIcon } from './icons.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Panels {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.open = new Map();   // id -> element
    const bus = game.bus;
    bus.on('ui:toggle', (id) => this.toggle(id));
    bus.on('ui:close', () => this.closeAll());
    bus.on('npc:talk', (npc) => { this.trader = npc; this.show(npc.role === 'shop' ? 'shop' : 'bounty'); });
    for (const ev of ['bag:changed', 'levelup', 'trade', 'bounty:changed', 'xp', 'attune', 'found', 'boon', 'talent']) bus.on(ev, () => this.refresh());

    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) this.act(b.dataset.act, b.dataset.arg, b);
    });
    root.addEventListener('pointerover', (e) => {
      const c = e.target.closest('[data-item]');
      const hint = c && c.closest('.panel').querySelector('.hint');
      if (hint) {
        const it = ITEMS[c.dataset.item];
        hint.innerHTML = `<strong>${esc(it.name)}</strong> — ${esc(it.desc || '')}${it.value ? ` <span class="dim">Sells for ${it.value}.</span>` : ''}`;
      }
    });
  }

  spec(id) {
    return {
      character: { title: 'Character', side: 'left', body: () => this.character() },
      bag: { title: 'Bag', side: 'right', body: () => this.bag() },
      shop: { title: 'Trade', side: 'right', body: () => this.shop() },
      bounty: { title: 'Bounty Board', side: 'right', body: () => this.bounty() },
      view: { title: 'View', side: 'right', body: () => this.view() },
      travel: { title: 'Waystones', side: 'right', body: () => this.travel() },
      help: { title: 'How to Play', side: '', body: () => this.help() },
    }[id];
  }

  toggle(id) { if (this.open.has(id)) this.close(id); else this.show(id); }

  show(id) {
    const spec = this.spec(id);
    if (!spec) return;
    // one window per side keeps the middle of the screen clear
    for (const [other] of this.open) if (other !== id && (innerWidth < 1100 || this.spec(other).side === spec.side)) this.close(other);
    let el = this.open.get(id);
    if (!el) {
      el = document.createElement('section');
      el.className = `panel plate ${spec.side}`;
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', spec.title);
      el.innerHTML = `<header><h2>${spec.title}</h2><button type="button" class="x" data-act="close" data-arg="${id}" aria-label="Close">×</button></header><div class="body"></div>`;
      this.root.appendChild(el);
      this.open.set(id, el);
      if (id === 'bounty') this.game.bounties.offers.length || this.game.bounties.refresh();
    }
    el.querySelector('.body').innerHTML = spec.body();
    this.game.bus.emit('ui:click');
  }

  close(id) {
    const el = this.open.get(id);
    if (el) { el.remove(); this.open.delete(id); }
  }
  closeAll() { for (const [id] of this.open) this.close(id); }
  refresh() { for (const [id, el] of this.open) el.querySelector('.body').innerHTML = this.spec(id).body(); }

  act(name, arg, el) {
    const g = this.game, p = g.player, s = p.sheet;
    if (name === 'close') return this.close(arg);
    if (name === 'attr' && s.points > 0) { s.base[arg]++; s.points--; derive(p); g.bus.emit('ui:click'); }
    else if (name === 'use') g.loot.use(arg);
    else if (name === 'unwear') g.loot.unequip(+arg);
    else if (name === 'sell') g.loot.sell(arg, 1);
    else if (name === 'sellmats') g.loot.sellMaterials();
    else if (name === 'buy') g.loot.buy(arg);
    else if (name === 'accept') g.bounties.accept(+arg);
    else if (name === 'abandon') g.bounties.abandon();
    else if (name === 'claim') g.bounties.claim();
    else if (name === 'talent') { if (takeTalent(s, arg)) { derive(p); g.bus.emit('talent', { id: arg, name: TALENTS[arg].name }); g.bus.emit('ui:click'); } }
    else if (name === 'craft') g.loot.craft(+arg);
    else if (name === 'guide') { this.closeAll(); g.bus.emit('guide:restart'); return; }
    else if (name === 'travel') { if (g.discover.travel(+arg)) this.closeAll(); return; }
    else if (name === 'cam') {
      const cam = g.camera;
      if (arg === 'left') cam.rotate(0.5, 0); else if (arg === 'right') cam.rotate(-0.5, 0);
      else if (arg === 'high') cam.rotate(0, 0.16); else if (arg === 'low') cam.rotate(0, -0.16);
      else if (arg === 'near') cam.zoom(0.84); else if (arg === 'far') cam.zoom(1.19);
      else if (VIEWS[arg]) Object.assign(cam.goal, { pitch: VIEWS[arg][0], distance: VIEWS[arg][1] * (g.touch ? 0.9 : 1) });
      else if (arg === 'full') {
        const d = document, root = d.documentElement;
        const on = d.fullscreenElement || d.webkitFullscreenElement;
        try {
          const done = on ? (d.exitFullscreen || d.webkitExitFullscreen).call(d) : (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
          if (done && done.catch) done.catch(() => {});
        } catch { /* the browser said no; the page simply stays as it is */ }
      }
      g.bus.emit('ui:click');
      return;      // the same button stays under the finger, so leave the sheet as it is
    }
    this.refresh();
  }

  // ------------------------------------------------------------ bodies
  character() {
    const p = this.game.player, s = p.sheet;
    const rows = ATTRIBUTES.map((a) => {
      const bonus = p.attr[a.id] - s.base[a.id];
      return `<div class="attr"><div><strong>${a.name}</strong><small>${a.hint}</small></div>
        <div class="val">${s.base[a.id]}${bonus ? `<u>+${bonus}</u>` : ''}</div>
        <button type="button" class="plus" data-act="attr" data-arg="${a.id}" ${s.points ? '' : 'disabled'} aria-label="Raise ${a.name}">+</button></div>`;
    }).join('');
    const skills = SKILLS.map((k) => `<div class="attr" style="grid-template-columns:1fr auto"><div><strong>${k.name}</strong><small>${k.desc}</small></div>
      <div class="dim">${s.level >= k.unlock ? (this.game.touch ? 'Ready' : `Key ${k.key}`) : `Level ${k.unlock}`}</div></div>`).join('');
    // a talent to choose: three on offer, one to take
    const numeral = ['', 'I', 'II', 'III'];
    const offer = s.picks > 0 && s.offer ? `<div class="label">Choose a talent${s.picks > 1 ? ` (${s.picks} to choose)` : ''}</div>` + s.offer.map((id) => {
      const t = TALENTS[id], r = rank(s, id);
      return `<div class="offer"><strong>${t.name}${t.max > 1 ? ` ${numeral[r + 1]}` : ''}</strong><small>${t.desc}</small>
        <button type="button" class="btn primary" data-act="talent" data-arg="${id}" aria-label="Choose ${t.name}">Choose</button></div>`;
    }).join('') : '';
    const owned = Object.keys(s.talents || {}).map((id) => `${TALENTS[id].name}${TALENTS[id].max > 1 ? ' ' + numeral[rank(s, id)] : ''}`).join(', ');
    return `
      <div class="row"><p>Level ${s.level} Wayfarer</p><p class="dim">${s.xp} / ${xpToNext(s.level)} xp</p></div>
      ${offer}
      <p class="${s.points ? '' : 'dim'}">${s.points ? `<strong style="color:var(--red-ink)">${s.points} points</strong> to spend.` : 'Gain a level to earn attribute points.'}</p>
      ${rows}
      <div class="sheet">
        <div><span>Health</span>${p.maxHp}</div><div><span>Focus</span>${p.maxFocus}</div>
        <div><span>Attack</span>${p.attack.toFixed(0)}</div><div><span>Swings / s</span>${p.attackSpeed.toFixed(2)}</div>
        <div><span>Critical</span>${(p.crit * 100).toFixed(0)}%</div><div><span>Dodge</span>${(p.dodge * 100).toFixed(0)}%</div>
        <div><span>Armor</span>${p.defense.toFixed(0)}</div><div><span>Skill power</span>${(p.power * 100).toFixed(0)}%</div>
      </div>
      <div class="label">Skills</div>${skills}
      <div class="label">Talents</div><p class="${owned ? '' : 'dim'}">${owned || 'Each level brings a choice of three.'}</p>`;
  }

  cells(mode) {
    const s = this.game.player.sheet;
    let html = '';
    for (let i = 0; i < 24; i++) {
      const b = s.bag[i];
      if (!b) { html += '<div class="cell"></div>'; continue; }
      const it = ITEMS[b.id];
      const act = mode === 'sell' ? (it.value ? 'sell' : '') : it.kind !== 'mat' ? 'use' : '';
      html += `<button type="button" class="cell" data-item="${b.id}" ${act ? `data-act="${act}" data-arg="${b.id}"` : ''} aria-label="${esc(it.name)}">${itemIcon(it)}${b.n > 1 ? `<span class="count">${b.n}</span>` : ''}</button>`;
    }
    return html;
  }

  bag() {
    const s = this.game.player.sheet;
    const worn = [0, 1].map((i) => {
      const id = s.charms[i];
      return id ? `<button type="button" class="cell worn" data-item="${id}" data-act="unwear" data-arg="${i}" aria-label="Take off ${esc(ITEMS[id].name)}">${itemIcon(ITEMS[id])}</button>` : '<div class="cell"></div>';
    }).join('');
    return `
      <div class="row"><div class="label">Worn charms</div><span class="coin">${s.glint} glint</span></div>
      <div class="grid">${worn}</div>
      <div class="label">Carried</div>
      <div class="grid">${this.cells('use')}</div>
      <div class="hint dim">${this.game.touch ? 'Tap' : 'Click'} a tonic to drink it, or a charm to wear it.</div>`;
  }

  shop() {
    const s = this.game.player.sheet;
    const stock = SHOP_STOCK.map((id) => {
      const it = ITEMS[id];
      return `<div class="offer"><strong>${it.name}</strong><small>${it.desc}</small>
        <button type="button" class="btn" data-act="buy" data-arg="${id}" ${s.glint < it.price ? 'disabled' : ''}>Buy · ${it.price}</button></div>`;
    }).join('');
    const mats = s.bag.filter((b) => ITEMS[b.id].kind === 'mat').reduce((n, b) => n + ITEMS[b.id].value * b.n, 0);
    return `
      <div class="row"><p>“${this.trader && this.trader.id === 'tinker' ? 'Bits and bottles, all honest.' : 'Fresh tonics, fair prices.'}”</p><span class="coin">${s.glint} glint</span></div>
      ${stock}
      <div class="label">Made from what you carry</div>
      ${RECIPES.map((r, i) => {
        const needs = Object.keys(r.needs).map((id) => `${ITEMS[id].name} ${Math.min(this.game.loot.count(id), r.needs[id])}/${r.needs[id]}`).join(', ');
        const can = s.glint >= r.glint && Object.keys(r.needs).every((id) => this.game.loot.count(id) >= r.needs[id]);
        return `<div class="offer"><strong>${ITEMS[r.id].name}</strong><small>${needs}</small>
          <button type="button" class="btn" data-act="craft" data-arg="${i}" ${can ? '' : 'disabled'} aria-label="Make ${ITEMS[r.id].name} for ${r.glint} glint">Make · ${r.glint}</button></div>`;
      }).join('')}
      <div class="row"><div class="label">Your bag — ${this.game.touch ? 'tap' : 'click'} to sell one</div>
        <button type="button" class="btn" data-act="sellmats" ${mats ? '' : 'disabled'}>Sell materials · ${mats}</button></div>
      <div class="grid">${this.cells('sell')}</div>
      <div class="hint dim">${this.game.touch ? 'Each tap sells one, and shows what it fetched.' : 'Point at an item to see what it fetches.'}</div>`;
  }

  bounty() {
    const g = this.game, b = g.player.sheet.bounty;
    if (b) {
      const done = b.have >= b.need;
      g.bounties.progress();
      return `<p>“${done ? 'Good work out there. Here is your pay.' : 'Still at it? Come back when it is done.'}”</p>
        <div class="offer"><strong>${esc(g.bounties.title(b))}</strong><small>${b.need > 1 ? `${b.have} of ${b.need} · ` : ''}reward ${b.xp} xp, ${b.glint} glint</small>
        ${done ? '<button type="button" class="btn primary" data-act="claim">Claim reward</button>' : '<button type="button" class="btn" data-act="abandon">Give up</button>'}</div>`;
    }
    return `<p>“There is always work for a Wayfarer. Take a job.”</p>` + g.bounties.offers.filter(Boolean).map((o, i) =>
      `<div class="offer"><strong>${esc(g.bounties.title(o))}</strong><small>Reward ${o.xp} xp, ${o.glint} glint${o.x !== undefined ? ' · marked in red on your map' : ''}</small>
       <button type="button" class="btn" data-act="accept" data-arg="${i}">Accept</button></div>`).join('');
  }

  /** Where the hero can go at once, and what the journey has found so far. */
  travel() {
    const g = this.game, p = g.player, s = p.sheet;
    const ways = s.ways.map((w, i) => ({ w, i, d: Math.hypot(w.x - p.x, w.z - p.z) })).sort((a, b) => a.d - b.d);
    const rows = ways.map(({ w, i, d }) => `<div class="way"><strong>${esc(w.name)}</strong><small>${d < 12 ? 'You are here' : `${Math.round(d)} paces away`}</small>
      <button type="button" class="btn" data-act="travel" data-arg="${i}" ${d < 12 ? 'disabled' : ''}>Go</button></div>`).join('');
    const known = Object.keys(s.known).length;
    return `
      <div class="row"><p>${g.discover.count()} ${g.discover.count() === 1 ? 'place' : 'places'} found</p><p class="dim">${known ? `${known} more marked on the map` : ''}</p></div>
      <div class="label">The Long Walk: ${Object.keys(s.lands || {}).length} of ${BIOMES.length} countries walked</div>
      <p class="dim">${BIOMES.filter((b) => s.lands && s.lands[b.id]).map((b) => b.name).join(', ') || 'None yet.'}${g.discover.nextMark() ? ` The road teaches a talent at ${g.discover.nextMark()}.` : ' You have walked them all.'}</p>
      ${s.boon ? `<p>${BOONS[s.boon.id].name}: ${BOONS[s.boon.id].desc}</p>` : ''}
      <div class="label">Waystones you are attuned to</div>
      ${rows}
      <p class="dim">${ways.length < 2 ? 'Walk up to a waystone to attune to it. You can then travel to it from anywhere, when no fight is on.' : 'Travel takes a moment, and cannot be done in the middle of a fight.'}</p>`;
  }

  /** Every way of turning and zooming the view that needs a drag, a pinch or a wheel is also a button here. */
  view() {
    const d = document;
    const full = d.fullscreenEnabled || d.webkitFullscreenEnabled;
    const b = (arg, text) => `<button type="button" class="btn" data-act="cam" data-arg="${arg}">${text}</button>`;
    return `
      <div class="pair">${b('behind', 'Behind the hero')}${b('above', 'From above')}</div>
      <div class="pair">${b('left', 'Turn left')}${b('right', 'Turn right')}</div>
      <div class="pair">${b('high', 'Look from higher')}${b('low', 'Look from lower')}</div>
      <div class="pair">${b('near', 'Closer')}${b('far', 'Farther')}</div>
      ${full ? `<div class="pair">${b('full', 'Full screen on or off')}</div>` : ''}
      <p class="dim">${this.game.touch ? 'You can also drag the picture to turn it and pinch to zoom.' : 'You can also drag with the right mouse button, turn with Q and E, and zoom with the wheel.'}</p>`;
  }

  help() {
    if (this.game.touch) return `<div class="keys-list">
      <kbd>Stick</kbd><span>Your left thumb walks. Push it part-way to stroll.</span>
      <kbd>Tap</kbd><span>Tap the picture to walk to a spot, attack a creature or talk to townsfolk.</span>
      <kbd>Sword</kbd><span>Attacks the nearest creature, or talks to someone close. Hold it to keep fighting.</span>
      <kbd>Round buttons</kbd><span>Skills. They aim at your target, or at the nearest creature.</span>
      <kbd>Arrows</kbd><span>Picks the next creature.</span>
      <kbd>Flasks</kbd><span>Drink a Red Tonic or a Blue Draught.</span>
      <kbd>Drag / pinch</kbd><span>Drag the picture to turn and tilt the view, pinch to zoom. The View menu has buttons for both.</span>
      <kbd>The map</kbd><span>Tap it for the waystones you can travel to, and what you have found.</span>
    </div>
    <p class="dim">Loot is picked up by walking over it. Waystones mend you and become the place you return to. A sun-yellow mark at the map's rim points to somewhere not yet found: caches under cairns, standing stones that lend a boon, beacons that show the country round. The farther from Hearthmere, the stronger the wilds.</p>
    <button type="button" class="btn" data-act="guide">Show me the first steps again</button>`;
    return `<div class="keys-list">
      <kbd>Left click</kbd><span>Walk to a spot, attack a creature, talk to townsfolk. Hold to keep walking.</span>
      <kbd>W A S D</kbd><span>Walk by hand.</span>
      <kbd>1 2 3 4</kbd><span>Skills. They aim at your target, or at the cursor.</span>
      <kbd>R / F</kbd><span>Drink a Red Tonic or a Blue Draught.</span>
      <kbd>Space / Tab</kbd><span>Attack the nearest creature, or pick the next one.</span>
      <kbd>Right drag</kbd><span>Turn and tilt the view. <kbd>Q</kbd> <kbd>E</kbd> also turn it.</span>
      <kbd>Wheel</kbd><span>Zoom.</span>
      <kbd>C / B / V</kbd><span>Character sheet, bag, and buttons for the view.</span>
      <kbd>T / the map</kbd><span>Waystones you can travel to, and what you have found.</span>
    </div>
    <p class="dim">Loot is picked up by walking over it. Waystones mend you and become the place you return to. A sun-yellow mark at the map's rim points to somewhere not yet found: caches under cairns, standing stones that lend a boon, beacons that show the country round. The farther from Hearthmere, the stronger the wilds.</p>
    <button type="button" class="btn" data-act="guide">Show me the first steps again</button>`;
  }
}
