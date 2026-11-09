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
