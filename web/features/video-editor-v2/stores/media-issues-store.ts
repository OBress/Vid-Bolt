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
  | 'format_unsupported';

export type MediaIssueAction =
  | 'retry'
  | 'replace_stock'
  | 'remove'
  | 'dismiss';

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
  /** Whether the user has dismissed this issue */
  dismissed: boolean;
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
}

interface MediaIssuesActions {
  /** Add a new issue */
  addIssue: (issue: Omit<MediaIssue, 'id' | 'createdAt' | 'dismissed'>) => string;
  /** Add multiple issues at once (from EDL import) */
  addIssues: (issues: Array<Omit<MediaIssue, 'id' | 'createdAt' | 'dismissed'>>) => void;
  /** Remove an issue */
  removeIssue: (id: string) => void;
  /** Dismiss an issue (hides it but keeps record) */
  dismissIssue: (id: string) => void;
  /** Clear all issues */
  clearAll: () => void;
  /** Set the clip ID for an issue (after timeline import) */
  setIssueClipId: (issueId: string, clipId: string) => void;
  /** Toggle the panel open/closed */
  togglePanel: () => void;
  /** Set panel visibility */
  setPanelOpen: (open: boolean) => void;

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

  // Actions
  addIssue: (issue) => {
    const id = generateIssueId();
    const newIssue: MediaIssue = {
      ...issue,
      id,
      createdAt: Date.now(),
      dismissed: false,
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

/** Whether a specific clip has active issues — primitive return */
export const selectClipHasIssues = (clipId: string) => (s: MediaIssuesState) =>
  s.issues.some((i) => i.clipId === clipId && !i.dismissed);
