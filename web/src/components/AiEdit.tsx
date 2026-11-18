"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { api } from "@/lib/api";
import { fileExt, supabase } from "@/lib/supabase";

/** Owner tool: upload an image, describe the change, and fal.ai (through the render worker) edits it. ~4¢ a try. */
export function AiEdit({ user }: { user: User }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [prompt, setPrompt] = useState("");
  const [id, setId] = useState<string | null>(null);
  const [res, setRes] = useState<{ status: string; error: string | null; url: string | null; download: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    const check = () => api<{ status: string; error: string | null; url: string | null; download: string | null }>("/api/admin", { editId: id })
      .then(setRes).catch((e) => setError(e.message));
    check();
    const t = setInterval(check, 4000);
    return () => clearInterval(t);
  }, [id]);
  const done = res?.status === "ready" || res?.status === "failed";

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !prompt.trim()) return;
    setBusy(true); setError(""); setRes(null); setId(null);
    try {
      const path = `${user.id}/edits/src-${crypto.randomUUID()}.${fileExt(file.name)}`;
      const up = await supabase().storage.from("photos").upload(path, file, { contentType: file.type || undefined });
      if (up.error) throw new Error(up.error.message);
      const r = await api<{ id: string }>("/api/admin", { edit: { path, prompt } });
      setId(r.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={run} className="card flex flex-col gap-4 p-5">
        <label className="block text-sm">
          <span className="font-semibold">Image</span>
          <input type="file" accept="image/*" className="mt-2 block w-full text-sm"
            onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); setPreview(f ? URL.createObjectURL(f) : ""); }} />
        </label>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview && <img src={preview} alt="" className="max-h-72 w-full rounded-lg object-contain bg-line" />}
        <label className="block text-sm">
          <span className="font-semibold">What to change</span>
          <textarea className="input mt-2 min-h-32" value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder="Add Christmas lights along the roofline and a wreath on the front door. Keep everything else exactly the same." />
        </label>
        <button className="btn-gold self-start px-5 py-2.5" disabled={!file || !prompt.trim() || busy || (!!id && !done)}>
          {busy ? "Uploading…" : id && !done ? "Editing…" : "Run edit (about 4¢)"}
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
      <div className="card flex min-h-64 flex-col items-center justify-center gap-3 p-5 text-sm text-ink-soft">
        {!id && <p>The edited image shows up here. Takes about a minute.</p>}
        {id && !done && <p>Editing… (the worker checks for new edits every few seconds)</p>}
        {res?.status === "failed" && <p className="text-danger">Didn&apos;t work: {res.error}</p>}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {res?.url && <img src={res.url} alt="Edited" className="w-full rounded-lg" />}
        {res?.download && <a href={res.download} className="btn-ghost">Download</a>}
      </div>
    </div>
  );
}
