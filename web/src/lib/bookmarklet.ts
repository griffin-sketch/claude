/**
 * The "Send to Tourvo" button: a browser bookmark that runs on the listing page the realtor has open
 * (Realtor.com, HAR, her MLS, her brokerage site), collects the photo addresses her browser already loaded,
 * and opens Tourvo's import page with them. Nothing is fetched by Tourvo until she picks a listing there.
 */
export function bookmarklet(origin: string) {
  const src = `(()=>{const S=new Set,A=u=>{try{u=new URL(u,location.href).href;if(/^https?:/.test(u)&&!/\\.(svg|gif)(\\?|$)/i.test(u))S.add(u)}catch(e){}},
B=s=>{const b=s.split(',').map(c=>c.trim().split(/\\s+/)).sort((a,b)=>parseFloat(b[1]||0)-parseFloat(a[1]||0))[0];b&&b[0]&&A(b[0])};
document.querySelectorAll('img').forEach(i=>{const s=i.getAttribute('srcset')||i.getAttribute('data-srcset');if(s)B(s);
if((i.naturalWidth||0)>=500)A(i.currentSrc||i.src);['data-src','data-original','data-lazy','data-full','data-zoom-image'].forEach(k=>i.getAttribute(k)&&A(i.getAttribute(k)))});
document.querySelectorAll('source[srcset]').forEach(s=>B(s.getAttribute('srcset')));
document.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"]').forEach(m=>A(m.content));
document.querySelectorAll('[style*="background-image"]').forEach(e=>{const m=(e.style.backgroundImage||'').match(/url\\(["']?([^"')]+)/);m&&A(m[1])});
(document.documentElement.innerHTML.match(/https?:\\\\?\\/\\\\?\\/[^"'\\s<>()]+?\\.(?:jpe?g|png|webp)(?:\\?[^"'\\s<>()]*)?/gi)||[]).forEach(u=>A(u.replace(/\\\\\\//g,'/')));
const d={u:location.href,t:document.title,i:[...S].slice(0,200)};
window.open('${origin}/import#d='+encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(d))))),'_blank')})()`;
  return "javascript:" + encodeURIComponent(src.replace(/\n/g, ""));
}

export type SentPage = { u: string; t: string; i: string[] };

/** Read what the button sent (from the page's #d=… part). */
export function readSent(hash: string): SentPage | null {
  const m = hash.match(/[#&]d=([^&]+)/);
  if (!m) return null;
  try {
    const json = decodeURIComponent(escape(atob(decodeURIComponent(m[1]))));
    const d = JSON.parse(json) as SentPage;
    if (!d || !Array.isArray(d.i)) return null;
    return { u: String(d.u || ""), t: String(d.t || ""), i: d.i.filter((x) => typeof x === "string" && /^https?:\/\//.test(x)).slice(0, 200) };
  } catch {
    return null;
  }
}

/**
 * Listing sites often load only some photos (or only small thumbnails) until you open the gallery, but their full-size
 * photos are usually numbered: .../img-1.jpg, .../img-2.jpg ... When several addresses share a pattern like that,
 * fill in the whole numbered run so the realtor sees every photo. Addresses that don't exist just fail to load and drop out.
 */
export function expandNumbered(urls: string[], max = 300): string[] {
  const re = /^(.*?)(\d{1,3})(\D{0,12}\.(?:jpe?g|png|webp))(\?.*)?$/i;
  const groups = new Map<string, { pre: string; suf: string; q: string; have: Map<number, string>; first: number }>();
  urls.forEach((u, i) => {
    const m = u.match(re);
    if (!m) return;
    const key = m[1] + "#" + m[3];
    const g = groups.get(key) ?? { pre: m[1], suf: m[3], q: m[4] ?? "", have: new Map(), first: i };
    if (!g.have.has(Number(m[2]))) g.have.set(Number(m[2]), u);
    groups.set(key, g);
  });
  const seq = new Map<number, string[]>();   // first position of a numbered run -> the full run, in order
  const inRun = new Set<string>();
  for (const g of groups.values()) {
    const nums = [...g.have.keys()];
    if (nums.length < 3) continue;           // a couple of numbers isn't a photo gallery
    const top = Math.min(Math.max(...nums) + 15, 120);
    const run: string[] = [];
    for (let n = Math.min(1, ...nums); n <= top; n++) run.push(g.have.get(n) ?? `${g.pre}${n}${g.suf}${g.q}`);
    seq.set(g.first, run);
    g.have.forEach((u) => inRun.add(u));
  }
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (u: string) => { if (!seen.has(u)) { seen.add(u); out.push(u); } };
  urls.forEach((u, i) => {
    if (seq.has(i)) seq.get(i)!.forEach(add);
    else if (!inRun.has(u)) add(u);
  });
  return out.slice(0, max);
}
