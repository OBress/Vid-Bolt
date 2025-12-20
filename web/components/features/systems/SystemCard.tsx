"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Server,
  Database,
  Shield,
  Wifi,
  HardDrive,
  Cpu,
  Activity,
  AlertTriangle,
  CheckCircle,
  Settings,
} from "lucide-react";
import { System } from "@/types/system";

interface SystemCardProps {
  system: System;
  onClick: (system: System) => void;
}

export function SystemCard({ system, onClick }: SystemCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "online":
        return "bg-white/20 text-white";
      case "warning":
        return "bg-orange-500/20 text-orange-500";
      case "maintenance":
        return "bg-neutral-500/20 text-neutral-300";
      case "offline":
        return "bg-red-500/20 text-red-500";
      default:
        return "bg-neutral-500/20 text-neutral-300";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "online":
        return <CheckCircle className="w-4 h-4" />;
      case "warning":
        return <AlertTriangle className="w-4 h-4" />;
      case "maintenance":
        return <Settings className="w-4 h-4" />;
      case "offline":
        return <AlertTriangle className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const getSystemIcon = (type: string) => {
    switch (type) {
      case "Primary Server":
        return <Server className="w-6 h-6" />;
      case "Database":
        return <Database className="w-6 h-6" />;
      case "Firewall":
        return <Shield className="w-6 h-6" />;
      case "Network":
        return <Wifi className="w-6 h-6" />;
      case "Storage":
        return <HardDrive className="w-6 h-6" />;
      case "Processing":
        return <Cpu className="w-6 h-6" />;
      default:
        return <Server className="w-6 h-6" />;
    }
  };

  const getHealthColor = (health: number) => {
    if (health >= 95) return "text-white";
    if (health >= 85) return "text-white";
    if (health >= 70) return "text-orange-500";
    return "text-red-500";
  };

  return (
    <Card
      className="bg-neutral-900 border-neutral-700 hover:border-orange-500/50 transition-colors cursor-pointer"
      onClick={() => onClick(system)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {getSystemIcon(system.type)}
            <div>
              <CardTitle className="text-sm font-bold text-white tracking-wider">
                {system.name}
              </CardTitle>
              <p className="text-xs text-neutral-400">{system.type}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusIcon(system.status)}
            <Badge className={getStatusColor(system.status)}>
              {system.status.toUpperCase()}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-400">SYSTEM HEALTH</span>
          <span
            className={`text-sm font-bold font-mono ${getHealthColor(
              system.health
            )}`}
          >
            {system.health}%
          </span>
        </div>
        <Progress value={system.health} className="h-2" />

        <div className="grid grid-cols-3 gap-4 text-xs">
          <div>
            <div className="text-neutral-400 mb-1">CPU</div>
            <div className="text-white font-mono">{system.cpu}%</div>
            <div className="w-full bg-neutral-800 rounded-full h-1 mt-1">
              <div
                className="bg-orange-500 h-1 rounded-full transition-all duration-300"
                style={{ width: `${system.cpu}%` }}
              ></div>
            </div>
          </div>
          <div>
            <div className="text-neutral-400 mb-1">MEMORY</div>
            <div className="text-white font-mono">{system.memory}%</div>
            <div className="w-full bg-neutral-800 rounded-full h-1 mt-1">
              <div
                className="bg-orange-500 h-1 rounded-full transition-all duration-300"
                style={{ width: `${system.memory}%` }}
              ></div>
            </div>
          </div>
          <div>
            <div className="text-neutral-400 mb-1">STORAGE</div>
            <div className="text-white font-mono">{system.storage}%</div>
            <div className="w-full bg-neutral-800 rounded-full h-1 mt-1">
              <div
                className="bg-orange-500 h-1 rounded-full transition-all duration-300"
                style={{ width: `${system.storage}%` }}
              ></div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
