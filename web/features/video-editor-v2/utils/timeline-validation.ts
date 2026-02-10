/**
 * ============================================================
 * TIMELINE VALIDATION & INTEGRITY SERVICE
 * ============================================================
 * 
 * Professional-grade validation for timeline operations.
 * Ensures data integrity at all times, preventing:
 * - Overlapping clips on non-overlap tracks
 * - Invalid time values (negative start, zero duration)
 * - Clips on wrong track types
 * - Clips on locked tracks
 * - Orphaned references
 * 
 * Based on Premiere Pro / DaVinci Resolve industry standards.
 */

import type { 
  TimelineClip, 
  TimelineTrack, 
  ClipType, 
  TrackType 
} from '../types/timeline-v2';

// ============================================================
// CONSTANTS
// ============================================================

/** Tolerance for floating point comparisons (1ms) */
const TIME_EPSILON = 0.001;

/** Minimum clip duration in seconds */
const MIN_CLIP_DURATION = 0.033; // ~1 frame at 30fps

/** Maximum clip duration (24 hours) */
const MAX_CLIP_DURATION = 86400;

/** Maximum start time (24 hours) */
const MAX_START_TIME = 86400;

// ============================================================
// CLIP TYPE TO TRACK TYPE MAPPING
// ============================================================

/** 
 * Defines which clip types belong on which track types
 * This is the authoritative mapping - NEVER allow violations
 */
export const CLIP_TYPE_TO_TRACK_TYPE: Record<ClipType, TrackType> = {
  // Visual items → Video tracks
  'video': 'video',
  'image': 'video',
  'text': 'video',
  'caption': 'video',
  'shape': 'video',
  'sticker': 'video',
  'motion-graphics': 'video',
  // Audio items → Audio tracks  
  'audio': 'audio',
  'sound': 'audio',
};

/**
 * Get the required track type for a clip type
 */
export const getRequiredTrackType = (clipType: ClipType): TrackType => {
  return CLIP_TYPE_TO_TRACK_TYPE[clipType] || 'video';
};

/**
 * Check if a clip type is compatible with a track type
 */
export const isClipTypeCompatibleWithTrack = (
  clipType: ClipType, 
  trackType: TrackType
): boolean => {
  return getRequiredTrackType(clipType) === trackType;
};

// ============================================================
// VALIDATION RESULT TYPES
// ============================================================

export interface ValidationError {
  code: string;
  message: string;
  clipId?: string;
  trackId?: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export interface PlacementValidation extends ValidationResult {
  /** Suggested position if original is invalid */
  suggestedPosition?: {
    trackId: string;
    startTime: number;
  };
  /** IDs of clips that would be affected */
  affectedClipIds?: string[];
}

// ============================================================
// INDIVIDUAL VALIDATIONS
// ============================================================

/**
 * Validate time values
 */
export const validateTimeValues = (
  startTime: number, 
  duration: number
): ValidationResult => {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  
  // Check start time
  if (typeof startTime !== 'number' || isNaN(startTime)) {
    errors.push({
      code: 'INVALID_START_TIME',
      message: 'Start time must be a valid number',
      severity: 'error',
    });
  } else if (startTime < 0) {
    errors.push({
      code: 'NEGATIVE_START_TIME',
      message: `Start time cannot be negative: ${startTime}`,
      severity: 'error',
    });
  } else if (startTime > MAX_START_TIME) {
    errors.push({
      code: 'START_TIME_TOO_LARGE',
      message: `Start time exceeds maximum (${MAX_START_TIME}s): ${startTime}`,
      severity: 'error',
    });
  }
  
  // Check duration
  if (typeof duration !== 'number' || isNaN(duration)) {
    errors.push({
      code: 'INVALID_DURATION',
      message: 'Duration must be a valid number',
      severity: 'error',
    });
  } else if (duration <= 0) {
    errors.push({
      code: 'NON_POSITIVE_DURATION',
      message: `Duration must be positive: ${duration}`,
      severity: 'error',
    });
  } else if (duration < MIN_CLIP_DURATION) {
    warnings.push({
      code: 'DURATION_TOO_SHORT',
      message: `Duration is very short (${duration}s), minimum recommended: ${MIN_CLIP_DURATION}s`,
      severity: 'warning',
    });
  } else if (duration > MAX_CLIP_DURATION) {
    errors.push({
      code: 'DURATION_TOO_LONG',
      message: `Duration exceeds maximum (${MAX_CLIP_DURATION}s): ${duration}`,
      severity: 'error',
    });
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
};

/**
 * Validate track type compatibility
 */
export const validateTrackTypeCompatibility = (
  clipType: ClipType,
  track: TimelineTrack
): ValidationResult => {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  
  const requiredTrackType = getRequiredTrackType(clipType);
  
  if (track.type !== requiredTrackType) {
    errors.push({
      code: 'TRACK_TYPE_MISMATCH',
      message: `Clip type "${clipType}" requires a ${requiredTrackType} track, but target is ${track.type} track`,
      trackId: track.id,
      severity: 'error',
    });
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
};

/**
 * Validate track is not locked
 */
export const validateTrackNotLocked = (track: TimelineTrack): ValidationResult => {
  const errors: ValidationError[] = [];
  
  if (track.locked) {
    errors.push({
      code: 'TRACK_LOCKED',
      message: `Cannot modify clips on locked track "${track.name}"`,
      trackId: track.id,
      severity: 'error',
    });
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings: [],
  };
};

/**
 * Check if two time ranges overlap
 */
export const timeRangesOverlap = (
  start1: number,
  end1: number,
  start2: number,
  end2: number
): boolean => {
  return start1 < end2 - TIME_EPSILON && end1 > start2 + TIME_EPSILON;
};

/**
 * Find overlapping clips for a proposed placement
 */
export const findOverlappingClips = (
  startTime: number,
  duration: number,
  trackId: string,
  clips: TimelineClip[],
  excludeClipId?: string
): TimelineClip[] => {
  const endTime = startTime + duration;
  
  return clips.filter(clip => {
    // Skip the clip being moved/edited
    if (excludeClipId && clip.id === excludeClipId) return false;
    
    // Skip clips on other tracks
    if (clip.trackId !== trackId) return false;
    
    // Check for overlap
    const clipEnd = clip.startTime + clip.duration;
    return timeRangesOverlap(startTime, endTime, clip.startTime, clipEnd);
  });
};

/**
 * Validate no overlaps (for non-overlap tracks)
 */
export const validateNoOverlaps = (
  startTime: number,
  duration: number,
  track: TimelineTrack,
  clips: TimelineClip[],
  excludeClipId?: string
): ValidationResult => {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  
  // Skip validation for tracks that allow overlap
  if (track.allowOverlap) {
    return { valid: true, errors: [], warnings: [] };
  }
  
  const overlapping = findOverlappingClips(
    startTime, 
    duration, 
    track.id, 
    clips, 
    excludeClipId
  );
  
  if (overlapping.length > 0) {
    errors.push({
      code: 'CLIP_OVERLAP',
      message: `Clip would overlap with ${overlapping.length} existing clip(s): ${overlapping.map(c => c.label || c.id).join(', ')}`,
      trackId: track.id,
      severity: 'error',
    });
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
};

// ============================================================
// COMPREHENSIVE VALIDATION
// ============================================================

/**
 * Validate a clip placement
 * This is the main validation function that checks ALL constraints
 */
export const validateClipPlacement = (
  clip: Partial<TimelineClip> & { startTime: number; duration: number; type: ClipType },
  targetTrack: TimelineTrack,
  allClips: TimelineClip[],
  allTracks: TimelineTrack[]
): PlacementValidation => {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  
  // 1. Validate time values
  const timeValidation = validateTimeValues(clip.startTime, clip.duration);
  errors.push(...timeValidation.errors);
  warnings.push(...timeValidation.warnings);
  
  // 2. Validate track type compatibility
  const trackTypeValidation = validateTrackTypeCompatibility(clip.type, targetTrack);
  errors.push(...trackTypeValidation.errors);
  warnings.push(...trackTypeValidation.warnings);
  
  // 3. Validate track is not locked
  const lockValidation = validateTrackNotLocked(targetTrack);
  errors.push(...lockValidation.errors);
  
  // 4. Validate no overlaps
  const overlapValidation = validateNoOverlaps(
    clip.startTime,
    clip.duration,
    targetTrack,
    allClips,
    clip.id
  );
  errors.push(...overlapValidation.errors);
  warnings.push(...overlapValidation.warnings);
  
  // If invalid, try to find a valid position
  let suggestedPosition: PlacementValidation['suggestedPosition'];
  let affectedClipIds: string[] = [];
  
  if (errors.length > 0) {
    // Find the correct track type if track type mismatch
    const correctTrackType = getRequiredTrackType(clip.type);
    const compatibleTracks = allTracks.filter(t => 
      t.type === correctTrackType && !t.locked
    );
    
    if (compatibleTracks.length > 0) {
      // Try to find a valid position on a compatible track
      for (const track of compatibleTracks) {
        const position = findFirstAvailablePosition(
          track,
          clip.duration,
          allClips,
          clip.startTime, // Try to stay close to original time
          clip.id
        );
        
        if (position !== null) {
          suggestedPosition = {
            trackId: track.id,
            startTime: position,
          };
          break;
        }
      }
    }
  }
  
  // Collect affected clip IDs (for overlap resolution)
  if (!targetTrack.allowOverlap) {
    const overlapping = findOverlappingClips(
      clip.startTime,
      clip.duration,
      targetTrack.id,
      allClips,
      clip.id
    );
    affectedClipIds = overlapping.map(c => c.id);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestedPosition,
    affectedClipIds,
  };
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Find the first available position on a track for a clip of given duration
 */
export const findFirstAvailablePosition = (
  track: TimelineTrack,
  duration: number,
  allClips: TimelineClip[],
  preferredStartTime: number = 0,
  excludeClipId?: string
): number | null => {
  // Track allows overlap - any position is fine
  if (track.allowOverlap) {
    return Math.max(0, preferredStartTime);
  }
  
  // Get clips on this track, sorted by start time
  const trackClips = allClips
    .filter(c => c.trackId === track.id && c.id !== excludeClipId)
    .sort((a, b) => a.startTime - b.startTime);
  
  // Check if preferred position works
  if (trackClips.length === 0) {
    return Math.max(0, preferredStartTime);
  }
  
  // Check gap at the beginning (before first clip)
  if (trackClips[0].startTime >= duration) {
    const position = Math.max(0, Math.min(preferredStartTime, trackClips[0].startTime - duration));
    if (position >= 0 && position + duration <= trackClips[0].startTime + TIME_EPSILON) {
      return position;
    }
  }
  
  // Check gaps between clips
  for (let i = 0; i < trackClips.length - 1; i++) {
    const gapStart = trackClips[i].startTime + trackClips[i].duration;
    const gapEnd = trackClips[i + 1].startTime;
    const gapDuration = gapEnd - gapStart;
    
    if (gapDuration >= duration - TIME_EPSILON) {
      // Gap is big enough
      if (preferredStartTime >= gapStart && preferredStartTime + duration <= gapEnd + TIME_EPSILON) {
        return preferredStartTime;
      }
      return gapStart;
    }
  }
  
  // Place at the end
  const lastClip = trackClips[trackClips.length - 1];
  const endPosition = lastClip.startTime + lastClip.duration;
  return Math.max(endPosition, preferredStartTime);
};

/**
 * Find the best track for a clip type
 */
export const findCompatibleTrack = (
  clipType: ClipType,
  tracks: TimelineTrack[],
  preferUnlocked: boolean = true
): TimelineTrack | null => {
  const requiredType = getRequiredTrackType(clipType);
  
  const compatible = tracks.filter(t => t.type === requiredType);
  
  if (compatible.length === 0) return null;
  
  if (preferUnlocked) {
    const unlocked = compatible.filter(t => !t.locked);
    if (unlocked.length > 0) return unlocked[0];
  }
  
  return compatible[0];
};

/**
 * Validate entire timeline state
 */
export const validateTimelineState = (
  clips: TimelineClip[],
  tracks: TimelineTrack[]
): ValidationResult => {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  
  const trackMap = new Map(tracks.map(t => [t.id, t]));
  
  for (const clip of clips) {
    // Check track exists
    const track = trackMap.get(clip.trackId);
    if (!track) {
      errors.push({
        code: 'ORPHANED_CLIP',
        message: `Clip "${clip.label || clip.id}" references non-existent track "${clip.trackId}"`,
        clipId: clip.id,
        trackId: clip.trackId,
        severity: 'error',
      });
      continue;
    }
    
    // Validate time values
    const timeValidation = validateTimeValues(clip.startTime, clip.duration);
    timeValidation.errors.forEach(e => errors.push({ ...e, clipId: clip.id }));
    timeValidation.warnings.forEach(w => warnings.push({ ...w, clipId: clip.id }));
    
    // Validate track type compatibility
    const trackTypeValidation = validateTrackTypeCompatibility(clip.type, track);
    trackTypeValidation.errors.forEach(e => errors.push({ ...e, clipId: clip.id }));
    
    // Validate linked clip reference
    if (clip.linkedClipId) {
      const linkedClip = clips.find(c => c.id === clip.linkedClipId);
      if (!linkedClip) {
        warnings.push({
          code: 'BROKEN_LINK',
          message: `Clip "${clip.label || clip.id}" has broken link to "${clip.linkedClipId}"`,
          clipId: clip.id,
          severity: 'warning',
        });
      }
    }
  }
  
  // Check for overlaps on non-overlap tracks
  for (const track of tracks) {
    if (track.allowOverlap) continue;
    
    const trackClips = clips
      .filter(c => c.trackId === track.id)
      .sort((a, b) => a.startTime - b.startTime);
    
    for (let i = 0; i < trackClips.length - 1; i++) {
      const current = trackClips[i];
      const next = trackClips[i + 1];
      
      const currentEnd = current.startTime + current.duration;
      
      if (currentEnd > next.startTime + TIME_EPSILON) {
        errors.push({
          code: 'OVERLAP_DETECTED',
          message: `Overlapping clips on track "${track.name}": "${current.label || current.id}" and "${next.label || next.id}"`,
          trackId: track.id,
          clipId: current.id,
          severity: 'error',
        });
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
};

/**
 * Repair common timeline issues
 */
export const repairTimelineState = (
  clips: TimelineClip[],
  tracks: TimelineTrack[]
): { clips: TimelineClip[]; repairsMade: string[] } => {
  const repairsMade: string[] = [];
  let repairedClips = [...clips];
  
  const trackMap = new Map(tracks.map(t => [t.id, t]));
  
  // Remove orphaned clips
  const validClips = repairedClips.filter(clip => {
    if (!trackMap.has(clip.trackId)) {
      repairsMade.push(`Removed orphaned clip "${clip.label || clip.id}"`);
      return false;
    }
    return true;
  });
  repairedClips = validClips;
  
  // Fix negative start times
  repairedClips = repairedClips.map(clip => {
    if (clip.startTime < 0) {
      repairsMade.push(`Fixed negative start time for "${clip.label || clip.id}": ${clip.startTime} → 0`);
      return { ...clip, startTime: 0 };
    }
    return clip;
  });
  
  // Fix zero or negative durations
  repairedClips = repairedClips.map(clip => {
    if (clip.duration <= 0) {
      repairsMade.push(`Fixed invalid duration for "${clip.label || clip.id}": ${clip.duration} → ${MIN_CLIP_DURATION}`);
      return { ...clip, duration: MIN_CLIP_DURATION };
    }
    return clip;
  });
  
  // Fix broken links
  const clipIds = new Set(repairedClips.map(c => c.id));
  repairedClips = repairedClips.map(clip => {
    if (clip.linkedClipId && !clipIds.has(clip.linkedClipId)) {
      repairsMade.push(`Removed broken link for "${clip.label || clip.id}"`);
      return { ...clip, linkedClipId: undefined };
    }
    return clip;
  });
  
  // Resolve overlaps on non-overlap tracks (push later clips forward)
  for (const track of tracks) {
    if (track.allowOverlap) continue;
    
    const trackClips = repairedClips
      .filter(c => c.trackId === track.id)
      .sort((a, b) => a.startTime - b.startTime);
    
    let lastEnd = 0;
    for (const clip of trackClips) {
      if (clip.startTime < lastEnd - TIME_EPSILON) {
        const newStart = lastEnd;
        repairsMade.push(`Moved "${clip.label || clip.id}" to resolve overlap: ${clip.startTime.toFixed(3)}s → ${newStart.toFixed(3)}s`);
        
        // Update in the main array
        const idx = repairedClips.findIndex(c => c.id === clip.id);
        if (idx !== -1) {
          repairedClips[idx] = { ...repairedClips[idx], startTime: newStart };
        }
        lastEnd = newStart + clip.duration;
      } else {
        lastEnd = clip.startTime + clip.duration;
      }
    }
  }
  
  return {
    clips: repairedClips,
    repairsMade,
  };
};

// ============================================================
// EXPORTS
// ============================================================

export const TimelineValidation = {
  // Type helpers
  getRequiredTrackType,
  isClipTypeCompatibleWithTrack,
  CLIP_TYPE_TO_TRACK_TYPE,
  
  // Individual validations
  validateTimeValues,
  validateTrackTypeCompatibility,
  validateTrackNotLocked,
  validateNoOverlaps,
  
  // Comprehensive validation
  validateClipPlacement,
  validateTimelineState,
  
  // Utilities
  findFirstAvailablePosition,
  findCompatibleTrack,
  findOverlappingClips,
  timeRangesOverlap,
  
  // Repair
  repairTimelineState,
  
  // Constants
  TIME_EPSILON,
  MIN_CLIP_DURATION,
  MAX_CLIP_DURATION,
  MAX_START_TIME,
};

export default TimelineValidation;
