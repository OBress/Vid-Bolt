import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Video Studio",
  description: "AI-powered video studio in VID-BOLT.",
};

export default function VideoStudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
