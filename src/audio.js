// ===== MEYDAN — ses efektleri ve müzik (WebAudio ile üretilir) =====
let ac = null, master, sfxBus, musicBus, noiseBuf;
let sfxOn = true, musicOn = true;
const plucks = {};

try { sfxOn = localStorage.getItem('meydan_sfx') !== '0'; musicOn = localStorage.getItem('meydan_music') !== '0'; } catch (e) {}

export function initAudio() {
  if (!ac) {
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = ac.createGain(); master.gain.value = 0.9;
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.gain.value = sfxOn ? 1 : 0; sfxBus.connect(master);
    musicBus = ac.createGain(); musicBus.gain.value = musicOn ? 0.32 : 0; musicBus.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    buildPlucks();
  }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
}
export const audioState = () => ({ sfxOn, musicOn });
export function setSfx(v) { sfxOn = v; if (sfxBus) sfxBus.gain.value = v ? 1 : 0; try { localStorage.setItem('meydan_sfx', v ? '1' : '0'); } catch (e) {} }
export function setMusic(v) { musicOn = v; if (musicBus) musicBus.gain.value = v ? 0.32 : 0; try { localStorage.setItem('meydan_music', v ? '1' : '0'); } catch (e) {} }

function now() { return ac.currentTime; }
function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function osc(type, f, t, dur, peak, f2, dest = sfxBus, a = 0.005) {
  const o = ac.createOscillator(), g = ac.createGain(); o.type = type;
  o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  env(g, t, a, peak, dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + a + dur + 0.05);
}
function noise(t, dur, peak, type = 'bandpass', f = 1000, f2, q = 1, dest = sfxBus, a = 0.004) {
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ac.createGain(); env(g, t, a, peak, dur);
  s.connect(fl); fl.connect(g); g.connect(dest); s.start(t, Math.random()); s.stop(t + a + dur + 0.05);
}

// Karplus-Strong ile saz/bağlama tınısı
function ks(freq, dur = 1.2, bright = 0.5) {
  const sr = ac.sampleRate, n = Math.floor(sr * dur), buf = ac.createBuffer(1, n, sr), d = buf.getChannelData(0);
  const p = Math.max(2, Math.round(sr / freq)); const line = new Float32Array(p);
  for (let i = 0; i < p; i++) line[i] = (Math.random() * 2 - 1) * (i < p * bright ? 1 : 0.4);
  let idx = 0, last = 0;
  for (let i = 0; i < n; i++) { const v = line[idx]; const nv = 0.497 * (v + last); last = v; line[idx] = nv; d[i] = v; idx = (idx + 1) % p; }
  return buf;
}
// Hicaz makamı (Re): D Eb F# G A Bb C D
const HICAZ = [146.83, 155.56, 185.0, 196.0, 220.0, 233.08, 261.63, 293.66, 311.13, 369.99, 392.0, 440.0];
function buildPlucks() { HICAZ.forEach((f, i) => { plucks[i] = ks(f, 1.1, 0.6); }); plucks.bass = ks(73.42, 1.4, 0.8); plucks.bass2 = ks(110, 1.4, 0.8); }
function playBuf(buf, t, vol, dest = musicBus, rate = 1) {
  const s = ac.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
  const g = ac.createGain(); g.gain.value = vol; s.connect(g); g.connect(dest); s.start(t);
}

// ---------- efektler ----------
const last = {};
export function sfx(name, v = 1) {
  if (!ac || !sfxOn) return;
  const t = now();
  if (last[name] && t - last[name] < 0.03) return; last[name] = t;
  switch (name) {
    case 'tea':      noise(t, 0.12, 0.35 * v, 'highpass', 2500, 6000, 0.7); osc('triangle', 1900, t, 0.06, 0.15 * v, 2800); osc('sine', 2900, t + 0.02, 0.12, 0.08 * v); break;
    case 'simit':    noise(t, 0.16, 0.4 * v, 'bandpass', 700, 2400, 1.4); osc('sine', 260, t, 0.1, 0.2 * v, 140); break;
    case 'swing':    noise(t, 0.14, 0.5 * v, 'bandpass', 500, 2200, 2); break;
    case 'lob':      osc('sine', 380, t, 0.25, 0.18 * v, 900); noise(t, 0.08, 0.2 * v, 'lowpass', 900); break;
    case 'bounce':   osc('triangle', 520, t, 0.06, 0.15 * v, 380); break;
    case 'hit':      osc('sine', 180, t, 0.12, 0.45 * v, 60); noise(t, 0.06, 0.35 * v, 'bandpass', 1800, 900, 1.2); osc('square', 1200, t, 0.03, 0.05 * v); break;
    case 'hurt':     osc('sawtooth', 140, t, 0.16, 0.25 * v, 60); noise(t, 0.1, 0.3 * v, 'lowpass', 900); break;
    case 'splat':    noise(t, 0.22, 0.5 * v, 'lowpass', 1600, 300, 0.8); osc('sine', 220, t, 0.15, 0.3 * v, 70); break;
    case 'boom':     noise(t, 0.6, 0.9 * v, 'lowpass', 2200, 90, 0.7); osc('sine', 120, t, 0.5, 0.7 * v, 35); osc('square', 60, t, 0.2, 0.15 * v, 30); break;
    case 'gazfull':  [0, 1, 2, 3].forEach((i) => osc('triangle', [523, 659, 784, 1046][i], t + i * 0.06, 0.18, 0.13, null)); osc('sine', 2093, t + 0.24, 0.3, 0.05); break;
    case 'super':    noise(t, 0.4, 0.6, 'bandpass', 300, 3000, 1.2); osc('sawtooth', 220, t, 0.35, 0.18, 660); osc('square', 330, t + 0.05, 0.3, 0.08, 990); break;
    case 'jump':     osc('sine', 200, t, 0.35, 0.3, 700); noise(t, 0.3, 0.2, 'bandpass', 600, 2400, 1); break;
    case 'ko':       osc('sawtooth', 440, t, 0.6, 0.25, 70); osc('square', 330, t, 0.5, 0.1, 50); noise(t, 0.5, 0.4, 'lowpass', 2000, 100); break;
    case 'heal':     osc('sine', 660, t, 0.2, 0.06, 990); break;
    case 'click':    osc('triangle', 900, t, 0.05, 0.2, 600); noise(t, 0.03, 0.15, 'highpass', 3000); break;
    case 'select':   osc('triangle', 660, t, 0.08, 0.2, 990); osc('sine', 1320, t + 0.06, 0.12, 0.1); break;
    case 'count':    osc('square', 660, t, 0.12, 0.12); break;
    case 'go':       osc('square', 990, t, 0.3, 0.14); osc('square', 1320, t, 0.3, 0.08); break;
    case 'empty':    osc('square', 180, t, 0.05, 0.08); break;
    case 'toz':      noise(t, 1.0, 0.25, 'lowpass', 400, 200, 0.5, sfxBus, 0.3); break;
    case 'win': {
      const n = [293.66, 369.99, 440, 587.33, 739.99, 880];
      n.forEach((f, i) => { osc('square', f, t + i * 0.11, 0.25, 0.09); osc('triangle', f, t + i * 0.11, 0.4, 0.12); });
      osc('triangle', 1174.66, t + 0.7, 0.9, 0.14); noise(t + 0.7, 0.8, 0.15, 'highpass', 6000);
      break;
    }
    case 'vs':       noise(t, 0.5, 0.5, 'bandpass', 200, 4000, 1); osc('sawtooth', 110, t + 0.35, 0.5, 0.2, 55); noise(t + 0.35, 0.4, 0.5, 'lowpass', 1500, 80); osc('square', 220, t + 0.4, 0.25, 0.08); break;
    case 'crash':    noise(t, 0.45, 0.8, 'lowpass', 3000, 200, 0.8); for (let i = 0; i < 5; i++) osc('triangle', 300 + Math.random() * 900, t + i * 0.04, 0.08, 0.12, 120); osc('sine', 90, t, 0.3, 0.5, 40); break;
    case 'drink':    for (let i = 0; i < 4; i++) osc('sine', 500 + i * 120, t + i * 0.07, 0.1, 0.15, 900 + i * 100); break;
    case 'boost':    osc('sawtooth', 300, t, 0.3, 0.1, 900); osc('sine', 600, t + 0.1, 0.3, 0.12, 1400); noise(t, 0.25, 0.2, 'highpass', 3000); break;
    case 'flap':     for (let i = 0; i < 4; i++) noise(t + i * 0.06, 0.05, 0.25, 'bandpass', 900, 600, 2); break;
    case 'lose': [440, 415.3, 392, 311.13].forEach((f, i) => osc('triangle', f, t + i * 0.22, 0.4, 0.13)); break;
  }
}

// ---------- müzik (darbuka + saz, Hicaz) ----------
let musicTimer = null, musicMode = null, nextT = 0, step = 0, phrase = [];
const DUM_TEK = { menu: 'D..t..t.D.D.t...', battle: 'D.tkD.tkD.t.Dktk' };
function drum(kind, t) {
  if (kind === 'D') { osc('sine', 110, t, 0.28, 0.9, 48, musicBus); noise(t, 0.05, 0.25, 'lowpass', 400, null, 1, musicBus); }
  else if (kind === 't') { noise(t, 0.07, 0.55, 'bandpass', 3200, 2400, 3, musicBus); osc('sine', 700, t, 0.04, 0.2, 500, musicBus); }
  else if (kind === 'k') { noise(t, 0.04, 0.25, 'highpass', 5000, null, 1, musicBus); }
}
function newPhrase() {
  // makam içinde dolaşan, 16'lık bir ezgi
  const p = []; let n = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < 16; i++) {
    if (i % 2 === 1 && Math.random() < 0.55) { p.push(-1); continue; }
    n = Math.max(0, Math.min(11, n + [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)]));
    p.push(n);
  }
  p[14] = 4; p[15] = -1; p[0] = Math.random() < .5 ? 7 : 4; return p;
}
function schedule() {
  if (!ac) return;
  const bpm = musicMode === 'battle' ? 128 : 100, sp = 60 / bpm / 4;
  while (nextT < ac.currentTime + 0.25) {
    const i = step % 16, bar = Math.floor(step / 16);
    if (i === 0 && bar % 2 === 0) phrase = newPhrase();
    const pat = DUM_TEK[musicMode]; const ch = pat[i];
    if (ch !== '.') drum(ch, nextT);
    const note = phrase[i];
    if (note >= 0 && (musicMode === 'battle' || bar % 4 !== 3)) playBuf(plucks[note], nextT, musicMode === 'battle' ? 0.55 : 0.5);
    if (i === 0) playBuf(bar % 4 === 2 ? plucks.bass2 : plucks.bass, nextT, 0.7);
    if (i === 8 && musicMode === 'battle') playBuf(plucks.bass, nextT, 0.5);
    nextT += sp; step++;
  }
}
export function music(mode) {
  if (!ac) return;
  if (mode === musicMode) return;
  musicMode = mode;
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  if (!mode) return;
  nextT = ac.currentTime + 0.1; step = 0; phrase = newPhrase();
  musicTimer = setInterval(schedule, 60);
}
