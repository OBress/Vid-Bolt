/**
 * Wizard Data Import
 * ==================
 * Converts video creation wizard output (audioChunks, shotList, generatedMedia)
 * into V2 timeline clips and tracks.
 *
 * V2: Supports EditorAgentEDL with multi-track, effects, keyframes, text styling.
 *
 * CRITICAL: All mutations are batched into a SINGLE set() call to prevent
 * cascading re-renders from 40+ individual Zustand state updates.
 *
 * Flow:
 *   1. Build all tracks, clips, transitions, and track order in memory
 *   2. Commit everything via ONE atomic set() call
 *   3. Apply media issues (separate store, no cascade risk)
 */

import { useEffect, useRef, useMemo } from 'react';
import type { AudioChunk, ShotEvent, GeneratedMedia } from '@/types/video';
import { useVideoEditorStore } from '../stores/video-editor-store';
import type { ClipType, TimelineTrack, TimelineClip, TransitionEntity } from '../types/timeline-v2';
import { VideoTransitionType, AudioTransitionType, EasingPreset } from '../types';
import type { TransitionEasing, PropertyKeyframes, Keyframe, InterpolationType } from '../types';
import type { EditDecisionList, EDLTransition } from '@/lib/services/edit-assembly/edit-assembly-prompts';
import { MotionGraphicsCategory } from '../types/motion-graphics';
import type {
  EditorAgentEDL,
  AgentClip,
  AgentKeyframes,
  AgentKeyframePoint,
} from '@/lib/services/edit-assembly/editor-capability-manifest';
import { useMediaIssuesStore } from '../stores/media-issues-store';

// R2 public URL base (for CORS rewriting)
const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://assets.vidbolt.app';

export interface UseWizardDataImportOptions {
  audioChunks?: AudioChunk[];
  audioUrl?: string | null;
  shotList?: ShotEvent[];
  generatedMedia?: GeneratedMedia[];
  /** AI-generated Edit Decision List (legacy format) */
  edl?: EditDecisionList | null;
  /** AI-generated Editor Agent EDL (v2 format — preferred) */
  agentEdl?: EditorAgentEDL | null;
}

/** Re-export for external use */
export type WizardData = UseWizardDataImportOptions;

// ============================================================
// HELPERS
// ============================================================

/** Generate unique IDs matching the store's format */
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Default easing for transitions */
function defaultEasing(): TransitionEasing {
  return { preset: EasingPreset.EASE };
}

/** Rewrite R2 public URLs to same-origin /r2-media/ path for CORS safety. */
function rewriteR2Url(url: string): string {
  if (url.startsWith(R2_PUBLIC_URL)) {
    return url.replace(R2_PUBLIC_URL, '/r2-media');
  }
  return url;
}

/** Determine the visual clip type from a shot event. */
function getVisualClipType(
  shot: ShotEvent,
  mediaMap: Map<number, { url: string | undefined; type: 'image' | 'video' | 'motion-graphics'; remotionCode?: string; usedIcons?: string[] }>,
): ClipType {
  const media = mediaMap.get(shot.segment_index);
  if (media) return media.type;
  switch (shot.content_type) {
    case 'transition':
    case 'emotional-beat':
      return 'video';
    default:
      return 'image';
  }
}

/** Build a shot_index → media info map, rewriting R2 URLs and preserving MG type/code. */
function buildMediaUrlMap(
  generatedMedia?: GeneratedMedia[],
): Map<number, { url: string | undefined; type: 'image' | 'video' | 'motion-graphics'; remotionCode?: string; usedIcons?: string[] }> {
  const map = new Map<number, { url: string | undefined; type: 'image' | 'video' | 'motion-graphics'; remotionCode?: string; usedIcons?: string[] }>();
  if (!generatedMedia) return map;
  for (const media of generatedMedia) {
    // Accept any media that has a URL OR remotion code — don't require generation_status === 'completed'
    // as a defensive fallback.
    if (media.media_url || media.remotion_code) {
      if (media.generation_status !== 'completed') {
        console.warn(`[WizardDataImport] Shot ${media.shot_index} has URL but status="${media.generation_status}" — using anyway`);
      }
      const type: 'image' | 'video' | 'motion-graphics' =
        media.media_type === 'motiongraphic' ? 'motion-graphics'
        : media.media_type === 'video' ? 'video'
        : 'image';
      
      // Handle remotion:// marker URLs — these are NOT real loadable URLs.
      // They indicate the shot has Remotion code for programmatic rendering.
      // Use undefined for URL so downstream code uses the transparent placeholder,
      // but preserve the remotionCode/usedIcons for the rendering pipeline.
      const isRemotionMarker = media.media_url?.startsWith('remotion://');
      const url = isRemotionMarker ? undefined : (media.media_url ? rewriteR2Url(media.media_url) : undefined);
      
      if (isRemotionMarker || media.remotion_code) {
        console.log(`[WizardDataImport] Shot ${media.shot_index} uses Remotion code (no static URL) | remotion_code length=${media.remotion_code?.length ?? 0}`);
      }

      // KEY FIX: Pre-rendered motion graphics that have been converted to media files
      // by the GPU pipeline should render as regular media, not as motion-graphics.
      // Only keep 'motion-graphics' type if the clip actually has remotion_code
      // (i.e., it should be dynamically rendered via Remotion/CompositionRenderer).
      let effectiveType = type;
      if (type === 'motion-graphics' && url && !media.remotion_code) {
        // Detect whether the pre-rendered file is an image or video based on extension
        const urlLower = (media.media_url || '').toLowerCase();
        const isImageFile = /\.(png|jpe?g|webp|gif|bmp|svg)(\?|$)/i.test(urlLower);
        effectiveType = isImageFile ? 'image' : 'video';
        console.log(`[WizardDataImport] Shot ${media.shot_index}: Pre-rendered MG with real URL → retyped as '${effectiveType}'`);
      }
      
      map.set(media.shot_index, { url, type: effectiveType, remotionCode: media.remotion_code, usedIcons: media.used_icons });
    }
  }
  console.log(`[WizardDataImport] buildMediaUrlMap: ${map.size}/${generatedMedia.length} shots have URLs or code`);
  
  // Diagnostic: check if motiongraphic entries lack remotion_code
  if (generatedMedia.length > 0) {
    const mgEntries = generatedMedia.filter(m => m.media_type === 'motiongraphic');
    const mgWithCode = mgEntries.filter(m => !!m.remotion_code);
    if (mgEntries.length > 0) {
      console.log(`[WizardDataImport] 📊 Motion graphics: ${mgWithCode.length}/${mgEntries.length} have remotion_code`);
      if (mgWithCode.length < mgEntries.length) {
        const missing = mgEntries.filter(m => !m.remotion_code);
        console.warn(`[WizardDataImport] ⚠️ Motion graphics WITHOUT remotion_code:`, missing.map(m => ({
          shot_index: m.shot_index,
          status: m.generation_status,
          hasUrl: !!m.media_url,
        })));
      }
    }
  }
  
  return map;
}

/** Map EDL transition type to V2 VideoTransitionType */
function mapTransitionType(edlType: string): VideoTransitionType {
  switch (edlType) {
    case 'crossfade': return VideoTransitionType.CROSSFADE;
    case 'fadeToBlack': return VideoTransitionType.FADE_TO_BLACK;
    case 'fadeToWhite': return VideoTransitionType.FADE_TO_WHITE;
    case 'fade': return VideoTransitionType.FADE;
    case 'wipeLeft': return VideoTransitionType.WIPE_LEFT;
    case 'wipeRight': return VideoTransitionType.WIPE_RIGHT;
    case 'wipeUp': return VideoTransitionType.WIPE_UP;
    case 'wipeDown': return VideoTransitionType.WIPE_DOWN;
    case 'slideLeft': return VideoTransitionType.SLIDE_LEFT;
    case 'slideRight': return VideoTransitionType.SLIDE_RIGHT;
    case 'slideUp': return VideoTransitionType.SLIDE_UP;
    case 'slideDown': return VideoTransitionType.SLIDE_DOWN;
    case 'zoomIn': return VideoTransitionType.ZOOM_IN;
    case 'zoomOut': return VideoTransitionType.ZOOM_OUT;
    case 'crossBlur': return VideoTransitionType.CROSS_BLUR;
    case 'irisCircle': return VideoTransitionType.IRIS_CIRCLE;
    case 'irisRectangle': return VideoTransitionType.IRIS_RECTANGLE;
    case 'flipHorizontal': return VideoTransitionType.FLIP_HORIZONTAL;
    case 'flipVertical': return VideoTransitionType.FLIP_VERTICAL;
    case 'dissolve': return VideoTransitionType.DISSOLVE;
    default: return VideoTransitionType.CROSSFADE;
  }
}

/** Map easing string to EasingPreset */
function mapEasingPreset(easing?: string): EasingPreset {
  switch (easing) {
    case 'linear': return EasingPreset.LINEAR;
    case 'ease': return EasingPreset.EASE;
    case 'easeIn': return EasingPreset.EASE_IN;
    case 'easeOut': return EasingPreset.EASE_OUT;
    case 'easeInOut': return EasingPreset.EASE_IN_OUT;
    case 'easeInCubic': return EasingPreset.EASE_IN_CUBIC;
    case 'easeOutCubic': return EasingPreset.EASE_OUT_CUBIC;
    case 'easeInOutCubic': return EasingPreset.EASE_IN_OUT_CUBIC;
    case 'easeInExpo': return EasingPreset.EASE_IN_EXPO;
    case 'easeOutExpo': return EasingPreset.EASE_OUT_EXPO;
    case 'easeInOutExpo': return EasingPreset.EASE_IN_OUT_EXPO;
    default: return EasingPreset.EASE_IN_OUT;
  }
}

/** Map interpolation string to InterpolationType */
function mapInterpolationType(easing?: string): InterpolationType {
  // InterpolationType uses the same string values
  return (easing || 'easeInOut') as InterpolationType;
}

/** Convert AgentKeyframes to PropertyKeyframes for the editor store */
function agentKeyframesToPropertyKeyframes(
  agentKeyframes: AgentKeyframes[],
): PropertyKeyframes[] {
  return agentKeyframes
    .filter(ak => ak.property && Array.isArray(ak.points) && ak.points.length > 0)
    .map(ak => ({
      propertyPath: ak.property,
      enabled: true,
      keyframes: ak.points.map((point, i) => ({
        id: generateId('kf'),
        time: point.time,
        value: point.value,
        interpolation: {
          type: mapInterpolationType(point.easing),
        },
      })),
    }));
}

// ============================================================
// POST-IMPORT: Video Duration Probing
// ============================================================

/**
 * Probe actual video file durations and fix mediaDuration mismatches.
 * 
 * When the pipeline generates videos, the clip's mediaDuration is set from
 * the scripted shot.duration_seconds — but the actual GPU-generated video
 * may differ (due to frame rounding, retries, or fallbacks). When the
 * clip's mediaDuration exceeds the real video, the browser <video> element
 * freezes on its last frame for the remaining duration.
 * 
 * This function runs as a fire-and-forget post-import step.
 */
async function probeAndFixVideoClipDurations(): Promise<void> {
  const state = useVideoEditorStore.getState();
  const allClips = Object.values(state.clips) as TimelineClip[];
  const videoClips = allClips.filter(
    (c) => c.type === 'video' && c.media?.src && !c.media.src.startsWith('data:')
  );

  if (videoClips.length === 0) return;

  console.log(`[WizardDataImport] 🎥 Probing ${videoClips.length} video clip durations...`);

  const MISMATCH_THRESHOLD = 0.5; // Only fix if >0.5s difference
  let fixCount = 0;

  const probeOne = (clip: typeof videoClips[0]): Promise<void> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;

      const cleanup = () => {
        video.removeAttribute('src');
        video.load(); // Release media resources
        resolve();
      };

      const timeout = setTimeout(() => {
        console.warn(`[WizardDataImport] ⏱️ Timeout probing clip ${clip.id}`);
        cleanup();
      }, 10000); // 10s timeout per clip

      video.onloadedmetadata = () => {
        clearTimeout(timeout);
        const actualDuration = video.duration;

        if (!Number.isFinite(actualDuration) || actualDuration <= 0) {
          cleanup();
          return;
        }

        const clipMediaDuration = clip.media?.mediaDuration ?? clip.duration;
        const diff = clipMediaDuration - actualDuration;

        if (diff > MISMATCH_THRESHOLD) {
          console.warn(
            `[WizardDataImport] ⚠️ Video clip ${clip.id}: ` +
            `expected ${clipMediaDuration.toFixed(2)}s, actual ${actualDuration.toFixed(2)}s ` +
            `(${diff.toFixed(2)}s too long — fixing)`
          );

          // Update BOTH mediaDuration AND timeline duration to match actual content.
          // Previously only mediaDuration was updated, leaving the clip rendering
          // past the end of the video source → freeze on last frame.
          useVideoEditorStore.setState((prev) => {
            const existingClip = prev.clips[clip.id];
            if (!existingClip?.media) return prev;
            return {
              ...prev,
              clips: {
                ...prev.clips,
                [clip.id]: {
                  ...existingClip,
                  // Cap timeline duration so clip doesn't render past actual video end
                  duration: Math.min(existingClip.duration, actualDuration),
                  media: {
                    ...existingClip.media,
                    mediaDuration: actualDuration,
                  },
                },
              },
            };
          });

          // Report the mismatch as a warning so the user can review
          useMediaIssuesStore.getState().addIssue({
            shotIndex: clip.data?.shotIndex ?? -1,
            clipId: clip.id,
            severity: 'warning',
            type: 'duration_mismatch',
            title: `Video trimmed: Shot ${clip.data?.shotIndex ?? '?'}`,
            description: `Video source is ${actualDuration.toFixed(1)}s but clip was ${clipMediaDuration.toFixed(1)}s. Auto-trimmed to prevent freeze frame.`,
            availableActions: ['dismiss'],
          });

          fixCount++;
        }

        cleanup();
      };

      video.onerror = () => {
        clearTimeout(timeout);
        // Don't warn — some URLs may be inaccessible cross-origin
        cleanup();
      };

      video.src = clip.media!.src!;
    });
  };

  // Probe in parallel with concurrency limit of 4
  const CONCURRENCY = 4;
  for (let i = 0; i < videoClips.length; i += CONCURRENCY) {
    const batch = videoClips.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(probeOne));
  }

  if (fixCount > 0) {
    console.log(`[WizardDataImport] 🔧 Fixed ${fixCount}/${videoClips.length} video clip durations`);

    // Auto-open the media issues panel so the user sees the warnings
    const { getActiveCount, setPanelOpen } = useMediaIssuesStore.getState();
    if (getActiveCount() > 0) {
      setPanelOpen(true);
    }
  } else {
    console.log(`[WizardDataImport] ✅ All ${videoClips.length} video clip durations match`);
  }
}

// ============================================================
// POST-IMPORT: Quality Validation
// ============================================================

/**
 * Final safety-net quality check that runs after probing.
 * Scans all video clips for any remaining duration mismatches
 * that the probe didn't catch (e.g., cross-origin videos that
 * couldn't be probed, or timing edge cases).
 *
 * Reports issues but does NOT auto-fix — at this point the user
 * should review manually to maintain quality.
 */
function postImportQualityValidation(): void {
  const state = useVideoEditorStore.getState();
  const allClips = Object.values(state.clips) as TimelineClip[];
  const issueStore = useMediaIssuesStore.getState();

  let issuesFound = 0;

  for (const clip of allClips) {
    if (clip.type !== 'video' || !clip.media) continue;

    const mediaDur = clip.media.mediaDuration ?? 0;
    const clipDur = clip.duration ?? 0;

    // If mediaDuration is known and clip duration exceeds it, that's a freeze-frame risk
    if (mediaDur > 0 && clipDur > mediaDur + 0.5) {
      issueStore.addIssue({
        shotIndex: clip.data?.shotIndex ?? -1,
        clipId: clip.id,
        severity: 'warning',
        type: 'duration_mismatch',
        title: `Potential freeze: Shot ${clip.data?.shotIndex ?? '?'}`,
        description: `Clip is ${clipDur.toFixed(1)}s but video source is ${mediaDur.toFixed(1)}s. The last ${(clipDur - mediaDur).toFixed(1)}s may freeze. Consider trimming this clip.`,
        availableActions: ['dismiss'],
      });
      issuesFound++;
    }
  }

  if (issuesFound > 0) {
    console.warn(`[WizardDataImport] ⚠️ Quality validation found ${issuesFound} potential freeze-frame risks`);
    // Auto-open panel if issues were found
    if (issueStore.getActiveCount() > 0) {
      issueStore.setPanelOpen(true);
    }
  } else {
    console.log('[WizardDataImport] ✅ Quality validation passed — no freeze-frame risks detected');
  }
}

// ============================================================
// IMPERATIVE FUNCTION — call directly after store.initialize()
// ============================================================

/**
 * Import wizard data into the V2 editor store imperatively.
 * All mutations are batched into a SINGLE set() call.
 * Call this AFTER store.initialize() to ensure clips aren't wiped.
 *
 * When `agentEdl` is provided, it takes priority over the legacy `edl`.
 *
 * @returns true if data was imported, false if skipped
 */
export function importWizardDataToStore(options: WizardData): boolean {
  const {
    audioChunks,
    shotList,
    generatedMedia,
    edl,
    agentEdl,
  } = options;

  const store = useVideoEditorStore.getState();

  // Guard: store already has clips (loaded from persistence)
  const existingClipCount = Object.keys(store.clips).length;
  if (existingClipCount > 0) {
    console.log('[WizardDataImport] Store already has clips, skipping population');
    return false;
  }

  const hasAudio = audioChunks && audioChunks.length > 0;
  const hasShots = shotList && shotList.length > 0;

  if (!hasAudio && !hasShots) {
    console.log('[WizardDataImport] No wizard data to import');
    return false;
  }

  console.log('[WizardDataImport] Building timeline data:', {
    audioChunks: audioChunks?.length || 0,
    shots: shotList?.length || 0,
    generatedMedia: generatedMedia?.length || 0,
    hasAgentEdl: !!agentEdl,
    hasLegacyEdl: !!edl,
  });

  const mediaUrlMap = buildMediaUrlMap(generatedMedia);
  
  // Debug: log per-shot media resolution
  if (mediaUrlMap.size > 0) {
    console.log('[WizardDataImport] 📊 Media URL Map:');
    mediaUrlMap.forEach((entry, shotIndex) => {
      const urlSummary = !entry.url ? '(placeholder fallback)'
        : entry.url.startsWith('data:') ? '(data-uri)'
        : entry.url.substring(0, 60) + '...';
      console.log(`  Shot ${shotIndex}: type=${entry.type} | url=${urlSummary}${entry.remotionCode ? ' | has remotionCode' : ''}`);
    });
  }
  
  const now = Date.now();

  // ─── Build all data in memory first ────────────────────────────
  const tracksToAdd: Record<string, TimelineTrack> = {};
  const trackOrderToAdd: string[] = [];
  const clipsToAdd: Record<string, TimelineClip> = {};
  const transitionsToAdd: Record<string, TransitionEntity> = {};

  // Track clip IDs by shot index for EDL phase
  const clipIdByShotIndex = new Map<number, string>();
  const audioClipIds: string[] = [];

  // Lazy-create an overlays track for pre-rendered motion graphics.
  // Only added when a clip actually gets routed to it — avoids empty unused tracks.
  // Shared across agent EDL path and Phase 3 MG processing.
  let overlaysTrackId: string | null = null;
  const getOrCreateOverlaysTrack = (): string => {
    if (overlaysTrackId) return overlaysTrackId;
    overlaysTrackId = generateId('track');
    tracksToAdd[overlaysTrackId] = {
      id: overlaysTrackId,
      type: 'video',
      name: 'Video 2',
      order: 1,
      group: 'video',
      locked: false,
      visible: true,
      muted: false,
      allowOverlap: true,
      createdAt: now,
      updatedAt: now,
    };
    trackOrderToAdd.unshift(overlaysTrackId); // Overlays above main video
    console.log(`[WizardDataImport] \ud83d\udcd0 Created overlays track on demand: ${overlaysTrackId}`);
    return overlaysTrackId;
  };

  // ─── Phase 1: Audio Track ──────────────────────────────────────
  if (hasAudio) {
    const audioTrackId = store.tracks['track-audio-1'] ? 'track-audio-1' : generateId('track');
    const audioTrack: TimelineTrack = {
      id: audioTrackId,
      type: 'audio',
      name: 'Narration',
      order: 0,
      group: 'audio',
      locked: false,
      visible: true,
      muted: false,
      allowOverlap: false,
      createdAt: now,
      updatedAt: now,
    };
    tracksToAdd[audioTrackId] = audioTrack;
    trackOrderToAdd.push(audioTrackId);

    const sortedChunks = [...audioChunks].sort(
      (a, b) => a.chapterNumber - b.chapterNumber,
    );

    let currentTime = 0;
    for (const chunk of sortedChunks) {
      const durationSec = chunk.duration_seconds || (chunk as any).durationSeconds;
      if (!durationSec || durationSec <= 0) {
        throw new Error(
          `[WizardDataImport] Audio chunk ${chunk.chapterNumber} has no valid duration ` +
          `(duration_seconds=${chunk.duration_seconds}, durationSeconds=${(chunk as any).durationSeconds}). ` +
          `The audio data is incomplete — aborting import.`
        );
      }
      const audioSrc = rewriteR2Url(chunk.url);
      const clipId = generateId('clip');

      clipsToAdd[clipId] = {
        id: clipId,
        trackId: audioTrackId,
        startTime: currentTime,
        duration: durationSec,
        type: 'audio',
        sourceId: audioSrc,
        label: `Audio ${chunk.chapterNumber + 1}`,
        transform: { x: 0, y: 0, width: 0, height: 0, rotation: 0 },
        media: {
          src: audioSrc,
          speed: 1,
          volume: 1,
          mediaStartTime: 0,
          mediaDuration: durationSec,
        },
        data: {
          text: chunk.text,
          chapterNumber: chunk.chapterNumber,
        },
        createdAt: now,
        updatedAt: now,
      };

      audioClipIds.push(clipId);
      currentTime += durationSec;
    }

    console.log(`[WizardDataImport] Built ${sortedChunks.length} audio clips`);
  }

  // Shot index offset (0-based → 1-based) — declared at function scope
  // so media issues import can also use it
  let edlShotIndexOffset = 0;

  // ─── Phase 2: Visual Clips ─────────────────────────────────────
  if (hasShots) {
    // Transparent 1x1 PNG fallback
    const transparentPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const contentTypeColors: Record<string, string> = {
      'list-item': '#f97316',
      comparison: '#8b5cf6',
      concept: '#3b82f6',
      transition: '#22c55e',
      'emotional-beat': '#ef4444',
    };

    // Lazy-create an overlays track for pre-rendered motion graphics.
    // Only added when a clip actually gets routed to it — avoids empty unused tracks.
    // Shared across agent EDL path and Phase 3 MG processing.
    let overlaysTrackId: string | null = null;
    const getOrCreateOverlaysTrack = (): string => {
      if (overlaysTrackId) return overlaysTrackId;
      overlaysTrackId = generateId('track');
      tracksToAdd[overlaysTrackId] = {
        id: overlaysTrackId,
        type: 'video',
        name: 'Video 2',
        order: 1,
        group: 'video',
        locked: false,
        visible: true,
        muted: false,
        allowOverlap: true,
        createdAt: now,
        updatedAt: now,
      };
      trackOrderToAdd.unshift(overlaysTrackId); // Overlays above main video
      console.log(`[WizardDataImport] 📐 Created overlays track on demand: ${overlaysTrackId}`);
      return overlaysTrackId;
    };

    // Use agentEdl tracks if available, otherwise create default
    if (agentEdl && agentEdl.tracks.length > 0) {
      // ─── AGENT EDL: Use agent-defined tracks ──────────────────
      console.log(`[WizardDataImport] Using agent EDL tracks: ${agentEdl.tracks.length} tracks`);

      // Create all agent-defined video tracks
      for (const agentTrack of agentEdl.tracks) {
        const trackId = generateId('track');
        const track: TimelineTrack = {
          id: trackId,
          type: agentTrack.type,
          name: agentTrack.name,
          order: agentTrack.order,
          group: agentTrack.group,
          locked: false,
          visible: true,
          muted: false,
          allowOverlap: agentTrack.group !== 'audio',
          createdAt: now,
          updatedAt: now,
        };
        tracksToAdd[trackId] = track;
        // Video/text/effects tracks go before audio tracks
        if (agentTrack.type === 'video') {
          trackOrderToAdd.unshift(trackId);
        } else {
          trackOrderToAdd.push(trackId);
        }
        // Map agent track id to internal track id
        (track as any)._agentTrackId = agentTrack.id;
      }

      // Build agent track id → internal track id mapping
      const agentToInternalTrackId = new Map<string, string>();
      for (const trackId of Object.keys(tracksToAdd)) {
        const agentId = (tracksToAdd[trackId] as any)._agentTrackId;
        if (agentId) {
          agentToInternalTrackId.set(agentId, trackId);
        }
      }


      // Place clips from agent EDL
      // Track running time per internal track for sequential NaN fallback
      const trackRunningTime = new Map<string, number>();

      // Detect 0-based vs 1-based shot indices from agent EDL.
      // AI sometimes uses 0-based indices (shotIndex=0,1,2,...) while actual
      // shots use 1-based segment_index (1,2,3,...). Detect and offset.
      const minShotSegment = shotList.length > 0 ? Math.min(...shotList.map(s => s.segment_index)) : 1;
      const hasZeroIndexClip = agentEdl.clips.some(c => {
        const si = (c as any).shotIndex ?? (c as any).shot_index;
        return si === 0;
      });
      const hasMatchForZero = shotList.some(s => s.segment_index === 0);
      edlShotIndexOffset = (hasZeroIndexClip && !hasMatchForZero && minShotSegment >= 1) ? 1 : 0;
      if (edlShotIndexOffset > 0) {
        console.log(`[WizardDataImport] 🔧 Detected 0-based shot indices in agent EDL — applying +${edlShotIndexOffset} offset`);
      }

      for (const agentClip of agentEdl.clips) {
        // Normalize field names — handle snake_case from AI or stale DB data
        const trackId = (agentClip as any).trackId ?? (agentClip as any).track_id ?? (agentClip as any).track ?? 'main-video';
        const shotIdxRaw: number | undefined = (agentClip as any).shotIndex ?? (agentClip as any).shot_index;
        const shotIdx: number | undefined = shotIdxRaw != null ? shotIdxRaw + edlShotIndexOffset : undefined;
        const rawStartTime: number | undefined = (agentClip as any).startTime ?? (agentClip as any).start_time;
        const rawDuration: number | undefined = (agentClip as any).duration;
        const clipTypeRaw: string = agentClip.type ?? (agentClip as any).mediaType ?? (agentClip as any).media_type ?? 'image';

        const internalTrackId = agentToInternalTrackId.get(trackId);
        if (!internalTrackId) {
          console.warn(`[WizardDataImport] Unknown agent track: ${trackId}, skipping clip`);
          continue;
        }

        if (clipTypeRaw === 'text') {
          // Text clips are no longer generated by the AI — all text is handled by Remotion motion graphics.
          // If an old cached EDL still has text clips, skip them.
          console.warn(`[WizardDataImport] ⚠️ Skipping text clip from agent EDL (text should use motion graphics): "${agentClip.text?.text?.substring(0, 40) || ''}"`);
          continue;
        } else if (clipTypeRaw === 'audio') {
          // Audio clips handled in Phase 1, skip
          continue;
        } else {
          // ─── Visual clip (image, video, motion-graphics) ──────
          const shot = shotIdx != null ? shotList.find(s => s.segment_index === shotIdx) : undefined;
          if (!shot && shotIdx != null) {
            console.warn(`[WizardDataImport] No shot found for shotIndex=${shotIdx} (available: ${shotList.map(s => s.segment_index).join(',')})`);
            continue;
          }

          const resolvedMedia = shotIdx != null
            ? mediaUrlMap.get(shotIdx)
            : undefined;
          // Use transparent placeholder when URL is undefined/empty (e.g. remotion markers).
          // Motion graphics clips don't need a real media URL — they render via Remotion code.
          const src = resolvedMedia?.url ?? transparentPng;
          const mgType = clipTypeRaw === 'motion-graphics' || clipTypeRaw === 'motiongraphic';
          // Use media URL map type as source of truth — it already handles retyping
          // pre-rendered MG clips (with real video URLs but no remotion_code) as 'video'.
          // Only fall back to agent EDL type if media map has no entry.
          const clipType: ClipType = resolvedMedia?.type as ClipType || (mgType ? 'motion-graphics' : clipTypeRaw as ClipType);
          const color = shot ? contentTypeColors[shot.content_type] || '#6b7280' : '#6b7280';
          const clipId = generateId('clip');

          // Debug: log every visual clip creation
          console.log(`[WizardDataImport] 🎬 Creating clip: type=${clipType} | track=${trackId} | shotIndex=${shotIdx} | src=${src.substring(0, 60)}... | hasMG=${clipType === 'motion-graphics'} | hasRemotionCode=${!!resolvedMedia?.remotionCode}`);

          // Guard against undefined/NaN timing from agent EDL
          // Shot timing is the authoritative source — it's always set by the segmenter.
          let visualDur: number;
          if (Number.isFinite(rawDuration) && rawDuration! > 0) {
            visualDur = rawDuration!;
          } else if (shot?.duration_seconds && shot.duration_seconds > 0) {
            visualDur = shot.duration_seconds;
            console.warn(`[WizardDataImport] Visual clip (shot ${shotIdx}) had NaN duration from EDL, using shot plan timing ${visualDur}s`);
          } else {
            throw new Error(
              `[WizardDataImport] Visual clip (shot ${shotIdx}) has no valid duration ` +
              `(rawDuration=${rawDuration}, shot.duration_seconds=${shot?.duration_seconds}). ` +
              `Pipeline timing data is incomplete — aborting import.`
            );
          }

          let visualStart: number;
          if (Number.isFinite(rawStartTime)) {
            visualStart = rawStartTime!;
          } else if (shot) {
            visualStart = shot.start_seconds;
            console.warn(`[WizardDataImport] Visual clip (shot ${shotIdx}) had NaN startTime, using shot timing ${visualStart}s`);
          } else {
            throw new Error(
              `[WizardDataImport] Visual clip (shot ${shotIdx}) has no valid startTime ` +
              `and no shot data available. Pipeline timing data is incomplete — aborting import.`
            );
          }

          // Update running time for this track
          trackRunningTime.set(internalTrackId, Math.max(
            trackRunningTime.get(internalTrackId) || 0,
            visualStart + visualDur
          ));

          // Build motion-graphics properties for the rendering pipeline
          // Always populate for motion-graphics clips, even without remotion code,
          // to avoid "No template data" errors in the renderer
          const mgProperties = clipType === 'motion-graphics'
            ? {
                template: {
                  id: `mg-wizard-${clipId}`,
                  name: shot?.text?.substring(0, 40) || `Motion Graphic ${shotIdx ?? ''}`.trim(),
                  description: shot?.visual_prompt || 'AI-generated motion graphic',
                  category: MotionGraphicsCategory.CUSTOM,
                  duration: Math.round(visualDur * 30), // seconds → frames at 30fps
                  editableProperties: [],
                },
                ...(resolvedMedia?.remotionCode ? {
                  compositionDefinition: {
                    id: `comp-${clipId}`,
                    name: shot?.text?.substring(0, 40) || `Motion Graphic ${shotIdx ?? ''}`.trim(),
                    duration: Math.round(visualDur * 30),
                    fps: 30,
                    width: 1920,
                    height: 1080,
                    backgroundColor: '#000000',
                    layers: [],
                    originalRemotionCode: resolvedMedia.remotionCode,
                    generatedFromJSX: true,
                    usedIcons: resolvedMedia.usedIcons,
                  },
                } : {}),
              }
            : undefined;

          // Route clips to the overlays track when:
          // 1) The agent EDL explicitly placed them on "overlays" (via agentToInternalTrackId mapping)
          // 2) They're pre-rendered MG clips (mgType but retyped as 'video' by media URL map)
          const isOnOverlaysTrack = trackId === 'overlays';
          const isPreRenderedMG = mgType && clipType !== 'motion-graphics';
          const finalTrackId = (isOnOverlaysTrack || isPreRenderedMG) ? getOrCreateOverlaysTrack() : internalTrackId;

          clipsToAdd[clipId] = {
            id: clipId,
            trackId: finalTrackId,
            startTime: visualStart,
            duration: visualDur,
            type: clipType,
            sourceId: src,
            label: agentClip.label || (shot ? `Shot ${shot.segment_index}` : 'Clip'),
            color,
            transform: {
              x: agentClip.transform?.x ?? 0,
              y: agentClip.transform?.y ?? 0,
              width: agentClip.transform?.width ?? 1920,
              height: agentClip.transform?.height ?? 1080,
              rotation: agentClip.transform?.rotation ?? 0,
              opacity: agentClip.transform?.opacity ?? 1,
            },
            media: {
              src,
              speed: 1,
              volume: clipType === 'video' ? 0 : undefined,
              mediaStartTime: 0,
              mediaDuration: visualDur,
            },
            // Motion graphics properties for the rendering pipeline
            ...(mgProperties && { properties: mgProperties }),
            // Apply keyframes from agent EDL
            keyframes: agentClip.keyframes
              ? agentKeyframesToPropertyKeyframes(agentClip.keyframes)
              : undefined,
            data: {
              shotIndex: shotIdx,
              contentType: shot?.content_type,
              visualPrompt: shot?.visual_prompt || shot?.text,
              text: shot?.text,
              // Preserve Remotion MG code for rendering
              ...(resolvedMedia?.remotionCode && { remotionCode: resolvedMedia.remotionCode }),
              ...(resolvedMedia?.usedIcons && { usedIcons: resolvedMedia.usedIcons }),
            },
            createdAt: now,
            updatedAt: now,
          };

          if (shotIdx != null) {
            clipIdByShotIndex.set(shotIdx, clipId);
          }

          // Track placeholder fallbacks as warnings for the media issues panel
          // (non-MG clips using the transparent PNG because no real media was found)
          if (src === transparentPng && clipType !== 'motion-graphics') {
            useMediaIssuesStore.getState().addIssue({
              shotIndex: shotIdx ?? -1,
              clipId,
              severity: 'warning',
              type: 'substituted_media',
              title: `Placeholder: Shot ${(shotIdx ?? 0) + 1}`,
              description: `No media was found for this shot. A transparent placeholder is being used. Consider regenerating or replacing this media.`,
              availableActions: ['dismiss', 'remove'],
            });
          }
        }
      }

      console.log(`[WizardDataImport] Built ${Object.keys(clipsToAdd).length - audioClipIds.length} visual/text clips from agent EDL`);

      // ─── Video Audio: Create muted audio clips for video sources ─────
      // These let users unmute individual video audio if desired
      const videoClipEntries = Object.values(clipsToAdd).filter(
        c => c.type === 'video' && c.media?.src && c.media.src !== transparentPng
      );
      if (videoClipEntries.length > 0) {
        // Create a dedicated audio track for video audio
        const videoAudioTrackId = generateId('track');
        tracksToAdd[videoAudioTrackId] = {
          id: videoAudioTrackId,
          type: 'audio',
          name: 'Video Audio',
          order: Object.keys(tracksToAdd).length,
          group: 'audio',
          locked: false,
          visible: true,
          muted: false,
          allowOverlap: false,
          createdAt: now,
          updatedAt: now,
        };
        trackOrderToAdd.push(videoAudioTrackId);

        let videoAudioCount = 0;
        for (const videoClip of videoClipEntries) {
          const mediaSrc = videoClip.media?.src || '';
          if (!mediaSrc) continue;
          const audioClipId = generateId('clip');
          clipsToAdd[audioClipId] = {
            id: audioClipId,
            trackId: videoAudioTrackId,
            startTime: videoClip.startTime,
            duration: videoClip.duration,
            type: 'audio',
            sourceId: mediaSrc,
            label: `${videoClip.label || 'Video'} (audio)`,
            color: '#475569', // Slate-600 — muted appearance
            linkedClipId: videoClip.id,
            transform: { x: 0, y: 0, width: 0, height: 0, rotation: 0, opacity: 1 },
            media: {
              src: mediaSrc,
              speed: 1,
              volume: 0, // Muted by default
              mediaStartTime: 0,
              mediaDuration: videoClip.duration,
            },
            createdAt: now,
            updatedAt: now,
          };
          // Link the video clip back to its audio
          videoClip.linkedClipId = audioClipId;
          videoAudioCount++;
        }
        console.log(`[WizardDataImport] Built ${videoAudioCount} muted video audio clips`);
      }

      // ─── Agent EDL transitions ────────────────────────────────
      if (agentEdl.transitions && agentEdl.transitions.length > 0) {
        for (const transition of agentEdl.transitions) {
          const fromClipId = clipIdByShotIndex.get(transition.fromShotIndex);
          const toClipId = clipIdByShotIndex.get(transition.toShotIndex);

          if (fromClipId && toClipId) {
            const fromClip = clipsToAdd[fromClipId];
            const toClip = clipsToAdd[toClipId];
            if (fromClip && toClip) {
              const boundary = fromClip.startTime + fromClip.duration;
              const halfDuration = (transition.duration || 1) / 2;
              const transId = generateId('transition');

              transitionsToAdd[transId] = {
                id: transId,
                type: transition.isAudio
                  ? AudioTransitionType.CROSSFADE_LINEAR
                  : mapTransitionType(transition.type),
                startTime: boundary - halfDuration,
                endTime: boundary + halfDuration,
                easing: transition.easing
                  ? { preset: mapEasingPreset(transition.easing) }
                  : defaultEasing(),
                position: 'between',
                clipIds: [fromClipId, toClipId],
                isAudio: !!transition.isAudio,
                createdAt: now,
                updatedAt: now,
              };
            }
          }
        }
        console.log(`[WizardDataImport] Built ${agentEdl.transitions.length} transitions from agent EDL`);
      }

      // ─── Agent EDL audio fades ────────────────────────────────
      if (agentEdl.audioFades && agentEdl.audioFades.length > 0 && audioClipIds.length > 0) {
        for (const fade of agentEdl.audioFades) {
          if (fade.type === 'fadeIn' && audioClipIds[0]) {
            const clipId = audioClipIds[0];
            const clip = clipsToAdd[clipId];
            if (clip) {
              const transId = generateId('transition');
              transitionsToAdd[transId] = {
                id: transId,
                type: AudioTransitionType.FADE_IN_LINEAR,
                startTime: clip.startTime,
                endTime: clip.startTime + (fade.duration || 1),
                easing: defaultEasing(),
                position: 'in',
                clipIds: [clipId],
                isAudio: true,
                createdAt: now,
                updatedAt: now,
              };
            }
          } else if (fade.type === 'fadeOut' && audioClipIds[audioClipIds.length - 1]) {
            const clipId = audioClipIds[audioClipIds.length - 1];
            const clip = clipsToAdd[clipId];
            if (clip) {
              const transId = generateId('transition');
              transitionsToAdd[transId] = {
                id: transId,
                type: AudioTransitionType.FADE_OUT_LINEAR,
                startTime: clip.startTime + clip.duration - (fade.duration || 1),
                endTime: clip.startTime + clip.duration,
                easing: defaultEasing(),
                position: 'out',
                clipIds: [clipId],
                isAudio: true,
                createdAt: now,
                updatedAt: now,
              };
            }
          }
        }
        console.log(`[WizardDataImport] Built audio fades from agent EDL`);
      }

    } else {
      // ─── LEGACY PATH: Single video track + legacy EDL ──────────
      const videoTrackId = store.tracks['track-video-1'] ? 'track-video-1' : generateId('track');
      const videoTrack: TimelineTrack = {
        id: videoTrackId,
        type: 'video',
        name: 'Visuals',
        order: 0,
        group: 'video',
        locked: false,
        visible: true,
        muted: false,
        allowOverlap: true,
        createdAt: now,
        updatedAt: now,
      };
      tracksToAdd[videoTrackId] = videoTrack;
      trackOrderToAdd.unshift(videoTrackId);

      for (const shot of shotList) {
        const clipType = getVisualClipType(shot, mediaUrlMap);
        const resolvedMedia = mediaUrlMap.get(shot.segment_index);
        const src = resolvedMedia?.url ?? transparentPng;
        const color = contentTypeColors[shot.content_type] || '#6b7280';
        const clipId = generateId('clip');

        // Build motion-graphics properties for the rendering pipeline
        // Always populate for motion-graphics clips, even without remotion code
        const mgProperties = clipType === 'motion-graphics'
          ? {
              template: {
                id: `mg-wizard-${clipId}`,
                name: shot.text?.substring(0, 40) || `Motion Graphic ${shot.segment_index}`,
                description: shot.visual_prompt || 'AI-generated motion graphic',
                category: MotionGraphicsCategory.CUSTOM,
                duration: Math.round(shot.duration_seconds * 30),
                editableProperties: [],
              },
              ...(resolvedMedia?.remotionCode ? {
                compositionDefinition: {
                  id: `comp-${clipId}`,
                  name: shot.text?.substring(0, 40) || `Motion Graphic ${shot.segment_index}`,
                  duration: Math.round(shot.duration_seconds * 30),
                  fps: 30,
                  width: 1920,
                  height: 1080,
                  backgroundColor: '#000000',
                  layers: [],
                  originalRemotionCode: resolvedMedia.remotionCode,
                  generatedFromJSX: true,
                  usedIcons: resolvedMedia.usedIcons,
                },
              } : {}),
            }
          : undefined;

        // Debug: log every visual clip creation in legacy path
        console.log(`[WizardDataImport] 🎬 Legacy clip: type=${clipType} | shot=${shot.segment_index} | src=${src.substring(0, 60)}... | hasMG=${clipType === 'motion-graphics'} | hasRemotionCode=${!!resolvedMedia?.remotionCode}`);

        clipsToAdd[clipId] = {
          id: clipId,
          trackId: videoTrackId,
          startTime: shot.start_seconds,
          duration: shot.duration_seconds,
          type: clipType,
          sourceId: src,
          label: `Shot ${shot.segment_index}`,
          color,
          transform: {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            rotation: 0,
            opacity: 1,
          },
          media: {
            src,
            speed: 1,
            volume: clipType === 'video' ? 0 : undefined,
            mediaStartTime: 0,
            mediaDuration: shot.duration_seconds,
          },
          // Motion graphics properties for the rendering pipeline
          ...(mgProperties && { properties: mgProperties }),
          data: {
            shotIndex: shot.segment_index,
            contentType: shot.content_type,
            visualPrompt: shot.visual_prompt || shot.text,
            text: shot.text,
            // Preserve Remotion MG code for rendering
            ...(resolvedMedia?.remotionCode && { remotionCode: resolvedMedia.remotionCode }),
            ...(resolvedMedia?.usedIcons && { usedIcons: resolvedMedia.usedIcons }),
          },
          createdAt: now,
          updatedAt: now,
        };

        clipIdByShotIndex.set(shot.segment_index, clipId);
      }

      console.log(`[WizardDataImport] Built ${shotList.length} visual clips (legacy path)`);

      // ─── Legacy EDL Phase ───────────────────────────────────
      if (edl) {
        console.log('[WizardDataImport] Building from legacy EDL:', {
          transitions: edl.transitions?.length || 0,
          textOverlays: edl.textOverlays?.length || 0,
          audioEffects: edl.audioEffects?.length || 0,
        });

        // 3a. Between transitions
        if (edl.transitions && edl.transitions.length > 0) {
          for (const transition of edl.transitions) {
            const fromClipId = clipIdByShotIndex.get(transition.fromShotIndex);
            const toClipId = clipIdByShotIndex.get(transition.toShotIndex);

            if (fromClipId && toClipId && transition.position === 'between') {
              const fromClip = clipsToAdd[fromClipId];
              const toClip = clipsToAdd[toClipId];
              if (fromClip && toClip) {
                const boundary = fromClip.startTime + fromClip.duration;
                const halfDuration = (transition.duration || 1) / 2;
                const transId = generateId('transition');

                transitionsToAdd[transId] = {
                  id: transId,
                  type: mapTransitionType(transition.type),
                  startTime: boundary - halfDuration,
                  endTime: boundary + halfDuration,
                  easing: defaultEasing(),
                  position: 'between',
                  clipIds: [fromClipId, toClipId],
                  isAudio: false,
                  createdAt: now,
                  updatedAt: now,
                };
              }
            }
          }
          console.log(`[WizardDataImport] Built ${edl.transitions.length} transitions`);
        }

        // 3b. Text overlays
        if (edl.textOverlays && edl.textOverlays.length > 0) {
          const textTrackId = store.tracks['track-video-2'] ? 'track-video-2' : generateId('track');
          const textTrack: TimelineTrack = {
            id: textTrackId,
            type: 'video',
            name: 'Text',
            order: 1,
            group: 'text',
            locked: false,
            visible: true,
            muted: false,
            allowOverlap: true,
            createdAt: now,
            updatedAt: now,
          };
          tracksToAdd[textTrackId] = textTrack;
          if (!trackOrderToAdd.includes(textTrackId)) {
            const videoIdx = trackOrderToAdd.findIndex(id => tracksToAdd[id]?.type === 'video');
            trackOrderToAdd.splice(videoIdx + 1, 0, textTrackId);
          }

          for (const overlay of edl.textOverlays) {
            const fontSize = overlay.fontSize || (overlay.style === 'chapterTitle' ? 72 : 36);
            const posX = overlay.position?.x ?? 0.5;
            const posY = overlay.position?.y ?? (overlay.style === 'chapterTitle' ? 0.5 : 0.85);
            const clipId = generateId('clip');

            clipsToAdd[clipId] = {
              id: clipId,
              trackId: textTrackId,
              startTime: overlay.startTime,
              duration: overlay.duration,
              type: 'text',
              sourceId: `text-${overlay.startTime}`,
              label: overlay.text.substring(0, 30),
              transform: {
                x: posX * 1920,
                y: posY * 1080,
                width: overlay.style === 'lowerThird' ? 600 : 800,
                height: fontSize * 2,
                rotation: 0,
                opacity: 1,
              },
              text: {
                text: overlay.text,
                fontFamily: 'Inter',
                fontSize,
                color: '#ffffff',
                backgroundColor: overlay.style === 'lowerThird' ? 'rgba(0,0,0,0.7)' : 'transparent',
                textAlign: 'center',
              },
              data: {
                edlStyle: overlay.style,
              },
              createdAt: now,
              updatedAt: now,
            };
          }
          console.log(`[WizardDataImport] Built ${edl.textOverlays.length} text overlays`);
        }

        // 3c. Audio fades
        if (edl.audioEffects && edl.audioEffects.length > 0 && audioClipIds.length > 0) {
          for (const effect of edl.audioEffects) {
            if (effect.type === 'fadeIn' && audioClipIds[0]) {
              const clipId = audioClipIds[0];
              const clip = clipsToAdd[clipId];
              if (clip) {
                const transId = generateId('transition');
                transitionsToAdd[transId] = {
                  id: transId,
                  type: AudioTransitionType.FADE_IN_LINEAR,
                  startTime: clip.startTime,
                  endTime: clip.startTime + (effect.duration || 1),
                  easing: defaultEasing(),
                  position: 'in',
                  clipIds: [clipId],
                  isAudio: true,
                  createdAt: now,
                  updatedAt: now,
                };
              }
            } else if (effect.type === 'fadeOut' && audioClipIds[audioClipIds.length - 1]) {
              const clipId = audioClipIds[audioClipIds.length - 1];
              const clip = clipsToAdd[clipId];
              if (clip) {
                const transId = generateId('transition');
                transitionsToAdd[transId] = {
                  id: transId,
                  type: AudioTransitionType.FADE_OUT_LINEAR,
                  startTime: clip.startTime + clip.duration - (effect.duration || 1),
                  endTime: clip.startTime + clip.duration,
                  easing: defaultEasing(),
                  position: 'out',
                  clipIds: [clipId],
                  isAudio: true,
                  createdAt: now,
                  updatedAt: now,
                };
              }
            }
          }
          console.log(`[WizardDataImport] Built audio effects`);
        }
      }
    }
  }

  // ─── Phase 3: Motion Graphics Overlay Track ─────────────────────
  // For shots with remotion_code (pure MG or hybrid), create overlay clips
  // on a dedicated "Motion Graphics" track above the base visuals.
  {
    // Collect shots that need MG overlay processing
    const mgShotEntries: Array<{
      shotIndex: number;
      remotionCode: string;
      usedIcons?: string[];
      isPureMG: boolean;
    }> = [];

    for (const [shotIndex, media] of mediaUrlMap.entries()) {
      // Case 1: Pure motion-graphics shot (type is 'motion-graphics')
      if (media.type === 'motion-graphics' && media.remotionCode) {
        mgShotEntries.push({ shotIndex, remotionCode: media.remotionCode, usedIcons: media.usedIcons, isPureMG: true });
      }
      // Case 2: Hybrid shot — has base media (image/video) AND remotion_code
      else if (media.remotionCode && (media.type === 'image' || media.type === 'video')) {
        mgShotEntries.push({ shotIndex, remotionCode: media.remotionCode, usedIcons: media.usedIcons, isPureMG: false });
      }
    }

    if (mgShotEntries.length > 0) {
      // Motion graphics clips go on the same video track as other visual clips.
      // Pure MG: convert the existing clip in-place to motion-graphics type.
      // Hybrid: create an additional MG clip on the video track (overlapping the base media).

      for (const { shotIndex, remotionCode, usedIcons, isPureMG } of mgShotEntries) {
        const shot = shotList?.find(s => s.segment_index === shotIndex);
        if (!shot) continue;

        const existingClipId = clipIdByShotIndex.get(shotIndex);
        const durationFrames = Math.round(shot.duration_seconds * 30);

        // Build the MG template from the generated Remotion code
        const mgCompositionDefinition = {
          id: `comp-wizard-mg-${shotIndex}`,
          name: `MG Shot ${shotIndex}`,
          duration: durationFrames,
          fps: 30,
          width: 1920,
          height: 1080,
          backgroundColor: 'transparent',
          layers: [],
          originalRemotionCode: remotionCode,
          generatedFromJSX: true,
          usedIcons: usedIcons || [],
          createdAt: new Date().toISOString(),
        };

        const mgTemplate = {
          id: `wizard-mg-${shotIndex}`,
          name: `MG Shot ${shotIndex}`,
          description: shot.visual_prompt || shot.text || '',
          category: MotionGraphicsCategory.CUSTOM,
          duration: durationFrames,
          editableProperties: [],
          remotionCode,
          compositionDefinition: mgCompositionDefinition,
        };

        if (isPureMG && existingClipId && clipsToAdd[existingClipId]) {
          // Pure MG: Convert the existing clip to motion-graphics type (stays on video track)
          const clip = clipsToAdd[existingClipId];
          // Skip if Phase 2 (agent EDL) already set this clip as motion-graphics
          if (clip.type === 'motion-graphics' && clip.properties?.template) {
            console.log(`[WizardDataImport] Shot ${shotIndex} already typed as motion-graphics by Phase 2 — skipping Phase 3 conversion`);
            continue;
          }
          clip.type = 'motion-graphics';
          clip.sourceId = `mg-${shotIndex}`;
          clip.color = '#9333ea'; // Purple for MG clips
          clip.properties = {
            template: mgTemplate,
          };
        } else if (!isPureMG) {
          // Hybrid: Base media stays on its track; create a NEW MG clip on the overlays track.
          // BUT only if Phase 2 (agent EDL) didn't already create a motion-graphics clip
          // for this shot — otherwise we'd end up with duplicate clips on the timeline.
          const alreadyHasOverlay = Object.values(clipsToAdd).some(
            c => c.data?.shotIndex === shotIndex &&
                 c.type === 'motion-graphics' &&
                 c.id !== existingClipId
          );
          if (alreadyHasOverlay) {
            console.log(`[WizardDataImport] Skipping Phase 3 overlay for shot ${shotIndex} — already created by agent EDL`);
            continue;
          }

          const targetOverlayTrackId = getOrCreateOverlaysTrack();
          if (!targetOverlayTrackId) {
            console.warn(`[WizardDataImport] No overlay track available for hybrid MG clip at shot ${shotIndex}`);
            continue;
          }
          const mgClipId = generateId('clip');
          clipsToAdd[mgClipId] = {
            id: mgClipId,
            trackId: targetOverlayTrackId,
            startTime: shot.start_seconds,
            duration: shot.duration_seconds,
            type: 'motion-graphics',
            sourceId: `mg-${shotIndex}`,
            label: `Overlay ${shotIndex}`,
            color: '#9333ea',
            transform: {
              x: 0,
              y: 0,
              width: 1920,
              height: 1080,
              rotation: 0,
              opacity: 1,
            },
            properties: {
              template: mgTemplate,
            },
            data: {
              shotIndex,
              contentType: shot.content_type,
              visualPrompt: shot.visual_prompt || shot.text,
              isOverlay: true,
            },
            createdAt: now,
            updatedAt: now,
          };
        }
      }

      console.log(
        `[WizardDataImport] Added ${mgShotEntries.length} motion graphics clips to video track ` +
        `(${mgShotEntries.filter(e => e.isPureMG).length} pure MG, ` +
        `${mgShotEntries.filter(e => !e.isPureMG).length} hybrid overlays)`
      );
    }
  }

  // ─── COMMIT: Single atomic set() call ──────────────────────────
  const clipCount = Object.keys(clipsToAdd).length;
  const trackCount = Object.keys(tracksToAdd).length;
  const transitionCount = Object.keys(transitionsToAdd).length;
  const keyframedClipCount = Object.values(clipsToAdd).filter(c => c.keyframes && c.keyframes.length > 0).length;

  console.log(`[WizardDataImport] Committing: ${trackCount} tracks, ${clipCount} clips, ${transitionCount} transitions, ${keyframedClipCount} keyframed clips`);

  // Update track orders before commit
  trackOrderToAdd.forEach((id, index) => {
    if (tracksToAdd[id]) {
      tracksToAdd[id].order = index;
    }
  });

  // IMPORTANT: Use plain object merge, NOT mutation-style setState.
  // The store uses `mutative` middleware, but external setState() through
  // the `persist → mutative` middleware stack may not propagate mutations
  // correctly. Object merge is universally safe.
  useVideoEditorStore.setState({
    tracks: tracksToAdd,
    trackOrder: trackOrderToAdd,
    clips: clipsToAdd,
    transitions: transitionsToAdd,
    isDirty: true,
  });

  // Verify commit was successful by reading back from store
  const postCommitState = useVideoEditorStore.getState();
  const actualClips = Object.keys(postCommitState.clips).length;
  const actualTracks = Object.keys(postCommitState.tracks).length;
  const clipsArr = Object.values(postCommitState.clips) as Array<{ id: string; type: string; trackId: string; startTime: number; duration: number; media?: { src?: string } }>;
  const computedDuration = clipsArr.length > 0 
    ? Math.max(...clipsArr.map(c => c.startTime + c.duration)) 
    : 0;
  
  console.log(`[WizardDataImport] ✅ Post-commit verification: ${actualTracks} tracks, ${actualClips} clips, duration=${computedDuration.toFixed(2)}s`);
  
  // Log first 3 clips for data quality check
  clipsArr.slice(0, 3).forEach(c => {
    console.log(`  Clip ${c.id}: type=${c.type}, trackId=${c.trackId}, start=${c.startTime.toFixed(2)}, dur=${c.duration.toFixed(2)}, src=${c.media?.src?.substring(0, 50) || 'none'}`);
  });
  
  if (actualClips !== clipCount) {
    console.error(`[WizardDataImport] ❌ MISMATCH: Expected ${clipCount} clips but store has ${actualClips}!`);
  }
  
  // Deferred check: verify the state persists after middleware processing
  setTimeout(() => {
    const deferredState = useVideoEditorStore.getState();
    const deferredClips = Object.keys(deferredState.clips).length;
    const deferredTracks = Object.keys(deferredState.tracks).length;
    console.log(`[WizardDataImport] ⏱️ Deferred verification (next tick): ${deferredTracks} tracks, ${deferredClips} clips`);
    if (deferredClips === 0 && actualClips > 0) {
      console.error('[WizardDataImport] ❌ CRITICAL: Clips were lost after setState! Middleware may be reverting the state.');
    }
  }, 100);

  console.log('[WizardDataImport] Import complete ✓');

  // ─── Post-commit: Probe actual video durations ─────────────────
  // Fire-and-forget: asynchronously check each video clip's actual duration
  // and fix mediaDuration mismatches that cause video freezing.
  // After probing, run a final quality validation pass as a safety net.
  probeAndFixVideoClipDurations()
    .then(() => {
      postImportQualityValidation();
    })
    .catch((err) => {
      console.warn('[WizardDataImport] Video duration probing failed:', err);
      // Still run quality validation even if probe fails —
      // it uses stored mediaDuration, not network probing
      postImportQualityValidation();
    });

  // ─── Post-commit: Media issues (separate store, no cascade risk)
  const activeEdl = agentEdl || edl;
  if (activeEdl) {
    const issues = 'mediaIssues' in activeEdl ? activeEdl.mediaIssues : [];
    if (issues && issues.length > 0) {
      const { addIssues, setPanelOpen } = useMediaIssuesStore.getState();
      addIssues(
        issues.map((issue) => ({
          shotIndex: issue.shotIndex,
          clipId: clipIdByShotIndex.get(issue.shotIndex),
          severity: issue.severity as 'error' | 'warning' | 'info',
          type: issue.type as 'generation_failed' | 'placeholder' | 'missing_media' | 'quality_warning' | 'format_unsupported' | 'duration_mismatch' | 'substituted_media',
          title: issue.title,
          description: issue.description,
          availableActions: ['dismiss', 'remove'],
        }))
      );
      console.log(`[WizardDataImport] Added ${issues.length} media issues`);

      // Auto-open the panel when there are error-severity issues needing attention
      const hasErrors = issues.some((i) => i.severity === 'error');
      if (hasErrors) {
        setPanelOpen(true);
      }
    }
  }

  return true;
}

// ============================================================
// REACT HOOK — legacy, for standalone use outside wizard context
// ============================================================

/**
 * Hook that imports wizard data into the V2 editor store.
 * Auto-populates the timeline on mount when data is available.
 * Guards against duplicate population via a ref.
 */
export function useWizardDataImport({
  audioChunks,
  audioUrl,
  shotList,
  generatedMedia,
  edl,
  agentEdl,
}: UseWizardDataImportOptions) {
  const hasPopulatedRef = useRef(false);

  // Build the media URL map (memoized)
  const mediaUrlMap = useMemo(
    () => buildMediaUrlMap(generatedMedia),
    [generatedMedia],
  );

  // Get store actions (for dep array only — actual work is done imperatively)
  const addTrack = useVideoEditorStore((s) => s.addTrack);
  const addClip = useVideoEditorStore((s) => s.addClip);

  useEffect(() => {
    if (hasPopulatedRef.current) return;
    hasPopulatedRef.current = true;
    importWizardDataToStore({ audioChunks, audioUrl, shotList, generatedMedia, edl, agentEdl });
  }, [audioChunks, audioUrl, shotList, generatedMedia, edl, agentEdl, mediaUrlMap, addTrack, addClip]);
}
