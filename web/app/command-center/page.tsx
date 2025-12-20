"use client";

import { AgentAllocationCard } from "@/components/features/command-center/AgentAllocationCard";
import { ActivityLogCard } from "@/components/features/command-center/ActivityLogCard";
import { EncryptedChatCard } from "@/components/features/command-center/EncryptedChatCard";
import { MissionActivityChart } from "@/components/features/command-center/MissionActivityChart";
import { MissionInformationCard } from "@/components/features/command-center/MissionInformationCard";

export default function CommandCenterPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Main Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4">
          <AgentAllocationCard />
        </div>
        <div className="lg:col-span-4">
          <ActivityLogCard />
        </div>
        <div className="lg:col-span-4">
          <EncryptedChatCard />
        </div>
        <div className="lg:col-span-8">
          <MissionActivityChart />
        </div>
        <div className="lg:col-span-4">
          <MissionInformationCard />
        </div>
      </div>
    </div>
  );
}
