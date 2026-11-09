// ===== MEYDAN — oyun ayarları =====
export const T = 60;            // bir karenin (tile) piksel boyu
export const MAX_AMMO = 3;
export const ROUND_TIME = 90;   // saniye
export const TOZ_START = 40;    // toz bulutu kapanmaya başlar
export const WIN_ROUNDS = 2;

// Karakterler (Kahramanlar)
// attack.type: spread | bounce | lob
// super.type : lobBlast | radial | jump | multiLob
export const CHARS = {
  cayci: {
    id: 'cayci', name: 'Çaycı Abi', role: 'Yakın Dövüşçü', rarity: 'Efsane',
    color: '#e8473b', hp: 4200, speed: 275, reload: 1.3, quote: 'Çaylar benden!',
    lore: 'Mahallenin en hızlı çaycısı. Tepsisi hiç boş kalmaz, bardakları hiç ıskalamaz.',
    attack: { name: 'Sıcak Çay', desc: 'Üç bardak sıcak çayı yelpaze gibi fırlatır.',
      type: 'spread', count: 3, spread: 0.42, dmg: 440, range: 390, speed: 900, r: 15, proj: 'tea' },
    super: { name: 'Semaver Patlatma', desc: 'Kaynayan semaveri fırlatır. Patlar ve yeri bir süre yakar.',
      type: 'lobBlast', dmg: 1400, radius: 135, range: 520, dur: 0.7, burn: { dps: 380, time: 2.6 }, proj: 'semaver' },
    superHits: 7,
  },
  simitci: {
    id: 'simitci', name: 'Simitçi', role: 'Nişancı', rarity: 'Destansı',
    color: '#f2a43a', hp: 3200, speed: 265, reload: 1.1, quote: 'Simiiit! Taze simit!',
    lore: 'Sabah ezanından önce fırından çıkar. Simitleri duvardan seker, hedefi şaşırtır.',
    attack: { name: 'Susamlı Simit', desc: 'Uzağa giden ve duvardan bir kez seken simit atar.',
      type: 'bounce', count: 1, dmg: 980, range: 650, speed: 1050, r: 16, bounces: 1, proj: 'simit' },
    super: { name: 'Tepsi Çevirme', desc: 'Tepsiyi çevirip her yöne 12 simit saçar.',
      type: 'radial', count: 12, dmg: 650, range: 470, speed: 860, r: 15, bounces: 1, proj: 'simit' },
    superHits: 4,
  },
  kel: {
    id: 'kel', name: 'Keloğlan', role: 'Suikastçı', rarity: 'Efsane',
    color: '#4bbf5a', hp: 4600, speed: 300, reload: 1.0, quote: 'Ben Keloğlan\'ım, pes etmem!',
    lore: 'Masallardan çıkıp meydana indi. Kurnaz, hızlı ve hiç pes etmez.',
    attack: { name: 'Değnek Darbesi', desc: 'Kısa mesafede değneğini savurur, çok sert vurur.',
      type: 'spread', count: 3, spread: 0.6, dmg: 620, range: 190, speed: 1100, r: 20, proj: 'swing' },
    super: { name: 'Masal Zıplayışı', desc: 'Duvarların üstünden zıplar, indiği yeri sarsar.',
      type: 'jump', dmg: 1500, radius: 125, range: 470, dur: 0.6 },
    superHits: 4,
  },
  teyze: {
    id: 'teyze', name: 'Pazarcı Teyze', role: 'Topçu', rarity: 'Destansı',
    color: '#a35bd6', hp: 3000, speed: 255, reload: 1.5, quote: 'Taze bunlar, taze!',
    lore: 'Pazarın kraliçesi. "Taze bunlar!" diye bağırınca kimse yerinde duramaz.',
    attack: { name: 'Domates Yağmuru', desc: 'Duvarların üstünden domates atar, düştüğü yer patlar.',
      type: 'lob', dmg: 950, radius: 72, range: 560, dur: 0.65, proj: 'tomato' },
    super: { name: 'Kasa Kasa Domates', desc: 'Bir kasa domatesi hedefin etrafına yağdırır.',
      type: 'multiLob', count: 6, spreadR: 95, dmg: 760, radius: 78, range: 560, dur: 0.75, proj: 'tomato' },
    superHits: 5,
  },
};
export const CHAR_ORDER = ['cayci', 'simitci', 'kel', 'teyze'];

// Yakında gelecek karakterler (menüde kilitli görünür)
export const COMING = [
  { name: 'Nasreddin Hoca', role: 'Kaçak Ustası' },
  { name: 'Kangallı Çoban', role: 'Hayvan Dostu' },
  { name: 'Dolmuşçu', role: 'Tank' },
  { name: 'Ozan', role: 'Destek' },
];

// ===== Haritalar =====
// # duvar (süper güçle kırılır)  b çalı/halı  f çeşme (can)  c çay ocağı (hız)  1 2 doğma noktası  . zemin
// Üst yarı + orta satır yazılır; alt yarı 180° döndürülerek simetrik üretilir.
const KAPALI_TOP = [
  '1......bbb.......##......',
  '.......bbb.......##..bb..',
  '..##..........b......bb..',
  '..##....###...b.....f....',
  '........#.........###....',
  'bb..c...#....bb..........',
  'bb...........bb.....##...',
];
const KAPALI_MID = '....##.....bbb.....##....';

function mirrorMap(top, mid) {
  const bottom = top.slice().reverse().map(r => r.split('').reverse().join('').replace('1', '2'));
  return [...top, mid, ...bottom];
}

export const MAPS = {
  kapalicarsi: {
    id: 'kapalicarsi', name: 'Kapalıçarşı',
    rows: mirrorMap(KAPALI_TOP, KAPALI_MID),
    theme: {
      floorA: '#d8b98a', floorB: '#cfae7c', grout: '#b48d5c',
      wallTop: '#9c5b34', wallFace: '#6e3b1f', wallEdge: '#3c1e0e',
      awnings: ['#d83a34', '#1f7fbf', '#e9a726', '#2f9e5b', '#8e44ad'],
      bushA: '#b8322f', bushB: '#7d1f2a', bushPattern: '#f2c14e',
      toz: 'rgba(120,160,70,', bg: '#3a2414',
    },
  },
};
