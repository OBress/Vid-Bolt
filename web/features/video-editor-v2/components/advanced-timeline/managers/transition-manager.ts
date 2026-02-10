/**
 * Transition Manager — Stub module for advanced timeline transition operations.
 * These operations are now handled directly in the video-editor-store.
 */

import type { TransitionEntity } from '../../../types/timeline-v2';
import type { VideoTransitionType, AudioTransitionType } from '../../../types/index';

export interface TransitionDropParams {
  firstClipId: string;
  secondClipId: string;
  transitionType: string;
  duration?: number;
  position?: 'in' | 'out' | 'between';
}

export interface BoundaryTransitionParams {
  firstClipId: string;
  secondClipId: string;
  type: VideoTransitionType | AudioTransitionType;
  isAudio: boolean;
  duration?: number;
}

export interface TransitionManagerAPI {
  handleTransitionDrop: (params: TransitionDropParams) => void;
  removeTransition: (transitionId: string) => void;
  updateTransitionTimes: (transitionId: string, startTime: number, endTime: number) => void;
  updateTransitionTiming: (transitionId: string, startTime: number, endTime: number) => void;
  
  // Selection
  isSelected: (transitionId: string) => boolean;
  selectTransition: (transitionId: string) => void;
  clearSelection: () => void;
  
  // Sidebar drag state
  sidebarDragIsVideo: boolean;
  sidebarDragType: string | null;
  
  // Query
  hasTransitionAt: (clipId: string, position: 'in' | 'out') => boolean;
  getBoundaryTransition: (clipId: string) => TransitionEntity | null;
  
  // Create/modify
  createSingleTransition: (params: BoundaryTransitionParams) => void;
  createBoundaryTransition: (params: BoundaryTransitionParams) => void;
  endSidebarDrag: () => void;
}

export function createTransitionManager(): TransitionManagerAPI {
  return {
    handleTransitionDrop: () => {},
    removeTransition: () => {},
    updateTransitionTimes: () => {},
    updateTransitionTiming: () => {},
    isSelected: () => false,
    selectTransition: () => {},
    clearSelection: () => {},
    sidebarDragIsVideo: false,
    sidebarDragType: null,
    hasTransitionAt: () => false,
    getBoundaryTransition: () => null,
    createSingleTransition: () => {},
    createBoundaryTransition: () => {},
    endSidebarDrag: () => {},
  };
}

/**
 * Stub hook for backwards compatibility.
 * Sidebar drag state is now managed via the store.
 */
export function useIsSidebarDragActive(): boolean {
  return false;
}

export function useTransitionManager(): TransitionManagerAPI {
  return createTransitionManager();
}
