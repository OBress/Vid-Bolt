import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vid Bolt",
  description: "Performance metrics and analytics for VID-BOLT.",
};

export default function PerformanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
