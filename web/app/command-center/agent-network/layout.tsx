import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agent Network",
  description: "Manage and monitor AI agents in the VID-BOLT network.",
};

export default function AgentNetworkLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
