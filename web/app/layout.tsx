import type React from "react";
import type { Metadata, Viewport } from "next";
import { Geist_Mono as GeistMono } from "next/font/google";
import "./globals.css";

const geistMono = GeistMono({ subsets: ["latin"] });

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: {
    default: "Vid-Bolt — AI Video Production Platform",
    template: "%s | Vid-Bolt",
  },
  description:
    "Semi-automated video production platform powered by AI. Generate scripts, visuals, and publish — all from one command center.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://vidbolt.app"
  ),
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Vid-Bolt",
  },
  twitter: {
    card: "summary_large_image",
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistMono.className} bg-black text-white antialiased`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
