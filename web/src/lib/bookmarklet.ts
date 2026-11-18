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
