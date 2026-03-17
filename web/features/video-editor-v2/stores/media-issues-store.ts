/**
 * Media Issues Store
 * ============================================================================
 * Lightweight Zustand store for tracking media generation issues.
 * Separated from the main video editor store to keep concerns clean.
 *
 * Issues are populated by:
 * - The wizard data import hook (from EDL mediaIssues)
 * - The media generation pipeline (failed shots)
 * - Manual user actions (flagging clips)
 */

import { create } from 'zustand';

// ============================================================
// TYPES
// ============================================================

export type MediaIssueSeverity = 'error' | 'warning' | 'info';

export type MediaIssueType =
  | 'generation_failed'
  | 'placeholder'
  | 'missing_media'
  | 'quality_warning'
  | 'format_unsupported'
  | 'duration_mismatch'
  | 'substituted_media';

export type MediaIssueAction =
  | 'retry'
  | 'replace_stock'
  | 'remove'
  | 'dismiss';

export type MediaIssueTab = 'all' | 'errors' | 'warnings';

export interface MediaIssue {
  /** Unique issue ID */
  id: string;
  /** Shot index this issue relates to */
  shotIndex: number;
  /** Associated clip ID in the timeline (set after import) */
  clipId?: string;
  /** Issue severity */
  severity: MediaIssueSeverity;
  /** Issue type */
  type: MediaIssueType;
  /** Short title */
  title: string;
  /** Detailed description */
  description: string;
  /** When this issue was created */
  createdAt: number;
  /** Whether the user has dismissed this issue (hidden entirely) */
  dismissed: boolean;
  /** Whether the user has resolved this issue (stays visible, dimmed) */
  resolved: boolean;
  /** Available actions for this issue */
  availableActions: MediaIssueAction[];
}

// ============================================================
// STORE STATE + ACTIONS
// ============================================================

interface MediaIssuesState {
  /** All tracked media issues */
  issues: MediaIssue[];
  /** Whether the panel is open */
  isPanelOpen: boolean;
  /** Active severity tab filter */
  activeTab: MediaIssueTab;
  /** Clip ID currently highlighted in the timeline (for navigate-to-clip) */
  highlightedClipId: string | null;
  /** Callback registered by the Timeline component to scroll the viewport */
  scrollToTimeCallback: ((time: number, center?: boolean) => void) | null;
  /** Callback registered by TimelineSection to seek the Remotion player */
  seekToFrameCallback: ((frame: number) => void) | null;
}

interface MediaIssuesActions {
  /** Add a new issue */
  addIssue: (issue: Omit<MediaIssue, 'id' | 'createdAt' | 'dismissed' | 'resolved'>) => string;
  /** Add multiple issues at once (from EDL import) */
  addIssues: (issues: Array<Omit<MediaIssue, 'id' | 'createdAt' | 'dismissed' | 'resolved'>>) => void;
  /** Remove an issue */
  removeIssue: (id: string) => void;
  /** Dismiss an issue (hides it but keeps record) */
  dismissIssue: (id: string) => void;
  /** Mark an issue as resolved (stays visible, dimmed with checkmark) */
  resolveIssue: (id: string) => void;
  /** Unmark a resolved issue */
  unresolveIssue: (id: string) => void;
  /** Clear all issues */
  clearAll: () => void;
  /** Set the clip ID for an issue (after timeline import) */
  setIssueClipId: (issueId: string, clipId: string) => void;
  /** Toggle the panel open/closed */
  togglePanel: () => void;
  /** Set panel visibility */
  setPanelOpen: (open: boolean) => void;
  /** Set the active severity tab */
  setActiveTab: (tab: MediaIssueTab) => void;
  /** Set highlighted clip ID (for timeline navigation) */
  setHighlightedClipId: (clipId: string | null) => void;
  /** Register the timeline's scrollToTime function */
  registerScrollToTime: (fn: ((time: number, center?: boolean) => void) | null) => void;
  /** Register the video player seekTo function */
  registerSeekToFrame: (fn: ((frame: number) => void) | null) => void;

  // === DERIVED ===
  /** Get active (non-dismissed) issues */
  getActiveIssues: () => MediaIssue[];
  /** Get count of active issues */
  getActiveCount: () => number;
  /** Get issues for a specific clip */
  getIssuesForClip: (clipId: string) => MediaIssue[];
  /** Check if a clip has issues */
  clipHasIssues: (clipId: string) => boolean;
}

export type MediaIssuesStore = MediaIssuesState & MediaIssuesActions;

// ============================================================
// STORE
// ============================================================

let issueIdCounter = 0;
const generateIssueId = (): string => {
  issueIdCounter += 1;
  return `issue-${Date.now()}-${issueIdCounter}`;
};

export const useMediaIssuesStore = create<MediaIssuesStore>((set, get) => ({
  // State
  issues: [],
  isPanelOpen: false,
  activeTab: 'all',
  highlightedClipId: null,
  scrollToTimeCallback: null,
  seekToFrameCallback: null,

  // Actions
  addIssue: (issue) => {
    const id = generateIssueId();
    const newIssue: MediaIssue = {
      ...issue,
      id,
      createdAt: Date.now(),
      dismissed: false,
      resolved: false,
    };
    set((state) => ({ issues: [...state.issues, newIssue] }));
    return id;
  },

  addIssues: (issues) => {
    const newIssues = issues.map((issue) => ({
      ...issue,
      id: generateIssueId(),
      createdAt: Date.now(),
      dismissed: false,
      resolved: false,
    }));
    set((state) => ({ issues: [...state.issues, ...newIssues] }));
  },

  removeIssue: (id) => {
    set((state) => ({ issues: state.issues.filter((i) => i.id !== id) }));
  },

  dismissIssue: (id) => {
    set((state) => ({
      issues: state.issues.map((i) =>
        i.id === id ? { ...i, dismissed: true } : i
      ),
    }));
  },

  resolveIssue: (id) => {
    set((state) => ({
      issues: state.issues.map((i) =>
        i.id === id ? { ...i, resolved: true } : i
      ),
    }));
  },

  unresolveIssue: (id) => {
    set((state) => ({
      issues: state.issues.map((i) =>
        i.id === id ? { ...i, resolved: false } : i
      ),
    }));
  },

  clearAll: () => {
    set({ issues: [] });
  },

  setIssueClipId: (issueId, clipId) => {
    set((state) => ({
      issues: state.issues.map((i) =>
        i.id === issueId ? { ...i, clipId } : i
      ),
    }));
  },

  togglePanel: () => {
    set((state) => ({ isPanelOpen: !state.isPanelOpen }));
  },

  setPanelOpen: (open) => {
    set({ isPanelOpen: open });
  },

  setActiveTab: (tab) => {
    set({ activeTab: tab });
  },

  setHighlightedClipId: (clipId) => {
    set({ highlightedClipId: clipId });
  },

  registerScrollToTime: (fn) => {
    set({ scrollToTimeCallback: fn });
  },

  registerSeekToFrame: (fn) => {
    set({ seekToFrameCallback: fn });
  },

  // Derived
  getActiveIssues: () => {
    return get().issues.filter((i) => !i.dismissed);
  },

  getActiveCount: () => {
    return get().issues.filter((i) => !i.dismissed).length;
  },

  getIssuesForClip: (clipId) => {
    return get().issues.filter((i) => i.clipId === clipId && !i.dismissed);
  },

  clipHasIssues: (clipId) => {
    return get().issues.some((i) => i.clipId === clipId && !i.dismissed);
  },
}));

// ============================================================
// REACTIVE SELECTORS
// ============================================================
// These read from the proxy `state` param and are safe to use inside
// useMediaIssuesStore(selector). The get()-based methods above are
// still valid for imperative calls (e.g. inside useEffect / handlers).

/** Active (non-dismissed) issues — use with useShallow for array stability */
export const selectActiveIssues = (s: MediaIssuesState) =>
  s.issues.filter((i) => !i.dismissed);

/** Count of active issues — primitive return, no useShallow needed */
export const selectActiveCount = (s: MediaIssuesState) =>
  s.issues.filter((i) => !i.dismissed).length;

/** Count of active error-severity issues */
export const selectErrorCount = (s: MediaIssuesState) =>
  s.issues.filter((i) => !i.dismissed && i.severity === 'error').length;

/** Count of active warning-severity issues */
export const selectWarningCount = (s: MediaIssuesState) =>
  s.issues.filter((i) => !i.dismissed && i.severity === 'warning').length;

/** Whether a specific clip has active issues — primitive return */
export const selectClipHasIssues = (clipId: string) => (s: MediaIssuesState) =>
  s.issues.some((i) => i.clipId === clipId && !i.dismissed);

/** Currently highlighted clip ID for timeline navigation */
export const selectHighlightedClipId = (s: MediaIssuesState) =>
  s.highlightedClipId;
