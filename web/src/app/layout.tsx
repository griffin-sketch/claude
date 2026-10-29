import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";

const manrope = localFont({
  variable: "--font-manrope",
  display: "swap",
  src: [
    { path: "../fonts/manrope-400.woff2", weight: "400" },
    { path: "../fonts/manrope-500.woff2", weight: "500" },
    { path: "../fonts/manrope-600.woff2", weight: "600" },
    { path: "../fonts/manrope-700.woff2", weight: "700" },
  ],
});

const cormorant = localFont({
  variable: "--font-cormorant",
  display: "swap",
  src: [
    { path: "../fonts/cormorant-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/cormorant-500-italic.woff2", weight: "500", style: "italic" },
    { path: "../fonts/cormorant-600.woff2", weight: "600", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_TAGLINE,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} ${cormorant.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
