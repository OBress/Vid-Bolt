"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Target,
  MapPin,
  Clock,
  Users,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { Operation } from "@/types/operation";

interface OperationCardProps {
  operation: Operation;
  onClick: (operation: Operation) => void;
}

export function OperationCard({ operation, onClick }: OperationCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-white/20 text-white";
      case "planning":
        return "bg-orange-500/20 text-orange-500";
      case "completed":
        return "bg-white/20 text-white";
      case "compromised":
        return "bg-red-500/20 text-red-500";
      default:
        return "bg-neutral-500/20 text-neutral-300";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical":
        return "bg-red-500/20 text-red-500";
      case "high":
        return "bg-orange-500/20 text-orange-500";
      case "medium":
        return "bg-neutral-500/20 text-neutral-300";
      case "low":
        return "bg-white/20 text-white";
      default:
        return "bg-neutral-500/20 text-neutral-300";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <Target className="w-4 h-4" />;
      case "planning":
        return <Clock className="w-4 h-4" />;
      case "completed":
        return <CheckCircle className="w-4 h-4" />;
      case "compromised":
        return <XCircle className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  return (
    <Card
      className="bg-neutral-900 border-neutral-700 hover:border-orange-500/50 transition-colors cursor-pointer"
      onClick={() => onClick(operation)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-sm font-bold text-white tracking-wider">
              {operation.name}
            </CardTitle>
            <p className="text-xs text-neutral-400 font-mono">{operation.id}</p>
          </div>
          <div className="flex items-center gap-2">
            {getStatusIcon(operation.status)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Badge className={getStatusColor(operation.status)}>
            {operation.status.toUpperCase()}
          </Badge>
          <Badge className={getPriorityColor(operation.priority)}>
            {operation.priority.toUpperCase()}
          </Badge>
        </div>

        <p className="text-sm text-neutral-300 line-clamp-2">
          {operation.description}
        </p>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <MapPin className="w-3 h-3" />
            <span>{operation.location}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <Users className="w-3 h-3" />
            <span>{operation.agents} agents assigned</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <Clock className="w-3 h-3" />
            <span>Est. completion: {operation.estimatedCompletion}</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-neutral-400">Progress</span>
            <span className="text-white font-mono">{operation.progress}%</span>
          </div>
          <div className="w-full bg-neutral-800 rounded-full h-2">
            <div
              className="bg-orange-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${operation.progress}%` }}
            ></div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
