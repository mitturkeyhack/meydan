// ===== MEYDAN — görsel yükleyici =====
const NAMES = [
  'ch_cayci', 'ch_simitci', 'ch_kel', 'ch_teyze',
  'st_spice', 'st_lamp', 'st_sacks', 'bush_carpet',
  'pr_tea', 'pr_simit', 'pr_tomato', 'pr_semaver',
  'ic_trophy', 'ic_gaz', 'md_duel', 'md_simit', 'md_siege', 'logo', 'floor', 'bg_bazaar',
  'pad_ocak', 'pad_cesme', 'it_bohca', 'it_bohca_open', 'it_akce', 'it_nazar',
];
export const IMG = {};
export const url = (n) => 'assets/' + n + '.webp';

export function loadAssets(onProgress) {
  let done = 0;
  return Promise.all(NAMES.map(n => new Promise(res => {
    const im = new Image();
    im.onload = () => { IMG[n] = im; done++; onProgress && onProgress(done / NAMES.length); res(); };
    im.onerror = () => { done++; onProgress && onProgress(done / NAMES.length); res(); };
    im.src = url(n);
  })));
}

// Beyaz parlama için siluet önbelleği
const white = new Map();
export function whiteOf(img) {
  if (white.has(img)) return white.get(img);
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  white.set(img, c); return c;
}

// ===== Performans: önceden küçültülmüş görsel önbelleği =====
// Büyük resimleri her karede küçültmek telefonu yorar; hedef boyuta bir kez küçültüp saklarız.
const cache = new Map();
export function sized(img, w, h, gray = false) {
  if (!img) return null;
  const W = Math.max(2, Math.round(w)), H = Math.max(2, Math.round(h));
  const key = img.src + '|' + W + 'x' + H + (gray ? 'g' : '');
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
  // büyük oranlarda kademeli küçült (daha net sonuç)
  let src = img, sw = img.width, sh = img.height;
  while (sw / 2 > W * 1.2) {
    const t = document.createElement('canvas'); t.width = Math.round(sw / 2); t.height = Math.round(sh / 2);
    t.getContext('2d').drawImage(src, 0, 0, t.width, t.height); src = t; sw = t.width; sh = t.height;
  }
  x.drawImage(src, 0, 0, W, H);
  if (gray) {
    try {
      const d = x.getImageData(0, 0, W, H), a = d.data;
      for (let i = 0; i < a.length; i += 4) { const v = (a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11) * 0.6; a[i] = a[i + 1] = a[i + 2] = v; }
      x.putImageData(d, 0, 0);
    } catch (e) {}
  }
  if (cache.size > 400) cache.clear();
  cache.set(key, c);
  return c;
}
