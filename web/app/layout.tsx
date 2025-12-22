import type React from "react";
import type { Metadata } from "next";
import { Geist_Mono as GeistMono } from "next/font/google";
import "./globals.css";

const geistMono = GeistMono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Vid Bolt Dashboard",
  description: "Command center and control system",
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
