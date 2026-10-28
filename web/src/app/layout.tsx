import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";

const poppins = localFont({
  variable: "--font-poppins",
  src: [
    { path: "../fonts/poppins-500.woff", weight: "500" },
    { path: "../fonts/poppins-600.woff", weight: "600" },
    { path: "../fonts/poppins-700.woff", weight: "700" },
  ],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_TAGLINE,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${poppins.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
