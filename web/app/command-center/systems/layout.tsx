import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vid Bolt",
  description:
    "Infrastructure health and performance monitoring for VID-BOLT.",
};

export default function SystemsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
