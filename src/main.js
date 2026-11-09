// ===== MEYDAN — menüler ve uygulama akışı =====
import { CHARS, CHAR_ORDER, COMING, ROAD, REWARD, MAX_LEVEL, upgradeCost, LEVEL_BONUS } from './config.js';
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
  online: false, lastMode: 'quick', p: null,
};
if (!CHARS[state.char]) state.char = 'cayci';

// ---------- ekran yönetimi ----------
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('show', s.id === id));
  $('bQuit').classList.toggle('hidden', id !== null);
  if (id === 's-home') startHeroAnim(); else stopHeroAnim();
  if (id && id !== 's-result') music('menu');
  if (id === 's-home') refreshTop();
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
const levelOf = (c) => Math.max(1, (state.p && state.p.levels && +state.p.levels[c]) || 1);
function applyProfile(p) {
  if (!p || !p.id) return;
  state.p = p; state.trophies = p.trophies; store.set('meydan_trophies', p.trophies); refreshTop();
}
function claimableQuests() { const q = state.p && state.p.quests; return q ? q.list.filter(e => !e.done && e.p >= e.n).length : 0; }
function claimableRoad() { if (!state.p) return 0; return ROAD.filter((r, i) => state.trophies >= r.need && !state.p.road.includes(i)).length; }
function badge(id, n) { const el = $(id); el.textContent = n; el.classList.toggle('on', n > 0); }
function refreshTop() {
  $('hName').textContent = state.name || 'Oyuncu';
  $('hTrophy').textContent = state.trophies;
  const p = state.p;
  $('hAkce').textContent = p ? p.akce : '-'; $('hNazar').textContent = p ? p.nazar : '-';
  badge('bdBohca', p ? p.bohca : 0); badge('bdQuest', claimableQuests()); badge('bdRoad', claimableRoad());
  const next = ROAD.find((r, i) => !(p && p.road.includes(i)) && r.need > state.trophies) || ROAD[ROAD.length - 1];
  const prevNeed = [...ROAD].reverse().find(r => r.need <= state.trophies)?.need || 0;
  $('rcNext').textContent = `${state.trophies} / ${next.need} 🏆`;
  $('rcFill').style.width = Math.min(100, (state.trophies - prevNeed) / Math.max(1, next.need - prevNeed) * 100) + '%';
  $('hLevel').textContent = levelOf(state.char);
  $('tileHero').src = url('ch_' + state.char);
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
    try { applyProfile(await n.profile()); } catch (e) { console.warn('profil alınamadı', e && e.message); }
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
  const ch = CHARS[id], maxHp = 4600 * (1 + LEVEL_BONUS * 9), el = $('charDetail');
  const spd = ch.speed / 280, rng = (ch.attack.range) / 650;
  const dps = (ch.attack.dmg * (ch.attack.count || 1)) / ch.reload / 1500;
  el.innerHTML = `<img class="big" src="${url('ch_' + id)}" alt=""><h3 style="color:${ch.color}">${ch.name}</h3><div class="role">${ch.role} · ${ch.rarity}</div>
    <div class="lore">"${ch.lore}"</div>
    <div class="stat">❤️ Can <i><b style="width:${ch.hp * (1 + LEVEL_BONUS * (levelOf(id) - 1)) / maxHp * 100}%"></b></i> ${Math.round(ch.hp * (1 + LEVEL_BONUS * (levelOf(id) - 1)))}</div>
    <div class="stat">💥 Hasar <i><b style="width:${Math.min(100, dps * 100)}%"></b></i></div>
    <div class="stat">🎯 Menzil <i><b style="width:${Math.min(100, rng * 100)}%"></b></i></div>
    <div class="stat">👟 Hız <i><b style="width:${spd * 100}%"></b></i></div>
    <div class="ab"><b>${ch.attack.name}</b><p>${ch.attack.desc}</p></div>
    <div class="ab"><b class="sup">⚡ GAZ: ${ch.super.name}</b><p>${ch.super.desc}</p></div>
    <div class="lvrow"><div class="lv-badge">${levelOf(id)}</div><span style="font-family:system-ui;font-size:12px;opacity:.75">Her seviye +%${Math.round(LEVEL_BONUS * 100)} can ve hasar</span></div>
    ${levelOf(id) < MAX_LEVEL ? `<button class="btn green-up" id="upBtn">GÜÇLENDİR <span class="cost"><img src="${url('it_akce')}">${upgradeCost(levelOf(id))}</span></button>` : '<div style="text-align:center;color:#ffe066">EN YÜKSEK SEVİYE</div>'}
    <button class="btn yellow" id="pickBtn">${id === state.char ? 'SEÇİLİ ✓' : 'SEÇ'}</button>`;
  const ub = $('upBtn');
  if (ub) ub.onclick = async () => {
    if (!state.p) { toast('Güçlendirmek için internete bağlan'); return; }
    if (state.p.akce < upgradeCost(levelOf(id))) { sfx('empty'); toast('Yeterli akçen yok. Maç kazan, bohça aç!'); return; }
    ub.disabled = true;
    try { applyProfile(await net.upgrade(id)); sfx('upgrade'); flash(); toast(`${ch.name} seviye ${levelOf(id)} oldu!`); detail(id); }
    catch (e) { toast('Güçlendirilemedi'); ub.disabled = false; }
  };
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
  startGame({ mode: 'bot', mapId: 'kapalicarsi', me: { name: state.name, char: state.char, lvl: levelOf(state.char) }, opp: { name: `🤖 ${names[Math.floor(Math.random() * names.length)]} (${lvlName})`, char: bc, lvl: Math.max(1, levelOf(state.char) - 1 + lvl) }, botLevel: lvl });
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
  const me = { sid: net.newSid(), name: state.name, char: state.char, trophies: state.trophies, lvl: levelOf(state.char) };
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
      startGame({ mode: 'net', mapId: 'kapalicarsi', net: r, isHost, me: { name: state.name, char: state.char, trophies: state.trophies, lvl: levelOf(state.char) }, opp: { name: opp.name, char: CHARS[opp.char] ? opp.char : 'cayci', trophies: opp.trophies, lvl: opp.lvl || 1 } });
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
        if (res) { applyProfile(res); $('rTrophy').innerHTML = `🏆 ${res.delta >= 0 ? '+' : ''}${res.delta} &nbsp; <img class="ri" src="${url('it_akce')}"> +${res.gainAkce}` + (res.gainBohca ? ` &nbsp; <img class="ri" src="${url('it_bohca')}"> +1` : ''); sfx('coin'); }
      } catch (e) { $('rTrophy').textContent = '🏆 kaydedilemedi'; }
    } else {
      if (state.online && net) net.report(r.won, state.char, r.opp, 'bot').then(res => { if (res) { applyProfile(res); if (res.gainAkce) { $('rTrophy').innerHTML += ` &nbsp; <img class="ri" src="${url('it_akce')}"> +${res.gainAkce}`; sfx('coin'); } } }).catch(() => {});
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
  enterRoom('oda-' + code, { sid: net.newSid(), name: state.name, char: state.char, trophies: state.trophies, lvl: levelOf(state.char), friend: true });
};
$('fJoin').onclick = () => {
  sfx('click'); if (!state.online) { toast('Önce internete bağlanmalısın'); connect(); return; }
  const code = $('fIn').value.trim(); if (!/^\d{4}$/.test(code)) { toast('4 haneli kodu yaz'); return; }
  leaveRoom(); state.lastMode = 'friend';
  $('fStatus').textContent = 'Odaya bağlanılıyor...';
  enterRoom('oda-' + code, { sid: net.newSid(), name: state.name, char: state.char, trophies: state.trophies, lvl: levelOf(state.char), friend: true });
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
$('bBohca').onclick = () => { sfx('click'); if (!needOnline()) return; openBohcaScreen(); };
$('bQuests').onclick = () => { sfx('click'); if (!needOnline()) return; renderQuests(); show('s-quests'); };
$('bRoad').onclick = $('pTrophy').onclick = () => { sfx('click'); if (!needOnline()) return; renderRoad(); show('s-road'); };
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
window.__meydan = { state, startBot, applyProfile, show, setNet: (n) => { net = n; state.online = true; }, get game() { return game; } };


// ===== İlerleme ekranları =====
function needOnline() { if (state.online && state.p) return true; toast('Bunun için internete bağlı olmalısın'); connect(); return false; }
function flash() { const f = document.createElement('div'); f.className = 'flash'; document.body.appendChild(f); setTimeout(() => f.remove(), 600); }
function showReward(rt, ra) {
  const R = REWARD[rt]; $('rwImg').src = url(R.img); $('rwName').textContent = R.name; $('m-reward').classList.add('show');
  sfx('burst'); countUp($('rwAmt'), ra);
}
function countUp(el, to) {
  const t0 = performance.now(), d = 700;
  const step = (n) => { const k = Math.min(1, (n - t0) / d); el.textContent = '+' + Math.round(to * k); if (k < 1) { if (Math.random() < .4) sfx('coin'); requestAnimationFrame(step); } };
  requestAnimationFrame(step);
}

// --- Bohça ---
let bxBusy = false, bxStage = 0;
function openBohcaScreen() { resetBohca(); show('s-bohca'); }
function resetBohca() {
  bxBusy = false; bxStage = 0;
  $('bxCount').textContent = state.p ? state.p.bohca : 0;
  const im = $('bxImg'); im.src = url('it_bohca'); im.className = '';
  $('bxReward').classList.remove('on'); $('bxRays').classList.remove('on');
  $('bxAgain').classList.add('hidden'); $('bxDone').classList.add('hidden');
  $('bxHint').style.display = ''; $('bxHint').textContent = state.p && state.p.bohca > 0 ? 'Bohçaya dokun, aç!' : 'Bohçan yok. Online maç kazan, Meydan Yolu\'ndan topla!';
}
$('bxImg').onclick = async () => {
  if (bxBusy || !state.p || state.p.bohca < 1 || bxStage >= 3) return;
  bxStage++; const im = $('bxImg');
  sfx('shake', bxStage); im.classList.remove('shake'); void im.offsetWidth; im.classList.add('shake');
  if (navigator.vibrate) try { navigator.vibrate(30 * bxStage); } catch (e) {}
  if (bxStage < 3) { $('bxHint').textContent = ['', 'Bir daha!', 'Son bir kez!'][bxStage]; setTimeout(() => im.classList.remove('shake'), 350); return; }
  bxBusy = true; $('bxHint').style.display = 'none';
  let res;
  try { res = await net.openBohca(); } catch (e) { toast('Bohça açılamadı'); resetBohca(); return; }
  setTimeout(() => {
    im.classList.remove('shake'); flash(); sfx('burst'); im.src = url('it_bohca_open'); im.classList.add('burst');
    $('bxRays').classList.add('on');
    const R = REWARD[res.rt]; $('bxRImg').src = url(R.img); $('bxRName').textContent = res.big ? 'BÜYÜK İKRAMİYE! ' + R.name : R.name;
    $('bxReward').classList.add('on'); countUp($('bxRAmt'), res.ra);
    applyProfile(res); $('bxCount').textContent = res.bohca;
    setTimeout(() => { $('bxDone').classList.remove('hidden'); if (res.bohca > 0) $('bxAgain').classList.remove('hidden'); }, 800);
  }, 500);
};
$('bxAgain').onclick = () => { sfx('click'); resetBohca(); };
$('bxDone').onclick = () => { sfx('click'); show('s-home'); };

// --- Meydan Yolu ---
function renderRoad() {
  const el = $('roadList'); el.innerHTML = ''; $('rdTrophy').textContent = state.trophies;
  ROAD.forEach((r, i) => {
    const R = REWARD[r.rt], reach = state.trophies >= r.need, claimed = state.p && state.p.road.includes(i);
    const node = document.createElement('div'); node.className = 'rnode' + (reach ? ' reach' : '') + (claimed ? ' claimed' : '');
    node.innerHTML = `<div class="rneed"><img src="${url('ic_trophy')}">${r.need}</div><div class="rcard"><img src="${url(R.img)}"><b>${r.ra}</b></div>` +
      (claimed ? '<div class="ok">✓ ALINDI</div>' : reach ? '<button class="btn yellow">AL</button>' : '<div class="lock">🔒</div>');
    const b = node.querySelector('button');
    if (b) b.onclick = async () => { b.disabled = true; try { const res = await net.claimRoad(i); applyProfile(res); showReward(res.rt, res.ra); renderRoad(); } catch (e) { toast('Alınamadı'); b.disabled = false; } };
    el.appendChild(node);
  });
  const first = ROAD.findIndex((r, i) => !(state.p && state.p.road.includes(i)));
  setTimeout(() => { const n = el.children[Math.max(0, first)]; if (n) el.scrollLeft = n.offsetLeft - el.clientWidth / 2 + 75; }, 30);
}

// --- Görevler ---
function questText(e) {
  if (e.t === 'play') return `${e.n} maç oyna`;
  if (e.t === 'win') return `${e.n} maç kazan`;
  return `${CHARS[e.c] ? CHARS[e.c].name : e.c} ile ${e.n} maç kazan`;
}
function renderQuests() {
  const el = $('questList'); el.innerHTML = '';
  const q = state.p && state.p.quests; if (!q) { el.innerHTML = '<p style="text-align:center">Görevler yüklenemedi.</p>'; return; }
  q.list.forEach((e, i) => {
    const R = REWARD[e.rt], ok = e.p >= e.n;
    const d = document.createElement('div'); d.className = 'quest' + (e.done ? ' done' : '');
    d.innerHTML = `<div class="qi">${e.t === 'play' ? '⚔️' : e.t === 'win' ? '🏆' : '⭐'}</div>
      <div class="qt"><b>${questText(e)}</b><div class="qbar"><i style="width:${Math.min(100, e.p / e.n * 100)}%"></i><span>${e.p} / ${e.n}</span></div></div>
      <div class="qrw"><img src="${url(R.img)}"><b>${e.ra}</b></div>` +
      (e.done ? '<div class="ok" style="color:#7ee081;font-size:20px">✓</div>' : ok ? '<button class="btn yellow">AL</button>' : '');
    const b = d.querySelector('button');
    if (b) b.onclick = async () => { b.disabled = true; try { const res = await net.claimQuest(i); applyProfile(res); showReward(res.rt, res.ra); renderQuests(); } catch (e2) { toast('Alınamadı'); b.disabled = false; } };
    el.appendChild(d);
  });
}
