"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Operation } from "@/types/operation";
import { OperationCard } from "@/components/features/operations/OperationCard";
import { OperationModal } from "@/components/features/operations/OperationModal";
import { StatsOverview } from "@/components/features/operations/StatsOverview";

export default function OperationsPage() {
  const [selectedOperation, setSelectedOperation] = useState<Operation | null>(
    null
  );

  const operations: Operation[] = [
    {
      id: "OP-OMEGA-001",
      name: "SHADOW PROTOCOL",
      status: "active",
      priority: "critical",
      location: "Eastern Europe",
      agents: 5,
      progress: 75,
      startDate: "2025-06-15",
      estimatedCompletion: "2025-06-30",
      description: "Track high-value target in Eastern Europe",
      objectives: [
        "Locate target",
        "Establish surveillance",
        "Extract intelligence",
      ],
    },
    {
      id: "OP-DELTA-002",
      name: "GHOST FIRE",
      status: "planning",
      priority: "high",
      location: "Seoul",
      agents: 3,
      progress: 25,
      startDate: "2025-06-20",
      estimatedCompletion: "2025-07-05",
      description: "Infiltrate cybercrime network in Seoul",
      objectives: [
        "Penetrate network",
        "Gather evidence",
        "Identify key players",
      ],
    },
    {
      id: "OP-SIERRA-003",
      name: "NIGHT STALKER",
      status: "completed",
      priority: "medium",
      location: "Berlin",
      agents: 2,
      progress: 100,
      startDate: "2025-05-28",
      estimatedCompletion: "2025-06-12",
      description: "Monitor rogue agent communications in Berlin",
      objectives: [
        "Intercept communications",
        "Decode messages",
        "Report findings",
      ],
    },
    {
      id: "OP-ALPHA-004",
      name: "CRIMSON TIDE",
      status: "active",
      priority: "high",
      location: "Cairo",
      agents: 4,
      progress: 60,
      startDate: "2025-06-10",
      estimatedCompletion: "2025-06-25",
      description: "Support covert extraction in South America",
      objectives: [
        "Secure extraction point",
        "Neutralize threats",
        "Extract asset",
      ],
    },
    {
      id: "OP-BRAVO-005",
      name: "SILENT BLADE",
      status: "compromised",
      priority: "critical",
      location: "Moscow",
      agents: 6,
      progress: 40,
      startDate: "2025-06-05",
      estimatedCompletion: "2025-06-20",
      description: "Monitor rogue agent communications in Berlin",
      objectives: ["Assess compromise", "Extract personnel", "Damage control"],
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wider">
            OPERATIONS CENTER
          </h1>
          <p className="text-sm text-neutral-400">
            Mission planning and execution oversight
          </p>
        </div>
        <div className="flex gap-2">
          <Button className="bg-orange-500 hover:bg-orange-600 text-white">
            New Operation
          </Button>
          <Button className="bg-orange-500 hover:bg-orange-600 text-white">
            Mission Brief
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <StatsOverview />

      {/* Operations List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {operations.map((operation) => (
          <OperationCard
            key={operation.id}
            operation={operation}
            onClick={setSelectedOperation}
          />
        ))}
      </div>

      {/* Operation Detail Modal */}
      {selectedOperation && (
        <OperationModal
          operation={selectedOperation}
          onClose={() => setSelectedOperation(null)}
        />
      )}
    </div>
  );
}
