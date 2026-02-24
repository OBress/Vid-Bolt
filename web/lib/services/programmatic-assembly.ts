/**
 * Programmatic Assembly Service
 * ============================================================================
 * Builds a Video Editor V2–compatible state object programmatically from
 * the closed-loop pipeline's generated media (shots, images, videos, MG,
 * audio, SFX). This replaces the LLM-based EDL generation for the
 * orchestrated pipeline.
 *
 * Output: A serializable editor state JSON that can be saved directly to
 * `video_projects.editor_state` and loaded by the Video Editor V2 store.
 *
 * Features:
 *   - Deterministic clip placement (no AI variance)
 *   - Transition logic (cuts, cross-dissolves, fade-in/out)
 *   - Multi-track layout (video, audio, overlay, MG)
 *   - Sound effect overlay support
 */

import type { PlannedShot } from '@/lib/types/closed-loop';

// ============================================================================
// TYPES
// ============================================================================

/** Transition type between shots */
export type TransitionType = 'cut' | 'crossfade' | 'fade_to_black' | 'fade_from_black';

/** A clip in the assembled timeline */
export interface AssembledClip {
  id: string;
  trackId: string;
  type: 'video' | 'image' | 'audio' | 'motion-graphic';
  /** Absolute start time in seconds */
  startTime: number;
  /** Duration in seconds */
  duration: number;
  /** Media URL (R2, stock, or generated) */
  mediaUrl: string;
  /** Shot index for traceability */
  shotIndex: number;
  /** Opacity (0-1) */
  opacity?: number;
  /** Transition to next clip */
  transitionOut?: {
    type: TransitionType;
    duration: number;
  };
  /** MG Remotion code reference */
  remotionCode?: string;
  /** Whether this clip uses MG Remotion rendering */
  isMotionGraphic?: boolean;
}

/** A track in the assembled timeline */
export interface AssembledTrack {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'overlay';
  group: string;
  order: number;
}

/** The complete assembled timeline state */
export interface AssembledTimeline {
  tracks: AssembledTrack[];
  clips: AssembledClip[];
  totalDuration: number;
  metadata: {
    shotCount: number;
    clipCount: number;
    audioClipCount: number;
    mgClipCount: number;
    sfxClipCount: number;
    transitionCount: number;
  };
}

// ============================================================================
// TRACK DEFINITIONS
// ============================================================================

const DEFAULT_TRACKS: AssembledTrack[] = [
  { id: 'main-video', name: 'Video 1', type: 'video', group: 'video', order: 0 },
  { id: 'mg-overlay', name: 'MG Overlay', type: 'overlay', group: 'video', order: 1 },
  { id: 'narration', name: 'Narration', type: 'audio', group: 'audio', order: 0 },
  { id: 'music', name: 'Music', type: 'audio', group: 'audio', order: 1 },
  { id: 'sfx', name: 'Sound Effects', type: 'audio', group: 'audio', order: 2 },
];

// ============================================================================
// TRANSITION STRATEGY
// ============================================================================

/**
 * Determine the transition type between two consecutive shots.
 * Uses content-aware rules:
 *   - Scene changes → crossfade (0.5s)
 *   - Same-scene continuation → cut (0s)
 *   - Dramatic pauses / emotional beats → fade to black
 *   - Opening shot → fade from black
 */
function determineTransition(
  currentShot: PlannedShot,
  nextShot: PlannedShot | undefined,
  shotIndex: number,
  totalShots: number
): { type: TransitionType; duration: number } | undefined {
  // First shot: fade from black
  if (shotIndex === 0) {
    return { type: 'fade_from_black', duration: 0.5 };
  }

  // Last shot: fade to black
  if (shotIndex === totalShots - 1) {
    return { type: 'fade_to_black', duration: 1.0 };
  }

  if (!nextShot) return undefined;

  // Different media types → crossfade
  if (currentShot.media_type !== nextShot.media_type) {
    return { type: 'crossfade', duration: 0.4 };
  }

  // Content type change → crossfade
  if (currentShot.content_type !== nextShot.content_type) {
    return { type: 'crossfade', duration: 0.3 };
  }

  // Default: hard cut
  return { type: 'cut', duration: 0 };
}

// ============================================================================
// MAIN ASSEMBLY
// ============================================================================

/**
 * Build a complete Video Editor V2 timeline from the closed-loop pipeline's
 * generated media outputs.
 *
 * @param shots - The planned shots from Phase II
 * @param generatedImages - Map of shot-{index} → image URL
 * @param generatedVideos - Map of shot-{index} → video URL
 * @param mgResults - Map of shot-{index} → Remotion code
 * @param audioUrl - The narration audio URL
 * @param musicUrl - The background music URL (optional)
 * @param sfxEntries - Sound effect entries with URLs and timings
 */
export function assembleProgrammaticTimeline(
  shots: PlannedShot[],
  generatedImages: Record<string, string>,
  generatedVideos: Record<string, string>,
  mgResults: Record<string, string>,
  audioUrl: string,
  musicUrl?: string,
  sfxEntries?: Array<{ url: string; triggerAt: number; duration: number }>
): AssembledTimeline {
  const tracks = [...DEFAULT_TRACKS];
  const clips: AssembledClip[] = [];
  let clipIdCounter = 1;
  let transitionCount = 0;

  // =========================================================================
  // Visual clips (Video 1 track)
  // =========================================================================
  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const nextShot = i < shots.length - 1 ? shots[i + 1] : undefined;
    const segKey = `shot-${shot.segment_index}`;

    // Determine media URL and type
    let mediaUrl = '';
    let clipType: AssembledClip['type'] = 'image';
    let isMotionGraphic = false;
    let remotionCode: string | undefined;

    if (shot.media_type === 'video' && generatedVideos[segKey]) {
      mediaUrl = generatedVideos[segKey];
      clipType = 'video';
    } else if (shot.media_type === 'motiongraphic' && mgResults[segKey]) {
      mediaUrl = generatedImages[segKey] || ''; // Use image as background
      clipType = 'motion-graphic';
      isMotionGraphic = true;
      remotionCode = mgResults[segKey];
    } else if (generatedImages[segKey]) {
      mediaUrl = generatedImages[segKey];
      clipType = 'image';
    } else if (shot.media_type === 'stock') {
      // Stock URL would come from AssetManifest; placeholder for now
      mediaUrl = '';
      clipType = 'image';
    }

    // Determine transition
    const transition = determineTransition(shot, nextShot, i, shots.length);
    if (transition && transition.type !== 'cut') {
      transitionCount++;
    }

    clips.push({
      id: `clip-${clipIdCounter++}`,
      trackId: 'main-video',
      type: clipType,
      startTime: shot.start_seconds,
      duration: shot.duration_seconds,
      mediaUrl,
      shotIndex: shot.segment_index,
      opacity: 1,
      transitionOut: transition,
      isMotionGraphic,
      remotionCode,
    });

    // If MG, also add to overlay track for layered rendering
    if (isMotionGraphic && remotionCode) {
      clips.push({
        id: `clip-${clipIdCounter++}`,
        trackId: 'mg-overlay',
        type: 'motion-graphic',
        startTime: shot.start_seconds,
        duration: shot.duration_seconds,
        mediaUrl: '',
        shotIndex: shot.segment_index,
        opacity: 1,
        isMotionGraphic: true,
        remotionCode,
      });
    }
  }

  // =========================================================================
  // Narration audio clip
  // =========================================================================
  if (audioUrl) {
    const totalDuration = shots.length > 0
      ? shots[shots.length - 1].end_seconds
      : 0;

    clips.push({
      id: `clip-${clipIdCounter++}`,
      trackId: 'narration',
      type: 'audio',
      startTime: 0,
      duration: totalDuration,
      mediaUrl: audioUrl,
      shotIndex: -1,
      opacity: 1,
    });
  }

  // =========================================================================
  // Music clip
  // =========================================================================
  if (musicUrl) {
    const totalDuration = shots.length > 0
      ? shots[shots.length - 1].end_seconds
      : 0;

    clips.push({
      id: `clip-${clipIdCounter++}`,
      trackId: 'music',
      type: 'audio',
      startTime: 0,
      duration: totalDuration,
      mediaUrl: musicUrl,
      shotIndex: -1,
      opacity: 0.3, // Ducked behind narration
    });
  }

  // =========================================================================
  // Sound effects
  // =========================================================================
  const sfxClipCount = sfxEntries?.length || 0;
  if (sfxEntries) {
    for (const sfx of sfxEntries) {
      clips.push({
        id: `clip-${clipIdCounter++}`,
        trackId: 'sfx',
        type: 'audio',
        startTime: sfx.triggerAt,
        duration: sfx.duration,
        mediaUrl: sfx.url,
        shotIndex: -1,
        opacity: 0.7,
      });
    }
  }

  // =========================================================================
  // Compute metadata
  // =========================================================================
  const totalDuration = shots.length > 0
    ? shots[shots.length - 1].end_seconds
    : 0;

  const mgClipCount = clips.filter(c => c.isMotionGraphic).length;
  const audioClipCount = clips.filter(c => c.type === 'audio').length;

  return {
    tracks,
    clips,
    totalDuration,
    metadata: {
      shotCount: shots.length,
      clipCount: clips.length,
      audioClipCount,
      mgClipCount,
      sfxClipCount,
      transitionCount,
    },
  };
}

// ============================================================================
// EDITOR STATE PERSISTENCE
// ============================================================================

/**
 * Save the assembled timeline to video_projects.editor_state for the
 * Video Editor V2 to load on mount.
 */
export async function saveAssembledTimeline(
  videoId: string,
  timeline: AssembledTimeline,
  supabase: ReturnType<typeof import('@/lib/queues/shared').getSupabaseServiceClient>
): Promise<void> {
  const { error } = await supabase
    .from('video_projects')
    .update({
      editor_state: timeline,
      updated_at: new Date().toISOString(),
    })
    .eq('id', videoId);

  if (error) {
    console.error('[ProgrammaticAssembly] Failed to save editor state:', error);
    throw error;
  }

  console.log(`[ProgrammaticAssembly] Saved timeline to editor_state: ${timeline.clips.length} clips, ${timeline.tracks.length} tracks`);
}
