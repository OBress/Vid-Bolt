"use client";

/**
 * Media Issues Panel
 * ============================================================================
 * Popover panel showing media generation issues (failed, placeholder, missing).
 * Displayed via the warning button in the editor header.
 *
 * Features:
 * - Badge with active issue count (always visible — green check when clean)
 * - Tab-based severity filtering (Errors / Warnings)
 * - Click-to-navigate: jumps timeline to affected clip + highlights it
 * - Double-click checkmark: marks issue as resolved (stays visible, dimmed)
 * - Copy all issues to clipboard (admin utility)
 * - Animated entrance
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  X,
  Trash2,
  Eye,
  ChevronDown,
  Timer,
  Repeat,
  ImageOff,
  CheckCircle2,
  Check,
  Copy,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "../../utils/general/utils";
import {
  useMediaIssuesStore,
  selectActiveIssues,
  selectActiveCount,
  selectErrorCount,
  selectWarningCount,
  type MediaIssue,
  type MediaIssueSeverity,
  type MediaIssueTab,
} from "../../stores/media-issues-store";
import { useShallow } from "zustand/react/shallow";
import { useVideoEditorStore } from "../../stores/video-editor-store";
import { createClient } from "@/lib/supabase/client";
import type { TimelineClip } from "../../types/timeline-v2";

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

// Type-specific icon overrides — more descriptive than severity alone
const TYPE_ICON_CONFIG: Partial<Record<string, React.ComponentType<{ className?: string }>>> = {
  duration_mismatch: Timer,
  substituted_media: Repeat,
  generation_failed: ImageOff,
};

// ============================================================
// ISSUE ITEM COMPONENT
// ============================================================

interface IssueItemProps {
  issue: MediaIssue;
  onNavigate: (issue: MediaIssue) => void;
  onDismiss: (id: string) => void;
  onRemove: (id: string) => void;
  onResolveToggle: (id: string, currentlyResolved: boolean) => void;
}

const IssueItem: React.FC<IssueItemProps> = ({
  issue,
  onNavigate,
  onDismiss,
  onRemove,
  onResolveToggle,
}) => {
  const config = SEVERITY_CONFIG[issue.severity];
  // Use type-specific icon when available, falling back to severity icon
  const Icon = TYPE_ICON_CONFIG[issue.type] || config.icon;

  // Double-click tracking for resolve checkmark
  const lastClickRef = useRef<number>(0);
  const handleCheckmarkClick = useCallback(() => {
    const now = Date.now();
    const timeSinceLastClick = now - lastClickRef.current;
    lastClickRef.current = now;

    // Double-click threshold: 400ms
    if (timeSinceLastClick < 400) {
      onResolveToggle(issue.id, issue.resolved);
      lastClickRef.current = 0; // Reset
    }
  }, [issue.id, issue.resolved, onResolveToggle]);

  return (
    <div
      className={cn(
        "group flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer",
        issue.resolved
          ? "opacity-50 bg-emerald-500/5 border-emerald-500/10"
          : cn(config.bgColor, config.borderColor),
        "hover:brightness-110"
      )}
      onClick={() => onNavigate(issue)}
    >
      {/* Resolve checkmark (double-click to toggle) */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleCheckmarkClick();
        }}
        className={cn(
          "mt-0.5 flex-shrink-0 p-0.5 rounded transition-colors",
          issue.resolved
            ? "text-emerald-400 hover:text-emerald-300"
            : "text-muted-foreground/40 hover:text-muted-foreground/70"
        )}
        title={issue.resolved ? "Double-click to un-resolve" : "Double-click to mark as resolved"}
      >
        {issue.resolved ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <div className="h-4 w-4 rounded-full border border-current flex items-center justify-center">
            <Check className="h-2.5 w-2.5 opacity-0 group-hover:opacity-50 transition-opacity" />
          </div>
        )}
      </button>

      {/* Severity icon */}
      <div className="mt-0.5 flex-shrink-0">
        <Icon className={cn("h-4 w-4", issue.resolved ? "text-muted-foreground/40" : config.color)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-xs font-medium truncate",
            issue.resolved ? "text-muted-foreground/50 line-through" : "text-foreground/90"
          )}>
            {issue.title}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">
            Shot {issue.shotIndex + 1}
          </span>
          {/* Type label badge */}
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 text-muted-foreground/60 font-medium whitespace-nowrap">
            {issue.type.replace(/_/g, ' ')}
          </span>
        </div>
        <p className={cn(
          "text-[11px] mt-0.5 line-clamp-2",
          issue.resolved ? "text-muted-foreground/40" : "text-muted-foreground"
        )}>
          {issue.description}
        </p>
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {issue.clipId && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(issue);
            }}
            className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
            title="Jump to clip"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(issue.id);
          }}
          className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
          title="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        {issue.clipId && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(issue.id);
            }}
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
// MEDIA ISSUES BADGE (for editor header)
// ============================================================

/**
 * Combined badge + portal panel.
 * The badge renders inline (in the header) and stores a ref.
 * The panel renders via createPortal at document.body so
 * it escapes any overflow:hidden / CSS containment boundaries.
 */
export const MediaIssuesPopover: React.FC = () => {
  const activeCount = useMediaIssuesStore(selectActiveCount);
  const errorCount = useMediaIssuesStore(selectErrorCount);
  const warningCount = useMediaIssuesStore(selectWarningCount);
  const togglePanel = useMediaIssuesStore((s) => s.togglePanel);
  const isPanelOpen = useMediaIssuesStore((s) => s.isPanelOpen);
  const setPanelOpen = useMediaIssuesStore((s) => s.setPanelOpen);

  const hasErrors = errorCount > 0;
  const hasWarnings = warningCount > 0;
  const hasIssues = activeCount > 0;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; right: number } | null>(null);

  // Recalculate panel position when it opens (or on scroll/resize)
  useEffect(() => {
    if (!isPanelOpen || !triggerRef.current) return;

    const updatePosition = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      setPanelPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isPanelOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isPanelOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanelOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isPanelOpen, setPanelOpen]);

  return (
    <>
      {/* Trigger button (renders inline in header) */}
      <button
        ref={triggerRef}
        onClick={togglePanel}
        className={cn(
          "relative inline-flex items-center justify-center rounded-md h-8 w-8 transition-all",
          isPanelOpen
            ? "bg-accent text-foreground"
            : hasErrors
              ? "text-red-400 hover:bg-red-500/10 hover:text-red-300"
              : hasWarnings
                ? "text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                : "text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
        )}
        title={
          hasIssues
            ? `${errorCount > 0 ? `${errorCount} error${errorCount !== 1 ? "s" : ""}` : ""}${errorCount > 0 && warningCount > 0 ? ", " : ""}${warningCount > 0 ? `${warningCount} warning${warningCount !== 1 ? "s" : ""}` : ""}`
            : "No issues"
        }
        aria-label={hasIssues ? `${activeCount} media issues` : "No media issues"}
      >
        {hasIssues ? (
          <AlertTriangle className="h-4 w-4" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        )}
        {hasIssues && (
          <span
            className={cn(
              "absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[10px] font-bold text-white px-1",
              hasErrors ? "bg-red-500" : "bg-amber-500",
              "animate-in zoom-in-75 duration-200"
            )}
          >
            {activeCount > 99 ? "99+" : activeCount}
          </span>
        )}
      </button>

      {/* Portal panel — renders at document.body to escape overflow/containment */}
      {isPanelOpen && panelPos && createPortal(
        <>
          {/* Backdrop — closes panel on click-outside */}
          <div
            className="fixed inset-0 z-[9998]"
            onClick={() => setPanelOpen(false)}
          />
          {/* Panel */}
          <div
            ref={panelRef}
            className="fixed z-[9999]"
            style={{ top: panelPos.top, right: panelPos.right }}
          >
            <MediaIssuesPanelContent />
          </div>
        </>,
        document.body
      )}
    </>
  );
};

// ============================================================
// MEDIA ISSUES PANEL CONTENT (rendered inside portal)
// ============================================================

const MediaIssuesPanelContent: React.FC = () => {
  const activeIssues = useMediaIssuesStore(useShallow(selectActiveIssues));
  const isPanelOpen = useMediaIssuesStore((s) => s.isPanelOpen);
  const activeTab = useMediaIssuesStore((s) => s.activeTab);
  const dismissIssue = useMediaIssuesStore((s) => s.dismissIssue);
  const removeIssue = useMediaIssuesStore((s) => s.removeIssue);
  const resolveIssue = useMediaIssuesStore((s) => s.resolveIssue);
  const unresolveIssue = useMediaIssuesStore((s) => s.unresolveIssue);
  const clearAll = useMediaIssuesStore((s) => s.clearAll);
  const setPanelOpen = useMediaIssuesStore((s) => s.setPanelOpen);
  const setActiveTab = useMediaIssuesStore((s) => s.setActiveTab);
  const setHighlightedClipId = useMediaIssuesStore((s) => s.setHighlightedClipId);
  const errorCount = useMediaIssuesStore(selectErrorCount);
  const warningCount = useMediaIssuesStore(selectWarningCount);

  const setCurrentTime = useVideoEditorStore((s) => s.setCurrentTime);
  const selectClip = useVideoEditorStore((s) => s.selectClip);
  const getClipById = useVideoEditorStore((s) => s.getClipById);
  const deleteClip = useVideoEditorStore((s) => s.deleteClip);
  const clips = useVideoEditorStore((s) => s.clips) as Record<string, TimelineClip>;

  // Copy feedback state
  const [copied, setCopied] = useState(false);

  // Admin check for copy button
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || cancelled) return;
      supabase
        .from("users")
        .select("is_admin")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (!cancelled && data) setIsAdmin(data.is_admin || false);
        });
    });
    return () => { cancelled = true; };
  }, []);

  // Filter issues by active tab
  const filteredIssues = useMemo(() => {
    switch (activeTab) {
      case 'errors':
        return activeIssues.filter((i) => i.severity === 'error');
      case 'warnings':
        return activeIssues.filter((i) => i.severity === 'warning');
      default:
        return activeIssues;
    }
  }, [activeIssues, activeTab]);

  const handleNavigate = useCallback(
    (issue: MediaIssue) => {
      // Get registered callbacks
      const { scrollToTimeCallback: scrollToTime, seekToFrameCallback: seekToFrame } =
        useMediaIssuesStore.getState();
      const fps = useVideoEditorStore.getState().fps || 30;

      // Collect all shotIndex values for diagnostics
      const allClipsList = Object.values(clips);
      const shotIndexMap = new Map<number, string>();
      allClipsList.forEach((c) => {
        if (c.data?.shotIndex != null) shotIndexMap.set(c.data.shotIndex, c.id);
      });

      console.log('[MediaIssuesPanel] Navigate request:', {
        issueId: issue.id,
        clipId: issue.clipId,
        issueShotIndex: issue.shotIndex,
        title: issue.title,
        availableShotIndices: Array.from(shotIndexMap.keys()).sort((a, b) => a - b),
      });

      // Helper: navigate to a clip — seeks player, scrolls timeline, highlights clip
      const navigateToClip = (clipId: string, time: number) => {
        const frame = Math.round(time * fps);
        // Seek the actual Remotion player (this updates playback position)
        seekToFrame?.(frame);
        // Also update the store time for consistency
        setCurrentTime(time);
        // Select and highlight the clip
        selectClip(clipId);
        setHighlightedClipId(clipId);
        // Scroll the timeline viewport to center on this time
        scrollToTime?.(time, true);
        // Auto-clear highlight after 3 seconds
        setTimeout(() => setHighlightedClipId(null), 3000);
      };

      // Helper: jump to time without a specific clip
      const jumpToTime = (time: number) => {
        const frame = Math.round(time * fps);
        seekToFrame?.(frame);
        setCurrentTime(time);
        scrollToTime?.(time, true);
        selectClip(null);
        // Still show the canvas highlight overlay even without a specific clip
        setHighlightedClipId('__issue-area__');
        setTimeout(() => setHighlightedClipId(null), 3000);
      };

      // Strategy 1: Direct clipId lookup
      if (issue.clipId) {
        const clip = getClipById(issue.clipId);
        if (clip) {
          console.log('[MediaIssuesPanel] ✅ Found clip by ID:', issue.clipId, 'at', clip.startTime);
          navigateToClip(issue.clipId, clip.startTime);
          return;
        }
        console.warn('[MediaIssuesPanel] ⚠ clipId set but clip not found in store:', issue.clipId);
      }

      // Strategy 2: Find clip by shotIndex in clip data
      const matchId = shotIndexMap.get(issue.shotIndex);
      if (matchId) {
        const matchClip = clips[matchId];
        if (matchClip) {
          console.log(`[MediaIssuesPanel] ✅ Found clip by shotIndex: issue.shotIndex=${issue.shotIndex} → ${matchId} at ${matchClip.startTime}`);
          // Retroactively link the clipId for future clicks
          useMediaIssuesStore.getState().setIssueClipId(issue.id, matchId);
          navigateToClip(matchId, matchClip.startTime);
          return;
        }
      }

      // Strategy 3: Find clip by label matching (e.g. "Shot 3" in label)
      const labelMatch = allClipsList.find((c) => {
        const label = c.label || c.name || '';
        return label.includes(`Shot ${issue.shotIndex}`);
      });
      if (labelMatch) {
        console.log(`[MediaIssuesPanel] ✅ Found clip by label match: "${labelMatch.label}" → ${labelMatch.id} at ${labelMatch.startTime}`);
        useMediaIssuesStore.getState().setIssueClipId(issue.id, labelMatch.id);
        navigateToClip(labelMatch.id, labelMatch.startTime);
        return;
      }

      // Strategy 4: No clip exists — jump to approximate time based on shot index
      if (allClipsList.length > 0) {
        const maxTime = Math.max(...allClipsList.map(c => c.startTime + c.duration));
        const totalShots = Math.max(
          issue.shotIndex + 1,
          ...allClipsList.map(c => (c.data?.shotIndex ?? 0) + 1)
        );
        const estimatedTime = (issue.shotIndex / totalShots) * maxTime;
        console.log('[MediaIssuesPanel] ⚠ No clip found for shot', issue.shotIndex, '— jumping to estimated time', estimatedTime.toFixed(2));
        jumpToTime(estimatedTime);
      } else {
        console.warn('[MediaIssuesPanel] ❌ No clips in timeline, cannot navigate');
      }
    },
    [clips, getClipById, setCurrentTime, selectClip, setHighlightedClipId]
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

  const handleResolveToggle = useCallback(
    (id: string, currentlyResolved: boolean) => {
      if (currentlyResolved) {
        unresolveIssue(id);
      } else {
        resolveIssue(id);
      }
    },
    [resolveIssue, unresolveIssue]
  );

  const handleCopyAll = useCallback(async () => {
    const lines: string[] = [
      `=== Media Issues Report (${new Date().toISOString()}) ===`,
      `Total: ${activeIssues.length} issues (${errorCount} errors, ${warningCount} warnings)`,
      '',
    ];

    // Group by severity
    const errors = activeIssues.filter(i => i.severity === 'error');
    const warnings = activeIssues.filter(i => i.severity === 'warning');
    const infos = activeIssues.filter(i => i.severity === 'info');

    if (errors.length > 0) {
      lines.push(`── ERRORS (${errors.length}) ──`);
      for (const issue of errors) {
        lines.push(`  [ERROR] Shot ${issue.shotIndex + 1}: ${issue.title}`);
        lines.push(`    Type: ${issue.type} | Clip: ${issue.clipId || 'N/A'} | Resolved: ${issue.resolved ? 'Yes' : 'No'}`);
        lines.push(`    ${issue.description}`);
        lines.push('');
      }
    }

    if (warnings.length > 0) {
      lines.push(`── WARNINGS (${warnings.length}) ──`);
      for (const issue of warnings) {
        lines.push(`  [WARN] Shot ${issue.shotIndex + 1}: ${issue.title}`);
        lines.push(`    Type: ${issue.type} | Clip: ${issue.clipId || 'N/A'} | Resolved: ${issue.resolved ? 'Yes' : 'No'}`);
        lines.push(`    ${issue.description}`);
        lines.push('');
      }
    }

    if (infos.length > 0) {
      lines.push(`── INFO (${infos.length}) ──`);
      for (const issue of infos) {
        lines.push(`  [INFO] Shot ${issue.shotIndex + 1}: ${issue.title}`);
        lines.push(`    Type: ${issue.type} | Clip: ${issue.clipId || 'N/A'}`);
        lines.push(`    ${issue.description}`);
        lines.push('');
      }
    }

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[MediaIssuesPanel] Failed to copy to clipboard:', err);
    }
  }, [activeIssues, errorCount, warningCount]);

  if (!isPanelOpen) return null;

  const tabs: { key: MediaIssueTab; label: string; count: number; color: string }[] = [
    { key: 'all', label: 'All', count: activeIssues.length, color: 'text-foreground' },
    { key: 'errors', label: 'Errors', count: errorCount, color: 'text-red-400' },
    { key: 'warnings', label: 'Warnings', count: warningCount, color: 'text-amber-400' },
  ];

  return (
    <div
      className={cn(
        "w-[400px] max-h-[480px]",
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
        </div>
        <div className="flex items-center gap-1">
          {/* Copy all button (admin only) */}
          {isAdmin && activeIssues.length > 0 && (
            <button
              onClick={handleCopyAll}
              className={cn(
                "p-1.5 rounded transition-colors",
                copied
                  ? "text-emerald-400 bg-emerald-500/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
              title="Copy all issues to clipboard"
            >
              {copied ? (
                <ClipboardCheck className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          )}
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

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border/30">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
              activeTab === tab.key
                ? "bg-white/10 text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            )}
          >
            <span className={activeTab === tab.key ? tab.color : undefined}>
              {tab.label}
            </span>
            {tab.count > 0 && (
              <span
                className={cn(
                  "min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold px-1",
                  activeTab === tab.key
                    ? tab.key === 'errors'
                      ? "bg-red-500/20 text-red-400"
                      : tab.key === 'warnings'
                        ? "bg-amber-500/20 text-amber-400"
                        : "bg-white/10 text-foreground"
                    : "bg-white/5 text-muted-foreground"
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Quality banner for errors */}
      {errorCount > 0 && activeTab !== 'warnings' && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-xs text-red-300">
          <span className="font-medium">⚠ Quality impact:</span>{" "}
          {errorCount} clip{errorCount !== 1 ? "s" : ""} may affect the final video.
          Review and fix before exporting.
        </div>
      )}

      {/* Issue list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {filteredIssues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            </div>
            <p className="text-sm text-muted-foreground">
              {activeTab === 'all' ? 'No issues found' : `No ${activeTab === 'errors' ? 'errors' : 'warnings'}`}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              {activeTab === 'all'
                ? 'All media generated successfully'
                : `Switch to "All" to see other issues`}
            </p>
          </div>
        ) : (
          filteredIssues.map((issue) => (
            <IssueItem
              key={issue.id}
              issue={issue}
              onNavigate={handleNavigate}
              onDismiss={handleDismiss}
              onRemove={handleRemove}
              onResolveToggle={handleResolveToggle}
            />
          ))
        )}
      </div>

      {/* Footer with resolve hint */}
      {filteredIssues.length > 0 && (
        <div className="px-4 py-2 border-t border-border/30 text-[10px] text-muted-foreground/50 text-center">
          Click to jump to clip · Double-click ○ to mark resolved
        </div>
      )}
    </div>
  );
};
