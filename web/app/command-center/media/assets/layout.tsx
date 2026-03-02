import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Asset Manager",
  description: "Manage and browse media assets in VID-BOLT.",
};

export default function AssetsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
