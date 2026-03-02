import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Video Editor",
  description: "Professional timeline-based video editor in VID-BOLT.",
};

export default function VideoEditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
