// ===== MEYDAN — Supabase: profil, kupa, sıralama, eşleşme ve 1v1 oda =====
import { createClient } from '@supabase/supabase-js';

const SB_URL = 'https://dhkhlptixkbyennclhji.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoa2hscHRpeGtieWVubmNsaGppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MDE2OTksImV4cCI6MjEwNzI3NzY5OX0.HssSQpCKi2gp8Nhtn1d50ejFUc_hcva7l0G82UeggGU';

export const sb = createClient(SB_URL, SB_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { params: { eventsPerSecond: 40 } },
});

function rid(n = 24) {
  const a = new Uint8Array(n); (crypto || window.crypto).getRandomValues(a);
  return Array.from(a, b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
}
export function deviceKey() {
  let k = null; try { k = localStorage.getItem('meydan_key'); } catch (e) {}
  if (!k || k.length < 20) { k = 'm' + rid(31); try { localStorage.setItem('meydan_key', k); } catch (e) {} }
  return k;
}

// ---------- profil ----------
export async function register(name) {
  const { data, error } = await sb.rpc('meydan_register', { p_key: deviceKey(), p_name: name });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}
export async function report(won, char, opponent) {
  const { data, error } = await sb.rpc('meydan_report', { p_key: deviceKey(), p_won: won, p_char: char, p_opponent: opponent, p_mode: 'duello' });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}
export async function leaderboard() {
  const { data, error } = await sb.rpc('meydan_leaderboard');
  if (error) throw error;
  return data || [];
}

// ---------- 1v1 oda ----------
// Kanal üstünden tek olay: 'm' -> {y: tür, p: veri}
export function joinRoom(name, me, { onReady, onError }) {
  const myId = me.sid;
  const ch = sb.channel('meydan-room-' + name, { config: { broadcast: { self: false, ack: false } } });
  let opp = null, theySawMe = false, ready = false, helloTimer = null, dead = false;
  const room = {
    onMsg: null,
    send(y, p) { if (dead) return; ch.send({ type: 'broadcast', event: 'm', payload: { y, p } }).catch(() => {}); },
    leave() {
      if (dead) return; room.send('bye', {}); dead = true; clearInterval(helloTimer); clearTimeout(to);
      setTimeout(() => sb.removeChannel(ch).catch(() => {}), 300);
    },
  };
  const hello = () => room.send('hello', { id: myId, name: me.name, char: me.char, trophies: me.trophies || 0, seen: opp ? 1 : 0 });
  ch.on('broadcast', { event: 'm' }, ({ payload }) => {
    if (!payload || dead) return;
    const { y, p } = payload;
    if (y === 'hello') {
      if (!opp) { opp = p; hello(); }
      if (p.seen) theySawMe = true;
      if (opp && theySawMe && !ready) {
        ready = true; clearInterval(helloTimer); clearTimeout(to); hello();
        onReady(opp, myId < opp.id, room);
      }
      return;
    }
    if (ready && room.onMsg) room.onMsg(y, p);
  });
  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') { hello(); helloTimer = setInterval(hello, 600); }
    else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !ready) { fail('Bağlantı kurulamadı'); }
  });
  const fail = (msg) => { if (dead) return; dead = true; clearInterval(helloTimer); sb.removeChannel(ch).catch(() => {}); onError && onError(msg); };
  const to = setTimeout(() => { if (!ready) fail(me.friend ? 'Arkadaşın odaya gelmedi' : 'Rakip bağlanamadı'); }, me.friend ? 120000 : 12000);
  return room;
}

// ---------- hızlı eşleşme (lobi) ----------
export function findMatch(me, { onFound, onCount, onError }) {
  const myId = me.sid;
  const ch = sb.channel('meydan-lobby', { config: { presence: { key: myId } } });
  let done = false;
  const stop = () => { if (done) return; done = true; ch.untrack().catch(() => {}); setTimeout(() => sb.removeChannel(ch).catch(() => {}), 200); };
  ch.on('presence', { event: 'sync' }, () => {
    if (done) return;
    const st = ch.presenceState();
    const list = Object.values(st).map(a => a && a[0]).filter(x => x && x.id && x.w === 1);
    list.sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
    onCount && onCount(list.length);
    const i = list.findIndex(x => x.id === myId); if (i < 0) return;
    const j = i % 2 === 0 ? i + 1 : i - 1; const partner = list[j];
    if (!partner) return;
    const roomId = [myId, partner.id].sort().join('_');
    stop();
    onFound(roomId, partner);
  });
  ch.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') { try { await ch.track({ id: myId, name: me.name, trophies: me.trophies || 0, t: Date.now(), w: 1 }); } catch (e) { onError && onError('Lobiye girilemedi'); } }
    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { if (!done) { stop(); onError && onError('Sunucuya bağlanılamadı'); } }
  });
  return stop;
}
export function newSid() { return rid(16); }
