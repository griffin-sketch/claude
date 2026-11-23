import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { admin } from "@/lib/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function find(token: string) {
  if (!UUID.test(token)) return null;
  const db = admin();
  const { data: l } = await db.from("listings").select("id, address, city_line, status").eq("mls_token", token).single();
  if (!l || l.status !== "done") return null;
  const { data: r } = await db.from("renders").select("video_path").eq("listing_id", l.id).eq("kind", "mls").order("version", { ascending: false }).limit(1).maybeSingle();
  if (!r) return null;
  const { data } = await db.storage.from("videos").createSignedUrl(r.video_path, 60 * 60 * 24);
  return data?.signedUrl ? { ...l, src: data.signedUrl } : null;
}

export async function generateMetadata({ params }: PageProps<"/mls/[token]">): Promise<Metadata> {
  const l = await find((await params).token);
  return { title: l?.address ? `${l.address} · Virtual tour` : "Virtual tour", robots: { index: false, follow: false } };
}

/**
 * The MLS-compliant tour (served at mls.gettourvo.com/<token>): the unbranded walkthrough and nothing about the
 * agent or brokerage. MLS rules allow a link back to the tour company only.
 */
export default async function MlsTourPage({ params }: PageProps<"/mls/[token]">) {
  const l = await find((await params).token);
  if (!l) notFound();
  return (
    <div className="flex min-h-screen flex-col bg-[#14110f] text-white">
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-5 px-4 py-8 sm:px-6">
        <div>
          <h1 className="font-display text-3xl leading-tight sm:text-4xl">{l.address || "Virtual tour"}</h1>
          {l.city_line && <p className="mt-1 text-white/70">{l.city_line}</p>}
        </div>
        <video src={l.src} controls playsInline preload="metadata" className="aspect-video w-full rounded-xl bg-black" />
      </main>
      <footer className="px-4 pb-6 text-center text-xs text-white/50">
        Virtual tour by <a href="https://www.gettourvo.com" className="underline underline-offset-2">Tourvo</a>
      </footer>
    </div>
  );
}
