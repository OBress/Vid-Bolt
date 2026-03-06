"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import {
  CheckCircle2,
  RefreshCw,
  Lightbulb,
  ShieldCheck,
  Info,
  AlertTriangle,
  Play,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { ActivityEvent } from "@/types/task";

// ============================================================================
// TYPES
// ============================================================================

interface ActivityFeedProps {
  events: ActivityEvent[];
  /** Whether the pipeline is currently running */
  isRunning: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

/** Icon and color for each event type */
function getEventStyle(type: ActivityEvent["type"]) {
  switch (type) {
    case "phase_start":
      return {
        icon: <Play className="w-3 h-3" />,
        color: "text-blue-400",
        bg: "bg-blue-500/10",
        border: "border-blue-500/20",
      };
    case "phase_complete":
      return {
        icon: <CheckCircle2 className="w-3 h-3" />,
        color: "text-green-400",
        bg: "bg-green-500/10",
        border: "border-green-500/20",
      };
    case "reflection":
      return {
        icon: <Lightbulb className="w-3 h-3" />,
        color: "text-purple-400",
        bg: "bg-purple-500/10",
        border: "border-purple-500/20",
      };
    case "retry":
      return {
        icon: <RefreshCw className="w-3 h-3" />,
        color: "text-amber-400",
        bg: "bg-amber-500/10",
        border: "border-amber-500/20",
      };
    case "verification":
      return {
        icon: <ShieldCheck className="w-3 h-3" />,
        color: "text-cyan-400",
        bg: "bg-cyan-500/10",
        border: "border-cyan-500/20",
      };
    case "warning":
      return {
        icon: <AlertTriangle className="w-3 h-3" />,
        color: "text-red-400",
        bg: "bg-red-500/10",
        border: "border-red-500/20",
      };
    case "info":
    default:
      return {
        icon: <Info className="w-3 h-3" />,
        color: "text-neutral-400",
        bg: "bg-neutral-500/10",
        border: "border-neutral-500/20",
      };
  }
}

/** Format a relative time string */
function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;

  if (diffMs < 5000) return "just now";
  if (diffMs < 60_000) return `${Math.floor(diffMs / 1000)}s ago`;
  if (diffMs < 3600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  return `${Math.floor(diffMs / 3600_000)}h ago`;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ActivityFeed({ events, isRunning }: ActivityFeedProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  // Re-render relative times every 10s
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isRunning || events.length === 0) return;
    const timer = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(timer);
  }, [isRunning, events.length]);

  // Auto-expand when first event arrives
  useEffect(() => {
    if (events.length > 0 && prevCountRef.current === 0) {
      setIsExpanded(true);
    }
    prevCountRef.current = events.length;
  }, [events.length]);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (isExpanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length, isExpanded]);

  // Memoize latest event message for the collapsed summary
  const latestEvent = useMemo(
    () => (events.length > 0 ? events[events.length - 1] : null),
    [events]
  );

  if (events.length === 0) return null;

  return (
    <div className="w-full bg-neutral-900/60 border border-neutral-800 rounded-xl overflow-hidden">
      {/* Header / toggle */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-800/40 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider shrink-0">
            Activity
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-neutral-800 text-neutral-500">
            {events.length}
          </span>
          {/* Collapsed: show latest event */}
          {!isExpanded && latestEvent && (
            <span className="text-xs text-neutral-500 truncate ml-2">
              {latestEvent.message}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
        )}
      </button>

      {/* Event list */}
      {isExpanded && (
        <div
          ref={scrollRef}
          className="max-h-64 overflow-y-auto px-4 pb-3 space-y-1.5 scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-transparent"
        >
          {events.map((event, index) => {
            const style = getEventStyle(event.type);

            return (
              <div
                key={`${event.timestamp}-${index}`}
                className="flex items-start gap-2.5 animate-in fade-in slide-in-from-bottom-1 duration-300"
                style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
              >
                {/* Type icon */}
                <div
                  className={`w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 ${style.bg} ${style.color}`}
                >
                  {style.icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-xs leading-relaxed ${style.color}`}>
                    {event.message}
                  </p>
                  {event.detail && (
                    <p className="text-[10px] text-neutral-600 mt-0.5 truncate">
                      {event.detail}
                    </p>
                  )}
                </div>

                {/* Timestamp */}
                <span className="text-[10px] font-mono text-neutral-600 shrink-0 mt-0.5">
                  {formatRelativeTime(event.timestamp)}
                </span>
              </div>
            );
          })}

          {/* Pulsing indicator when running */}
          {isRunning && (
            <div className="flex items-center gap-2 pt-1">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-[10px] text-neutral-600">
                Listening for events...
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
