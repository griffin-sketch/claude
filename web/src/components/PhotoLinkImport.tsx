"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

/**
 * "Don't have the photos on this device?" Paste the photographer's Dropbox / Google Drive / delivery link
 * and Tourvo pulls the photos into the listing, in the photographer's order.
 */
export function PhotoLinkImport({ listingId, room, onDone }: { listingId: string; room: number; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!link.trim() || !consent || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ added: number; more: boolean }>("/api/import", { listingId, link: link.trim(), consent });
      setMsg({ ok: true, text: `Added ${r.added} photo${r.added === 1 ? "" : "s"}.${r.more ? " There were more in the folder than room on this listing; swap any out below." : ""}` });
      setLink("");
      onDone();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <p className="mt-3 text-center text-sm text-ink-soft">
        Photos not on this device?{" "}
        <button type="button" className="font-semibold text-ink underline underline-offset-4" onClick={() => setOpen(true)}>
          Import them from a link
        </button>
      </p>
    );
  }

  return (
    <form onSubmit={run} className="mt-4 rounded-2xl border border-line p-4 sm:p-5">
      <label className="block">
        <span className="font-semibold">Paste your photographer&apos;s link</span>
        <span className="mt-0.5 block text-sm text-ink-soft">
          A Dropbox or Google Drive folder, or the download link from your photographer&apos;s delivery email. We&apos;ll bring in up to {room} photos, in their order.
        </span>
        <input
          className="input mt-3"
          type="url"
          inputMode="url"
          placeholder="https://www.dropbox.com/…"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          disabled={busy}
        />
      </label>
      <label className="mt-3 flex items-start gap-2.5 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={busy} />
        <span>These are photos of my listing, and I have the right to use them in marketing videos.</span>
      </label>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-gold px-5 py-2.5" disabled={!link.trim() || !consent || busy}>
          {busy ? "Bringing in photos…" : "Import photos"}
        </button>
        <button type="button" className="text-sm text-ink-soft underline-offset-4 hover:underline" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
      </div>
      {busy && <p className="mt-3 text-xs text-muted">This can take up to a minute for a big folder.</p>}
      {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-ok" : "text-danger"}`} role="status">{msg.text}</p>}
      <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
        Listing is on Realtor.com, HAR or your MLS? Use the{" "}
        <Link href="/send" className="font-semibold text-ink underline underline-offset-4">Send to Tourvo button</Link> on your computer.
      </p>
    </form>
  );
}
