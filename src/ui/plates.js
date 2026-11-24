// World-anchored interface: nameplates over creatures and the numbers that
// float up when something is hit. Pooled DOM nodes moved with transforms.

export class Plates {
  constructor(game, root, floatRoot) {
    this.game = game;
    this.root = root;
    this.floatRoot = floatRoot;
    this.nodes = new Map();   // entity id -> { el, fill, key }
    this.floaters = [];
    this.pool = [];

    const bus = game.bus;
    bus.on('damage', (d) => {
      const t = d.target;
      this.float(t.x, t.y + t.height * 0.9, t.z, String(d.amount), t.kind === 'player' ? 'hurt' : d.crit ? 'crit' : '');
    });
    bus.on('miss', (d) => this.float(d.target.x, d.target.y + d.target.height, d.target.z, d.text, 'miss'));
    bus.on('xp', (d) => { const p = game.player; this.float(p.x, p.y + 2.3, p.z, `+${d.amount} xp`, 'xp'); });
    bus.on('heal', (d) => { if (!d.focus) this.float(d.entity.x, d.entity.y + 2.0, d.entity.z, 'Mended', 'heal'); });
  }

  float(x, y, z, text, cls) {
    const el = this.pool.pop() || this.floatRoot.appendChild(document.createElement('div'));
    el.className = 'fl ' + cls;
    el.textContent = text;
    el.style.display = '';
    this.floaters.push({ el, x: x + (Math.random() - 0.5) * 0.5, y, z, t: 0, life: cls === 'crit' ? 1.1 : 0.9 });
  }

  update(dt) {
    const g = this.game, cam = g.camera, p = g.player;
    const W = g.renderer.size.cssW, H = g.renderer.size.cssH;   // the picture's box, which #plates and #floaters share

    // numbers rise and fade; no bounce, no zoom
    let w = 0;
    for (const f of this.floaters) {
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) { f.el.style.display = 'none'; this.pool.push(f.el); continue; }
      const s = cam.project(f.x, f.y + k * 1.1, f.z);
      if (s) {
        f.el.style.transform = `translate(${(s.x * W).toFixed(1)}px, ${(s.y * H).toFixed(1)}px) translate(-50%, -50%)`;
        f.el.style.opacity = k < 0.6 ? 1 : (1 - (k - 0.6) / 0.4).toFixed(2);
      }
      this.floaters[w++] = f;
    }
    this.floaters.length = w;

    // nameplates: townsfolk always, monsters when hovered, targeted or hurt, loot when near
    const seen = new Set();
    for (const e of g.entities.list) {
      if (e.kind === 'player' || e.dead || e.grow < 0.6) continue;
      const dist = Math.hypot(e.x - p.x, e.z - p.z);
      let show = false;
      if (e.kind === 'npc') show = dist < 30;
      else if (e.kind === 'monster') show = dist < 40 && (e.hover || e === p.target || e.hp < e.maxHp || e.elite || e.ai.state === 'chase' || e.ai.state === 'attack');
      else if (e.kind === 'drop') show = dist < 9 && e.age > 0.4;
      if (!show) continue;
      const s = cam.project(e.x, e.y + e.height + 0.25 + e.lift, e.z);
      if (!s || s.x < -0.1 || s.x > 1.1 || s.y < -0.1 || s.y > 1.1) continue;
      seen.add(e.id);
      let n = this.nodes.get(e.id);
      if (!n) {
        const el = this.root.appendChild(document.createElement('div'));
        el.className = 'np' + (e.kind === 'npc' ? ' npc' : e.kind === 'drop' ? ' loot' + (e.rare ? ' rare' : '') : e.elite ? ' elite' : '');
        if (e.kind === 'monster') el.innerHTML = `${e.name}<small>Lv ${e.level}</small><span class="mini"><i></i></span>`;
        else if (e.kind === 'npc') el.innerHTML = `${e.name}<small>${e.role === 'shop' ? 'Trader' : 'Warden'}</small>`;
        else el.textContent = e.name;
        n = { el, fill: el.querySelector('i'), hp: -1 };
        this.nodes.set(e.id, n);
      }
      n.el.style.transform = `translate(${(s.x * W).toFixed(1)}px, ${(s.y * H).toFixed(1)}px) translate(-50%, -100%)`;
      if (n.fill && n.hp !== e.hp) { n.hp = e.hp; n.fill.style.transform = `scaleX(${Math.max(0, e.hp / e.maxHp).toFixed(3)})`; }
    }
    for (const [id, n] of this.nodes) if (!seen.has(id)) { n.el.remove(); this.nodes.delete(id); }
  }
}
