// ===== MEYDAN — menüler ve uygulama akışı =====
import { CHARS, CHAR_ORDER, COMING } from './config.js';
import { loadAssets, url } from './assets.js';
import { initAudio, sfx, music, setSfx, setMusic, audioState } from './audio.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { checkUpdate, openUrl, VERSION } from './update.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const input = new Input(canvas);
let net = null;               // ağ modülü (Supabase) — tembel yüklenir
let game = null, room = null, stopSearch = null, searchTimer = null, heroAnim = null;

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};
const state = {
  name: store.get('meydan_name', ''),
  char: store.get('meydan_char', 'cayci'),
  trophies: +store.get('meydan_trophies', '0') || 0,
  online: false, lastMode: 'quick',
};
if (!CHARS[state.char]) state.char = 'cayci';

// ---------- ekran yönetimi ----------
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('show', s.id === id));
  $('bQuit').classList.toggle('hidden', id !== null);
  if (id === 's-home') startHeroAnim(); else stopHeroAnim();
  if (id === 's-home' || id === 's-chars' || id === 's-friend' || id === 's-board' || id === 's-search') music('menu');
}
function hideAll() { document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); stopHeroAnim(); $('bQuit').classList.remove('hidden'); }
document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => { sfx('click'); leaveRoom(); show('s-home'); }));
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { sfx('click'); b.closest('.modal').classList.remove('show'); }));
document.addEventListener('pointerdown', () => { initAudio(); if (!game && document.querySelector('.screen.show')) music('menu'); }, { capture: true });
document.addEventListener('click', (e) => { if (e.target.closest('button')) initAudio(); }, { capture: true });

// ---------- ana menü kahramanı ----------
let shownHero = null;
function startHeroAnim() {
  const ch = CHARS[state.char], im = $('heroImg');
  $('hHero').textContent = ch.name; $('hRole').textContent = ch.role;
  if (shownHero !== ch.id) {
    shownHero = ch.id; im.src = url('ch_' + ch.id);
    im.classList.remove('swap'); void im.offsetWidth; im.classList.add('swap');
    setTimeout(() => im.classList.remove('swap'), 500);
  }
  $('hAvatar').style.backgroundImage = `url(${url('ch_' + ch.id)})`;
}
function stopHeroAnim() {}
function refreshTop() {
  $('hName').textContent = state.name || 'Oyuncu';
  $('hTrophy').textContent = state.trophies;
  $('hStatus').textContent = state.online ? '● Çevrimiçi' : '○ Çevrimdışı (antrenman açık)';
  $('hStatus').style.color = state.online ? '#7ee081' : '#ffb3b3';
}

// ---------- ağ ----------
async function loadNet() {
  if (net) return net;
  net = await import('./net.js');
  return net;
}
async function connect() {
  try {
    const n = await loadNet();
    const p = await Promise.race([n.register(state.name), new Promise((_, r) => setTimeout(() => r(new Error('zaman aşımı')), 8000))]);
    if (p) { state.trophies = p.trophies; state.online = true; store.set('meydan_trophies', p.trophies); }
  } catch (e) { console.warn('Sunucu bağlantısı yok:', e && e.message); state.online = false; }
  refreshTop();
}

// ---------- karakterler ----------
function buildChars() {
  const grid = $('charGrid'); grid.innerHTML = '';
  for (const id of CHAR_ORDER) {
    const ch = CHARS[id];
    const card = document.createElement('div'); card.className = 'card' + (id === state.char ? ' sel' : '');
    card.style.setProperty('--c', ch.color);
    card.insertAdjacentHTML('beforeend', `<img class="pic" src="${url('ch_' + id)}" alt=""><div class="rar">${ch.rarity}</div><div class="nm">${ch.name}</div>`);
    card.addEventListener('click', () => { sfx('select'); detail(id); grid.querySelectorAll('.card').forEach(c => c.classList.remove('sel')); card.classList.add('sel'); });
    grid.appendChild(card);
  }
  for (const c of COMING) {
    grid.insertAdjacentHTML('beforeend', `<div class="card locked"><div class="lock">🔒</div><div class="nm">${c.name}</div></div>`);
  }
  detail(state.char);
}
function detail(id) {
  const ch = CHARS[id], maxHp = 4600, el = $('charDetail');
  const spd = ch.speed / 280, rng = (ch.attack.range) / 650;
  const dps = (ch.attack.dmg * (ch.attack.count || 1)) / ch.reload / 1500;
  el.innerHTML = `<img class="big" src="${url('ch_' + id)}" alt=""><h3 style="color:${ch.color}">${ch.name}</h3><div class="role">${ch.role} · ${ch.rarity}</div>
    <div class="lore">"${ch.lore}"</div>
    <div class="stat">❤️ Can <i><b style="width:${ch.hp / maxHp * 100}%"></b></i> ${ch.hp}</div>
    <div class="stat">💥 Hasar <i><b style="width:${Math.min(100, dps * 100)}%"></b></i></div>
    <div class="stat">🎯 Menzil <i><b style="width:${Math.min(100, rng * 100)}%"></b></i></div>
    <div class="stat">👟 Hız <i><b style="width:${spd * 100}%"></b></i></div>
    <div class="ab"><b>${ch.attack.name}</b><p>${ch.attack.desc}</p></div>
    <div class="ab"><b class="sup">⚡ GAZ: ${ch.super.name}</b><p>${ch.super.desc}</p></div>
    <button class="btn yellow" id="pickBtn">${id === state.char ? 'SEÇİLİ ✓' : 'SEÇ'}</button>`;
  $('pickBtn').onclick = () => { sfx('select'); state.char = id; store.set('meydan_char', id); detail(id); startHeroAnim(); };
}

// ---------- maç başlatma ----------
function startGame(opts) {
  hideAll();
  input.reset();
  game = new Game(canvas, input, {
    ...opts,
    onEnd: (r) => onMatchEnd(r, opts),
  });
}
function startBot() {
  leaveRoom();
  state.lastMode = 'bot';
  const others = CHAR_ORDER.filter(c => c !== state.char);
  const bc = others[Math.floor(Math.random() * others.length)];
  const names = ['Mahallenin Delisi', 'Bakkal Cemil', 'Seyyar Ramazan', 'Kahveci Osman', 'Kırtasiyeci Ayşe', 'Fırıncı Hasan'];
  const lvl = Math.max(0, Math.min(3, +store.get('meydan_botlvl', '0') || 0));
  const lvlName = ['Çırak', 'Kalfa', 'Usta', 'Ağa'][lvl];
  startGame({ mode: 'bot', mapId: 'kapalicarsi', me: { name: state.name, char: state.char }, opp: { name: `🤖 ${names[Math.floor(Math.random() * names.length)]} (${lvlName})`, char: bc }, botLevel: lvl });
}
async function quickMatch() {
  state.lastMode = 'quick';
  if (!state.online) { await connect(); if (!state.online) { toast('Sunucuya bağlanılamadı. Antrenman modunu deneyebilirsin.'); return; } }
  show('s-search'); $('sTitle').textContent = 'Rakip aranıyor...'; $('sInfo').textContent = 'Meydanda biri var mı bakıyoruz';
  $('sBot').classList.add('hidden');
  const t0 = Date.now();
  clearInterval(searchTimer);
  searchTimer = setInterval(() => {
    const s = Math.floor((Date.now() - t0) / 1000); $('sTime').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (s >= 10) $('sBot').classList.remove('hidden');
  }, 250);
  const me = { sid: net.newSid(), name: state.name, char: state.char, trophies: state.trophies };
  stopSearch = net.findMatch(me, {
    onCount: (n) => { $('sInfo').textContent = n > 1 ? `Lobide ${n} oyuncu var` : 'Meydanda biri var mı bakıyoruz'; },
    onFound: (roomId) => { $('sTitle').textContent = 'Rakip bulundu!'; sfx('select'); enterRoom(roomId, me); },
    onError: (m) => { toast(m); cancelSearch(); show('s-home'); },
  });
}
function enterRoom(roomId, me) {
  room = net.joinRoom(roomId, me, {
    onReady: (opp, isHost, r) => {
      clearInterval(searchTimer); stopSearch = null;
      startGame({ mode: 'net', mapId: 'kapalicarsi', net: r, isHost, me: { name: state.name, char: state.char, trophies: state.trophies }, opp: { name: opp.name, char: CHARS[opp.char] ? opp.char : 'cayci', trophies: opp.trophies } });
    },
    onError: (m) => { toast(m); room = null; if (me.friend) { $('fStatus').textContent = m; } else { cancelSearch(); show('s-home'); } },
  });
}
function cancelSearch() { clearInterval(searchTimer); if (stopSearch) stopSearch(); stopSearch = null; leaveRoom(); }
function leaveRoom() { if (room) { room.leave(); room = null; } }

async function onMatchEnd(r, opts) {
  const g = game;
  setTimeout(async () => {
    if (game === g) game = null;
    if (room) { const rm = room; room = null; setTimeout(() => rm.leave(), 1500); }
    $('rTitle').textContent = r.won ? 'KAZANDIN!' : 'KAYBETTİN';
    $('rTitle').classList.toggle('lose', !r.won);
    $('rScore').textContent = `${r.scores[0]} - ${r.scores[1]}` + (r.forfeit ? ' (rakip ayrıldı)' : '');
    const ch = CHARS[state.char]; $('rHero').src = url('ch_' + ch.id);
    const rh = $('rHero').parentElement; rh.style.setProperty('--c', ch.color); rh.classList.toggle('lose', !r.won); $('rHero').classList.toggle('dance', r.won);
    show('s-result');
    if (opts.mode === 'net') {
      $('rTrophy').textContent = '🏆 ...';
      try {
        const res = await net.report(r.won, state.char, r.opp);
        if (res) { state.trophies = res.trophies; store.set('meydan_trophies', res.trophies); $('rTrophy').textContent = `🏆 ${res.delta >= 0 ? '+' : ''}${res.delta}  (${res.trophies})`; }
      } catch (e) { $('rTrophy').textContent = '🏆 kaydedilemedi'; }
    } else {
      const lvl = Math.max(0, Math.min(3, (+store.get('meydan_botlvl', '0') || 0) + (r.won ? 1 : -1)));
      store.set('meydan_botlvl', String(lvl));
      $('rTrophy').textContent = 'Antrenman · sıradaki bot: ' + ['Çırak', 'Kalfa', 'Usta', 'Ağa'][lvl];
    }
    refreshTop();
  }, 900);
}

// ---------- arkadaş odası ----------
$('fCreate').onclick = () => {
  sfx('click'); if (!state.online) { toast('Önce internete bağlanmalısın'); connect(); return; }
  leaveRoom(); state.lastMode = 'friend';
  const code = String(Math.floor(1000 + Math.random() * 9000)); $('fCode').textContent = code;
  $('fStatus').textContent = 'Arkadaşın bekleniyor... Kodu ona söyle.';
  enterRoom('oda-' + code, { sid: net.newSid(), name: state.name, char: state.char, trophies: state.trophies, friend: true });
};
$('fJoin').onclick = () => {
  sfx('click'); if (!state.online) { toast('Önce internete bağlanmalısın'); connect(); return; }
  const code = $('fIn').value.trim(); if (!/^\d{4}$/.test(code)) { toast('4 haneli kodu yaz'); return; }
  leaveRoom(); state.lastMode = 'friend';
  $('fStatus').textContent = 'Odaya bağlanılıyor...';
  enterRoom('oda-' + code, { sid: net.newSid(), name: state.name, char: state.char, trophies: state.trophies, friend: true });
};

// ---------- sıralama ----------
async function openBoard() {
  show('s-board'); const el = $('boardList'); el.innerHTML = '<p style="text-align:center">Yükleniyor...</p>';
  try {
    const n = await loadNet(); const list = await n.leaderboard();
    el.innerHTML = list.length ? '' : '<p style="text-align:center">Henüz kimse yok. İlk sen ol!</p>';
    list.forEach((r, i) => {
      const fav = r.fav_char && CHARS[r.fav_char] ? CHARS[r.fav_char].name : '';
      el.insertAdjacentHTML('beforeend', `<div class="brow${r.name === state.name ? ' me' : ''}"><div class="rk">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</div><div class="nm">${esc(r.name)}<br><small>${fav} · ${r.wins} galibiyet</small></div><div class="tr">🏆 ${r.trophies}</div></div>`);
    });
  } catch (e) { el.innerHTML = '<p style="text-align:center">Sıralama yüklenemedi. İnternetini kontrol et.</p>'; }
}
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------- küçük bildirim ----------
let toastEl = null;
function toast(msg) {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1d1029;border:3px solid #ffe066;border-radius:12px;padding:10px 18px;z-index:60;font-family:system-ui;font-size:15px;max-width:80vw;text-align:center;transition:opacity .3s;pointer-events:none'; document.body.appendChild(toastEl); }
  toastEl.textContent = msg; toastEl.style.opacity = 1; clearTimeout(toastEl._t); toastEl._t = setTimeout(() => toastEl.style.opacity = 0, 2800);
}

// ---------- düğmeler ----------
$('bPlay').onclick = () => { sfx('click'); quickMatch(); };
$('bBot').onclick = () => { sfx('click'); startBot(); };
$('bChars').onclick = () => { sfx('click'); buildChars(); show('s-chars'); };
$('bFriend').onclick = () => { sfx('click'); $('fCode').textContent = '----'; $('fStatus').textContent = ''; show('s-friend'); };
$('bBoard').onclick = () => { sfx('click'); openBoard(); };
$('sCancel').onclick = () => { sfx('click'); cancelSearch(); show('s-home'); };
$('sBot').onclick = () => { sfx('click'); cancelSearch(); startBot(); };
$('rHome').onclick = () => { sfx('click'); show('s-home'); };
$('rAgain').onclick = () => { sfx('click'); if (state.lastMode === 'bot') startBot(); else if (state.lastMode === 'friend') { show('s-friend'); } else quickMatch(); };
$('bSettings').onclick = () => { sfx('click'); const a = audioState(); $('optSfx').checked = a.sfxOn; $('optMusic').checked = a.musicOn; $('optVer').textContent = 'Sürüm ' + VERSION; $('m-settings').classList.add('show'); };
$('optSfx').onchange = (e) => setSfx(e.target.checked);
$('optMusic').onchange = (e) => setMusic(e.target.checked);
$('optName').onclick = () => { $('m-settings').classList.remove('show'); $('nameIn').value = state.name; show('s-name'); };
$('bQuit').onclick = () => { if (!game) return; $('qInfo').textContent = game.mode === 'net' ? 'Çıkarsan maçı kaybetmiş sayılırsın.' : 'Antrenmandan çıkılacak.'; $('m-quit').classList.add('show'); };
$('qYes').onclick = () => {
  $('m-quit').classList.remove('show');
  if (!game) return;
  const g = game; game = null; music(null);
  if (g.mode === 'net') { onMatchEnd({ won: false, scores: [g.scores[g.me.side], g.scores[g.op.side]], opp: g.op.name, char: state.char }, { mode: 'net' }); }
  else { leaveRoom(); show('s-home'); }
};
$('nameOk').onclick = () => {
  const v = $('nameIn').value.trim().replace(/\s+/g, ' ');
  if (v.length < 2) { toast('En az 2 harf yaz'); return; }
  sfx('select'); state.name = v.slice(0, 14); store.set('meydan_name', state.name);
  refreshTop(); show('s-home'); connect();
};
addEventListener('resize', () => game && game.resize());
document.addEventListener('visibilitychange', () => { if (document.hidden) music(null); });

// ---------- ana döngü ----------
let lt = performance.now();
function loop(n) {
  const dt = Math.min(0.05, (n - lt) / 1000); lt = n;
  if (game) game.frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------- açılış ----------
const tips = ['Mahalle ısınıyor...', 'Çaylar demleniyor...', 'Simitler fırından çıkıyor...', 'Pazar kuruluyor...'];
$('loadTip').textContent = tips[Math.floor(Math.random() * tips.length)];
document.querySelectorAll('.screen').forEach(el => {
  const dark = el.id === 's-home' ? '.35' : '.6';
  el.style.backgroundImage = `linear-gradient(rgba(29,16,41,${dark}), rgba(29,16,41,.85)), url(${url('bg_bazaar')})`;
});
const t0 = performance.now();
loadAssets((k) => { $('loadBar').style.width = Math.round(k * 100) + '%'; }).then(() => {
  setTimeout(() => {
    refreshTop();
    if (!state.name) show('s-name'); else { show('s-home'); connect(); }
    setTimeout(() => runUpdateCheck(false), 2500);
  }, Math.max(300, 1200 - (performance.now() - t0)));
});
let pendingUpd = null;
async function runUpdateCheck(manual) {
  const u = await checkUpdate();
  if (u) { pendingUpd = u; $('uInfo').textContent = `Sürüm ${u.version} (sende ${VERSION})`; $('uNotes').textContent = u.notes; $('m-update').classList.add('show'); sfx('gazfull'); }
  else if (manual) toast('Oyun güncel ✓ (' + VERSION + ')');
}
$('uGo').onclick = () => { sfx('click'); if (pendingUpd) openUrl(pendingUpd.url); $('m-update').classList.remove('show'); };
$('optUpd').onclick = () => { sfx('click'); runUpdateCheck(true); };
window.__meydan = { state, startBot, get game() { return game; } };
