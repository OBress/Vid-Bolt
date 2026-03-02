import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings",
  description: "Configure your VID-BOLT account, projects, and API keys.",
};

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
