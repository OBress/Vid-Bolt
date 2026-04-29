"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Ban,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { TaskStepTimeline } from "./TaskStepTimeline";
import { resolveTaskUrl } from "./task-navigation";
import type { TaskStep } from "@/types/task";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface TaskData {
  id: string;
  name: string;
  type: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  current_phase: string | null;
  current_step: string | null;
  progress_percent: number;
  error_message?: string | null;
  steps?: TaskStep[];
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  /** Input payload stored by the worker — contains videoId for video-linked tasks */
  input_data?: Record<string, unknown> | null;
  /** Media project ID (set on some task types; may be null for closed_loop tasks) */
  project_id?: string | null;
}

interface TaskCardProps {
  task: TaskData;
  onClose?: () => void;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  writing:          { label: "Writing",        color: "text-blue-400",    bg: "bg-blue-500/15 border-blue-500/25" },
  writing_workflow: { label: "Writing",        color: "text-blue-400",    bg: "bg-blue-500/15 border-blue-500/25" },
  audio:            { label: "Audio",          color: "text-purple-400",  bg: "bg-purple-500/15 border-purple-500/25" },
  video:            { label: "Video",          color: "text-orange-400",  bg: "bg-orange-500/15 border-orange-500/25" },
  export:           { label: "Export",         color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/25" },
  universal_script: { label: "Script",         color: "text-cyan-400",    bg: "bg-cyan-500/15 border-cyan-500/25" },
  outline:          { label: "Outline",        color: "text-amber-400",   bg: "bg-amber-500/15 border-amber-500/25" },
  script_writing:   { label: "Script",         color: "text-cyan-400",    bg: "bg-cyan-500/15 border-cyan-500/25" },
  av_script_part1:  { label: "AV Script P1",   color: "text-indigo-400",  bg: "bg-indigo-500/15 border-indigo-500/25" },
  av_script_part2:  { label: "AV Script P2",   color: "text-violet-400",  bg: "bg-violet-500/15 border-violet-500/25" },
  edit_assembly:    { label: "Edit Assembly",   color: "text-rose-400",    bg: "bg-rose-500/15 border-rose-500/25" },
  closed_loop:      { label: "Closed Loop",    color: "text-yellow-400",  bg: "bg-yellow-500/15 border-yellow-500/25" },
  niche_discovery:  { label: "Niche Scan",     color: "text-teal-400",    bg: "bg-teal-500/15 border-teal-500/25" },
};

const PHASE_LABELS: Record<string, string> = {
  preprocessing: "Pre-processing",
  writing: "Writing",
  postprocessing: "Post-processing",
  audio_generation: "Audio Generation",
  audio_processing: "Audio Processing",
  image_generation: "Image Generation",
  image_editing: "Image Editing",
  video_generation: "Video Generation",
  compositing: "Compositing",
  encoding: "Encoding",
  uploading: "Uploading",
  research: "Research",
  scoping: "Scoping",
  spine: "Spine",
  assets: "Assets",
  expansion: "Expansion",
  assembly: "Assembly",
  // Niche Discovery phases
  channel_profiling: "Channel Profiling",
  channel_crawling: "Crawling Featured Channels",
  keyword_search: "Keyword Search",
  enrichment: "Enriching Candidates",
  snowball_expansion: "Network Expansion",
  embedding_similarity: "Computing Embeddings",
  ai_analysis: "AI Similarity Analysis",
  scoring: "Multi-Signal Scoring",
  storing_results: "Storing Results",
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function getRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function getStepStats(steps?: TaskStep[]) {
  if (!steps || steps.length === 0) return null;
  const completed = steps.filter(
    (s) => s.status === "completed" || s.status === "skipped"
  ).length;
  return { completed, total: steps.length };
}

// ─── Component ─────────────────────────────────────────────────────────────

export function TaskCard({ task, onClose }: TaskCardProps) {
  const isActive = task.status === "running" || task.status === "pending";
  const [isExpanded, setIsExpanded] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isNavigating, setIsNavigating] = useState(false);
  const router = useRouter();

  const typeConfig = TYPE_CONFIG[task.type] || {
    label: task.type,
    color: "text-neutral-400",
    bg: "bg-neutral-500/15 border-neutral-500/25",
  };

  // Memoized Supabase client for navigation lookup (read-only)
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  // Navigate to the page where this task is being performed
  const handleNavigate = useCallback(
    async (e: React.MouseEvent) => {
      // Only fire when clicking the card body — not the steps toggle
      if ((e.target as HTMLElement).closest("[data-steps-toggle]")) return;
      if (isNavigating) return;
      setIsNavigating(true);
      try {
        const url = await resolveTaskUrl(task, supabase);
        if (url) {
          router.push(url);
          onClose?.();  // Dismiss the task panel after navigating
        }
      } finally {
        setIsNavigating(false);
      }
    },
    [task, supabase, router, isNavigating, onClose]
  );

  // Live elapsed timer for active tasks
  const computeElapsed = useCallback(() => {
    const start = task.started_at || task.created_at;
    return Date.now() - new Date(start).getTime();
  }, [task.started_at, task.created_at]);

  useEffect(() => {
    if (!isActive) {
      // For finished tasks, compute fixed duration
      if (task.completed_at && (task.started_at || task.created_at)) {
        const start = new Date(task.started_at || task.created_at).getTime();
        const end = new Date(task.completed_at).getTime();
        setElapsedMs(end - start);
      }
      return;
    }

    setElapsedMs(computeElapsed());
    const interval = setInterval(() => setElapsedMs(computeElapsed()), 1000);
    return () => clearInterval(interval);
  }, [isActive, task.completed_at, task.started_at, task.created_at, computeElapsed]);

  const stepStats = getStepStats(task.steps);

  // ─── Active Task Card ─────────────────────────────────────────────────
  if (isActive) {
    return (
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div
          className="group rounded-lg border border-neutral-800 bg-neutral-900/70 overflow-hidden transition-all duration-200 hover:border-orange-500/40 cursor-pointer"
          onClick={handleNavigate}
        >
          {/* Main content */}
          <div className="p-3">
            <div className="flex items-start gap-2.5">
              {/* Status icon */}
              {task.status === "running" ? (
                isNavigating ? (
                  <Loader2 className="w-4 h-4 animate-spin text-orange-400 mt-0.5 flex-shrink-0" />
                ) : (
                  <Loader2 className="w-4 h-4 animate-spin text-orange-500 mt-0.5 flex-shrink-0" />
                )
              ) : (
                <Clock className="w-4 h-4 text-neutral-500 mt-0.5 flex-shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                {/* Top row: name + type badge + navigate hint */}
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-white truncate flex-1">
                    {task.name}
                  </p>
                  <ExternalLink className="w-3 h-3 text-neutral-600 group-hover:text-orange-400 transition-colors flex-shrink-0" />
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${typeConfig.bg} ${typeConfig.color}`}
                  >
                    {typeConfig.label}
                  </span>
                </div>

                {/* Phase + current step */}
                <div className="mt-1 space-y-0.5">
                  <p className="text-[11px] text-neutral-400">
                    {PHASE_LABELS[task.current_phase || ""] || "Initializing"}
                  </p>
                  {task.current_step && (
                    <p className="text-[11px] text-orange-500/80 truncate">
                      {task.current_step}
                    </p>
                  )}
                </div>

                {/* Progress bar */}
                {task.status === "running" && (
                  <div className="mt-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-neutral-500 tabular-nums">
                        {formatElapsed(elapsedMs)}
                      </span>
                      <div className="flex items-center gap-2">
                        {stepStats && (
                          <span className="text-[10px] text-neutral-500 tabular-nums">
                            {stepStats.completed}/{stepStats.total} steps
                          </span>
                        )}
                        <span className="text-[10px] text-neutral-400 font-medium tabular-nums">
                          {task.progress_percent}%
                        </span>
                      </div>
                    </div>
                    <Progress
                      value={task.progress_percent}
                      className="h-1.5 bg-neutral-800"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Expand toggle for step timeline — isolated from card-level onClick */}
          {task.steps && task.steps.length > 0 && (
            <>
              <CollapsibleTrigger asChild>
                <button
                  data-steps-toggle
                  onClick={(e) => e.stopPropagation()}
                  className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] text-neutral-500 hover:text-neutral-300 bg-neutral-900/50 border-t border-neutral-800/50 transition-colors cursor-pointer"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                  {isExpanded ? "Hide" : "Show"} steps
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-3 pb-3 border-t border-neutral-800/50">
                  <TaskStepTimeline steps={task.steps} />
                </div>
              </CollapsibleContent>
            </>
          )}
        </div>
      </Collapsible>
    );
  }

  // ─── Finished Task Card ───────────────────────────────────────────────
  const StatusIcon =
    task.status === "completed" ? (
      <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
    ) : task.status === "failed" ? (
      <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
    ) : (
      <Ban className="w-4 h-4 text-neutral-500 flex-shrink-0" />
    );

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div
        className={`
          group rounded-lg border overflow-hidden transition-all duration-200 cursor-pointer
          ${task.status === "failed"
            ? "border-red-500/20 bg-red-950/20 hover:border-red-500/30"
            : "border-neutral-800/60 bg-neutral-900/40 hover:border-neutral-700/60"
          }
        `}
        onClick={handleNavigate}
      >
        <div className="p-2.5">
          <div className="flex items-center gap-2.5">
            {StatusIcon}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p
                  className={`text-xs truncate flex-1 ${
                    task.status === "failed"
                      ? "text-red-300"
                      : "text-neutral-300"
                  }`}
                >
                  {task.name}
                </p>
                <ExternalLink className="w-3 h-3 text-neutral-700 group-hover:text-neutral-400 transition-colors flex-shrink-0" />
                <span
                  className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${typeConfig.bg} ${typeConfig.color} opacity-70`}
                >
                  {typeConfig.label}
                </span>
              </div>

              {/* Meta row */}
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-neutral-600 tabular-nums">
                  {getRelativeTime(task.completed_at || task.updated_at)}
                </span>
                {elapsedMs > 0 && (
                  <>
                    <span className="text-neutral-700">·</span>
                    <span className="text-[10px] text-neutral-600 tabular-nums">
                      {formatElapsed(elapsedMs)}
                    </span>
                  </>
                )}
                {stepStats && (
                  <>
                    <span className="text-neutral-700">·</span>
                    <span className="text-[10px] text-neutral-600 tabular-nums">
                      {stepStats.completed}/{stepStats.total} steps
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Error message for failed tasks */}
          {task.status === "failed" && task.error_message && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="mt-2 flex items-start gap-1.5 px-1">
                  <AlertTriangle className="w-3 h-3 text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-[11px] text-red-400/80 line-clamp-2">
                    {task.error_message}
                  </p>
                </div>
              </TooltipTrigger>
              <TooltipContent
                side="left"
                className="max-w-xs bg-neutral-900 text-neutral-200 border border-neutral-700"
              >
                <p className="text-xs">{task.error_message}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Expand toggle for step timeline (history cards) — isolated from card-level onClick */}
        {task.steps && task.steps.length > 0 && (
          <>
            <CollapsibleTrigger asChild>
              <button
                data-steps-toggle
                onClick={(e) => e.stopPropagation()}
                className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] text-neutral-600 hover:text-neutral-400 bg-neutral-900/30 border-t border-neutral-800/30 transition-colors cursor-pointer"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
                {isExpanded ? "Hide" : "Show"} steps
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-3 pb-3 border-t border-neutral-800/30">
                <TaskStepTimeline steps={task.steps} />
              </div>
            </CollapsibleContent>
          </>
        )}
      </div>
    </Collapsible>
  );
}
