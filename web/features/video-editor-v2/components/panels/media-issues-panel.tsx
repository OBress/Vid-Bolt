"use client";

/**
 * Media Issues Panel
 * ============================================================================
 * Popover panel showing media generation issues (failed, placeholder, missing).
 * Displayed as a notification badge in the canvas toolbar.
 *
 * Features:
 * - Badge with active issue count
 * - Scrollable list of issues with severity icons
 * - Click-to-navigate: jumps timeline to affected clip
 * - Per-issue actions: dismiss, remove clip
 * - Animated entrance
 */

import React, { useCallback, useMemo } from "react";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  X,
  Trash2,
  Eye,
  ChevronDown,
  Bell,
} from "lucide-react";
import { cn } from "../../utils/general/utils";
import {
  useMediaIssuesStore,
  selectActiveIssues,
  selectActiveCount,
  type MediaIssue,
  type MediaIssueSeverity,
} from "../../stores/media-issues-store";
import { useShallow } from "zustand/react/shallow";
import { useVideoEditorStore } from "../../stores/video-editor-store";

// ============================================================
// SEVERITY STYLING
// ============================================================

const SEVERITY_CONFIG: Record<
  MediaIssueSeverity,
  {
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    bgColor: string;
    borderColor: string;
    badgeColor: string;
  }
> = {
  error: {
    icon: AlertCircle,
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/20",
    badgeColor: "bg-red-500",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
    badgeColor: "bg-amber-500",
  },
  info: {
    icon: Info,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
    badgeColor: "bg-blue-500",
  },
};

// ============================================================
// ISSUE ITEM COMPONENT
// ============================================================

interface IssueItemProps {
  issue: MediaIssue;
  onNavigate: (clipId: string) => void;
  onDismiss: (id: string) => void;
  onRemove: (id: string) => void;
}

const IssueItem: React.FC<IssueItemProps> = ({
  issue,
  onNavigate,
  onDismiss,
  onRemove,
}) => {
  const config = SEVERITY_CONFIG[issue.severity];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "group flex items-start gap-3 p-3 rounded-lg border transition-all",
        config.bgColor,
        config.borderColor,
        "hover:brightness-110"
      )}
    >
      {/* Severity icon */}
      <div className="mt-0.5 flex-shrink-0">
        <Icon className={cn("h-4 w-4", config.color)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground/90 truncate">
            {issue.title}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">
            Shot {issue.shotIndex + 1}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
          {issue.description}
        </p>
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {issue.clipId && (
          <button
            onClick={() => onNavigate(issue.clipId!)}
            className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
            title="Jump to clip"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={() => onDismiss(issue.id)}
          className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
          title="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        {issue.clipId && (
          <button
            onClick={() => onRemove(issue.id)}
            className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
            title="Remove clip"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

// ============================================================
// MEDIA ISSUES BADGE (for toolbar)
// ============================================================

export const MediaIssuesBadge: React.FC = () => {
  const activeCount = useMediaIssuesStore(selectActiveCount);
  const activeIssues = useMediaIssuesStore(useShallow(selectActiveIssues));
  const togglePanel = useMediaIssuesStore((s) => s.togglePanel);
  const isPanelOpen = useMediaIssuesStore((s) => s.isPanelOpen);

  const highestSeverity: MediaIssueSeverity = useMemo(
    () => activeIssues.some((i) => i.severity === "error") ? "error" : "warning",
    [activeIssues]
  );

  if (activeCount === 0) return null;

  const config = SEVERITY_CONFIG[highestSeverity];

  return (
    <button
      onClick={togglePanel}
      className={cn(
        "relative flex items-center gap-1.5 px-2 py-1 rounded-md transition-all text-xs font-medium",
        isPanelOpen
          ? "bg-white/10 text-foreground"
          : "hover:bg-white/5 text-muted-foreground hover:text-foreground"
      )}
      title={`${activeCount} media issue${activeCount !== 1 ? "s" : ""}`}
    >
      <Bell className="h-3.5 w-3.5" />
      {/* Badge count */}
      <span
        className={cn(
          "absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[10px] font-bold text-white px-1",
          config.badgeColor,
          "animate-in zoom-in-75 duration-200"
        )}
      >
        {activeCount > 9 ? "9+" : activeCount}
      </span>
    </button>
  );
};

// ============================================================
// MEDIA ISSUES PANEL (popover content)
// ============================================================

export const MediaIssuesPanel: React.FC = () => {
  const activeIssues = useMediaIssuesStore(useShallow(selectActiveIssues));
  const isPanelOpen = useMediaIssuesStore((s) => s.isPanelOpen);
  const dismissIssue = useMediaIssuesStore((s) => s.dismissIssue);
  const removeIssue = useMediaIssuesStore((s) => s.removeIssue);
  const clearAll = useMediaIssuesStore((s) => s.clearAll);
  const setPanelOpen = useMediaIssuesStore((s) => s.setPanelOpen);

  const setCurrentTime = useVideoEditorStore((s) => s.setCurrentTime);
  const selectClip = useVideoEditorStore((s) => s.selectClip);
  const getClipById = useVideoEditorStore((s) => s.getClipById);
  const deleteClip = useVideoEditorStore((s) => s.deleteClip);

  const handleNavigate = useCallback(
    (clipId: string) => {
      const clip = getClipById(clipId);
      if (clip) {
        // Jump timeline to clip start
        setCurrentTime(clip.startTime);
        // Select the clip
        selectClip(clipId);
      }
    },
    [getClipById, setCurrentTime, selectClip]
  );

  const handleDismiss = useCallback(
    (id: string) => {
      dismissIssue(id);
    },
    [dismissIssue]
  );

  const handleRemove = useCallback(
    (id: string) => {
      const issue = activeIssues.find((i) => i.id === id);
      if (issue?.clipId) {
        deleteClip(issue.clipId);
      }
      removeIssue(id);
    },
    [activeIssues, deleteClip, removeIssue]
  );

  if (!isPanelOpen) return null;

  const errorCount = activeIssues.filter((i) => i.severity === "error").length;
  const warningCount = activeIssues.filter(
    (i) => i.severity === "warning"
  ).length;

  return (
    <div
      className={cn(
        "absolute top-full right-0 mt-1 z-50 w-[380px] max-h-[420px]",
        "bg-background/95 backdrop-blur-xl border border-border rounded-xl shadow-2xl",
        "animate-in slide-in-from-top-2 fade-in-0 duration-200",
        "flex flex-col overflow-hidden"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-semibold text-foreground">
            Media Issues
          </span>
          <span className="text-xs text-muted-foreground">
            {errorCount > 0 && (
              <span className="text-red-400">{errorCount} error{errorCount !== 1 ? "s" : ""}</span>
            )}
            {errorCount > 0 && warningCount > 0 && " · "}
            {warningCount > 0 && (
              <span className="text-amber-400">{warningCount} warning{warningCount !== 1 ? "s" : ""}</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {activeIssues.length > 0 && (
            <button
              onClick={clearAll}
              className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-white/5 transition-colors"
            >
              Clear all
            </button>
          )}
          <button
            onClick={() => setPanelOpen(false)}
            className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Issue list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {activeIssues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
              <AlertCircle className="h-5 w-5 text-emerald-400" />
            </div>
            <p className="text-sm text-muted-foreground">No issues found</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              All media generated successfully
            </p>
          </div>
        ) : (
          activeIssues.map((issue) => (
            <IssueItem
              key={issue.id}
              issue={issue}
              onNavigate={handleNavigate}
              onDismiss={handleDismiss}
              onRemove={handleRemove}
            />
          ))
        )}
      </div>
    </div>
  );
};
