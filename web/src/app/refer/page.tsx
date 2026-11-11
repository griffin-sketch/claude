"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";

type Referral = { id: string; status: "joined" | "rewarded"; created_at: string; rewarded_at: string | null };

function ReferView({ user }: { user: User }) {
  const [code, setCode] = useState<string | null>(null);
  const [bonus, setBonus] = useState(0);
  const [refs, setRefs] = useState<Referral[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const sb = supabase();
    sb.from("profiles").select("referral_code, bonus_credits").eq("id", user.id).single().then(({ data }) => {
      setCode(data?.referral_code ?? null);
      setBonus(data?.bonus_credits ?? 0);
    });
    sb.from("referrals").select("id, status, created_at, rewarded_at").eq("referrer_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => setRefs((data as Referral[]) ?? []));
  }, [user.id]);

  const link = code ? `${typeof window !== "undefined" ? window.location.origin : "https://www.gettourvo.com"}/?ref=${code}` : "";
  const message = `I make my listing videos with Tourvo. Sign up with my link and we both get a free listing video when you start a plan: ${link}`;
  const rewarded = refs.filter((r) => r.status === "rewarded").length;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  async function share() {
    try {
      await navigator.share({ title: "Tourvo", text: message });
    } catch {}
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="eyebrow">Refer a friend</p>
        <h1 className="mt-2 font-display text-3xl sm:text-4xl">Give a free video, get a free video</h1>
        <p className="mt-2 text-ink-soft">
          Share your link with another agent or photographer. When they sign up and start any plan, you each get one listing video free. There&apos;s no limit.
        </p>
      </div>

      <section className="card p-4 sm:p-6">
        <p className="text-sm font-semibold">Your link</p>
        {code ? (
          <>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input readOnly value={link} className="input font-mono" onFocus={(e) => e.currentTarget.select()} aria-label="Your referral link" />
              <button type="button" className="btn-primary min-h-11 shrink-0" onClick={copy}>{copied ? "Copied ✓" : "Copy link"}</button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {typeof navigator !== "undefined" && "share" in navigator && (
                <button type="button" className="btn-ghost" onClick={share}>Share…</button>
              )}
              <a className="btn-ghost" href={`sms:?&body=${encodeURIComponent(message)}`}>Text it</a>
              <a className="btn-ghost" href={`mailto:?subject=${encodeURIComponent("A free listing video for you")}&body=${encodeURIComponent(message)}`}>Email it</a>
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">Your link is being set up. Check back in a minute.</p>
        )}
      </section>

      <section className="grid grid-cols-3 gap-3">
        {[
          [refs.length, "signed up"],
          [rewarded, "started a plan"],
          [bonus, "free videos to use"],
        ].map(([n, label]) => (
          <div key={label as string} className="card p-4">
            <p className="font-display text-4xl leading-none">{n}</p>
            <p className="mt-1 text-sm text-ink-soft">{label}</p>
          </div>
        ))}
      </section>

      <section className="card p-4 text-sm text-ink-soft sm:p-6">
        <p className="font-semibold text-ink">How it works</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          <li>Your friend opens your link and creates a Tourvo account.</li>
          <li>When they start any plan, you both get one free listing video.</li>
          <li>Free videos never expire. Use them on any listing, with or without a plan.</li>
        </ol>
        <p className="mt-3 text-xs text-muted">Referral links are for new Tourvo accounts. You can&apos;t refer yourself or an account that has already paid.</p>
      </section>
    </div>
  );
}

export default function ReferPage() {
  return <AppShell>{(user) => <ReferView user={user} />}</AppShell>;
}
