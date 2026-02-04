/**
 * Project State Service
 * 
 * Handles saving and loading project state to/from Supabase.
 * Uses Timeline V2 format (tracks + clips).
 * All persistence is Supabase-only - no localStorage.
 */

import { apiRequest } from '@/lib/api-client';
import type { TimelineTrack, TimelineClip, TransitionEntity } from '../types/timeline-v2';
import type { AspectRatio, ResolutionPreset } from '../stores/video-editor-store';

/**
 * Timeline V2 data structure for persistence
 */
export interface TimelineV2Data {
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  transitions?: Record<string, TransitionEntity>;
  version: 2;
}

/**
 * Editor preferences stored with project
 */
export interface EditorPreferences {
  aspectRatio?: AspectRatio;
  resolution?: ResolutionPreset;
  backgroundColor?: string;
  fps?: number;
  showAlignmentGuides?: boolean;
  snappingEnabled?: boolean;
  editMode?: string;
}

export interface ProjectState {
  id?: string;
  projectId: string;
  researchData?: Record<string, unknown>;
  scriptData?: Record<string, unknown>;
  voiceData?: Record<string, unknown>;
  timelineData?: TimelineV2Data;
  exportSettings?: Record<string, unknown>;
  editorPreferences?: EditorPreferences;
  createdAt?: string;
  updatedAt?: string;
}

export interface SaveStateOptions {
  /** Only save specific sections */
  sections?: Array<'research_data' | 'script_data' | 'voice_data' | 'timeline_data' | 'export_settings' | 'editor_preferences'>;
}

interface StateResponse {
  success: boolean;
  error?: string;
  exists?: boolean;
  state?: {
    id: string;
    project_id: string;
    research_data?: Record<string, unknown>;
    script_data?: Record<string, unknown>;
    voice_data?: Record<string, unknown>;
    timeline_data?: Record<string, unknown>;
    export_settings?: Record<string, unknown>;
    editor_preferences?: Record<string, unknown>;
    created_at?: string;
    updated_at?: string;
  };
  updated_at?: string;
}

/**
 * Load project state from Supabase
 */
export async function loadProjectState(projectId: string): Promise<ProjectState | null> {
  try {
    const response = await apiRequest<StateResponse>(`/api/video-editor/projects/${projectId}/state`);
    
    if (!response.success) {
      console.warn('[ProjectState] Failed to load:', response.error);
      return null;
    }

    if (!response.exists || !response.state) {
      console.log('[ProjectState] No saved state found for project:', projectId);
      return null;
    }

    // Convert snake_case to camelCase
    const state = response.state;
    return {
      id: state.id,
      projectId: state.project_id,
      researchData: state.research_data || {},
      scriptData: state.script_data || {},
      voiceData: state.voice_data || {},
      timelineData: state.timeline_data || {},
      exportSettings: state.export_settings || {},
      editorPreferences: state.editor_preferences || {},
      createdAt: state.created_at,
      updatedAt: state.updated_at,
    };
  } catch (error) {
    console.error('[ProjectState] Error loading state:', error);
    return null;
  }
}

/**
 * Save project state to Supabase
 */
export async function saveProjectState(
  projectId: string,
  state: Partial<ProjectState>
): Promise<{ success: boolean; updatedAt?: string }> {
  try {
    // Convert camelCase to snake_case for API
    const payload: Record<string, unknown> = {};
    
    if (state.researchData !== undefined) {
      payload.research_data = state.researchData;
    }
    if (state.scriptData !== undefined) {
      payload.script_data = state.scriptData;
    }
    if (state.voiceData !== undefined) {
      payload.voice_data = state.voiceData;
    }
    if (state.timelineData !== undefined) {
      payload.timeline_data = state.timelineData;
    }
    if (state.exportSettings !== undefined) {
      payload.export_settings = state.exportSettings;
    }
    if (state.editorPreferences !== undefined) {
      payload.editor_preferences = state.editorPreferences;
    }

    const response = await apiRequest<StateResponse>(
      `/api/video-editor/projects/${projectId}/state`,
      {
        method: 'PUT',
        body: payload,
      }
    );

    if (!response.success) {
      console.error('[ProjectState] Save failed:', response.error);
      return { success: false };
    }

    return {
      success: true,
      updatedAt: response.updated_at,
    };
  } catch (error) {
    console.error('[ProjectState] Error saving state:', error);
    return { success: false };
  }
}

/**
 * Save a specific section of project state
 */
export async function saveProjectSection(
  projectId: string,
  section: 'research_data' | 'script_data' | 'voice_data' | 'timeline_data' | 'export_settings' | 'editor_preferences',
  data: Record<string, unknown>
): Promise<{ success: boolean; updatedAt?: string }> {
  try {
    const response = await apiRequest<StateResponse>(
      `/api/video-editor/projects/${projectId}/state/${section}`,
      {
        method: 'PATCH',
        body: data,
      }
    );

    if (!response.success) {
      console.error('[ProjectState] Section save failed:', response.error);
      return { success: false };
    }

    return {
      success: true,
      updatedAt: response.updated_at,
    };
  } catch (error) {
    console.error('[ProjectState] Error saving section:', error);
    return { success: false };
  }
}

/**
 * Delete project state
 */
export async function deleteProjectState(projectId: string): Promise<boolean> {
  try {
    const response = await apiRequest<{ success: boolean }>(
      `/api/video-editor/projects/${projectId}/state`,
      { method: 'DELETE' }
    );
    return response.success;
  } catch (error) {
    console.error('[ProjectState] Error deleting state:', error);
    return false;
  }
}

/**
 * Check if project has saved state
 */
export async function hasProjectState(projectId: string): Promise<boolean> {
  try {
    const response = await apiRequest<StateResponse>(`/api/video-editor/projects/${projectId}/state`);
    return response.success && !!response.exists;
  } catch (error) {
    return false;
  }
}
