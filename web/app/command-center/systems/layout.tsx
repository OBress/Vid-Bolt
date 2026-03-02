import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Systems Monitor",
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
