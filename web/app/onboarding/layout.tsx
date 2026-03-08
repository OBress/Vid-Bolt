import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vid Bolt",
  description:
    "Configure your operative credentials for the VID-BOLT network.",
};

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
