import Link from "next/link";
import { APP_NAME, APP_TAGLINE, TEMPLATES } from "@/lib/config";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <span className="flex items-center gap-2 font-bold tracking-tight">
          <span className="inline-block h-6 w-1.5 rounded-full bg-gold" />
          {APP_NAME}
        </span>
        <Link href="/login" className="btn-ghost">
          Sign in
        </Link>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6">
        <section className="grid items-center gap-10 py-12 md:grid-cols-2 md:py-20">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-gold">For listing agents</p>
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              Turn listing photos into a walkthrough video.
            </h1>
            <p className="mt-4 max-w-md text-lg text-ink-soft">{APP_TAGLINE}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className="btn-gold px-6 py-3 text-base">
                Make your first video
              </Link>
            </div>
            <ul className="mt-8 space-y-2 text-sm text-ink-soft">
              <li>• Real camera motion through every room, made from your photos</li>
              <li>• Your name, brokerage, headshot and logo on every video</li>
              <li>• 16:9 for MLS and YouTube, 9:16 for Reels and TikTok</li>
            </ul>
          </div>
          <div className="card overflow-hidden">
            <img src="/templates/t1.jpg" alt="Example listing video frame" className="aspect-video w-full object-cover" />
          </div>
        </section>

        <section className="pb-20">
          <h2 className="mb-5 text-xl font-bold">10 looks to choose from</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {TEMPLATES.map((t) => (
              <figure key={t.id} className="card overflow-hidden">
                <img src={`/templates/t${t.id}.jpg`} alt={t.name} className="aspect-video w-full object-cover" />
                <figcaption className="px-3 py-2 text-sm font-semibold">{t.name}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      </main>
      <footer className="border-t border-line py-6 text-center text-xs text-ink-soft">
        © {new Date().getFullYear()} KGB Marketing LLC
      </footer>
    </div>
  );
}
