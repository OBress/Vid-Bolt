"use client";

/**
 * Pipeline Status Badge
 * ============================================================================
 * Status pill component for step and run states.
 */

import type { StepStatus } from "../../types/pipeline-debugger";

const STATUS_STYLES: Record<StepStatus, { bg: string; text: string; label: string }> = {
  complete: { bg: "bg-green-900/40", text: "text-green-400", label: "Complete" },
  "in-progress": { bg: "bg-amber-900/40", text: "text-amber-400", label: "In Progress" },
  error: { bg: "bg-red-900/40", text: "text-red-400", label: "Error" },
  skipped: { bg: "bg-neutral-800/40", text: "text-neutral-500", label: "Skipped" },
  "not-reached": { bg: "bg-neutral-900/40", text: "text-neutral-600", label: "Pending" },
  paused: { bg: "bg-purple-900/40", text: "text-purple-400", label: "Paused" },
};

interface PipelineStatusBadgeProps {
  status: StepStatus;
  className?: string;
  compact?: boolean;
}

export function PipelineStatusBadge({
  status,
  className = "",
  compact = false,
}: PipelineStatusBadgeProps) {
  const style = STATUS_STYLES[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text} ${className}`}
    >
      <StatusDot status={status} />
      {!compact && style.label}
    </span>
  );
}

function StatusDot({ status }: { status: StepStatus }) {
  const dotColor: Record<StepStatus, string> = {
    complete: "bg-green-400",
    "in-progress": "bg-amber-400 animate-pulse",
    error: "bg-red-400",
    skipped: "bg-neutral-600",
    "not-reached": "bg-neutral-700",
    paused: "bg-purple-400 animate-pulse",
  };

  return <span className={`w-1.5 h-1.5 rounded-full ${dotColor[status]}`} />;
}
