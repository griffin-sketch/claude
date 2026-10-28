"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AppShell } from "@/components/AppShell";
import { fileExt, signedUrl, supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

function Branding({ user }: { user: User }) {
  const [p, setP] = useState<Profile | null>(null);
  const [previews, setPreviews] = useState<{ headshot?: string; logo?: string }>({});
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    supabase()
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()
      .then(async ({ data }) => {
        const prof = (data as Profile) ?? ({ id: user.id } as Profile);
        setP(prof);
        setPreviews({
          headshot: prof.headshot_path ? (await signedUrl("branding", prof.headshot_path)) ?? undefined : undefined,
          logo: prof.logo_path ? (await signedUrl("branding", prof.logo_path)) ?? undefined : undefined,
        });
      });
  }, [user.id]);

  if (!p) return <p className="text-sm text-ink-soft">Loading…</p>;

  const set = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: e.target.value });

  async function upload(kind: "headshot" | "logo", file: File) {
    const path = `${user.id}/${kind}-${crypto.randomUUID()}.${fileExt(file.name)}`;
    const { error } = await supabase().storage.from("branding").upload(path, file, { upsert: true });
    if (error) {
      setNote(error.message);
      return;
    }
    const col = kind === "headshot" ? "headshot_path" : "logo_path";
    await supabase().from("profiles").update({ [col]: path }).eq("id", user.id);
    setP((prev) => (prev ? { ...prev, [col]: path } : prev));
    setPreviews((prev) => ({ ...prev, [kind]: URL.createObjectURL(file) }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!p) return;
    setSaving(true);
    const { error } = await supabase()
      .from("profiles")
      .update({ full_name: p.full_name, title: p.title, brokerage: p.brokerage, phone: p.phone, email: p.email })
      .eq("id", user.id);
    setSaving(false);
    setNote(error ? error.message : "Saved. Your next videos will use this.");
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold">Your branding</h1>
      <p className="mb-6 text-sm text-ink-soft">This goes on the closing card of every video.</p>
      <form onSubmit={save} className="card space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input id="name" className="input" value={p.full_name ?? ""} onChange={set("full_name")} placeholder="Jordan Ellis" />
          </div>
          <div>
            <label className="label" htmlFor="title">Title (optional)</label>
            <input id="title" className="input" value={p.title ?? ""} onChange={set("title")} placeholder="REALTOR®" />
          </div>
          <div>
            <label className="label" htmlFor="brokerage">Brokerage or team</label>
            <input id="brokerage" className="input" value={p.brokerage ?? ""} onChange={set("brokerage")} />
          </div>
          <div>
            <label className="label" htmlFor="phone">Phone</label>
            <input id="phone" className="input" value={p.phone ?? ""} onChange={set("phone")} placeholder="(512) 555-0142" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {(["headshot", "logo"] as const).map((kind) => (
            <div key={kind}>
              <span className="label">{kind === "headshot" ? "Headshot" : "Logo (PNG with transparency is best)"}</span>
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-20 w-20 items-center justify-center overflow-hidden border border-line bg-bg ${
                    kind === "headshot" ? "rounded-full" : "rounded-lg"
                  }`}
                >
                  {previews[kind] ? (
                    <img src={previews[kind]} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-xs text-ink-soft">None</span>
                  )}
                </div>
                <label className="btn-ghost cursor-pointer">
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && upload(kind, e.target.files[0])}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Save branding"}</button>
          {note && <span className="text-sm text-ink-soft">{note}</span>}
        </div>
      </form>
    </div>
  );
}

export default function SettingsPage() {
  return <AppShell>{(user) => <Branding user={user} />}</AppShell>;
}
