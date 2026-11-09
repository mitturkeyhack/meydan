// ===== MEYDAN — karakter ve nesne çizimleri (tamamen kodla çizilir) =====
const OUT = '#1d1029';
const LW = 3.4;

function grad(ctx, x, y, r, light, dark) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r * 1.1);
  g.addColorStop(0, light); g.addColorStop(1, dark); return g;
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function fs(ctx, fill, lw = LW) { ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = OUT; ctx.stroke(); }
function circ(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
function ell(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); }

const SKIN = { light: '#ffd9b0', dark: '#e0a072' };

// ---------- ortak parçalar ----------
function legs(ctx, walk, colA, shoe, wide = false) {
  const k = Math.sin(walk) * 5;
  const w = wide ? 14 : 11;
  for (const [sx, o] of [[-9, k], [9, -k]]) {
    rr(ctx, sx - w / 2, -16 + o * 0.3, w, 14, 5); fs(ctx, colA);
    ell(ctx, sx, -2 + o * 0.5, w / 2 + 2, 5); fs(ctx, shoe, 2.6);
  }
}
function eyes(ctx, hx, hy, look, opts = {}) {
  const px = look.x * 2.4, py = look.y * 2.2;
  for (const sx of [-8, 8]) {
    ell(ctx, hx + sx, hy, 5.2, 6.4); fs(ctx, '#fff', 2.2);
    circ(ctx, hx + sx + px, hy + py + 0.5, 3); ctx.fillStyle = '#1d1029'; ctx.fill();
    circ(ctx, hx + sx + px + 1.1, hy + py - 0.9, 1.1); ctx.fillStyle = '#fff'; ctx.fill();
  }
  if (opts.brows) {
    ctx.strokeStyle = OUT; ctx.lineWidth = opts.browW || 3.2; ctx.lineCap = 'round';
    for (const sx of [-8, 8]) {
      ctx.beginPath(); ctx.moveTo(hx + sx - 5, hy - 9 + (sx < 0 ? 1 : -1) * (opts.angry ? -1.5 : 0.5));
      ctx.lineTo(hx + sx + 5, hy - 9 + (sx < 0 ? -1 : 1) * (opts.angry ? -1.5 : 0.5)); ctx.stroke();
    }
  }
}
function headBase(ctx, hx, hy, r) {
  circ(ctx, hx, hy, r); fs(ctx, grad(ctx, hx, hy, r, SKIN.light, SKIN.dark));
}
function blush(ctx, hx, hy) {
  ctx.fillStyle = 'rgba(255,90,90,.35)';
  ell(ctx, hx - 13, hy + 7, 4.5, 3); ctx.fill(); ell(ctx, hx + 13, hy + 7, 4.5, 3); ctx.fill();
}
function arm(ctx, sx, sy, hx, hy, sleeve) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUT; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.strokeStyle = sleeve; ctx.lineWidth = 6.5; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke();
  circ(ctx, hx, hy, 5.2); fs(ctx, SKIN.dark, 2.4);
}

// ---------- eşyalar ----------
export function drawTeaGlass(ctx, x, y, s = 1, rot = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  ctx.beginPath(); ctx.moveTo(-6, -11); ctx.quadraticCurveTo(-2, -2, -5, 4); ctx.quadraticCurveTo(-5, 9, 0, 9);
  ctx.quadraticCurveTo(5, 9, 5, 4); ctx.quadraticCurveTo(2, -2, 6, -11); ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-4.4, -6); ctx.quadraticCurveTo(-1.5, -1, -4, 4); ctx.quadraticCurveTo(-4, 7.5, 0, 7.5);
  ctx.quadraticCurveTo(4, 7.5, 4, 4); ctx.quadraticCurveTo(1.5, -1, 4.4, -6); ctx.closePath();
  ctx.fillStyle = '#c2410c'; ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(-3, -4, 1.4, 7);
  ell(ctx, 0, 11, 9, 2.6); fs(ctx, '#d9d9e3', 1.6);
  ctx.restore();
}
export function drawSimit(ctx, x, y, r = 12, rot = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2, true);
  ctx.fillStyle = grad(ctx, 0, 0, r, '#e9a456', '#9a4f17'); ctx.fill('evenodd');
  ctx.lineWidth = 2.2; ctx.strokeStyle = OUT; ctx.stroke();
  ctx.fillStyle = '#fff3c4';
  for (let i = 0; i < 14; i++) {
    const a = i * 0.45 + (i % 2) * 0.2, d = r * (0.6 + (i % 3) * 0.12);
    ctx.fillRect(Math.cos(a) * d - 0.8, Math.sin(a) * d - 0.5, 1.8, 1.1);
  }
  ctx.restore();
}
export function drawTomato(ctx, x, y, r = 11, rot = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  circ(ctx, 0, 0, r); fs(ctx, grad(ctx, 0, 0, r, '#ff6b5b', '#b3141d'), 2.2);
  ctx.fillStyle = '#2f9e44';
  for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 1.256; ell(ctx, Math.cos(a) * 3.5, -r * 0.55 + Math.sin(a) * 3.5, 3.5, 1.6, a); ctx.fill(); }
  circ(ctx, -r * 0.35, -r * 0.3, r * 0.22); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fill();
  ctx.restore();
}
export function drawSemaver(ctx, x, y, s = 1, rot = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  rr(ctx, -11, -6, 22, 22, 6); fs(ctx, grad(ctx, 0, 4, 16, '#fff1b0', '#c88b1a'), 2.4);
  ell(ctx, 0, -8, 9, 5); fs(ctx, '#e3b341', 2.2);
  rr(ctx, -4, -18, 8, 8, 3); fs(ctx, '#f5d76e', 2.2);
  ell(ctx, 0, 18, 13, 4); fs(ctx, '#a86d12', 2.2);
  ctx.beginPath(); ctx.moveTo(11, 6); ctx.lineTo(17, 8); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
  ctx.restore();
}
function tray(ctx, x, y, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ell(ctx, 6, 0, 14, 5); fs(ctx, grad(ctx, 6, 0, 14, '#ffffff', '#9aa0b5'), 2.4);
  drawTeaGlass(ctx, 1, -9, 0.75); drawTeaGlass(ctx, 11, -9, 0.75);
  ctx.restore();
}
function stick(ctx, x, y, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  rr(ctx, -4, -4, 40, 8, 4); fs(ctx, grad(ctx, 15, 0, 22, '#d49a5a', '#7a4a1e'), 2.6);
  circ(ctx, 30, 0, 6); fs(ctx, '#8b5a2b', 2.4);
  ctx.restore();
}
function bag(ctx, x, y, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot * 0.3);
  ctx.beginPath(); ctx.moveTo(-2, -4); ctx.quadraticCurveTo(8, -16, 18, -4); ctx.lineWidth = 2.4; ctx.strokeStyle = OUT; ctx.stroke();
  drawTomato(ctx, 4, 4, 7); drawTomato(ctx, 14, 3, 7); drawTomato(ctx, 9, 10, 7);
  ctx.strokeStyle = 'rgba(40,20,60,.55)'; ctx.lineWidth = 1.2;
  for (let i = -2; i < 22; i += 5) { ctx.beginPath(); ctx.moveTo(i, -2); ctx.lineTo(i + 6, 16); ctx.stroke(); }
  ctx.restore();
}

// ---------- karakterler ----------
const DRAW = {
  cayci(ctx, w, look, prop) {
    legs(ctx, w, '#2c2c3a', '#141018');
    rr(ctx, -17, -44, 34, 32, 11); fs(ctx, grad(ctx, 0, -30, 22, '#ffffff', '#cfcfd8'));
    // yelek
    ctx.beginPath(); ctx.moveTo(-17, -36); ctx.lineTo(-5, -40); ctx.lineTo(-7, -13); ctx.lineTo(-15, -13); ctx.closePath(); fs(ctx, '#2a2230', 2.4);
    ctx.beginPath(); ctx.moveTo(17, -36); ctx.lineTo(5, -40); ctx.lineTo(7, -13); ctx.lineTo(15, -13); ctx.closePath(); fs(ctx, '#2a2230', 2.4);
    // papyon
    ctx.beginPath(); ctx.moveTo(0, -39); ctx.lineTo(-6, -43); ctx.lineTo(-6, -35); ctx.closePath(); fs(ctx, '#e8473b', 1.8);
    ctx.beginPath(); ctx.moveTo(0, -39); ctx.lineTo(6, -43); ctx.lineTo(6, -35); ctx.closePath(); fs(ctx, '#e8473b', 1.8);
    // omuz havlusu
    rr(ctx, 8, -46, 12, 8, 3); fs(ctx, '#e8473b', 2); ctx.fillStyle = '#fff'; ctx.fillRect(10, -43, 8, 1.6);
    prop.back && prop.back();
    headBase(ctx, 0, -64, 22);
    // saç
    ctx.beginPath(); ctx.arc(0, -66, 22.5, Math.PI * 1.05, Math.PI * 1.95); ctx.quadraticCurveTo(10, -78, 0, -76);
    ctx.quadraticCurveTo(-12, -80, -21, -70); ctx.closePath(); fs(ctx, '#1d1625', 2.6);
    eyes(ctx, 0, -64, look, { brows: true, browW: 4 });
    // bıyık
    ctx.beginPath(); ctx.moveTo(0, -53); ctx.quadraticCurveTo(-9, -58, -17, -50); ctx.quadraticCurveTo(-9, -49, 0, -50);
    ctx.quadraticCurveTo(9, -49, 17, -50); ctx.quadraticCurveTo(9, -58, 0, -53); fs(ctx, '#1d1625', 2.2);
    ctx.beginPath(); ctx.arc(0, -47, 4, 0.1, Math.PI - 0.1); ctx.lineWidth = 2.2; ctx.strokeStyle = OUT; ctx.stroke();
    blush(ctx, 0, -62);
  },
  simitci(ctx, w, look, prop) {
    legs(ctx, w, '#34558b', '#2b1c14');
    rr(ctx, -16, -43, 32, 31, 11); fs(ctx, grad(ctx, 0, -30, 22, '#ffb74d', '#e07b17'));
    rr(ctx, -12, -34, 24, 22, 6); fs(ctx, '#fff8ea', 2.2);
    ctx.fillStyle = '#e07b17'; ctx.fillRect(-6, -30, 12, 2);
    prop.back && prop.back();
    headBase(ctx, 0, -62, 21);
    ctx.beginPath(); ctx.arc(0, -64, 21.5, Math.PI * 1.08, Math.PI * 1.92); ctx.quadraticCurveTo(0, -74, -20, -69); ctx.closePath(); fs(ctx, '#7a4320', 2.4);
    eyes(ctx, 0, -61, look, { brows: true });
    ctx.fillStyle = '#c26a3a'; for (const [fx, fy] of [[-12, -53], [-9, -51], [12, -53], [9, -51]]) { circ(ctx, fx, fy, 1.1); ctx.fill(); }
    ctx.beginPath(); ctx.arc(0, -52, 5, 0.15, Math.PI - 0.15); ctx.closePath(); fs(ctx, '#7a1f1f', 2);
    blush(ctx, 0, -58);
    // başında simit tablası
    ell(ctx, 0, -84, 27, 8); fs(ctx, grad(ctx, 0, -86, 26, '#c98b4e', '#7a4a1e'), 2.6);
    drawSimit(ctx, -13, -89, 8, 0.3); drawSimit(ctx, 1, -91, 8, 1.1); drawSimit(ctx, 14, -88, 8, 2);
    drawSimit(ctx, -5, -84, 8, 2.6); drawSimit(ctx, 9, -83, 8, 0.8);
  },
  kel(ctx, w, look, prop) {
    legs(ctx, w, '#3f8f4a', '#5a3417', true);
    // şalvar
    ell(ctx, 0, -18, 19, 8); fs(ctx, '#3f8f4a', 2.6);
    rr(ctx, -16, -43, 32, 28, 11); fs(ctx, grad(ctx, 0, -30, 22, '#fff4d6', '#e5d2a5'));
    ctx.beginPath(); ctx.moveTo(-16, -38); ctx.lineTo(-4, -42); ctx.lineTo(-6, -16); ctx.lineTo(-15, -16); ctx.closePath(); fs(ctx, '#8b5a2b', 2.4);
    ctx.beginPath(); ctx.moveTo(16, -38); ctx.lineTo(4, -42); ctx.lineTo(6, -16); ctx.lineTo(15, -16); ctx.closePath(); fs(ctx, '#8b5a2b', 2.4);
    rr(ctx, -14, -30, 7, 7, 2); fs(ctx, '#d35454', 1.6); rr(ctx, 8, -25, 6, 6, 2); fs(ctx, '#3b82c4', 1.6);
    rr(ctx, -16, -20, 32, 5, 2); fs(ctx, '#d35454', 2);
    prop.back && prop.back();
    // kulaklar
    ell(ctx, -21, -60, 6, 8); fs(ctx, SKIN.dark, 2.4); ell(ctx, 21, -60, 6, 8); fs(ctx, SKIN.dark, 2.4);
    headBase(ctx, 0, -62, 22);
    ell(ctx, -7, -76, 8, 4, -0.4); ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fill();
    circ(ctx, 6, -79, 2.2); ctx.fill();
    eyes(ctx, 0, -60, look, { brows: true, angry: true });
    ctx.fillStyle = '#c26a3a'; for (const [fx, fy] of [[-13, -52], [-10, -54], [13, -52], [10, -54], [-11, -50]]) { circ(ctx, fx, fy, 1.1); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(-9, -50); ctx.quadraticCurveTo(0, -42, 10, -51); ctx.quadraticCurveTo(0, -46, -9, -50); fs(ctx, '#7a1f1f', 2.2);
    ctx.fillStyle = '#fff'; ctx.fillRect(-2, -49, 4, 3);
  },
  teyze(ctx, w, look, prop) {
    // etek
    const k = Math.sin(w) * 3;
    ctx.beginPath(); ctx.moveTo(-15, -26); ctx.lineTo(15, -26); ctx.lineTo(20 + k * 0.3, -3); ctx.quadraticCurveTo(0, 2, -20 - k * 0.3, -3); ctx.closePath();
    fs(ctx, grad(ctx, 0, -14, 20, '#b06ad9', '#6a2a93'));
    ctx.fillStyle = '#ffd1f0'; for (let i = 0; i < 7; i++) { circ(ctx, -14 + i * 4.7, -10 + (i % 2) * 6, 1.6); ctx.fill(); }
    ell(ctx, -8, -1, 6, 4); fs(ctx, '#3b1f14', 2.2); ell(ctx, 8, -1, 6, 4); fs(ctx, '#3b1f14', 2.2);
    rr(ctx, -16, -46, 32, 24, 11); fs(ctx, grad(ctx, 0, -36, 22, '#c9455d', '#8a1f3a'));
    ctx.fillStyle = '#ffe3a3'; for (const yy of [-40, -34, -28]) { circ(ctx, 0, yy, 1.7); ctx.fill(); }
    prop.back && prop.back();
    // yazma (başörtü)
    ctx.beginPath(); ctx.arc(0, -63, 25, Math.PI * 0.85, Math.PI * 2.15); ctx.lineTo(18, -44); ctx.quadraticCurveTo(0, -38, -18, -44); ctx.closePath();
    fs(ctx, grad(ctx, 0, -66, 26, '#ff7fbf', '#d1306f'));
    ctx.fillStyle = '#fff'; for (let i = 0; i < 9; i++) { const a = Math.PI * (0.95 + i * 0.13); circ(ctx, Math.cos(a) * 20, -63 + Math.sin(a) * 20, 1.8); ctx.fill(); }
    // oya kenar
    ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(0, -63, 18.5, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    // yüz
    ell(ctx, 0, -58, 16, 15); fs(ctx, grad(ctx, 0, -58, 16, SKIN.light, SKIN.dark), 2.6);
    eyes(ctx, 0, -60, look, {});
    ctx.lineWidth = 2.2; ctx.strokeStyle = OUT;
    for (const sx of [-8, 8]) { circ(ctx, sx, -60, 7.2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-1, -60); ctx.lineTo(1, -60); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -51, 4.5, 0.2, Math.PI - 0.2); ctx.stroke();
    blush(ctx, 0, -55);
  },
};
const PROPS = {
  cayci: (ctx, x, y, a) => tray(ctx, x, y, a * 0.25),
  simitci: (ctx, x, y, a) => drawSimit(ctx, x + 4, y, 9, a),
  kel: (ctx, x, y, a) => stick(ctx, x, y, a),
  teyze: (ctx, x, y, a) => bag(ctx, x, y, a),
};
const SLEEVE = { cayci: '#ffffff', simitci: '#ffb74d', kel: '#fff4d6', teyze: '#c9455d' };

// Bir karakteri çizer. o: {aim, walk, moving, s}
export function drawChar(ctx, id, x, y, o = {}) {
  const aim = o.aim ?? 0.4, s = o.s ?? 1, walk = o.moving ? (o.walk || 0) : 0;
  const flip = Math.cos(aim) < 0 ? -1 : 1;
  const la = flip < 0 ? Math.PI - aim : aim;   // çevrilmiş uzayda nişan açısı
  const look = { x: Math.cos(la), y: Math.sin(la) };
  ctx.save(); ctx.translate(x, y); ctx.scale(s * flip, s);
  const bob = o.moving ? -Math.abs(Math.sin(walk)) * 3 : Math.sin((o.t || 0) * 3) * 0.8;
  ctx.translate(0, bob);
  const shx = 12, shy = -36;
  const hx = shx + Math.cos(la) * 18, hy = shy + Math.sin(la) * 16;
  const drawArm = () => { arm(ctx, shx, shy, hx, hy, SLEEVE[id]); PROPS[id](ctx, hx, hy, la); };
  const behind = Math.sin(la) < -0.35;
  // diğer kol
  arm(ctx, -13, -36, -18, -22 + Math.sin(walk) * 2, SLEEVE[id]);
  DRAW[id](ctx, walk, look, { back: behind ? drawArm : null });
  if (!behind) drawArm();
  ctx.restore();
}

// Gölge
export function drawShadow(ctx, x, y, s = 1, a = 0.28) {
  ctx.fillStyle = `rgba(20,8,30,${a})`; ell(ctx, x, y, 24 * s, 9 * s); ctx.fill();
}

// Kart/portre çizimi
export function drawPortrait(canvas, id, color, t = 0) {
  const ctx = canvas.getContext('2d'); const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, color); g.addColorStop(1, '#1d1029');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(W / 2, H * 0.55); ctx.rotate(t * 0.2);
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, W, i * 0.523, i * 0.523 + 0.26); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  const s = H / 125;
  drawShadow(ctx, W / 2, H * 0.9, s * 1.2, 0.4);
  drawChar(ctx, id, W / 2, H * 0.9, { aim: 0.5, s: s, t, moving: false });
}

export { rr, circ, ell, fs, grad, OUT };
