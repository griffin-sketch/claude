import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";
import { RefCapture } from "@/components/RefCapture";
import { ChatWidget } from "@/components/ChatWidget";
import { GoogleAnalytics } from "@next/third-parties/google";

// Coastal modern: Figtree for text, Fraunces (serif, with optical sizes) for headlines.
const figtree = localFont({
  variable: "--font-figtree",
  display: "swap",
  src: [{ path: "../fonts/figtree.woff2", weight: "300 900", style: "normal" }],
});

const fraunces = localFont({
  variable: "--font-fraunces",
  display: "swap",
  src: [
    { path: "../fonts/fraunces.woff2", weight: "100 900", style: "normal" },
    { path: "../fonts/fraunces-italic.woff2", weight: "100 900", style: "italic" },
  ],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.gettourvo.com"),
  title: APP_NAME,
  description: APP_TAGLINE,
  openGraph: { siteName: APP_NAME, title: `${APP_NAME} · Listing photos into walkthrough videos`, description: APP_TAGLINE, type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${figtree.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <RefCapture />
        {children}
        <ChatWidget />
      </body>
      <GoogleAnalytics gaId="G-PMG0VF2J7Q" />
    </html>
  );
}
