import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { imageSize } from "image-size";

/**
 * Pull listing photos in from somewhere the realtor points us:
 *  - a Dropbox or Google Drive share link (a folder or a single photo)
 *  - a photographer's delivery page, a zip, or a single image link
 *  - a list of image addresses that the "Send to Tourvo" button collected in her own browser
 * Every download is size-capped, only goes to public internet addresses, and must be a real photo.
 */

export type Photo = { name: string; data: Uint8Array; ext: string; type: string; width: number; height: number };

const MAX_IMAGE = 40 << 20;     // 40 MB a photo
const MAX_ZIP = 400 << 20;      // 400 MB a zip of photos
const MAX_PAGE = 5 << 20;       // 5 MB of web page
const MIN_W = 600, MIN_H = 400; // smaller than this is a logo, icon or thumbnail, not a listing photo (some MLS photos are only 471x630)
const UA = "Mozilla/5.0 (compatible; TourvoPhotoImport/1.0; +https://www.gettourvo.com)";

/** Sites whose pages we never fetch from the server (their terms forbid it and they block it). */
const PORTALS = ["zillow.com", "realtor.com", "homes.com", "redfin.com", "trulia.com", "har.com", "movoto.com", "homesnap.com"];
export function isPortal(host: string) {
  host = host.toLowerCase();
  return PORTALS.some((d) => host === d || host.endsWith(`.${d}`));
}

export class ImportError extends Error {}

function privateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
    const m = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return m ? privateIp(m[1]) : false;
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function checkUrl(raw: string) {
  let u: URL;
  try { u = new URL(raw); } catch { throw new ImportError("That doesn't look like a link."); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new ImportError("Only web links (https://…) can be imported.");
  if (u.username || u.password) throw new ImportError("That link can't be imported.");
  const addrs = isIP(u.hostname) ? [{ address: u.hostname }] : await lookup(u.hostname, { all: true }).catch(() => []);
  if (!addrs.length) throw new ImportError(`Couldn't reach ${u.hostname}.`);
  if (addrs.some((a) => privateIp(a.address))) throw new ImportError("That link can't be imported.");
  return u;
}

/** GET a public address, following up to 5 redirects (each one checked), stopping past `limit` bytes. */
async function get(raw: string, limit: number, accept = "*/*") {
  let url = raw;
  for (let hop = 0; hop < 6; hop++) {
    const u = await checkUrl(url);
    const res = await fetch(u, { redirect: "manual", headers: { "User-Agent": UA, Accept: accept }, signal: AbortSignal.timeout(45_000) });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, u).toString();
      continue;
    }
    if (!res.ok) throw new ImportError(`The link answered with an error (${res.status}). Make sure it's shared so anyone with the link can view it.`);
    const len = Number(res.headers.get("content-length") || 0);
    if (len > limit) throw new ImportError("That download is too big to import.");
    const reader = res.body?.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limit) { await reader.cancel(); throw new ImportError("That download is too big to import."); }
        parts.push(value);
      }
    }
    const data = new Uint8Array(size);
    let o = 0;
    for (const p of parts) { data.set(p, o); o += p.length; }
    return { data, type: (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase(), url: u };
  }
  throw new ImportError("That link redirects too many times.");
}

const EXT: Record<string, [string, string]> = {
  jpg: ["jpg", "image/jpeg"], png: ["png", "image/png"], webp: ["webp", "image/webp"],
  heif: ["heic", "image/heic"], heic: ["heic", "image/heic"], tiff: ["tiff", "image/tiff"],
};

/** A real listing photo, or null (too small, not an image, unreadable). */
function asPhoto(name: string, data: Uint8Array): Photo | null {
  try {
    const s = imageSize(data);
    const k = EXT[s.type ?? ""];
    if (!k || !s.width || !s.height) return null;
    const rot = s.orientation && s.orientation >= 5;   // EXIF says it's stored sideways
    const w = rot ? s.height : s.width, h = rot ? s.width : s.height;
    if (Math.max(w, h) < MIN_W || Math.min(w, h) < MIN_H) return null;
    return { name, data, ext: k[0], type: k[1], width: w, height: h };
  } catch {
    return null;
  }
}

const isZip = (d: Uint8Array) => d[0] === 0x50 && d[1] === 0x4b && d[2] === 0x03 && d[3] === 0x04;
const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function fromZip(data: Uint8Array) {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, { filter: (f) => /\.(jpe?g|png|webp|heic|heif|tiff?)$/i.test(f.name) && !/(^|\/)(__MACOSX|\.)/.test(f.name) && f.originalSize <= MAX_IMAGE });
  } catch {
    throw new ImportError("Couldn't open that zip file.");
  }
  return Object.keys(files).sort(natural.compare).map((n) => asPhoto(n.split("/").pop() || n, files[n])).filter((p): p is Photo => !!p);
}

/** Image addresses on a web page (a photographer's delivery page, not a listing portal), biggest version of each. */
function imagesOnPage(html: string, base: URL) {
  const out: string[] = [];
  const add = (u: string) => {
    try {
      const abs = new URL(u.replace(/&amp;/g, "&"), base).toString();
      if (/^https?:/.test(abs) && !out.includes(abs)) out.push(abs);
    } catch { /* not a link */ }
  };
  for (const m of html.matchAll(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/gi)) add(m[1]);
  for (const m of html.matchAll(/srcset=["']([^"']+)["']/gi)) {
    const best = m[1].split(",").map((c) => c.trim().split(/\s+/)).sort((a, b) => parseFloat(b[1] || "0") - parseFloat(a[1] || "0"))[0];
    if (best?.[0]) add(best[0]);
  }
  for (const m of html.matchAll(/<a[^>]+href=["']([^"']+\.(?:jpe?g|png|webp)(?:\?[^"']*)?)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/https?:\\?\/\\?\/[^"'\s<>()]+?\.(?:jpe?g|png|webp)(?:\?[^"'\s<>()]*)?/gi)) add(m[0].replace(/\\\//g, "/"));
  return out;
}

/** Download a list of image addresses (in order), keeping only real photos, until `want` are found. */
export async function photosFromUrls(urls: string[], want: number): Promise<Photo[]> {
  const out: Photo[] = [];
  const seen = new Set<string>();
  const queue = urls.slice(0, 80);
  let i = 0;
  async function next(): Promise<void> {
    while (i < queue.length && out.length < want) {
      const n = i++;
      try {
        const { data } = await get(queue[n], MAX_IMAGE, "image/*");
        const p = asPhoto(`photo-${n + 1}`, data);
        if (!p) continue;
        const h = createHash("sha1").update(data).digest("hex");
        if (seen.has(h)) continue;
        seen.add(h);
        (p as Photo & { order: number }).order = n;
        out.push(p);
      } catch { /* skip photos that won't download */ }
    }
  }
  await Promise.all([next(), next(), next(), next()]);
  return out.sort((a, b) => (a as Photo & { order: number }).order - (b as Photo & { order: number }).order).slice(0, want);
}

/** Everything one shared link points to, as listing photos in the photographer's order. */
export async function photosFromLink(raw: string, want: number): Promise<Photo[]> {
  let host = "";
  try { host = new URL(raw.trim()).hostname.toLowerCase(); } catch { /* checked next */ }
  if (isPortal(host)) {
    throw new ImportError("Listing sites like Zillow, Realtor.com and HAR block imports. Use the Send to Tourvo button on that page instead, or paste your photographer's link.");
  }
  const u = await checkUrl(raw.trim());

  // Dropbox: dl=1 turns a share link into the file itself (a folder comes back as a zip)
  if (host === "dropbox.com" || host.endsWith(".dropbox.com")) {
    u.searchParams.delete("dl");
    u.searchParams.set("dl", "1");
    const { data } = await get(u.toString(), MAX_ZIP);
    if (isZip(data)) return fromZip(data).slice(0, want);
    const p = asPhoto(u.pathname.split("/").pop() || "photo", data);
    if (!p) throw new ImportError("No photos found in that Dropbox link.");
    return [p];
  }

  // Google Drive: a shared folder (needs GOOGLE_API_KEY) or a single shared photo
  if (host === "drive.google.com" || host === "docs.google.com") {
    const folder = u.pathname.match(/\/folders\/([\w-]+)/)?.[1];
    const file = u.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] || u.searchParams.get("id");
    if (folder) return driveFolder(folder, want);
    if (file) {
      const { data } = await get(`https://drive.usercontent.google.com/download?id=${file}&export=download&confirm=t`, MAX_IMAGE);
      const p = asPhoto("photo", data);
      if (!p) throw new ImportError("That Google Drive file isn't a photo, or it isn't shared publicly.");
      return [p];
    }
  }

  // Anything else: a zip, a single photo, or a photographer's delivery page
  const { data, type, url } = await get(u.toString(), MAX_ZIP, "text/html,image/*,application/zip,*/*");
  if (isZip(data)) return fromZip(data).slice(0, want);
  const single = asPhoto(url.pathname.split("/").pop() || "photo", data);
  if (single) return [single];
  if (type.includes("html") || type === "") {
    const html = new TextDecoder().decode(data.slice(0, MAX_PAGE));
    const found = await photosFromUrls(imagesOnPage(html, url), want);
    if (found.length) return found;
  }
  throw new ImportError("No listing photos found at that link. Try your photographer's download link or a Dropbox / Google Drive folder.");
}

async function driveFolder(id: string, want: number) {
  const key = process.env.GOOGLE_API_KEY?.trim();
  if (!key) throw new ImportError("Google Drive folders aren't set up yet. Share a Dropbox link, or upload the photos instead.");
  const q = encodeURIComponent(`'${id}' in parents and mimeType contains 'image/' and trashed = false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,size)&pageSize=200&orderBy=name_natural&key=${key}`,
    { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new ImportError("Couldn't open that Google Drive folder. Make sure it's shared as \"Anyone with the link\".");
  const files = ((await res.json()).files ?? []) as { id: string; name: string; size?: string }[];
  if (!files.length) throw new ImportError("That Google Drive folder has no photos in it (or isn't shared publicly).");
  const sorted = files.filter((f) => Number(f.size || 0) <= MAX_IMAGE).sort((a, b) => natural.compare(a.name, b.name));
  return photosFromUrls(sorted.map((f) => `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&key=${key}`), want);
}
