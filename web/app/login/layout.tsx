import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vid Bolt",
  description: "Secure access to VID-BOLT Command & Control.",
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
