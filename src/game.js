// ===== MEYDAN — maç motoru: hareket, dövüş, efektler, bot, ağ senkronu =====
import { T, MAX_AMMO, ROUND_TIME, TOZ_START, WIN_ROUNDS, CHARS, MAPS } from './config.js';
import { drawChar, drawShadow, drawTeaGlass, drawSimit, drawTomato, drawSemaver, rr, circ, ell, fs, grad, OUT } from './art.js';
import { sfx, music } from './audio.js';
import { IMG, whiteOf } from './assets.js';

const SPR_H = { cayci: 112, simitci: 118, kel: 112, teyze: 108 };
const WALL_IMG = ['st_spice', 'st_lamp', 'st_sacks'];
const PROJ_IMG = { tea: ['pr_tea', 34], simit: ['pr_simit', 36], tomato: ['pr_tomato', 30], semaver: ['pr_semaver', 46] };
function drawImgC(ctx, img, x, y, size, rot) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); const h = size * img.height / img.width; ctx.drawImage(img, -size / 2, -h / 2, size, h); ctx.restore(); }

const PR = 22;          // oyuncu çarpışma yarıçapı
const CS = 0.74;        // karakter çizim ölçeği
const WH = 34;          // duvar yüksekliği (2.5D)
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
function hash(a, b) { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

export class Game {
  constructor(canvas, input, opts) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.input = input; this.o = opts;
    this.mode = opts.mode; this.host = opts.mode === 'bot' ? true : !!opts.isHost;
    this.net = opts.net || null;
    this.map = MAPS[opts.mapId || 'kapalicarsi'];
    this.parseMap();
    this.t = 0; this.pid = 0;
    const mySide = this.host ? 1 : 2, opSide = mySide === 1 ? 2 : 1;
    this.me = this.mkPlayer(opts.me, mySide, true);
    this.op = this.mkPlayer(opts.opp, opSide, false);
    this.players = [this.me, this.op];
    this.scores = [0, 0, 0];
    this.round = 0;
    this.parts = []; this.nums = []; this.projs = []; this.zones = []; this.timers = [];
    this.shake = 0; this.banner = null; this.cam = { x: this.me.x, y: this.me.y };
    this.netT = 0; this.lastRecv = performance.now(); this.ended = false;
    this.bot = this.mode === 'bot' ? new Bot(this, this.op, this.me, opts.botLevel || 1) : null;
    this.buildFloor();
    if (this.net) this.net.onMsg = (type, p) => this.onNet(type, p);
    this.resize();
    this.startRound(1);
    music('battle');
  }

  // ---------- harita ----------
  parseMap() {
    const rows = this.map.rows; this.R = rows.length; this.C = rows[0].length;
    this.g = []; this.spawns = {};
    for (let r = 0; r < this.R; r++) {
      this.g.push([]);
      for (let c = 0; c < this.C; c++) {
        const ch = rows[r][c];
        this.g[r].push(ch === '#' ? 1 : ch === 'b' ? 2 : 0);
        if (ch === '1' || ch === '2') this.spawns[ch] = { x: c * T + T / 2, y: r * T + T / 2 };
      }
    }
    this.MW = this.C * T; this.MH = this.R * T;
    this.walls = []; this.bushes = [];
    for (let r = 0; r < this.R; r++) for (let c = 0; c < this.C; c++) {
      if (this.g[r][c] === 1) this.walls.push({ r, c, kind: Math.floor(hash(r, c) * 4) });
      if (this.g[r][c] === 2) this.bushes.push({ r, c, v: hash(c, r) });
    }
    // bitişik duvarlar aynı tür tezgâh olsun
    const cid = {}; let n = 0;
    for (const w of this.walls) {
      if (cid[w.r + ',' + w.c] !== undefined) continue;
      const kind = (n++ + Math.floor(hash(w.r, w.c) * 3)) % 3, st = [w];
      cid[w.r + ',' + w.c] = kind;
      while (st.length) { const q = st.pop(); for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (q.r + dr) + ',' + (q.c + dc); if (cid[k] === undefined && this.g[q.r + dr] && this.g[q.r + dr][q.c + dc] === 1) { cid[k] = kind; st.push({ r: q.r + dr, c: q.c + dc }); } } }
    }
    for (const w of this.walls) w.img = WALL_IMG[cid[w.r + ',' + w.c]];
  }
  tile(x, y) { const c = Math.floor(x / T), r = Math.floor(y / T); if (r < 0 || c < 0 || r >= this.R || c >= this.C) return 1; return this.g[r][c]; }
  isWall(x, y) { return this.tile(x, y) === 1; }
  los(ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 12);
    for (let i = 1; i < n; i++) { const k = i / n; if (this.isWall(lerp(ax, bx, k), lerp(ay, by, k))) return false; }
    return true;
  }
  collide(p) {
    for (let it = 0; it < 2; it++) {
      const c0 = Math.floor((p.x - PR) / T), c1 = Math.floor((p.x + PR) / T), r0 = Math.floor((p.y - PR) / T), r1 = Math.floor((p.y + PR) / T);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const wall = r < 0 || c < 0 || r >= this.R || c >= this.C || this.g[r][c] === 1;
        if (!wall) continue;
        const nx = clamp(p.x, c * T, c * T + T), ny = clamp(p.y, r * T, r * T + T);
        let dx = p.x - nx, dy = p.y - ny; const d = Math.hypot(dx, dy);
        if (d < PR) {
          if (d < 0.01) { dx = p.x - (c * T + T / 2); dy = p.y - (r * T + T / 2); const dd = Math.hypot(dx, dy) || 1; p.x += dx / dd * PR; p.y += dy / dd * PR; }
          else { p.x += dx / d * (PR - d); p.y += dy / d * (PR - d); }
        }
      }
    }
    p.x = clamp(p.x, PR, this.MW - PR); p.y = clamp(p.y, PR, this.MH - PR);
  }
  freeSpot(x, y) {
    if (!this.isWall(x, y)) return { x, y };
    for (let rad = 20; rad < 300; rad += 20) for (let a = 0; a < TAU; a += 0.5) {
      const nx = x + Math.cos(a) * rad, ny = y + Math.sin(a) * rad; if (!this.isWall(nx, ny)) return { x: nx, y: ny };
    }
    return { x, y };
  }

  // ---------- oyuncular ----------
  mkPlayer(info, side, local) {
    const c = CHARS[info.char] || CHARS.cayci;
    return { name: info.name || 'Oyuncu', char: c.id, c, side, local, x: 0, y: 0, tx: 0, ty: 0, hp: c.hp, maxhp: c.hp,
      ammo: MAX_AMMO, gaz: 0, aim: side === 1 ? 0.5 : Math.PI + 0.5, moving: false, walk: 0, lastAtk: -9, lastHurt: -9,
      flash: 0, alive: true, jump: null, inBush: false, gazFullFx: false, trophies: info.trophies || 0, stepT: 0 };
  }
  isAuth(p) { return p === this.me || (this.mode === 'bot' && p === this.op); }
  enemyOf(p) { return p === this.me ? this.op : this.me; }
  visibleTo(viewer, p) {
    if (!p.alive) return true;
    if (!p.inBush) return true;
    if (Math.hypot(p.x - viewer.x, p.y - viewer.y) < T * 2.1) return true;
    return this.t - p.lastAtk < 0.9 || this.t - p.lastHurt < 0.9;
  }

  startRound(n) {
    this.round = n; this.phase = 'count'; this.countT = 3.2; this.rt = 0; this.tozDmgT = 0; this.tozWarned = false;
    this.projs = []; this.zones = []; this.timers = [];
    for (const p of this.players) {
      const s = this.spawns[p.side]; p.x = p.tx = s.x; p.y = p.ty = s.y; p.hp = p.maxhp; p.ammo = MAX_AMMO;
      p.alive = true; p.jump = null; p.flash = 0; p.lastHurt = -9; p.lastAtk = -9;
      p.aim = Math.atan2(this.MH / 2 - s.y, this.MW / 2 - s.x);
    }
    this.cam.x = this.me.x; this.cam.y = this.me.y;
    this.input.reset();
    this.banner = { txt: n === 3 ? 'SON RAUND' : n + '. RAUND', sub: 'Hazır ol!', t: 0, dur: 2.0, col: '#ffe066' };
    this.lastCount = 4;
  }

  // ---------- ağ ----------
  onNet(type, p) {
    this.lastRecv = performance.now();
    const op = this.op;
    if (type === 'st') {
      op.tx = p.x; op.ty = p.y; op.aim = p.a; op.moving = !!p.m; op.inBush = !!p.b;
      if (p.hp < op.hp - 1) { op.lastHurt = this.t; }
      op.hp = p.hp; op.gaz = p.g;
      if (Math.hypot(op.x - p.x, op.y - p.y) > T * 4 || p.r !== this.round) { op.x = p.x; op.y = p.y; }
    } else if (type === 'sh') {
      if (!op.alive || this.phase !== 'play') return;
      this.fire(op, p.k, p.a, p.tx, p.ty, { x: p.x, y: p.y });
    } else if (type === 'dmg') {
      this.addGaz(this.me, p.g);
    } else if (type === 'dead') {
      if (p.r !== this.round) return;
      if (op.alive) this.kill(op);
      if (this.host) this.decideRound(this.me.side);
    } else if (type === 'round') {
      if (this.host || p.r !== this.round || this.phase === 'roundEnd') return;
      this.scores = p.s; this.applyRound(p.w);
    } else if (type === 'bye') {
      this.forfeit();
    }
  }
  sendState() {
    const m = this.me;
    this.net.send('st', { x: Math.round(m.x), y: Math.round(m.y), a: +m.aim.toFixed(2), hp: Math.round(m.hp), m: m.moving ? 1 : 0,
      g: +m.gaz.toFixed(2), b: m.inBush ? 1 : 0, r: this.round });
  }
  forfeit() {
    if (this.ended) return;
    this.banner = { txt: 'RAKİP AYRILDI', sub: 'Kazandın!', t: 0, dur: 2.5, col: '#7ee081' };
    this.scores[this.me.side] = WIN_ROUNDS; this.phase = 'roundEnd';
    this.timers.push({ at: this.t + 2.6, fn: () => this.endMatch(true, true) });
  }

  // ---------- savaş ----------
  addGaz(p, amt) {
    if (amt <= 0) return;
    const was = p.gaz; p.gaz = Math.min(1, p.gaz + amt);
    if (p === this.me && was < 1 && p.gaz >= 1) { sfx('gazfull'); this.popText(p.x, p.y - 90, 'GAZ DOLDU!', '#ffe066', true); }
  }
  tryFire(p, kind, ang, dist) {
    if (!p.alive || this.phase !== 'play' || p.jump) return false;
    const isSup = kind === 'sup';
    if (isSup) { if (p.gaz < 1) return false; }
    else { if (p.ammo < 1 || this.t - p.lastAtk < 0.28) { if (p === this.me && p.ammo < 1) sfx('empty'); return false; } }
    const spec = isSup ? p.c.super : p.c.attack;
    const range = spec.range || 400;
    let d = clamp(dist ?? range, 60, range);
    const tx = p.x + Math.cos(ang) * d, ty = p.y + Math.sin(ang) * d;
    if (isSup) p.gaz = 0; else p.ammo -= 1;
    p.lastAtk = this.t; p.aim = ang;
    this.fire(p, kind, ang, tx, ty, null);
    if (p === this.me && this.net) this.net.send('sh', { k: kind, a: +ang.toFixed(3), tx: Math.round(tx), ty: Math.round(ty), x: Math.round(p.x), y: Math.round(p.y) });
    return true;
  }
  fire(p, kind, ang, tx, ty, origin) {
    const isSup = kind === 'sup', spec = isSup ? p.c.super : p.c.attack;
    const ox = origin ? origin.x : p.x, oy = origin ? origin.y : p.y;
    p.lastAtk = this.t; p.aim = ang; p.atkT = this.t;
    const gazPer = isSup ? 0 : 1 / p.c.superHits;
    const near = p === this.me ? 1 : 0.7;
    const sx = ox + Math.cos(ang) * 26, sy = oy + Math.sin(ang) * 26 - 4;
    this.muzzle(sx, sy, ang, p.c.color);
    if (isSup) { sfx('super', near); this.shake = Math.max(this.shake, 5); this.ring(ox, oy, '#ffe066', 70, 0.35); }
    switch (spec.type) {
      case 'spread': case 'bounce': {
        const n = spec.count || 1;
        for (let i = 0; i < n; i++) {
          const a = n > 1 ? ang + (i / (n - 1) - 0.5) * spec.spread : ang;
          this.projs.push({ id: ++this.pid, owner: p, x: sx, y: sy, vx: Math.cos(a) * spec.speed, vy: Math.sin(a) * spec.speed,
            sp: spec.speed, dist: 0, range: spec.range, dmg: spec.dmg, r: spec.r, kind: spec.proj, bounces: spec.bounces || 0, gaz: gazPer, rot: rand(0, 6), trail: [] });
        }
        sfx(spec.proj === 'tea' ? 'tea' : spec.proj === 'swing' ? 'swing' : 'simit', near);
        break;
      }
      case 'radial': {
        for (let i = 0; i < spec.count; i++) {
          const a = ang + i / spec.count * TAU;
          this.projs.push({ id: ++this.pid, owner: p, x: ox, y: oy - 4, vx: Math.cos(a) * spec.speed, vy: Math.sin(a) * spec.speed,
            sp: spec.speed, dist: 0, range: spec.range, dmg: spec.dmg, r: spec.r, kind: spec.proj, bounces: spec.bounces || 0, gaz: 0, rot: rand(0, 6), trail: [] });
        }
        sfx('simit', near);
        break;
      }
      case 'lob': case 'lobBlast':
        this.projs.push({ id: ++this.pid, owner: p, lob: true, sx: ox, sy: oy - 10, tx, ty, t: 0, dur: spec.dur, h: 150, x: ox, y: oy, z: 0,
          dmg: spec.dmg, radius: spec.radius, kind: spec.proj, burn: spec.burn || null, gaz: gazPer, rot: 0 });
        sfx('lob', near);
        break;
      case 'multiLob':
        for (let i = 0; i < spec.count; i++) {
          const a = i / spec.count * TAU + rand(-0.3, 0.3), r = i === 0 ? 0 : spec.spreadR * rand(0.6, 1.1);
          this.projs.push({ id: ++this.pid, owner: p, lob: true, sx: ox, sy: oy - 10, tx: tx + Math.cos(a) * r, ty: ty + Math.sin(a) * r,
            t: -i * 0.07, dur: spec.dur, h: 190, x: ox, y: oy, z: 0, dmg: spec.dmg, radius: spec.radius, kind: spec.proj, gaz: 0, rot: 0 });
        }
        sfx('lob', near);
        break;
      case 'jump': {
        const fsp = this.freeSpot(tx, ty);
        p.jump = { sx: ox, sy: oy, tx: fsp.x, ty: fsp.y, t: 0, dur: spec.dur, dmg: spec.dmg, radius: spec.radius };
        sfx('jump', near);
        break;
      }
    }
  }
  blast(x, y, radius, dmg, owner, gaz, kind) {
    const big = radius > 100;
    sfx(big ? 'boom' : 'splat', owner === this.me || Math.hypot(x - this.me.x, y - this.me.y) < 500 ? 1 : 0.6);
    this.shake = Math.max(this.shake, big ? 11 : 3);
    const col = kind === 'tomato' ? '#e8322b' : kind === 'semaver' ? '#ffb02e' : '#c9a36b';
    this.ring(x, y, kind === 'tomato' ? '#ff6b5b' : '#fff1b0', radius, 0.4);
    for (let i = 0; i < (big ? 36 : 16); i++) {
      const a = rand(0, TAU), s = rand(80, big ? 420 : 240);
      this.parts.push({ x, y, z: 4, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7, vz: rand(120, 380), g: 900, life: rand(0.4, 0.9), max: 0.9, size: rand(3, big ? 9 : 6), col: i % 3 ? col : '#fff', type: 'chunk' });
    }
    if (big) for (let i = 0; i < 10; i++) this.parts.push({ x: x + rand(-40, 40), y: y + rand(-30, 30), z: 10, vx: rand(-30, 30), vy: rand(-30, 30), vz: rand(30, 90), g: -20, life: rand(0.8, 1.4), max: 1.4, size: rand(16, 30), col: 'rgba(80,70,70,', type: 'smoke' });
    if (kind === 'tomato') this.zones.push({ x, y, r: radius * 0.8, t: 0, life: 1.8, dps: 0, owner, kind: 'splat', seed: rand(0, 6) });
    for (const p of this.players) {
      if (p === owner || !p.alive || p.jump) continue;
      if (Math.hypot(p.x - x, p.y - y) < radius + PR * 0.6) this.hitTarget(p, dmg, owner, gaz, x, y);
    }
  }
  hitTarget(p, dmg, owner, gaz, fx, fy) {
    if (this.isAuth(p)) this.damage(p, dmg, owner, gaz);
    else { // tahmini vuruş görseli (karşı taraf asıl hasarı kendisi hesaplar)
      p.flash = 0.12; this.dmgNum(p.x, p.y - 70, dmg, '#fff'); sfx('hit', 0.9); this.sparks(p.x, p.y - 30, owner.c.color, 8);
      if (this.mode === 'bot') this.addGaz(owner, gaz);
    }
  }
  damage(p, dmg, owner, gaz) {
    if (!p.alive || this.phase !== 'play') return;
    p.hp -= dmg; p.lastHurt = this.t; p.flash = 0.12;
    this.dmgNum(p.x, p.y - 70, dmg, p === this.me ? '#ff6b6b' : '#fff');
    this.sparks(p.x, p.y - 30, p === this.me ? '#ff4d4d' : owner ? owner.c.color : '#b7e36b', 9);
    if (p === this.me) { sfx('hurt'); this.shake = Math.max(this.shake, 4); this.hurtFx = 0.35; }
    else sfx('hit');
    if (owner) {
      if (this.mode === 'bot' || owner === this.me) this.addGaz(owner, gaz);
      else if (this.net && gaz > 0) this.net.send('dmg', { g: +gaz.toFixed(3) });
    }
    if (p.hp <= 0) { p.hp = 0; this.kill(p); }
  }
  kill(p) {
    if (!p.alive) return;
    p.alive = false; p.jump = null;
    sfx('ko'); this.shake = 14;
    this.ring(p.x, p.y - 20, '#fff', 110, 0.5); this.ring(p.x, p.y - 20, p.c.color, 160, 0.7);
    for (let i = 0; i < 40; i++) {
      const a = rand(0, TAU), s = rand(100, 480);
      this.parts.push({ x: p.x, y: p.y, z: 30, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7, vz: rand(200, 500), g: 1000, life: rand(0.6, 1.2), max: 1.2, size: rand(4, 10), col: i % 2 ? p.c.color : '#fff', type: 'chunk' });
    }
    this.popText(p.x, p.y - 100, 'NAKAVT!', '#fff', true);
    if (p === this.me) {
      if (this.net) this.net.send('dead', { r: this.round });
      if (this.host) this.decideRound(this.op.side);
    } else if (this.mode === 'bot') this.decideRound(this.me.side);
  }
  decideRound(w) {
    if (this.phase === 'roundEnd' || this.ended) return;
    this.scores[w]++;
    if (this.net) this.net.send('round', { r: this.round, w, s: this.scores });
    this.applyRound(w);
  }
  applyRound(w) {
    this.phase = 'roundEnd';
    const iWon = w === this.me.side;
    const done = this.scores[w] >= WIN_ROUNDS;
    this.banner = { txt: iWon ? 'RAUNDU KAZANDIN' : 'RAUNDU KAYBETTİN', sub: `${this.scores[this.me.side]} - ${this.scores[this.op.side]}`, t: 0, dur: 2.6, col: iWon ? '#7ee081' : '#ff6b6b' };
    this.timers.push({ at: this.t + 3, fn: () => { if (done) this.endMatch(iWon, false); else this.startRound(this.round + 1); } });
  }
  endMatch(won, forfeit) {
    if (this.ended) return; this.ended = true; this.phase = 'over';
    music(null); sfx(won ? 'win' : 'lose');
    this.o.onEnd && this.o.onEnd({ won, forfeit, scores: [this.scores[this.me.side], this.scores[this.op.side]], opp: this.op.name, char: this.me.char });
  }

  // ---------- efekt yardımcıları ----------
  dmgNum(x, y, v, col) { this.nums.push({ x: x + rand(-14, 14), y, txt: Math.round(v).toString(), col, t: 0, life: 0.9, big: v >= 1000 }); }
  popText(x, y, txt, col, big) { this.nums.push({ x, y, txt, col, t: 0, life: 1.3, big: true, text: true }); }
  ring(x, y, col, r, life) { this.parts.push({ x, y, z: 0, vx: 0, vy: 0, vz: 0, g: 0, life, max: life, size: r, col, type: 'ring' }); }
  sparks(x, y, col, n) { for (let i = 0; i < n; i++) { const a = rand(0, TAU), s = rand(120, 320); this.parts.push({ x, y, z: 0, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 0, g: 0, life: rand(0.2, 0.4), max: 0.4, size: rand(2, 4), col, type: 'spark' }); } }
  muzzle(x, y, a, col) { for (let i = 0; i < 6; i++) { const aa = a + rand(-0.5, 0.5), s = rand(80, 260); this.parts.push({ x, y, z: 0, vx: Math.cos(aa) * s, vy: Math.sin(aa) * s, vz: 0, g: 0, life: 0.18, max: 0.18, size: rand(3, 5), col: i % 2 ? '#fff' : col, type: 'dot' }); } }

  // ---------- güncelleme ----------
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr; this.W = innerWidth; this.H = innerHeight;
    this.cv.width = Math.round(this.W * dpr); this.cv.height = Math.round(this.H * dpr);
    this.zoom = Math.min(this.W / (15.5 * T), this.H / (8.8 * T));
    this.input.layout(this.W, this.H);
  }
  screenToWorld(sx, sy) { return { x: (sx - this.W / 2) / this.zoom + this.cam.x, y: (sy - this.H / 2) / this.zoom + this.cam.y }; }
  autoAim(p, kind) {
    const e = this.enemyOf(p);
    if (e.alive && this.visibleTo(p, e)) {
      const spec = kind === 'sup' ? p.c.super : p.c.attack;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      const lead = spec.speed ? d / spec.speed : spec.dur || 0;
      const vx = (e.x - (e.px ?? e.x)) / Math.max(this.dt, 0.001), vy = (e.y - (e.py ?? e.y)) / Math.max(this.dt, 0.001);
      const ex = e.x + clamp(vx, -400, 400) * lead * 0.6, ey = e.y + clamp(vy, -400, 400) * lead * 0.6;
      return { a: Math.atan2(ey - p.y, ex - p.x), d: Math.hypot(ex - p.x, ey - p.y) };
    }
    return { a: p.aim, d: null };
  }
  update(dt) {
    this.dt = dt; this.t += dt;
    for (const p of this.players) { p.px = p.x; p.py = p.y; }
    const me = this.me, inp = this.input;
    const evs = inp.poll();
    inp.superReady = me.gaz >= 1 && this.phase === 'play';
    // zamanlayıcılar
    for (let i = this.timers.length - 1; i >= 0; i--) if (this.t >= this.timers[i].at) { const f = this.timers[i].fn; this.timers.splice(i, 1); f(); }
    if (this.phase === 'count') {
      this.countT -= dt; const c = Math.ceil(this.countT - 0.2);
      if (c < this.lastCount && c >= 1) { sfx('count'); this.lastCount = c; }
      if (this.countT <= 0.2) { this.phase = 'play'; sfx('go'); this.banner = { txt: 'BAŞLA!', t: 0, dur: 0.8, col: '#fff' }; }
    }
    const canAct = this.phase === 'play';
    // benim hareketim
    if (me.alive && canAct && !me.jump) {
      const mx = inp.move.x, my = inp.move.y, m = Math.hypot(mx, my);
      me.moving = m > 0.1;
      if (me.moving) { me.x += mx * me.c.speed * dt; me.y += my * me.c.speed * dt; this.collide(me); if (!inp.atk) me.aim = Math.atan2(my, mx); }
      for (const e of evs) {
        let ang, dist;
        if (e.mouse) { const w = this.screenToWorld(e.sx, e.sy); ang = Math.atan2(w.y - me.y, w.x - me.x); dist = Math.hypot(w.x - me.x, w.y - me.y); }
        else if (e.auto) { const a = this.autoAim(me, e.kind); ang = a.a; dist = a.d; }
        else { ang = Math.atan2(e.dy, e.dx); const spec = e.kind === 'sup' ? me.c.super : me.c.attack; dist = Math.max(0.2, e.mag) * (spec.range || 400); }
        this.tryFire(me, e.kind, ang, dist);
      }
      if (inp.atk) { const v = inp.aimVec(); if (v && v.d > 14) me.aim = Math.atan2(v.dy, v.dx); }
    } else me.moving = false;
    // rakip
    if (this.bot) { if (canAct && this.op.alive) this.bot.update(dt); else this.op.moving = false; }
    else if (!this.op.jump) { const k = Math.min(1, dt * 14); this.op.x = lerp(this.op.x, this.op.tx, k); this.op.y = lerp(this.op.y, this.op.ty, k); }
    // ortak oyuncu güncellemesi
    for (const p of this.players) {
      p.flash = Math.max(0, p.flash - dt);
      if (p.moving) { p.walk += dt * 13; p.stepT += dt; if (p.stepT > 0.16) { p.stepT = 0; this.parts.push({ x: p.x + rand(-8, 8), y: p.y, z: 0, vx: rand(-20, 20), vy: rand(-10, 0), vz: 0, g: 0, life: 0.4, max: 0.4, size: rand(4, 7), col: 'rgba(150,120,80,', type: 'smoke' }); } }
      if (!p.alive) continue;
      p.inBush = this.tile(p.x, p.y) === 2;
      if (this.isAuth(p)) {
        if (p.ammo < MAX_AMMO) p.ammo = Math.min(MAX_AMMO, p.ammo + dt / p.c.reload);
        if (canAct && this.t - p.lastHurt > 3 && this.t - p.lastAtk > 3 && p.hp < p.maxhp) {
          p.hp = Math.min(p.maxhp, p.hp + p.maxhp * 0.13 * dt);
          if (Math.random() < dt * 6) this.parts.push({ x: p.x + rand(-16, 16), y: p.y - rand(10, 50), z: 0, vx: 0, vy: -40, vz: 0, g: 0, life: 0.6, max: 0.6, size: 4, col: '#7ee081', type: 'plus' });
        }
      }
      if (p.jump) {
        const j = p.jump; j.t += dt; const k = Math.min(1, j.t / j.dur);
        p.x = lerp(j.sx, j.tx, k); p.y = lerp(j.sy, j.ty, k); p.z = Math.sin(k * Math.PI) * 140;
        if (k >= 1) {
          p.jump = null; p.z = 0; if (this.isAuth(p)) this.collide(p);
          this.blast(p.x, p.y, j.radius, j.dmg, p, 0, 'ground');
        }
      } else p.z = 0;
      if (p === me && p.gaz >= 1 && Math.random() < dt * 10) this.parts.push({ x: p.x + rand(-20, 20), y: p.y, z: 0, vx: 0, vy: 0, vz: rand(40, 90), g: 0, life: 0.5, max: 0.5, size: rand(2, 4), col: '#ffe066', type: 'dot' });
    }
    // mermiler
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const pr = this.projs[i]; let dead = false;
      if (pr.lob) {
        pr.t += dt; if (pr.t < 0) continue;
        const k = Math.min(1, pr.t / pr.dur);
        pr.x = lerp(pr.sx, pr.tx, k); pr.y = lerp(pr.sy, pr.ty, k); pr.z = Math.sin(k * Math.PI) * pr.h; pr.rot += dt * 10;
        if (k >= 1) {
          dead = true;
          this.blast(pr.tx, pr.ty, pr.radius, pr.dmg, pr.owner, pr.gaz, pr.kind);
          if (pr.burn) this.zones.push({ x: pr.tx, y: pr.ty, r: pr.radius * 0.85, t: 0, life: pr.burn.time, dps: pr.burn.dps, owner: pr.owner, kind: 'burn', tick: 0, seed: rand(0, 6) });
        }
      } else {
        const ox = pr.x, oy = pr.y;
        pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.dist += pr.sp * dt; pr.rot += dt * (pr.kind === 'simit' ? 16 : 9);
        pr.trail.push(pr.x, pr.y); if (pr.trail.length > 12) pr.trail.splice(0, 2);
        if (this.isWall(pr.x, pr.y)) {
          if (pr.bounces > 0) {
            pr.bounces--; sfx('bounce', 0.7);
            const hx = this.isWall(pr.x, oy), hy = this.isWall(ox, pr.y);
            if (hx) pr.vx *= -1; if (hy) pr.vy *= -1; if (!hx && !hy) { pr.vx *= -1; pr.vy *= -1; }
            pr.x = ox; pr.y = oy; this.sparks(ox, oy, '#fff3c4', 5);
          } else { dead = true; this.sparks(ox, oy, pr.kind === 'tea' ? '#ffb38a' : '#e9a456', 7); }
        }
        if (!dead && pr.dist >= pr.range) { dead = true; this.sparks(pr.x, pr.y, 'rgba(255,255,255,.7)', 3); }
        if (!dead) for (const p of this.players) {
          if (p === pr.owner || !p.alive || p.jump) continue;
          if (Math.hypot(p.x - pr.x, p.y - pr.y) < PR + pr.r) { this.hitTarget(p, pr.dmg, pr.owner, pr.gaz, pr.x, pr.y); dead = true; break; }
        }
      }
      if (dead) this.projs.splice(i, 1);
    }
    // yanan alanlar
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i]; z.t += dt;
      if (z.dps && canAct) {
        z.tick += dt;
        if (z.tick >= 0.4) {
          z.tick = 0;
          for (const p of this.players) if (p !== z.owner && p.alive && !p.jump && this.isAuth(p) && Math.hypot(p.x - z.x, p.y - z.y) < z.r) this.damage(p, z.dps * 0.4, z.owner, 0.03);
        }
        if (Math.random() < dt * 20) this.parts.push({ x: z.x + rand(-z.r, z.r) * 0.7, y: z.y + rand(-z.r, z.r) * 0.5, z: 0, vx: 0, vy: 0, vz: rand(60, 140), g: 0, life: 0.5, max: 0.5, size: rand(4, 8), col: Math.random() < .5 ? '#ff9a2e' : '#ffe066', type: 'dot' });
      }
      if (z.t >= z.life) this.zones.splice(i, 1);
    }
    // toz bulutu (alan daralır)
    if (canAct) {
      this.rt += dt;
      if (this.rt > TOZ_START) {
        if (!this.tozWarned) { this.tozWarned = true; sfx('toz'); this.banner = { txt: 'TOZ BULUTU GELİYOR!', sub: 'Ortaya koş', t: 0, dur: 1.8, col: '#b7e36b' }; }
        this.tozDmgT += dt;
        if (this.tozDmgT > 0.5) {
          this.tozDmgT = 0;
          const tr = this.tozR(), cx = this.MW / 2, cy = this.MH / 2;
          for (const p of this.players) if (p.alive && this.isAuth(p) && Math.hypot(p.x - cx, p.y - cy) > tr) this.damage(p, 350 + (this.rt - TOZ_START) * 18, null, 0);
        }
      }
      if (this.rt >= ROUND_TIME && this.host) {
        const a = this.me.hp / this.me.maxhp, b = this.op.hp / this.op.maxhp;
        this.decideRound(a >= b ? this.me.side : this.op.side);
      }
    }
    // ağ
    if (this.net) {
      this.netT += dt;
      if (this.netT >= 1 / 12) { this.netT = 0; this.sendState(); }
      if (!this.ended && performance.now() - this.lastRecv > 8000) this.forfeit();
    }
    // parçacıklar
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i]; q.life -= dt; if (q.life <= 0) { this.parts.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.type === 'chunk') { q.vz -= q.g * dt; q.z += q.vz * dt; if (q.z < 0) { q.z = 0; q.vz *= -0.4; q.vx *= 0.6; q.vy *= 0.6; } }
      else { q.z += q.vz * dt; q.vx *= 0.92; q.vy *= 0.92; }
    }
    for (let i = this.nums.length - 1; i >= 0; i--) { const n = this.nums[i]; n.t += dt; if (n.t >= n.life) this.nums.splice(i, 1); }
    if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.dur) this.banner = null; }
    this.shake = Math.max(0, this.shake - dt * 40);
    this.hurtFx = Math.max(0, (this.hurtFx || 0) - dt);
    // kamera
    const tx = clamp(me.x, this.W / 2 / this.zoom - T, this.MW - this.W / 2 / this.zoom + T);
    const ty = clamp(me.y - 45, this.H / 2 / this.zoom - T * 2.4, this.MH - this.H / 2 / this.zoom + T);
    const k = Math.min(1, dt * 7); this.cam.x = lerp(this.cam.x, tx, k); this.cam.y = lerp(this.cam.y, ty, k);
  }
  tozR() {
    const max = Math.hypot(this.MW, this.MH) / 2 + 40, min = T * 2.6;
    const k = clamp((this.rt - TOZ_START) / (ROUND_TIME - 8 - TOZ_START), 0, 1);
    return lerp(max, min, k);
  }

  // ---------- çizim ----------
  buildFloor() {
    const th = this.map.theme, sc = 1.5;
    const c = document.createElement('canvas'); c.width = this.MW * sc; c.height = this.MH * sc;
    const x = c.getContext('2d'); x.scale(sc, sc);
    if (IMG.floor) {
      const pat = x.createPattern(IMG.floor, 'repeat'); const ps = (T * 4) / IMG.floor.width;
      pat.setTransform(new DOMMatrix().scale(ps)); x.fillStyle = pat; x.fillRect(0, 0, this.MW, this.MH);
      const eg = (x0, y0, x1, y1) => { const g = x.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(40,18,4,.45)'); g.addColorStop(1, 'rgba(40,18,4,0)'); return g; };
      x.fillStyle = eg(0, 0, 0, 60); x.fillRect(0, 0, this.MW, 60); x.fillStyle = eg(0, this.MH, 0, this.MH - 60); x.fillRect(0, this.MH - 60, this.MW, 60);
      x.fillStyle = eg(0, 0, 60, 0); x.fillRect(0, 0, 60, this.MH); x.fillStyle = eg(this.MW, 0, this.MW - 60, 0); x.fillRect(this.MW - 60, 0, 60, this.MH);
    }
    else for (let r = 0; r < this.R; r++) for (let cc = 0; cc < this.C; cc++) {
      const px = cc * T, py = r * T;
      x.fillStyle = (r + cc) % 2 ? th.floorA : th.floorB; x.fillRect(px, py, T, T);
      x.strokeStyle = th.grout; x.lineWidth = 2; x.strokeRect(px + 1, py + 1, T - 2, T - 2);
      const h = hash(r * 7, cc * 3);
      if (h < 0.12) { // çini yıldız motifi
        x.save(); x.translate(px + T / 2, py + T / 2);
        x.fillStyle = '#2a6fb0'; x.beginPath();
        for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, rr2 = i % 2 ? 9 : 20; x.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); }
        x.closePath(); x.fill(); x.fillStyle = '#f2e6c9'; circ(x, 0, 0, 6); x.fill(); x.fillStyle = '#c0392b'; circ(x, 0, 0, 3); x.fill();
        x.restore();
      } else if (h < 0.3) { x.fillStyle = 'rgba(80,50,20,.08)'; circ(x, px + T * hash(cc, r), py + T * hash(r, cc), 6 + h * 20); x.fill(); }
    }
    // duvar dibi gölgeleri
    for (const w of this.walls) { x.fillStyle = 'rgba(30,10,0,.28)'; ell(x, w.c * T + T / 2 + 6, w.r * T + T * 0.72, T * 0.68, T * 0.42); x.fill(); }
    for (const b of this.bushes) { x.fillStyle = 'rgba(30,10,0,.18)'; ell(x, b.c * T + T / 2, b.r * T + T * 0.7, T * 0.62, T * 0.36); x.fill(); }
    this.floor = c; this.floorSc = sc;
  }
  draw() {
    const ctx = this.ctx, th = this.map.theme, z = this.zoom, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = th.bg; ctx.fillRect(0, 0, this.W, this.H);
    const sx = this.shake ? rand(-this.shake, this.shake) : 0, sy = this.shake ? rand(-this.shake, this.shake) : 0;
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (this.W / 2 - this.cam.x * z + sx), dpr * (this.H / 2 - this.cam.y * z + sy));
    // dış duvar
    ctx.fillStyle = '#1e1009'; ctx.fillRect(-T * 6, -T * 6, this.MW + T * 12, this.MH + T * 12);
    rr(ctx, -T * 0.45, -T * 0.45, this.MW + T * 0.9, this.MH + T * 0.9, 18); ctx.fillStyle = '#6e3b1f'; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = '#3c1e0e'; ctx.stroke();
    ctx.fillStyle = '#e8b04a'; for (let i = 0; i < this.MW; i += T) { circ(ctx, i + T / 2, -T * 0.22, 5); ctx.fill(); circ(ctx, i + T / 2, this.MH + T * 0.22, 5); ctx.fill(); }
    for (let i = 0; i < this.MH; i += T) { circ(ctx, -T * 0.22, i + T / 2, 5); ctx.fill(); circ(ctx, this.MW + T * 0.22, i + T / 2, 5); ctx.fill(); }
    ctx.drawImage(this.floor, 0, 0, this.MW, this.MH);
    ctx.fillStyle = 'rgba(70,35,10,.12)'; ctx.fillRect(0, 0, this.MW, this.MH);
    // zeminde lekeler / yanan alanlar
    for (const zn of this.zones) {
      const a = Math.min(1, (zn.life - zn.t) * 2);
      if (zn.kind === 'splat') { ctx.fillStyle = `rgba(200,30,30,${0.45 * a})`; for (let i = 0; i < 6; i++) { const aa = zn.seed + i; circ(ctx, zn.x + Math.cos(aa) * zn.r * 0.5, zn.y + Math.sin(aa) * zn.r * 0.35, zn.r * (0.3 + 0.1 * (i % 3))); ctx.fill(); } }
      else { const g = ctx.createRadialGradient(zn.x, zn.y, 4, zn.x, zn.y, zn.r); g.addColorStop(0, `rgba(255,200,60,${0.7 * a})`); g.addColorStop(0.6, `rgba(255,100,20,${0.45 * a})`); g.addColorStop(1, 'rgba(255,60,0,0)'); ctx.fillStyle = g; ell(ctx, zn.x, zn.y, zn.r, zn.r * 0.75); ctx.fill(); }
    }
    // nişan göstergesi
    this.drawAim(ctx);
    // gölgeler
    for (const p of this.players) if (p.alive && (p === this.me || this.visibleTo(this.me, p))) drawShadow(ctx, p.x, p.y, (1 - (p.z || 0) / 300) * 1.05);
    for (const pr of this.projs) if (pr.lob && pr.t >= 0) { ctx.fillStyle = 'rgba(20,8,30,.3)'; ell(ctx, pr.x, pr.y, 12, 5); ctx.fill();
      ctx.strokeStyle = 'rgba(255,80,80,.5)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); circ(ctx, pr.tx, pr.ty, pr.radius); ctx.stroke(); ctx.setLineDash([]); }
    // derinlik sıralı çizim
    const list = [];
    for (const w of this.walls) list.push({ y: w.r * T + T, f: () => this.drawWall(ctx, w) });
    for (const p of this.players) if (p.alive) list.push({ y: p.y, f: () => this.drawPlayer(ctx, p) });
    list.sort((a, b) => a.y - b.y); for (const it of list) it.f();
    // mermiler
    for (const pr of this.projs) this.drawProj(ctx, pr);
    // çalılar (halı yığınları)
    for (const b of this.bushes) this.drawBush(ctx, b);
    // parçacıklar
    for (const q of this.parts) this.drawPart(ctx, q);
    // toz
    if (this.rt > TOZ_START - 0.01) this.drawToz(ctx);
    // isim ve can barları
    for (const p of this.players) if (p.alive && (p === this.me || this.visibleTo(this.me, p))) this.drawBars(ctx, p);
    // hasar sayıları
    for (const n of this.nums) this.drawNum(ctx, n);
    // ekran arayüzü
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.hurtFx > 0) { const g = ctx.createRadialGradient(this.W / 2, this.H / 2, this.H * 0.3, this.W / 2, this.H / 2, this.H * 0.9); g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(255,0,0,${this.hurtFx})`); ctx.fillStyle = g; ctx.fillRect(0, 0, this.W, this.H); }
    this.drawHUD(ctx);
  }
  drawWall(ctx, w) {
    const th = this.map.theme, x = w.c * T, y = w.r * T;
    const wimg = IMG[w.img];
    if (wimg) { const W2 = T * 1.34, H2 = W2 * wimg.height / wimg.width; ctx.drawImage(wimg, x + T / 2 - W2 / 2, y + T + 8 - H2, W2, H2); return; }
    const below = this.g[w.r + 1] && this.g[w.r + 1][w.c] === 1;
    // ön yüz
    if (!below) {
      ctx.fillStyle = th.wallFace; ctx.fillRect(x, y + T - WH, T, WH);
      ctx.fillStyle = 'rgba(0,0,0,.18)'; for (let i = 1; i < 4; i++) ctx.fillRect(x + i * T / 4, y + T - WH, 2, WH);
      ctx.strokeStyle = th.wallEdge; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + T - WH, T - 3, WH - 1.5);
    }
    // üst yüz
    const ty = y - WH;
    ctx.fillStyle = th.wallTop; ctx.fillRect(x, ty, T, T);
    ctx.strokeStyle = th.wallEdge; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, ty + 1.5, T - 3, T - 3);
    const cx = x + T / 2, cy = ty + T / 2, k = w.kind;
    if (k === 0) { // baharat kâseleri
      const cols = ['#d1342b', '#f2b134', '#8a4b1f', '#e86f1f'];
      for (let i = 0; i < 4; i++) { const bx = x + 15 + (i % 2) * 30, by = ty + 16 + Math.floor(i / 2) * 28;
        ell(ctx, bx, by + 4, 13, 7); fs(ctx, '#6b3b1b', 2); ctx.beginPath(); ctx.ellipse(bx, by, 11, 9, 0, Math.PI, 0); fs(ctx, cols[(i + w.r) % 4], 2); }
    } else if (k === 1) { // renkli lambalar
      const cols = ['#e63946', '#2a9d8f', '#e9c46a', '#8e44ad', '#1d7fbf'];
      for (let i = 0; i < 5; i++) { const a = i * 1.256 + w.c, lx = cx + Math.cos(a) * 14, ly = cy + Math.sin(a) * 12;
        circ(ctx, lx, ly, 9); fs(ctx, grad(ctx, lx, ly, 9, '#fff', cols[(i + w.c) % 5]), 2); }
      circ(ctx, cx, cy, 7); fs(ctx, grad(ctx, cx, cy, 7, '#fff', '#f4a261'), 2);
    } else if (k === 2) { // kilim
      rr(ctx, x + 6, ty + 6, T - 12, T - 12, 4); fs(ctx, '#b8322f', 2.4);
      ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.moveTo(cx, ty + 12); ctx.lineTo(x + T - 13, cy); ctx.lineTo(cx, ty + T - 12); ctx.lineTo(x + 13, cy); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1f3b73'; ctx.beginPath(); ctx.moveTo(cx, ty + 20); ctx.lineTo(x + T - 21, cy); ctx.lineTo(cx, ty + T - 20); ctx.lineTo(x + 21, cy); ctx.closePath(); ctx.fill();
    } else { // çuvallar
      for (const [dx, dy, s] of [[-12, -8, 1], [12, -6, 0.95], [0, 10, 1.05]]) { ell(ctx, cx + dx, cy + dy, 14 * s, 12 * s); fs(ctx, grad(ctx, cx + dx, cy + dy, 14, '#e9d6a8', '#a8865a'), 2.2);
        ctx.strokeStyle = OUT; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(cx + dx - 5, cy + dy - 9 * s); ctx.lineTo(cx + dx + 5, cy + dy - 9 * s); ctx.stroke(); }
    }
    // tente (sadece önü açık olanlar)
    if (!below) {
      const cols = th.awnings, col = cols[(w.c + w.r) % cols.length];
      for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? '#fff6e0' : col; ctx.beginPath(); const ax = x + i * T / 5;
        ctx.moveTo(ax, y + T - WH - 6); ctx.lineTo(ax + T / 5, y + T - WH - 6); ctx.lineTo(ax + T / 5, y + T - WH + 4); ctx.quadraticCurveTo(ax + T / 10, y + T - WH + 12, ax, y + T - WH + 4); ctx.closePath(); ctx.fill(); }
      ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y + T - WH - 6); ctx.lineTo(x + T, y + T - WH - 6); ctx.stroke();
    }
  }
  drawBush(ctx, b) {
    const th = this.map.theme, x = b.c * T, y = b.r * T;
    const me = this.me;
    const near = me.alive && Math.abs(me.x - (x + T / 2)) < T * 1.4 && Math.abs(me.y - (y + T / 2)) < T * 1.4 && me.inBush;
    ctx.save(); ctx.globalAlpha = near ? 0.45 : 1;
    const sway = Math.sin(this.t * 1.5 + b.v * 6) * 1.5;
    const bimg = IMG.bush_carpet;
    if (bimg) { const W2 = T * 1.36, H2 = W2 * bimg.height / bimg.width, fl = b.v > 0.5 ? -1 : 1;
      ctx.translate(x + T / 2, y + T + 4); ctx.scale(fl * (1 + sway * 0.006), 1 - sway * 0.006); ctx.drawImage(bimg, -W2 / 2, -H2, W2, H2); ctx.restore(); return; }
    // asılı / yığılı halılar
    const cols = [[th.bushA, th.bushPattern], ['#1f3b73', '#f2c14e'], ['#2f7d4f', '#f6e7c1'], ['#7d1f2a', '#e9a726']];
    for (let i = 0; i < 3; i++) {
      const [ca, cb] = cols[(Math.floor(b.v * 10) + i) % cols.length];
      const rx = x - 4 + i * 3, ry = y - 14 + i * 14 + sway * (i === 0 ? 1 : 0.4);
      rr(ctx, rx, ry, T + 8 - i * 6, 26, 6); fs(ctx, ca, 2.4);
      ctx.fillStyle = cb; for (let j = 0; j < 4; j++) { const px = rx + 9 + j * 13, py = ry + 13; ctx.beginPath(); ctx.moveTo(px, py - 7); ctx.lineTo(px + 5, py); ctx.lineTo(px, py + 7); ctx.lineTo(px - 5, py); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(rx + 4, ry + 3, T - 4 - i * 6, 4);
    }
    ctx.restore();
  }
  drawPlayer(ctx, p) {
    const me = this.me;
    const vis = p === me || this.visibleTo(me, p);
    if (!vis) return;
    ctx.save();
    if (p.inBush) ctx.globalAlpha = 0.6;
    // takım halkası
    ctx.lineWidth = 3; ctx.strokeStyle = p === me ? 'rgba(80,170,255,.9)' : 'rgba(255,70,70,.9)';
    ell(ctx, p.x, p.y, 26, 11); ctx.stroke();
    if (p.gaz >= 1) { ctx.strokeStyle = `rgba(255,224,102,${0.5 + 0.5 * Math.sin(this.t * 8)})`; ctx.lineWidth = 4; ell(ctx, p.x, p.y, 32, 14); ctx.stroke(); }
    const yy = p.y - (p.z || 0);
    const img = IMG['ch_' + p.char];
    if (!img) {
      drawChar(ctx, p.char, p.x, yy, { aim: p.aim, walk: p.walk, moving: p.moving, s: CS, t: this.t });
      if (p.flash > 0) { ctx.globalAlpha = p.flash / 0.12 * 0.7; ctx.fillStyle = '#fff'; circ(ctx, p.x, yy - 46 * CS, 22); ctx.fill(); ell(ctx, p.x, yy - 22 * CS, 16, 18); ctx.fill(); }
    } else {
      const H = SPR_H[p.char] || 110, W = H * img.width / img.height;
      const flip = Math.cos(p.aim) < 0 ? -1 : 1;
      let sx = 1, sy = 1, rot = 0, by = 0;
      if (p.moving) { const w = p.walk; by = -Math.abs(Math.sin(w)) * 7; sy = 1 + Math.sin(w * 2) * 0.04; sx = 2 - sy; rot = Math.sin(w) * 0.06; }
      else { sy = 1 + Math.sin(this.t * 3 + p.side) * 0.02; sx = 2 - sy; }
      const ak = clamp(1 - (this.t - (p.atkT ?? -9)) / 0.2, 0, 1);
      let lx = 0;
      if (ak > 0) { sx *= 1 + ak * 0.1; sy *= 1 - ak * 0.07; lx = Math.cos(p.aim) * ak * 7; }
      if (p.jump) { sy *= 1.1; sx *= 0.92; rot += Math.sin(p.jump.t / p.jump.dur * Math.PI * 2) * 0.3 * flip; }
      ctx.translate(p.x + lx, yy + by); ctx.rotate(rot); ctx.scale(flip * sx, sy);
      ctx.drawImage(img, -W / 2, -H, W, H);
      if (p.flash > 0) { ctx.globalAlpha = (p.inBush ? 0.6 : 1) * Math.min(1, p.flash / 0.12) * 0.85; ctx.drawImage(whiteOf(img), -W / 2, -H, W, H); }
    }
    ctx.restore();
  }
  drawBars(ctx, p) {
    const x = p.x, y = p.y - (p.z || 0) - (IMG['ch_' + p.char] ? (SPR_H[p.char] || 110) + 16 : 92);
    const w = 72, h = 12, k = clamp(p.hp / p.maxhp, 0, 1);
    ctx.font = '800 13px "Lilita One", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3.5; ctx.strokeStyle = OUT;
    ctx.strokeText(p.name, x, y - 7); ctx.fillStyle = p === this.me ? '#bfe3ff' : '#ffc2c2'; ctx.fillText(p.name, x, y - 7);
    rr(ctx, x - w / 2, y, w, h, 5); ctx.fillStyle = OUT; ctx.fill();
    rr(ctx, x - w / 2 + 2, y + 2, (w - 4) * k, h - 4, 3); ctx.fillStyle = p === this.me ? '#4cd964' : '#ff4d4d'; ctx.fill();
    ctx.font = '800 10px system-ui, sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(Math.ceil(p.hp), x, y + 9.5);
    if (p === this.me) {
      for (let i = 0; i < MAX_AMMO; i++) {
        const sx = x - w / 2 + i * (w / 3) + 1, fill = clamp(p.ammo - i, 0, 1);
        rr(ctx, sx, y + h + 3, w / 3 - 2, 6, 2); ctx.fillStyle = OUT; ctx.fill();
        if (fill > 0) { rr(ctx, sx + 1, y + h + 4, (w / 3 - 4) * fill, 4, 1.5); ctx.fillStyle = fill >= 1 ? '#ff9f1c' : '#b36b12'; ctx.fill(); }
      }
    }
  }
  drawProj(ctx, pr) {
    if (pr.lob) {
      if (pr.t < 0) return;
      const y = pr.y - pr.z - 10;
      const pi = PROJ_IMG[pr.kind] && IMG[PROJ_IMG[pr.kind][0]];
      if (pi) drawImgC(ctx, pi, pr.x, y, PROJ_IMG[pr.kind][1] * (1 + pr.z / 400), pr.kind === 'semaver' ? Math.sin(pr.rot) * 0.4 : pr.rot);
      else if (pr.kind === 'semaver') drawSemaver(ctx, pr.x, y, 1.1, pr.rot * 0.4); else drawTomato(ctx, pr.x, y, 12, pr.rot);
      return;
    }
    const tr = pr.trail;
    if (tr.length > 3) {
      ctx.lineCap = 'round';
      for (let i = 2; i < tr.length; i += 2) {
        const k = i / tr.length; ctx.strokeStyle = pr.kind === 'tea' ? `rgba(255,255,255,${k * 0.35})` : pr.kind === 'swing' ? `rgba(255,255,255,${k * 0.6})` : `rgba(255,220,150,${k * 0.4})`;
        ctx.lineWidth = (pr.kind === 'swing' ? 18 : 8) * k; ctx.beginPath(); ctx.moveTo(tr[i - 2], tr[i - 1] - 22); ctx.lineTo(tr[i], tr[i + 1] - 22); ctx.stroke();
      }
    }
    const y = pr.y - 22;
    const pim = PROJ_IMG[pr.kind] && IMG[PROJ_IMG[pr.kind][0]];
    if (pim) { drawImgC(ctx, pim, pr.x, y, PROJ_IMG[pr.kind][1], pr.rot); return; }
    if (pr.kind === 'tea') drawTeaGlass(ctx, pr.x, y, 1.1, pr.rot);
    else if (pr.kind === 'simit') drawSimit(ctx, pr.x, y, 13, pr.rot);
    else if (pr.kind === 'swing') { ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); const a = Math.atan2(pr.vy, pr.vx); ctx.arc(pr.x, y, pr.r, a - 1.1, a + 1.1); ctx.arc(pr.x - Math.cos(a) * 8, y - Math.sin(a) * 8, pr.r - 6, a + 1.1, a - 1.1, true); ctx.closePath(); ctx.fill(); }
  }
  drawPart(ctx, q) {
    const a = clamp(q.life / q.max, 0, 1), y = q.y - q.z;
    if (q.type === 'ring') { const k = 1 - a; ctx.strokeStyle = q.col; ctx.globalAlpha = a; ctx.lineWidth = 6 * a + 1; ell(ctx, q.x, q.y, q.size * (0.3 + k * 0.9), q.size * (0.3 + k * 0.9) * 0.6); ctx.stroke(); ctx.globalAlpha = 1; return; }
    if (q.type === 'smoke') { ctx.fillStyle = q.col + (0.35 * a) + ')'; circ(ctx, q.x, y, q.size * (1.4 - a * 0.4)); ctx.fill(); return; }
    if (q.type === 'plus') { ctx.globalAlpha = a; ctx.fillStyle = q.col; ctx.fillRect(q.x - 4, y - 1.5, 8, 3); ctx.fillRect(q.x - 1.5, y - 4, 3, 8); ctx.globalAlpha = 1; return; }
    ctx.globalAlpha = a; ctx.fillStyle = q.col;
    if (q.type === 'spark') { ctx.strokeStyle = q.col; ctx.lineWidth = q.size; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(q.x, y); ctx.lineTo(q.x - q.vx * 0.04, y - q.vy * 0.04); ctx.stroke(); }
    else if (q.type === 'chunk') { ctx.fillRect(q.x - q.size / 2, y - q.size / 2, q.size, q.size); }
    else { circ(ctx, q.x, y, q.size * a + 0.5); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  drawNum(ctx, n) {
    const k = n.t / n.life, pop = n.t < 0.12 ? 1 + (0.12 - n.t) * 5 : 1;
    const y = n.y - k * 40;
    ctx.save(); ctx.translate(n.x, y); ctx.scale(pop, pop); ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
    ctx.font = `900 ${n.text ? 22 : n.big ? 24 : 18}px "Lilita One", system-ui, sans-serif`; ctx.textAlign = 'center';
    ctx.lineWidth = 5; ctx.strokeStyle = OUT; ctx.strokeText(n.txt, 0, 0); ctx.fillStyle = n.col; ctx.fillText(n.txt, 0, 0);
    ctx.restore();
  }
  drawToz(ctx) {
    const r = this.tozR(), cx = this.MW / 2, cy = this.MH / 2;
    ctx.save(); ctx.beginPath(); ctx.rect(-T * 4, -T * 4, this.MW + T * 8, this.MH + T * 8); ctx.arc(cx, cy, r, 0, TAU, true);
    ctx.fillStyle = 'rgba(110,150,60,.45)'; ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(200,240,120,.8)'; ctx.lineWidth = 5; ctx.setLineDash([18, 12]); ctx.lineDashOffset = -this.t * 30; circ(ctx, cx, cy, r); ctx.stroke();
    ctx.restore();
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU + this.t * 0.2, rr2 = r + 30 + Math.sin(this.t * 2 + i) * 14;
      ctx.fillStyle = 'rgba(140,180,80,.35)'; circ(ctx, cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2, 34); ctx.fill(); }
  }
  drawAim(ctx) {
    const inp = this.input, me = this.me;
    if (!inp.atk || !me.alive || this.phase !== 'play') return;
    const v = inp.aimVec(); if (!v || v.d < 14) return;
    const isSup = inp.atk.kind === 'sup', spec = isSup ? me.c.super : me.c.attack;
    const a = Math.atan2(v.dy, v.dx), col = isSup ? 'rgba(255,224,102,' : 'rgba(255,255,255,';
    ctx.save(); ctx.translate(me.x, me.y);
    if (spec.type === 'lob' || spec.type === 'lobBlast' || spec.type === 'multiLob' || spec.type === 'jump') {
      const d = Math.max(0.2, v.mag) * spec.range, tx = Math.cos(a) * d, ty = Math.sin(a) * d;
      ctx.strokeStyle = col + '.5)'; ctx.lineWidth = 4; ctx.setLineDash([10, 10]);
      ctx.beginPath(); ctx.moveTo(0, -20); ctx.quadraticCurveTo(tx / 2, ty / 2 - 120, tx, ty); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = col + '.25)'; ctx.strokeStyle = col + '.8)'; ctx.lineWidth = 3; ell(ctx, tx, ty, spec.radius || 60, (spec.radius || 60) * 0.75); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = col + '.2)'; ctx.lineWidth = 2; circ(ctx, 0, 0, spec.range); ctx.stroke();
    } else if (spec.type === 'radial') {
      ctx.fillStyle = col + '.18)'; circ(ctx, 0, 0, spec.range); ctx.fill(); ctx.strokeStyle = col + '.6)'; ctx.lineWidth = 3; ctx.stroke();
    } else {
      ctx.rotate(a);
      const L = spec.range, sp = spec.count > 1 ? spec.spread / 2 + 0.04 : 0;
      ctx.fillStyle = col + '.22)'; ctx.strokeStyle = col + '.7)'; ctx.lineWidth = 3;
      if (sp > 0) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, L, -sp, sp); ctx.closePath(); }
      else rr(ctx, 0, -spec.r, L, spec.r * 2, spec.r);
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
  drawHUD(ctx) {
    const W = this.W, H = this.H, inp = this.input, me = this.me;
    const u = Math.min(W, H) / 400;
    // üst skor tablosu
    const pw = 150 * u, ph = 40 * u, top = 8 * u;
    const plate = (x, name, side, col, align) => {
      rr(ctx, x, top, pw, ph, 10 * u); ctx.fillStyle = 'rgba(20,10,35,.75)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke();
      ctx.font = `800 ${13 * u}px "Lilita One", system-ui, sans-serif`; ctx.textAlign = align; ctx.fillStyle = '#fff';
      const tx = align === 'left' ? x + 10 * u : x + pw - 10 * u; ctx.fillText(name, tx, top + 17 * u);
      for (let i = 0; i < WIN_ROUNDS; i++) {
        const sx = align === 'left' ? x + 16 * u + i * 20 * u : x + pw - 16 * u - i * 20 * u, sy = top + 29 * u;
        star(ctx, sx, sy, 7 * u, this.scores[side] > i ? '#ffe066' : 'rgba(255,255,255,.2)');
      }
    };
    plate(W / 2 - pw - 40 * u, me.name, me.side, '#4aa8ff', 'left');
    plate(W / 2 + 40 * u, this.op.name, this.op.side, '#ff5a5a', 'right');
    const left = Math.max(0, ROUND_TIME - this.rt);
    rr(ctx, W / 2 - 34 * u, top, 68 * u, ph, 10 * u); ctx.fillStyle = 'rgba(20,10,35,.85)'; ctx.fill();
    ctx.font = `900 ${18 * u}px "Lilita One", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = left < 15 ? '#ff6b6b' : '#fff';
    ctx.fillText(`${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`, W / 2, top + 27 * u);
    // geri sayım
    if (this.phase === 'count' && this.countT > 0.2) {
      const c = Math.ceil(this.countT - 0.2), f = (this.countT - 0.2) % 1;
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(1 + f * 0.6, 1 + f * 0.6);
      ctx.font = `900 ${90 * u}px "Lilita One", system-ui, sans-serif`; ctx.lineWidth = 10 * u; ctx.strokeStyle = OUT; ctx.textAlign = 'center';
      ctx.strokeText(c, 0, 30 * u); ctx.fillStyle = '#ffe066'; ctx.fillText(c, 0, 30 * u); ctx.restore();
    }
    // banner
    if (this.banner) {
      const b = this.banner, k = b.t / b.dur, s = b.t < 0.15 ? 0.6 + b.t / 0.15 * 0.4 : 1, al = k > 0.8 ? (1 - k) / 0.2 : 1;
      ctx.save(); ctx.globalAlpha = al; ctx.translate(W / 2, H * 0.3); ctx.scale(s, s);
      ctx.fillStyle = 'rgba(20,10,35,.6)'; ctx.fillRect(-W, -38 * u, W * 2, b.sub ? 76 * u : 56 * u);
      ctx.font = `900 ${34 * u}px "Lilita One", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 7 * u; ctx.strokeStyle = OUT;
      ctx.strokeText(b.txt, 0, 4 * u); ctx.fillStyle = b.col; ctx.fillText(b.txt, 0, 4 * u);
      if (b.sub) { ctx.font = `800 ${16 * u}px "Lilita One", system-ui, sans-serif`; ctx.fillStyle = '#fff'; ctx.fillText(b.sub, 0, 28 * u); }
      ctx.restore();
    }
    // hareket joystick'i
    const ms = inp.moveStick;
    if (ms) {
      ctx.fillStyle = 'rgba(255,255,255,.12)'; circ(ctx, ms.bx, ms.by, inp.moveR); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = 'rgba(80,170,255,.75)'; circ(ctx, ms.x, ms.y, inp.moveR * 0.45); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.stroke();
    } else if (this.t < 12) {
      ctx.fillStyle = 'rgba(255,255,255,.08)'; circ(ctx, 110 * u, H - 100 * u, inp.moveR); ctx.fill();
      ctx.font = `800 ${11 * u}px system-ui`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillText('YÜRÜ', 110 * u, H - 96 * u);
    }
    // saldırı butonu
    const ab = inp.atkBtn, ak = inp.atk && inp.atk.kind === 'atk';
    ctx.fillStyle = 'rgba(255,120,60,.25)'; circ(ctx, ab.x, ab.y, ab.r); ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,160,80,.8)'; ctx.stroke();
    const kp = ak ? inp.atk : null;
    const kx = kp ? ab.x + clamp(kp.x - ab.x, -ab.r, ab.r) : ab.x, ky = kp ? ab.y + clamp(kp.y - ab.y, -ab.r, ab.r) : ab.y;
    circ(ctx, kx, ky, ab.r * 0.5); fs(ctx, grad(ctx, kx, ky, ab.r * 0.5, '#ffb36b', '#e8562a'), 3);
    crosshair(ctx, kx, ky, ab.r * 0.24);
    // GAZ (süper) butonu
    const sb = inp.supBtn, full = me.gaz >= 1, sk = inp.atk && inp.atk.kind === 'sup';
    ctx.fillStyle = 'rgba(20,10,35,.55)'; circ(ctx, sb.x, sb.y, sb.r); ctx.fill();
    ctx.strokeStyle = full ? '#ffe066' : '#8a7a3a'; ctx.lineWidth = 6 * u;
    ctx.beginPath(); ctx.arc(sb.x, sb.y, sb.r - 3 * u, -Math.PI / 2, -Math.PI / 2 + TAU * me.gaz); ctx.stroke();
    const sx2 = sk ? sb.x + clamp(inp.atk.x - sb.x, -sb.r, sb.r) : sb.x, sy2 = sk ? sb.y + clamp(inp.atk.y - sb.y, -sb.r, sb.r) : sb.y;
    const pulse = full ? 1 + Math.sin(this.t * 8) * 0.06 : 1;
    if (IMG.ic_gaz) {
      if (full) { ctx.fillStyle = `rgba(255,224,102,${0.25 + 0.2 * Math.sin(this.t * 8)})`; circ(ctx, sx2, sy2, sb.r * 1.05); ctx.fill(); }
      else ctx.filter = 'grayscale(1) brightness(0.55)';
      const gs = sb.r * 1.35 * pulse; ctx.drawImage(IMG.ic_gaz, sx2 - gs / 2, sy2 - gs / 2, gs, gs); ctx.filter = 'none';
    } else {
      circ(ctx, sx2, sy2, sb.r * 0.62 * pulse); fs(ctx, full ? grad(ctx, sx2, sy2, sb.r * 0.6, '#fff6b0', '#f5b400') : '#5a5032', 3);
      bolt(ctx, sx2, sy2, sb.r * 0.32, full ? OUT : 'rgba(255,255,255,.35)');
    }
    ctx.font = `900 ${11 * u}px "Lilita One", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = OUT;
    const lbl = full ? 'GAZLA!' : 'GAZ %' + Math.floor(me.gaz * 100);
    ctx.strokeText(lbl, sb.x, sb.y + sb.r + 14 * u); ctx.fillStyle = full ? '#ffe066' : '#ccc'; ctx.fillText(lbl, sb.x, sb.y + sb.r + 14 * u);
  }
  frame(dt) { this.update(dt); this.draw(); }
}

function star(ctx, x, y, r, col) {
  ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr2 = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
  ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = OUT; ctx.stroke();
}
function crosshair(ctx, x, y, r) {
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; circ(ctx, x, y, r); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - r * 1.5, y); ctx.lineTo(x - r * 0.5, y); ctx.moveTo(x + r * 0.5, y); ctx.lineTo(x + r * 1.5, y);
  ctx.moveTo(x, y - r * 1.5); ctx.lineTo(x, y - r * 0.5); ctx.moveTo(x, y + r * 0.5); ctx.lineTo(x, y + r * 1.5); ctx.stroke();
}
function bolt(ctx, x, y, r, col) {
  ctx.beginPath(); ctx.moveTo(x + r * 0.2, y - r); ctx.lineTo(x - r * 0.6, y + r * 0.15); ctx.lineTo(x - r * 0.05, y + r * 0.15);
  ctx.lineTo(x - r * 0.25, y + r); ctx.lineTo(x + r * 0.6, y - r * 0.2); ctx.lineTo(x + r * 0.05, y - r * 0.2); ctx.closePath();
  ctx.fillStyle = col; ctx.fill();
}

// ===== Bot (yapay zekâ rakip) =====
class Bot {
  constructor(game, p, target, level) {
    this.g = game; this.p = p; this.tg = target; this.level = level;
    this.path = []; this.pathT = 0; this.strafe = 1; this.strafeT = 0; this.react = 0; this.lastSeen = null; this.wander = null;
  }
  bfs(sx, sy, tx, ty) {
    const g = this.g, C = g.C, R = g.R;
    const sc = clamp(Math.floor(sx / T), 0, C - 1), sr = clamp(Math.floor(sy / T), 0, R - 1);
    const tc = clamp(Math.floor(tx / T), 0, C - 1), tr = clamp(Math.floor(ty / T), 0, R - 1);
    const prev = new Int32Array(R * C).fill(-1), q = [sr * C + sc]; prev[sr * C + sc] = sr * C + sc;
    const goal = tr * C + tc;
    while (q.length) {
      const cur = q.shift(); if (cur === goal) break;
      const r = Math.floor(cur / C), c = cur % C;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nr = r + dr, nc = c + dc; if (nr < 0 || nc < 0 || nr >= R || nc >= C) continue;
        const ni = nr * C + nc; if (prev[ni] !== -1 || g.g[nr][nc] === 1) continue; prev[ni] = cur; q.push(ni);
      }
    }
    if (prev[goal] === -1) return [];
    const path = []; let cur = goal;
    while (cur !== sr * C + sc) { path.push({ x: (cur % C) * T + T / 2, y: Math.floor(cur / C) * T + T / 2 }); cur = prev[cur]; }
    return path.reverse();
  }
  update(dt) {
    const g = this.g, p = this.p, tg = this.tg;
    if (p.jump) return;
    const seen = tg.alive && g.visibleTo(p, tg);
    if (seen) this.lastSeen = { x: tg.x, y: tg.y, t: g.t };
    const aim = this.lastSeen || { x: g.MW / 2, y: g.MH / 2 };
    const dx = aim.x - p.x, dy = aim.y - p.y, d = Math.hypot(dx, dy);
    const spec = p.c.attack;
    const pref = spec.type === 'lob' ? spec.range * 0.8 : spec.range * (p.char === 'kel' ? 0.55 : 0.72);
    const lowHp = p.hp / p.maxhp < 0.35 && tg.hp / tg.maxhp > 0.4;
    // toz bulutundan kaç
    const cx = g.MW / 2, cy = g.MH / 2, inToz = g.rt > TOZ_START && Math.hypot(p.x - cx, p.y - cy) > g.tozR() - T;
    let mvx = 0, mvy = 0;
    this.pathT -= dt; this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafe *= -1; this.strafeT = rand(0.7, 1.8); }
    const goTo = (x, y) => {
      if (this.pathT <= 0 || !this.path.length) { this.path = this.bfs(p.x, p.y, x, y); this.pathT = 0.4; }
      while (this.path.length && Math.hypot(this.path[0].x - p.x, this.path[0].y - p.y) < T * 0.45) this.path.shift();
      const wp = this.path[0] || { x, y }; const ddx = wp.x - p.x, ddy = wp.y - p.y, dd = Math.hypot(ddx, ddy) || 1;
      mvx = ddx / dd; mvy = ddy / dd;
    };
    if (inToz) goTo(cx, cy);
    else if (lowHp && seen && d < spec.range * 1.3) { mvx = -dx / (d || 1); mvy = -dy / (d || 1); mvx += -dy / (d || 1) * this.strafe * 0.6; mvy += dx / (d || 1) * this.strafe * 0.6; }
    else if (!seen && (!this.lastSeen || g.t - this.lastSeen.t > 3)) {
      if (!this.wander || Math.hypot(this.wander.x - p.x, this.wander.y - p.y) < T) this.wander = { x: rand(T, g.MW - T), y: rand(T, g.MH - T) };
      goTo(this.wander.x, this.wander.y);
    } else if (d > pref || !g.los(p.x, p.y, aim.x, aim.y) && spec.type !== 'lob') goTo(aim.x, aim.y);
    else if (d < pref * 0.55) { mvx = -dx / d; mvy = -dy / d; }
    else { mvx = -dy / d * this.strafe; mvy = dx / d * this.strafe; }
    const m = Math.hypot(mvx, mvy);
    p.moving = m > 0.1;
    if (p.moving) {
      const ox = p.x, oy = p.y;
      p.x += mvx / m * p.c.speed * dt; p.y += mvy / m * p.c.speed * dt; g.collide(p);
      if (Math.hypot(p.x - ox, p.y - oy) < p.c.speed * dt * 0.2) { this.strafe *= -1; this.pathT = 0; }
      p.aim = Math.atan2(mvy, mvx);
    }
    // ateş
    this.react -= dt;
    if (seen && tg.alive && this.react <= 0) {
      const clear = spec.type === 'lob' || g.los(p.x, p.y - 20, tg.x, tg.y - 20);
      const err = (0.22 - this.level * 0.05) * (Math.random() * 2 - 1);
      if (p.gaz >= 1 && d < p.c.super.range * 0.95 && (clear || p.c.super.type !== 'radial')) {
        const a = g.autoAim(p, 'sup'); if (g.tryFire(p, 'sup', a.a + err * 0.5, a.d)) { this.react = rand(0.5, 0.9); return; }
      }
      if (p.ammo >= 1 && d < spec.range * 1.02 && clear) {
        const a = g.autoAim(p, 'atk');
        if (g.tryFire(p, 'atk', a.a + err, a.d)) this.react = rand(0.45, 0.95) - this.level * 0.08;
      }
    }
  }
}
