import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Project",
  description: "Media project workspace in VID-BOLT.",
};

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
