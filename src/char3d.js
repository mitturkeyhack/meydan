// ===== MEYDAN — 3D karakter çizici (kendi WebGL motorumuz) =====
// Modeller: public/models/<id>.bin (iskeletli, sıkıştırılmış) + <id>.jpg (doku)

// ---------- küçük matris kütüphanesi (sütun öncelikli) ----------
const M = {
  id() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
  mul(a, b, o = new Float32Array(16)) {
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  },
  t(x, y, z) { const m = M.id(); m[12] = x; m[13] = y; m[14] = z; return m; },
  s(k) { const m = M.id(); m[0] = m[5] = m[10] = k; return m; },
  rx(a) { const c = Math.cos(a), s = Math.sin(a), m = M.id(); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; },
  ry(a) { const c = Math.cos(a), s = Math.sin(a), m = M.id(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; },
  rz(a) { const c = Math.cos(a), s = Math.sin(a), m = M.id(); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; },
  ortho(l, r, b, t, n, f) {
    const m = M.id(); m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = -2 / (f - n);
    m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = -(f + n) / (f - n); return m;
  },
};

// ---------- WebGL ----------
const VS = `
attribute vec3 aPos; attribute vec3 aNrm; attribute vec2 aUv; attribute vec4 aJ; attribute vec4 aW;
uniform mat4 uB[16]; uniform mat4 uModel; uniform mat4 uVP; uniform float uScale; uniform float uOut;
varying vec2 vUv; varying vec3 vN; varying float vH;
void main(){
  mat4 sk = uB[int(aJ.x)]*aW.x + uB[int(aJ.y)]*aW.y + uB[int(aJ.z)]*aW.z + uB[int(aJ.w)]*aW.w;
  vec3 p = aPos*uScale + aNrm*uOut;
  vec4 wp = uModel * sk * vec4(p,1.0);
  vN = normalize(mat3(uModel) * mat3(sk) * aNrm);
  vUv = aUv; vH = p.y;
  gl_Position = uVP * wp;
}`;
const FS = `
precision mediump float;
uniform sampler2D uTex; uniform vec3 uL; uniform float uFlash; uniform float uOutline; uniform vec3 uTint;
varying vec2 vUv; varying vec3 vN; varying float vH;
void main(){
  if (uOutline > 0.5) { gl_FragColor = vec4(0.11,0.06,0.16,1.0); return; }
  vec3 n = normalize(vN);
  vec3 base = texture2D(uTex, vUv).rgb;
  float lum = dot(base, vec3(0.299,0.587,0.114));
  base = mix(vec3(lum), base, 1.18);                       // biraz daha canlı renk
  float ndl = dot(n, normalize(uL));
  float d = smoothstep(-0.35, 0.55, ndl);
  float light = mix(0.58, 1.12, d);
  float rim = pow(1.0 - clamp(n.z*0.8 + n.y*0.2, 0.0, 1.0), 3.0) * 0.32;
  float sky = clamp(n.y, 0.0, 1.0) * 0.08;
  vec3 col = base * light * vec3(1.04, 1.0, 0.95) + rim * vec3(1.0, 0.9, 0.75) + sky;
  col *= uTint;
  col = mix(col, vec3(1.0), uFlash);
  gl_FragColor = vec4(col, 1.0);
}`;

let gl = null, glCanvas = null, prog = null, loc = {};
const models = {};

function initGL() {
  if (gl !== null) return !!gl;
  try {
    glCanvas = document.createElement('canvas'); glCanvas.width = 256; glCanvas.height = 256;
    gl = glCanvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: true });
    if (!gl) { gl = false; return false; }
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    for (const a of ['aPos', 'aNrm', 'aUv', 'aJ', 'aW']) loc[a] = gl.getAttribLocation(prog, a);
    for (const u of ['uB', 'uModel', 'uVP', 'uScale', 'uOut', 'uTex', 'uL', 'uFlash', 'uOutline', 'uTint']) loc[u] = gl.getUniformLocation(prog, u);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
    return true;
  } catch (e) { console.warn('WebGL yok:', e); gl = false; return false; }
}

export async function loadModel(id, base = 'models/') {
  if (!initGL()) return null;
  const [bin, img] = await Promise.all([
    fetch(base + id + '.bin').then(r => { if (!r.ok) throw new Error('model yok'); return r.arrayBuffer(); }),
    new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = base + id + '.jpg'; }),
  ]);
  const dv = new DataView(bin);
  if (String.fromCharCode(...new Uint8Array(bin, 0, 4)) !== 'MDN1') throw new Error('bozuk model');
  const hl = dv.getUint32(4, true);
  const H = JSON.parse(new TextDecoder().decode(new Uint8Array(bin, 8, hl)));
  let off = 8 + hl; const nv = H.nv;
  const take = (bytes) => { const o = off; off += bytes + ((4 - bytes % 4) % 4); return o; };
  const oPos = take(nv * 6), oNrm = take(nv * 4), oUv = take(nv * 4), oJ = take(nv * 4), oW = take(nv * 4), oI = take(H.ni * 2);
  const buf = (target, data) => { const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b; };
  const m = {
    H, nv, ni: H.ni,
    pos: buf(gl.ARRAY_BUFFER, new Int16Array(bin, oPos, nv * 3)),
    nrm: buf(gl.ARRAY_BUFFER, new Int8Array(bin, oNrm, nv * 4)),
    uv: buf(gl.ARRAY_BUFFER, new Uint16Array(bin, oUv, nv * 2)),
    j: buf(gl.ARRAY_BUFFER, new Uint8Array(bin, oJ, nv * 4)),
    w: buf(gl.ARRAY_BUFFER, new Uint8Array(bin, oW, nv * 4)),
    idx: buf(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(bin, oI, H.ni)),
    tex: gl.createTexture(),
    bones: H.bones.map(b => ({ ...b })),
    byName: {},
  };
  m.bones.forEach((b, i) => { m.byName[b.name] = i; });
  gl.bindTexture(gl.TEXTURE_2D, m.tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  models[id] = m;
  return m;
}
export const hasModel = (id) => !!models[id];

// ---------- hareketler (prosedürel animasyon) ----------
// Her kemik için {x,y,z} dönüş (radyan). Eksenler: Y yukarı, Z karakterin önü.
// Kollar T-pozda ±X yönünde: aşağı indirmek için Z ekseninde döner.
const S = { L: 1, R: -1 };
const ease = (t) => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
const lerp = (a, b, k) => a + (b - a) * k;

function basePose() { return { root: { y: 0, x: 0, z: 0 }, r: {} }; }
function set(p, name, x = 0, y = 0, z = 0) { const o = p.r[name] || (p.r[name] = { x: 0, y: 0, z: 0 }); o.x += x; o.y += y; o.z += z; }
function armDown(p, tag, down, fwd = 0, bend = 0.25, twist = 0) {
  const s = S[tag];
  set(p, 'upperArm' + tag, -fwd, twist, -s * down);
  set(p, 'foreArm' + tag, 0, -s * bend, 0);
}

const ANIM = {
  idle(p, t) {
    const b = Math.sin(t * 2.4);
    set(p, 'chest', 0.03 + b * 0.015, 0, 0); set(p, 'head', -0.02 - b * 0.02, Math.sin(t * 0.7) * 0.12, 0);
    armDown(p, 'L', 1.18 + b * 0.03, 0.1, 0.35); armDown(p, 'R', 1.18 + b * 0.03, 0.1, 0.35);
    set(p, 'handL', 0, 0, -0.15); set(p, 'handR', 0, 0, 0.15);
    set(p, 'thighL', 0, 0, -0.04); set(p, 'thighR', 0, 0, 0.04);
    p.root.y = b * 0.008;
  },
  run(p, t) {
    const w = t * 11, s = Math.sin(w), c = Math.cos(w);
    set(p, 'hips', 0, s * 0.18, 0); set(p, 'spine', 0.12, -s * 0.12, 0); set(p, 'chest', 0.08, -s * 0.12, 0);
    set(p, 'head', -0.12, s * 0.15, 0);
    set(p, 'thighL', -s * 0.75 - 0.1, 0, -0.03); set(p, 'thighR', s * 0.75 - 0.1, 0, 0.03);
    set(p, 'shinL', Math.max(0, c) * 1.25 + 0.2, 0, 0); set(p, 'shinR', Math.max(0, -c) * 1.25 + 0.2, 0, 0);
    set(p, 'footL', 0.2 - s * 0.3, 0, 0); set(p, 'footR', 0.2 + s * 0.3, 0, 0);
    armDown(p, 'L', 1.15, s * 0.85, 1.15); armDown(p, 'R', 1.15, -s * 0.85, 1.15);
    p.root.y = Math.abs(c) * 0.06 - 0.02;
  },
  // üst gövde fırlatma (0..1 ilerleme)
  throw(p, k, tag = 'R') {
    const s = S[tag];
    const wind = ease(k / 0.35), hit = ease((k - 0.35) / 0.25), back = ease((k - 0.6) / 0.4);
    const a = wind * (1 - hit), f = hit * (1 - back);
    set(p, 'chest', -0.15 * a + 0.3 * f, s * (0.5 * a - 0.55 * f), 0);
    set(p, 'spine', 0.1 * f, s * (0.25 * a - 0.3 * f), 0);
    set(p, 'upperArm' + tag, (0.9 * a - 1.4 * f), 0, s * (1.6 * a + 0.4 * f));
    set(p, 'foreArm' + tag, 0, s * (-1.4 * a + 1.0 * f), 0);
    set(p, 'head', 0, -s * 0.3 * a, 0);
  },
  // süper: iki elle yukarı kaldırıp fırlatma + sıçrama
  super(p, k) {
    const up = ease(k / 0.4), down = ease((k - 0.4) / 0.25), back = ease((k - 0.7) / 0.3);
    const a = up * (1 - down), f = down * (1 - back);
    for (const tag of ['L', 'R']) {
      const s = S[tag];
      // önceki pozdaki indirmeyi telafi edip kolları başın üstüne, sonra öne savur
      set(p, 'upperArm' + tag, 0.5 * a, -s * 1.25 * f, s * (2.6 * a + 1.05 * f));
      set(p, 'foreArm' + tag, 0, -s * (0.9 * a - 0.5 * f), 0);
    }
    set(p, 'chest', -0.3 * a + 0.45 * f, 0, 0); set(p, 'spine', -0.15 * a + 0.2 * f, 0, 0);
    set(p, 'thighL', 0.4 * a, 0, 0); set(p, 'thighR', 0.4 * a, 0, 0); set(p, 'shinL', 0.8 * a, 0, 0); set(p, 'shinR', 0.8 * a, 0, 0);
    p.root.y += -0.08 * a;
  },
  jump(p, k) { // Keloğlan zıplaması / havada
    set(p, 'thighL', -0.9, 0, 0); set(p, 'thighR', -0.3, 0, 0); set(p, 'shinL', 1.4, 0, 0); set(p, 'shinR', 1.0, 0, 0);
    armDown(p, 'L', -0.75, 0.6, 0.9); armDown(p, 'R', -0.75, 0.6, 0.9);
    set(p, 'chest', 0.25, 0, 0); set(p, 'head', -0.2, 0, 0);
  },
  hurt(p, k) { const a = Math.sin(k * Math.PI); set(p, 'chest', -0.35 * a, 0, 0); set(p, 'head', -0.3 * a, 0, 0); set(p, 'spine', -0.15 * a, 0, 0); },
  win(p, t) { // halay/zeybek usulü kutlama
    const w = t * 6, s = Math.sin(w);
    armDown(p, 'L', -1.0 + s * 0.25, 0.35, 1.0); armDown(p, 'R', -1.0 - s * 0.25, 0.35, 1.0);
    set(p, 'hips', 0, s * 0.25, 0); set(p, 'chest', 0.05, s * 0.2, s * 0.08); set(p, 'head', 0, -s * 0.2, 0);
    set(p, 'thighL', -Math.max(0, s) * 0.8, 0, -0.05); set(p, 'shinL', Math.max(0, s) * 1.2, 0, 0);
    set(p, 'thighR', -Math.max(0, -s) * 0.8, 0, 0.05); set(p, 'shinR', Math.max(0, -s) * 1.2, 0, 0);
    p.root.y = Math.abs(s) * 0.06;
  },
};

// Durumdan poz üret. st: {moving, t, atkK (0..1 veya -1), supK, jump, hurtK, win, hand}
function buildPose(st) {
  const p = basePose();
  if (st.win) { ANIM.win(p, st.t); return p; }
  if (st.jump) { ANIM.jump(p, 0); }
  else if (st.runW > 0.01) {
    // koşu ve durma karışımı
    const a = basePose(), b = basePose();
    ANIM.idle(a, st.t); ANIM.run(b, st.runT);
    mix(p, a, 1 - st.runW); mix(p, b, st.runW);
  } else ANIM.idle(p, st.t);
  if (st.supK >= 0) ANIM.super(p, st.supK);
  else if (st.atkK >= 0) ANIM.throw(p, st.atkK, st.hand || 'R');
  if (st.hurtK >= 0) ANIM.hurt(p, st.hurtK);
  return p;
}
function mix(dst, src, w) {
  dst.root.y += src.root.y * w;
  for (const n in src.r) { const o = src.r[n]; set(dst, n, o.x * w, o.y * w, o.z * w); }
}

// ---------- çizim ----------
const bonesBuf = new Float32Array(16 * 16);
const tmpA = new Float32Array(16), tmpB = new Float32Array(16);
function computeBones(m, pose) {
  const W = [];
  for (let i = 0; i < m.bones.length; i++) {
    const b = m.bones[i], r = pose.r[b.name], pv = b.pivot;
    let local;
    if (r) {
      const R = M.mul(M.ry(r.y), M.mul(M.rx(r.x), M.rz(r.z)));
      local = M.mul(M.t(pv[0], pv[1], pv[2]), M.mul(R, M.t(-pv[0], -pv[1], -pv[2])));
    } else local = M.id();
    if (i === 0) local = M.mul(M.t(pose.root.x, pose.root.y, pose.root.z), local);
    W[i] = b.parent >= 0 ? M.mul(W[b.parent], local) : local;
    bonesBuf.set(W[i], i * 16);
  }
}

// Karakteri ana tuvale çizer. (x,y) = ayakların ekran konumu, h = ekrandaki boy (piksel)
// o: {yaw, flash, state, pitch, tint}
export function drawChar3D(ctx, id, x, y, h, o) {
  const m = models[id]; if (!m || !gl) return false;
  const dpr = o.dpr || 1;
  const sz = Math.min(512, Math.max(96, Math.round(h * 1.9 * dpr)));
  if (glCanvas.width !== sz) { glCanvas.width = sz; glCanvas.height = sz; }
  gl.viewport(0, 0, sz, sz);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(prog);

  computeBones(m, buildPose(o.state || {}));
  gl.uniformMatrix4fv(loc.uB, false, bonesBuf);
  const H = m.H, height = H.maxY - H.minY;
  // model: ayaklar orijinde, karakter boyu = 1
  const model = M.mul(M.ry(o.yaw || 0), M.mul(M.s(1 / height), M.t(0, -H.minY, 0)));
  const pitch = o.pitch ?? 0.62;
  // ortografik kamera: ayaklar tuvalin %85 yüksekliğinde
  const TOP = 1.08, BOT = -0.42, SPAN = TOP - BOT, view = M.rx(pitch);
  const proj = M.ortho(-SPAN / 2, SPAN / 2, BOT, TOP, -5, 5);
  gl.uniformMatrix4fv(loc.uModel, false, model);
  gl.uniformMatrix4fv(loc.uVP, false, M.mul(proj, view));
  gl.uniform1f(loc.uScale, H.scale);
  gl.uniform3f(loc.uL, -0.45, 0.85, 0.55);
  gl.uniform1f(loc.uFlash, o.flash || 0);
  const tn = o.tint || [1, 1, 1]; gl.uniform3f(loc.uTint, tn[0], tn[1], tn[2]);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, m.tex); gl.uniform1i(loc.uTex, 0);

  const attr = (a, b, n, type, norm) => { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(loc[a]); gl.vertexAttribPointer(loc[a], n, type, norm, 0, 0); };
  attr('aPos', m.pos, 3, gl.SHORT, true);
  attr('aNrm', m.nrm, 3, gl.BYTE, true); // 4 baytlık adımla
  gl.bindBuffer(gl.ARRAY_BUFFER, m.nrm); gl.vertexAttribPointer(loc.aNrm, 3, gl.BYTE, true, 4, 0);
  attr('aUv', m.uv, 2, gl.UNSIGNED_SHORT, true);
  attr('aJ', m.j, 4, gl.UNSIGNED_BYTE, false);
  attr('aW', m.w, 4, gl.UNSIGNED_BYTE, true);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx);

  // 1) dış hat (ters kabuk)
  gl.cullFace(gl.FRONT); gl.uniform1f(loc.uOutline, 1); gl.uniform1f(loc.uOut, (o.outline ?? 0.011) * height);
  gl.drawElements(gl.TRIANGLES, m.ni, gl.UNSIGNED_SHORT, 0);
  // 2) asıl yüzey
  gl.cullFace(gl.BACK); gl.uniform1f(loc.uOutline, 0); gl.uniform1f(loc.uOut, 0);
  gl.drawElements(gl.TRIANGLES, m.ni, gl.UNSIGNED_SHORT, 0);

  // tuvale aktar: ayak noktası tuvalde (0.5, 0.85)
  const dh = h * SPAN / Math.cos(pitch);   // h = ekrandaki karakter boyu
  ctx.drawImage(glCanvas, x - dh / 2, y - dh * (TOP / SPAN), dh, dh);
  return true;
}

// Animasyon durum yöneticisi (her oyuncu için)
export class Anim3D {
  constructor() { this.t = Math.random() * 10; this.runT = 0; this.runW = 0; this.yaw = 0; this.atk = -9; this.sup = -9; this.hurt = -9; this.hand = 'R'; }
  update(dt, moving, aimAngle, now) {
    this.t += dt;
    this.runW += ((moving ? 1 : 0) - this.runW) * Math.min(1, dt * 10);
    if (moving) this.runT += dt;
    // ekran açısı -> model yönü (model +Z = ekranda aşağı)
    const target = Math.atan2(Math.cos(aimAngle), Math.sin(aimAngle));
    let d = target - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * 14);
    this.now = now;
  }
  state(extra = {}) {
    const n = this.now ?? 0;
    const ak = (n - this.atk) / 0.38, sk = (n - this.sup) / 0.7, hk = (n - this.hurt) / 0.22;
    return { t: this.t, runT: this.runT, runW: this.runW, atkK: ak >= 0 && ak <= 1 ? ak : -1, supK: sk >= 0 && sk <= 1 ? sk : -1, hurtK: hk >= 0 && hk <= 1 ? hk : -1, hand: this.hand, ...extra };
  }
}
