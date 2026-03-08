import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vid Bolt",
  description: "Audience insights and analytics for VID-BOLT.",
};

export default function AudienceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
