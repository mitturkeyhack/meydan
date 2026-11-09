// ===== MEYDAN — dokunmatik joystick ve klavye/fare kontrolleri =====
export class Input {
  constructor(el) {
    this.el = el;
    this.move = { x: 0, y: 0 };
    this.moveStick = null;      // {id, bx, by, x, y}
    this.atk = null;            // {id, kind, bx, by, x, y, t0}
    this.events = [];
    this.keys = {};
    this.mouse = null;
    this.W = 0; this.H = 0;
    this.superReady = false;
    const opt = { passive: false };
    el.addEventListener('touchstart', e => this.ts(e), opt);
    el.addEventListener('touchmove', e => this.tm(e), opt);
    el.addEventListener('touchend', e => this.te(e), opt);
    el.addEventListener('touchcancel', e => this.te(e), opt);
    el.addEventListener('mousedown', e => this.md(e));
    addEventListener('mousemove', e => this.mm(e));
    addEventListener('mouseup', e => this.mu(e));
    el.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('keydown', e => { this.keys[e.code] = true; if (e.code === 'KeyE' || e.code === 'Space') this.keySuper(); });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
  }
  layout(W, H) {
    this.W = W; this.H = H;
    const u = Math.min(W, H) / 400;
    this.atkBtn = { x: W - 105 * u - 10, y: H - 100 * u - 6, r: 58 * u };
    this.supBtn = { x: W - 225 * u - 10, y: H - 62 * u - 6, r: 40 * u };
    this.moveR = 58 * u;
  }
  hitBtn(b, x, y, pad = 1.35) { return Math.hypot(x - b.x, y - b.y) < b.r * pad; }
  pos(t) { const r = this.el.getBoundingClientRect(); return { x: t.clientX - r.left, y: t.clientY - r.top }; }
  ts(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const p = this.pos(t);
      if (!this.atk && this.superReady && this.hitBtn(this.supBtn, p.x, p.y, 1.25)) {
        this.atk = { id: t.identifier, kind: 'sup', bx: this.supBtn.x, by: this.supBtn.y, x: p.x, y: p.y, t0: performance.now() };
      } else if (!this.atk && this.hitBtn(this.atkBtn, p.x, p.y, 1.5)) {
        this.atk = { id: t.identifier, kind: 'atk', bx: this.atkBtn.x, by: this.atkBtn.y, x: p.x, y: p.y, t0: performance.now() };
      } else if (!this.moveStick && p.x < this.W * 0.5) {
        this.moveStick = { id: t.identifier, bx: p.x, by: p.y, x: p.x, y: p.y };
      }
    }
  }
  tm(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const p = this.pos(t);
      if (this.moveStick && t.identifier === this.moveStick.id) { this.moveStick.x = p.x; this.moveStick.y = p.y; this.updMove(); }
      if (this.atk && t.identifier === this.atk.id) { this.atk.x = p.x; this.atk.y = p.y; }
    }
  }
  te(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.moveStick && t.identifier === this.moveStick.id) { this.moveStick = null; this.move.x = 0; this.move.y = 0; }
      if (this.atk && t.identifier === this.atk.id) this.releaseAtk();
    }
  }
  updMove() {
    const s = this.moveStick; let dx = s.x - s.bx, dy = s.y - s.by; const d = Math.hypot(dx, dy), R = this.moveR;
    if (d > R) { s.bx = s.x - dx / d * R; s.by = s.y - dy / d * R; dx = s.x - s.bx; dy = s.y - s.by; }
    const m = Math.min(1, d / R);
    this.move.x = d > 4 ? dx / Math.max(d, 1) * m : 0; this.move.y = d > 4 ? dy / Math.max(d, 1) * m : 0;
  }
  aimVec() {
    const a = this.atk; if (!a) return null;
    const dx = a.x - a.bx, dy = a.y - a.by, d = Math.hypot(dx, dy);
    const R = a.kind === 'sup' ? this.supBtn.r * 1.6 : this.atkBtn.r * 1.2;
    return { dx: d ? dx / d : 0, dy: d ? dy / d : 0, mag: Math.min(1, d / R), d };
  }
  releaseAtk() {
    const a = this.atk; const v = this.aimVec(); this.atk = null;
    if (!v) return;
    const quick = performance.now() - a.t0 < 300;
    if (v.d < 14) { if (quick || a.kind === 'atk') this.events.push({ kind: a.kind, auto: true }); }
    else this.events.push({ kind: a.kind, auto: false, dx: v.dx, dy: v.dy, mag: v.mag });
  }
  // ---- masaüstü test kontrolleri ----
  md(e) {
    if (e.button === 2) { this.mouseFire('sup', e); return; }
    if (e.button === 0) this.mouseFire('atk', e);
  }
  mouseFire(kind, e) { const p = this.pos(e); this.events.push({ kind, mouse: true, sx: p.x, sy: p.y }); }
  mm(e) { this.mouse = this.pos(e); }
  mu() {}
  keySuper() { if (this.mouse) this.events.push({ kind: 'sup', mouse: true, sx: this.mouse.x, sy: this.mouse.y }); else this.events.push({ kind: 'sup', auto: true }); }
  poll() {
    if (!this.moveStick) {
      let x = 0, y = 0; const k = this.keys;
      if (k.KeyA || k.ArrowLeft) x--; if (k.KeyD || k.ArrowRight) x++;
      if (k.KeyW || k.ArrowUp) y--; if (k.KeyS || k.ArrowDown) y++;
      const d = Math.hypot(x, y); this.move.x = d ? x / d : 0; this.move.y = d ? y / d : 0;
    }
    const ev = this.events; this.events = []; return ev;
  }
  reset() { this.moveStick = null; this.atk = null; this.move.x = 0; this.move.y = 0; this.events = []; }
}
