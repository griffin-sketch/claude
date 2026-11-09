import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";

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
  title: APP_NAME,
  description: APP_TAGLINE,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${figtree.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
