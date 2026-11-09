// ===== MEYDAN — GitHub'dan güncelleme kontrolü =====
/* global __BUILD__, __REPO__ */
export const BUILD = typeof __BUILD__ !== 'undefined' ? parseInt(__BUILD__, 10) || 0 : 0;
export const REPO = typeof __REPO__ !== 'undefined' ? __REPO__ : '';
export const VERSION = '1.0.' + BUILD;

export async function checkUpdate() {
  if (!REPO || !BUILD) return null;
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) return null;
    const j = await r.json();
    const m = /(\d+)\s*$/.exec(j.tag_name || ''); const latest = m ? parseInt(m[1], 10) : 0;
    if (latest <= BUILD) return null;
    const apk = (j.assets || []).find(a => /\.apk$/i.test(a.name));
    return { version: '1.0.' + latest, url: apk ? apk.browser_download_url : j.html_url, notes: (j.body || '').slice(0, 400) };
  } catch (e) { return null; }
}
export async function openUrl(url) {
  try { const { Browser } = await import('@capacitor/browser'); await Browser.open({ url }); }
  catch (e) { window.open(url, '_blank'); }
}
