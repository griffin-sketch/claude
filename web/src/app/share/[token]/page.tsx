import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { admin, isAdmin } from "@/lib/server";
import { Logo } from "@/components/Logo";
import { SaveVideo } from "@/components/SaveVideo";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: PageProps<"/share/[token]">): Promise<Metadata> {
  const { token } = await params;
  let title = "Your listing videos";
  if (UUID.test(token)) {
    const { data: l } = await admin().from("listings").select("address").eq("share_token", token).single();
    if (l?.address) title = `${l.address} · Your listing videos`;
  }
  const description = "Walkthrough video and Reels, ready to download and post.";
  return { title, description, robots: { index: false, follow: false }, openGraph: { title, description, type: "website" }, twitter: { card: "summary_large_image", title, description } };
}

const LABEL: Record<string, string> = {
  tour: "Full walkthrough",
  teaser: "15-second teaser",
  just_listed: "Just Listed",
  price_reveal: "Guess the price",
  top_features: "Top features",
  build_up: "Built from the ground up",
  staged: "Virtually staged",
  open_house: "Open house",
};
const ORDER = Object.keys(LABEL);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public delivery page for a client: watch and download the listing's videos, no account needed. */
export default async function SharePage({ params }: PageProps<"/share/[token]">) {
  const { token } = await params;
  if (!UUID.test(token)) notFound();
  const db = admin();
  const { data: l } = await db
    .from("listings")
    .select("id, user_id, address, city_line, status, client_name")
    .eq("share_token", token)
    .single();
  if (!l || l.status !== "done") notFound();
  const [{ data: renders }, { data: prof }] = await Promise.all([
    db.from("renders").select("kind, format, video_path").eq("listing_id", l.id),
    db.from("profiles").select("full_name, company, account_type").eq("id", l.user_id).single(),
  ]);
  const list = [...(renders ?? [])].sort(
    (a, b) => ORDER.indexOf(a.kind ?? "tour") - ORDER.indexOf(b.kind ?? "tour") || (a.format === "16:9" ? -1 : 1),
  );
  const urls = await Promise.all(
    list.map(async (r) => {
      const name = `${(l.address || "listing").replace(/[^\w]+/g, "-")}-${r.kind}-${r.format.replace(":", "x")}.mp4`;
      const [play, dl] = await Promise.all([
        db.storage.from("videos").createSignedUrl(r.video_path, 60 * 60 * 24 * 7),
        db.storage.from("videos").createSignedUrl(r.video_path, 60 * 60 * 24 * 7, { download: name }),
      ]);
      return { ...r, name, play: play.data?.signedUrl, download: dl.data?.signedUrl };
    }),
  );
  // Tourvo's own account makes videos for realtors (its profile changes to each client's branding), so its
  // links say "Presented by Tourvo" instead of whichever realtor the profile was last set to.
  const owner = await db.auth.admin.getUserById(l.user_id).then((r) => r.data.user).catch(() => null);
  const from = owner && isAdmin(owner) ? null : prof?.company || prof?.full_name;

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Logo size={28} />
          <span className="text-sm text-ink-soft">{from ? `Prepared by ${from}` : "Presented by Tourvo"}</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="eyebrow">{l.client_name ? `For ${l.client_name}` : "Your listing videos"}</p>
        <h1 className="mt-2 font-display text-5xl leading-tight">{l.address || "Listing videos"}</h1>
        {l.city_line && <p className="mt-1 text-ink-soft">{l.city_line}</p>}
        <p className="mt-4 max-w-xl text-sm text-ink-soft">
          {urls.length} videos, ready to post. Tap <b>Save video</b> on each one. On an iPhone, choose <b>Save Video</b> and it goes
          straight to your Photos. These links work for 7 days; ask for a new link any time.
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {urls.map((r) => (
            <div key={r.video_path}>
              <video
                src={r.play}
                controls
                playsInline
                preload="metadata"
                className={`w-full rounded-xl bg-black ${r.format === "9:16" ? "aspect-[9/16]" : "aspect-video"}`}
              />
              <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="block font-semibold">{LABEL[r.kind ?? "tour"] ?? "Video"}</span>
                  <span className="block text-xs text-muted">{r.format === "9:16" ? "Vertical · Reels, TikTok" : "16:9 · MLS, YouTube"}</span>
                </span>
                {r.download && r.play && <SaveVideo play={r.play} download={r.download} name={r.name} />}
              </div>
            </div>
          ))}
        </div>
      </main>
      <footer className="py-8 text-center text-xs text-muted">Made with Tourvo</footer>
    </div>
  );
}
