import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vid Bolt",
  description: "Classified reports and threat analysis for VID-BOLT.",
};

export default function IntelligenceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
