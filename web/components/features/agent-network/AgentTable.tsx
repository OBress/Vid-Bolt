"use client";

import { MapPin, Clock, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Agent } from "@/types/agent";

interface AgentTableProps {
  agents: Agent[];
  onSelectAgent: (agent: Agent) => void;
}

export function AgentTable({ agents, onSelectAgent }: AgentTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-neutral-700">
            <th className="text-left py-3 px-4 text-xs font-medium text-neutral-400 tracking-wider">
              AGENT ID
            </th>
            <th className="text-left py-3 px-4 text-xs font-medium text-neutral-400 tracking-wider">
              CODENAME
            </th>
            <th className="text-left py-3 px-4 text-xs font-medium text-neutral-400 tracking-wider">
              STATUS
            </th>
            <th className="text-left py-3 px-4 text-xs font-medium text-neutral-400 tracking-wider">
              LOCATION
            </th>
            <th className="text-left py-3 px-4 text-xs font-medium text-neutral-400 tracking-wider">
              LAST SEEN
            </th>
            <th className="text-left py-3 px-4 text-xs font-medium text-neutral-400 tracking-wider">
              MISSIONS
            </th>
            <th className="text-left py-3 px-4 text-xs font-medium text-neutral-400 tracking-wider">
              RISK
            </th>
            <th className="text-left py-3 px-4 text-xs font-medium text-neutral-400 tracking-wider">
              ACTIONS
            </th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent, index) => (
            <tr
              key={agent.id}
              className={`border-b border-neutral-800 hover:bg-neutral-800 transition-colors cursor-pointer ${
                index % 2 === 0 ? "bg-neutral-900" : "bg-neutral-850"
              }`}
              onClick={() => onSelectAgent(agent)}
            >
              <td className="py-3 px-4 text-sm text-white font-mono">
                {agent.id}
              </td>
              <td className="py-3 px-4 text-sm text-white">{agent.name}</td>
              <td className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      agent.status === "active"
                        ? "bg-white"
                        : agent.status === "standby"
                        ? "bg-neutral-500"
                        : agent.status === "training"
                        ? "bg-orange-500"
                        : "bg-red-500"
                    }`}
                  ></div>
                  <span className="text-xs text-neutral-300 uppercase tracking-wider">
                    {agent.status}
                  </span>
                </div>
              </td>
              <td className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <MapPin className="w-3 h-3 text-neutral-400" />
                  <span className="text-sm text-neutral-300">
                    {agent.location}
                  </span>
                </div>
              </td>
              <td className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <Clock className="w-3 h-3 text-neutral-400" />
                  <span className="text-sm text-neutral-300 font-mono">
                    {agent.lastSeen}
                  </span>
                </div>
              </td>
              <td className="py-3 px-4 text-sm text-white font-mono">
                {agent.missions}
              </td>
              <td className="py-3 px-4">
                <span
                  className={`text-xs px-2 py-1 rounded uppercase tracking-wider ${
                    agent.risk === "critical"
                      ? "bg-red-500/20 text-red-500"
                      : agent.risk === "high"
                      ? "bg-orange-500/20 text-orange-500"
                      : agent.risk === "medium"
                      ? "bg-neutral-500/20 text-neutral-300"
                      : "bg-white/20 text-white"
                  }`}
                >
                  {agent.risk}
                </span>
              </td>
              <td className="py-3 px-4">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-neutral-400 hover:text-orange-500"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
