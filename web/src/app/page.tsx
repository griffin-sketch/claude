import Link from "next/link";
import { Logo } from "@/components/Logo";
import { BeforeAfter, LoopVideo } from "@/components/Showcase";

const LOOKS = [
  { id: 1, name: "Signature Gold", note: "Classic luxury" },
  { id: 2, name: "Editorial", note: "Magazine serif" },
  { id: 7, name: "Coastal Glass", note: "Frosted and modern" },
  { id: 5, name: "Terracotta", note: "Bold boutique" },
  { id: 9, name: "Golden Hour", note: "Script and gold" },
  { id: 10, name: "Cinema", note: "Letterboxed" },
];

const FX = [
  { id: "build", name: "Construction build-up", note: "Framing to finished, in seconds. Made for new builds." },
  { id: "staging", name: "Virtual staging", note: "Empty rooms furnish themselves." },
  { id: "dusk", name: "Day to dusk", note: "Twilight sky, every light glowing on." },
  { id: "water", name: "Moving water", note: "Pools and spas ripple and shimmer." },
  { id: "fire", name: "Fireplace glow", note: "A warm fire flickers to life." },
  { id: "reveal", name: "Drone reveal", note: "Pull back and up over the whole property." },
  { id: "kitchen", name: "Rooms that assemble", note: "Cabinets, counters and lights snap into place." },
  { id: "move", name: "Cinematic camera moves", note: "Every photo becomes a smooth walkthrough shot." },
];

const STEPS = [
  {
    img: "/home/living.jpg",
    alt: "Living room listing photo",
    title: "Upload your photos",
    body: "Drop in 3 to 20 listing photos in the order you want them shown. Lead with the front of the home, then label each room.",
  },
  {
    img: "/templates/t1.jpg",
    alt: "A finished title card in the Signature Gold look",
    title: "Pick a look",
    body: "Choose one of ten designed title-and-label styles. Your name, brokerage, phone, headshot and logo go on the closing card.",
  },
  {
    img: "/home/kitchen.jpg",
    alt: "Kitchen listing photo",
    title: "Review, then download",
    body: "Watch every clip. Redo any shot you don't love at no charge. Then download your Reel pack: the full walkthrough plus short cuts for Reels, TikTok and Shorts.",
  },
];

const FAQ = [
  ["Can I get staged photos too?", "Yes. Stage any empty room in one of eight furniture styles and see a free preview. Download the full-size photo for $5."],
  ["Will it change how the home looks?", "No. The camera moves, the room stays as photographed. If a clip ever looks off, redo it before your video is made."],
  ["What photos work best?", "Your professional listing photos, wide and well lit. Phone photos work too, though bright, level shots give the smoothest moves."],
  ["How long does it take?", "About 5 to 10 minutes for the clips, then a few minutes to build the finished videos. You can close the page while it works."],
  ["Can I use it for any listing?", "Yes: houses, condos, land and rentals. Use photos you have the rights to share."],
];

const pad = "px-[max(20px,4vw)]";
const wrap = "mx-auto w-full max-w-[1240px]";
const h2 = "font-display text-[clamp(34px,4.2vw,56px)] font-normal leading-[1.08] text-balance";
const lead = "text-[17px] leading-[1.7] text-ink-soft sm:text-lg";
const swipe = "text-xs font-semibold text-muted sm:hidden";
const btnTeal = "inline-flex min-h-[54px] items-center justify-center gap-2.5 rounded-full bg-gold px-7 text-base font-semibold text-white hover:bg-gold-deep";
const btnWhite = "inline-flex min-h-[54px] items-center justify-center gap-2.5 rounded-full border border-line bg-white px-7 text-base font-semibold text-ink hover:border-gold";
const rail = "-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:overflow-visible sm:px-0 sm:pb-0";
const STEP_TILE = ["bg-gold text-white", "bg-sand text-ink", "bg-gold-light text-ink"];

function Check() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" className="flex-none">
      <circle cx="10" cy="10" r="10" fill="var(--champagne-soft)" />
      <path d="M6 10.4l2.6 2.6L14 7.6" fill="none" stroke="var(--champagne)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="bg-bg text-ink">
      {/* Nav: a floating white pill */}
      <header className={`sticky top-0 z-50 pt-3 sm:pt-5 ${pad}`}>
        <div className={`${wrap} flex items-center justify-between gap-4 rounded-full border border-line/60 bg-white/95 py-2.5 pl-6 pr-2.5 shadow-[0_8px_30px_rgba(29,52,56,0.10)] backdrop-blur`}>
          <Link href="/" aria-label="Tourvo home">
            <Logo size={30} />
          </Link>
          <nav aria-label="Main" className="flex items-center gap-5 whitespace-nowrap text-[15px] font-medium sm:gap-7">
            <a href="#how" className="hidden hover:text-gold lg:inline">How it works</a>
            <a href="#effects" className="hidden hover:text-gold sm:inline">Effects</a>
            <a href="#photographers" className="hidden hover:text-gold lg:inline">Photographers</a>
            <a href="#pricing" className="hidden hover:text-gold sm:inline">Pricing</a>
            <Link href="/login" className="hover:text-gold">Sign in</Link>
            <Link href="/login" className="inline-flex min-h-11 items-center rounded-full bg-gold px-5 font-semibold text-white hover:bg-gold-deep">
              Make a video
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className={`pb-16 pt-10 sm:pb-24 sm:pt-14 ${pad}`}>
        <div className={`${wrap} flex flex-wrap items-center gap-10 lg:gap-14`}>
          <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-6">
            <span className="eyebrow">For agents and real estate photographers</span>
            <h1 className="font-display text-[clamp(46px,6vw,84px)] font-normal leading-[1.03]">
              Walk buyers through the home <span className="italic text-gold">before they visit.</span>
            </h1>
            <p className={`${lead} max-w-[520px]`}>
              Upload your listing photos. We turn each room into a smooth, cinematic camera move and finish it with your
              branding: a full walkthrough plus a pack of ready-to-post Reels.
            </p>
            <div className="flex flex-wrap gap-3.5">
              <Link href="/login" className={btnTeal}>Make your first video</Link>
              <a href="#how" className={btnWhite}>
                <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9-5.5z" fill="currentColor" /></svg>
                See how it works
              </a>
            </div>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-ink-soft">
              {["No editing skills needed", "Free clip redos", "16:9 and 9:16"].map((t) => (
                <li key={t} className="flex items-center gap-2"><Check />{t}</li>
              ))}
            </ul>
          </div>
          <div className="relative min-w-0 flex-[1_1_520px]">
            <LoopVideo src="/fx/build_hero.mp4" poster="/fx/build.jpg" label="A house building itself, from framing to finished"
              className="aspect-[5/4] w-full rounded-[32px] bg-line object-cover" />
            <div className="absolute bottom-4 left-4 flex items-center gap-3 rounded-[20px] bg-white/95 px-4 py-3 shadow-[0_10px_30px_rgba(29,52,56,0.15)] sm:bottom-5 sm:left-5">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-gold text-white">
                <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9-5.5z" fill="currentColor" /></svg>
              </span>
              <span className="flex flex-col">
                <span className="text-[15px] font-semibold">Construction build-up</span>
                <span className="text-[13px] text-ink-soft">One listing photo, one click</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Still to walkthrough */}
      <section className={`bg-white py-16 sm:py-24 ${pad}`}>
        <div className={`${wrap} flex flex-wrap items-center gap-12 lg:gap-16`}>
          <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-5">
            <span className="eyebrow">From still to walkthrough</span>
            <h2 className={h2}>The camera moves through the home, <span className="italic text-gold">not across a slideshow.</span></h2>
            <p className={`${lead} max-w-[520px]`}>
              Each photo becomes a five-second shot with real depth: a push into the living room, a glide toward the
              kitchen island, a rise over the front lawn. Nothing in the room is added or moved, and every clip is yours
              to review before the video is made.
            </p>
          </div>
          <div className="grid min-w-0 flex-[1.3_1_520px] grid-cols-3 gap-3">
            {[
              ["/home/frame1.jpg", "0.0 s", "Front of the home, first frame"],
              ["/home/frame2.jpg", "2.5 s", "The camera moving closer"],
              ["/home/frame3.jpg", "5.0 s", "The camera arriving at the front door"],
            ].map(([src, t, alt]) => (
              <figure key={t} className="flex flex-col gap-2.5">
                <img src={src} alt={alt} className="aspect-video w-full rounded-[16px] object-cover" />
                <figcaption className="text-[13px] font-semibold text-muted">{t}</figcaption>
              </figure>
            ))}
            <p className="col-span-3 text-[13px] text-muted">One listing photo, three moments from its camera move.</p>
          </div>
        </div>
      </section>

      {/* Effects */}
      <section id="effects" className={`scroll-mt-24 py-16 sm:py-24 ${pad}`}>
        <div className={`${wrap} flex flex-col gap-10`}>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex min-w-0 flex-col gap-4">
              <span className="eyebrow">AI effects</span>
              <h2 className={h2}>Pick an effect for <span className="italic text-gold">any photo.</span></h2>
            </div>
            <p className="max-w-[400px] leading-relaxed text-ink-soft">
              Every effect starts from your real listing photo and lands back on it, so the finished room is exactly what buyers will see.
            </p>
          </div>
          <p className={`${swipe} -mb-6`}>Swipe to see all 8 →</p>
          <div className={`${rail} sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] sm:gap-5`}>
            {FX.map((f) => (
              <figure key={f.id} className="flex w-[80%] shrink-0 snap-start flex-col gap-3 rounded-[28px] bg-white p-3 sm:w-auto">
                <LoopVideo src={`/fx/${f.id}.mp4`} poster={`/fx/${f.id}.jpg`} label={f.name} className="aspect-video w-full rounded-[20px] bg-line object-cover" />
                <figcaption className="px-2 pb-2">
                  <span className="block font-semibold">{f.name}</span>
                  <span className="block text-sm leading-relaxed text-ink-soft">{f.note}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Before / after */}
      <section className={`bg-white py-16 sm:py-24 ${pad}`}>
        <div className={`${wrap} flex flex-col gap-10`}>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex min-w-0 flex-col gap-4">
              <span className="eyebrow">Drag to compare</span>
              <h2 className={h2}>Same photo. A whole new <span className="italic text-gold">first impression.</span></h2>
            </div>
            <p className="max-w-[400px] leading-relaxed text-ink-soft">
              Stage a vacant room or turn a daytime shot into twilight, right inside your video. Need stills too? Staged
              photos are $5 each.
            </p>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] gap-6">
            <figure className="flex flex-col gap-3 rounded-[28px] bg-bg p-3">
              <BeforeAfter before="/fx/staging_before.jpg" after="/fx/staging_after.jpg" beforeLabel="Vacant" afterLabel="Staged" alt="Sample living room" />
              <figcaption className="px-2 pb-1 text-[15px] font-semibold">Virtual staging</figcaption>
            </figure>
            <figure className="flex flex-col gap-3 rounded-[28px] bg-bg p-3">
              <BeforeAfter before="/fx/dusk_before.jpg" after="/fx/dusk_after.jpg" beforeLabel="Day" afterLabel="Dusk" alt="Sample home exterior" />
              <figcaption className="px-2 pb-1 text-[15px] font-semibold">Day to dusk</figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className={`scroll-mt-24 py-16 sm:py-24 ${pad}`}>
        <div className={`${wrap} flex flex-col gap-10 sm:gap-12`}>
          <div className="flex flex-col items-center gap-4 text-center">
            <h2 className={h2}>Three easy steps</h2>
            <p className="max-w-[520px] text-lg text-ink-soft">If you can upload photos to the MLS, you can make one of these. About fifteen minutes, start to finish.</p>
          </div>
          <div className={`${rail} sm:grid-cols-[repeat(auto-fit,minmax(260px,1fr))] sm:gap-5`}>
            {STEPS.map((s, i) => (
              <div key={s.title} className="flex w-[80%] shrink-0 snap-start flex-col gap-4 rounded-[28px] bg-white p-3 pb-7 sm:w-auto">
                <img src={s.img} alt={s.alt} className="aspect-video w-full rounded-[20px] object-cover" />
                <div className="flex flex-col gap-3 px-4">
                  <span className={`grid h-12 w-12 place-items-center rounded-2xl text-xl font-bold ${STEP_TILE[i]}`}>{i + 1}</span>
                  <h3 className="text-[22px] font-semibold">{s.title}</h3>
                  <p className="text-[15px] leading-[1.65] text-ink-soft">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Looks */}
      <section id="looks" className={`scroll-mt-24 bg-white py-16 sm:py-24 ${pad}`}>
        <div className={`${wrap} flex flex-col gap-10`}>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex min-w-0 flex-col gap-4">
              <span className="eyebrow">Ten looks</span>
              <h2 className={h2}>Pick a look that fits <span className="italic text-gold">your brand.</span></h2>
            </div>
            <p className="max-w-[380px] leading-relaxed text-ink-soft">
              From quiet magazine serif to bold boutique type. Six of the ten, shown on the same title card.
            </p>
          </div>
          <p className={`${swipe} -mb-6`}>Swipe to see more →</p>
          <div className={`${rail} sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] sm:gap-5`}>
            {LOOKS.map((l) => (
              <figure key={l.id} className="flex w-[80%] shrink-0 snap-start flex-col gap-3 rounded-[28px] bg-bg p-3 sm:w-auto">
                <img src={`/templates/t${l.id}.jpg`} alt={`${l.name} title card`} className="aspect-video w-full rounded-[20px] object-cover" />
                <figcaption className="px-2 pb-2 text-[15px]">
                  <span className="font-semibold">{l.name}</span> <span className="text-ink-soft">· {l.note}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className={`py-16 sm:py-24 ${pad}`}>
        <div className={`${wrap} flex flex-wrap items-center gap-14 lg:gap-16`}>
          <div className="relative min-w-0 flex-[1.2_1_520px] pb-8">
            <img src="/home/pool.jpg" alt="Backyard pool at dusk, shown as a 16:9 video" className="aspect-video w-full rounded-[32px] object-cover" />
            <img
              src="/home/pool_v.jpg"
              alt="The same shot as a vertical 9:16 video"
              className="absolute bottom-0 right-3 aspect-[9/16] w-[26%] rounded-[20px] border-[5px] border-bg object-cover shadow-[0_10px_30px_rgba(29,52,56,0.15)]"
            />
          </div>
          <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-7">
            <span className="eyebrow">What you get</span>
            <h2 className={h2}>One listing. <span className="italic text-gold">A whole pack of Reels.</span></h2>
            <ul className="flex flex-col gap-5">
              {[
                ["Full walkthrough", "in 16:9 for MLS, YouTube and your website, plus vertical"],
                ["Short Reels", "a 15-second teaser, Just Listed, Guess the price, Top features and Open house, each in its own style"],
                ["Your branding", "on the closing card: name, brokerage, phone, headshot, logo. Photographers can deliver them under their own brand"],
                ["Free redos", "on any clip before your video is built"],
              ].map(([b, rest]) => (
                <li key={b} className="flex items-start gap-3.5">
                  <span className="mt-[3px]"><Check /></span>
                  <span className="leading-relaxed">
                    <strong className="font-semibold">{b}</strong> <span className="text-ink-soft">{rest}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Photographers */}
      <section id="photographers" className={`scroll-mt-24 bg-white py-16 sm:py-24 ${pad}`}>
        <div className={`${wrap} flex flex-wrap items-center gap-12 lg:gap-16`}>
          <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-5">
            <span className="eyebrow">For real estate photographers</span>
            <h2 className={h2}>Sell video on <span className="italic text-gold">every shoot.</span></h2>
            <p className={`${lead} max-w-[520px]`}>
              Turn the photos you already deliver into a video add-on. No extra time on site, no editing.
            </p>
          </div>
          <ul className="grid min-w-0 flex-[1_1_480px] grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-4">
            {[
              ["Your client's branding", "Put the agent's name, brokerage, phone, headshot and logo on the closing card."],
              ["Or fully unbranded", "No Tourvo watermark, ever. Deliver it as your own work."],
              ["One link to deliver", "Send the agent a private page to watch and download every video."],
              ["A whole Reel pack", "Walkthrough, teaser, Just Listed, price reveal and more from one upload."],
            ].map(([t, d]) => (
              <li key={t} className="flex flex-col gap-2 rounded-[24px] bg-bg p-6">
                <span className="font-semibold">{t}</span>
                <span className="text-[15px] leading-relaxed text-ink-soft">{d}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className={`scroll-mt-24 py-16 sm:py-24 ${pad}`}>
        <div className="mx-auto flex max-w-[1000px] flex-col gap-10">
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="eyebrow">Pricing</span>
            <h2 className={h2}>Simple pricing</h2>
            <p className="text-lg text-ink-soft">Less than one hour of a videographer&apos;s time.</p>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-5">
            <div className="flex flex-col gap-4 rounded-[28px] border border-line bg-white p-8 sm:p-10">
              <h3 className="text-xl font-semibold">One video</h3>
              <p className="flex items-baseline gap-2">
                <span className="font-display text-[64px] leading-none">$49</span>
                <span className="text-[15px] text-muted">per listing</span>
              </p>
              <p className="text-[15px] leading-relaxed text-ink-soft">Pay for the listing in front of you. The full Reel pack and clip redos included.</p>
              <Link href="/login" className="mt-auto inline-flex min-h-[52px] items-center justify-center rounded-full border border-gold text-base font-semibold text-gold-deep hover:bg-gold hover:text-white">
                Make one video
              </Link>
            </div>
            <div className="flex flex-col gap-4 rounded-[28px] bg-gold p-8 text-white sm:p-10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-xl font-semibold">Monthly</h3>
                <span className="rounded-full bg-sand px-3 py-1.5 text-xs font-bold text-ink">Best value</span>
              </div>
              <p className="flex items-baseline gap-2">
                <span className="font-display text-[64px] leading-none">$80</span>
                <span className="text-[15px] text-gold-soft">per month</span>
              </p>
              <p className="text-[15px] leading-relaxed text-gold-soft">Three listing videos every month, about $27 each. Cancel anytime.</p>
              <Link href="/login" className="mt-auto inline-flex min-h-[52px] items-center justify-center rounded-full bg-white text-base font-semibold text-gold-deep hover:bg-gold-soft">
                Start the monthly plan
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] bg-white px-7 py-5">
            <p className="text-[15px]">
              <strong className="font-semibold">Virtual staging</strong>{" "}
              <span className="text-ink-soft">· free previews, $5 per full-size staged photo</span>
            </p>
            <Link href="/login" className="text-[15px] font-semibold text-gold-deep underline underline-offset-4">Stage a photo</Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className={`bg-white py-16 sm:py-20 ${pad}`}>
        <div className="mx-auto flex max-w-[1000px] flex-col gap-6">
          <h2 className={`${h2} text-center`}>Questions</h2>
          <div className="grid gap-x-12 sm:grid-cols-2">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group border-b border-line py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-semibold">
                  {q}
                  <span aria-hidden="true" className="grid h-7 w-7 flex-none place-items-center rounded-full bg-gold-soft text-gold-deep transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2.5 text-[15px] leading-[1.65] text-ink-soft">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Closing */}
      <section className={`py-16 sm:py-24 ${pad}`}>
        <div className={`${wrap} flex flex-col items-center gap-6 rounded-[40px] bg-gold-soft px-6 py-14 text-center sm:px-12 sm:py-20`}>
          <h2 className="max-w-[820px] font-display text-[clamp(38px,4.8vw,64px)] font-normal leading-[1.06] text-balance">
            Your next listing deserves a <span className="italic text-gold">walkthrough.</span>
          </h2>
          <p className="text-lg text-ink-soft">Sign up free. You only pay when you make a video.</p>
          <div className="flex flex-wrap justify-center gap-3.5">
            <Link href="/login" className={btnTeal}>
              <span className="grid h-7 w-7 place-items-center rounded-full bg-white"><GoogleIcon /></span>
              Start with Google
            </Link>
            <Link href="/login" className={btnWhite}>Use my email</Link>
          </div>
        </div>
      </section>

      <footer className={`pb-10 ${pad}`}>
        <div className={`${wrap} flex flex-wrap items-center justify-between gap-5 border-t border-line pt-8 text-sm text-ink-soft`}>
          <Logo size={24} />
          <span>© {new Date().getFullYear()} Tourvo · KGB Marketing LLC · Texas</span>
          <Link href="/login" className="hover:text-gold">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}
