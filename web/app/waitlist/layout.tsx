import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Access Pending",
  description: "Your VID-BOLT access is pending approval.",
};

export default function WaitlistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
