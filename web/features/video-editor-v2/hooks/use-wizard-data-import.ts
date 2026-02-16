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
  mediaMap: Map<number, { url: string; type: 'image' | 'video' | 'motion-graphics'; remotionCode?: string; usedIcons?: string[] }>,
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
): Map<number, { url: string; type: 'image' | 'video' | 'motion-graphics'; remotionCode?: string; usedIcons?: string[] }> {
  const map = new Map<number, { url: string; type: 'image' | 'video' | 'motion-graphics'; remotionCode?: string; usedIcons?: string[] }>();
  if (!generatedMedia) return map;
  for (const media of generatedMedia) {
    // Accept any media that has a URL — don't require generation_status === 'completed'
    // as a defensive fallback. The primary fix is in Step 6 polling for task completion.
    if (media.media_url) {
      if (media.generation_status !== 'completed') {
        console.warn(`[WizardDataImport] Shot ${media.shot_index} has URL but status="${media.generation_status}" — using anyway`);
      }
      const type: 'image' | 'video' | 'motion-graphics' =
        media.media_type === 'motiongraphic' ? 'motion-graphics'
        : media.media_type === 'video' ? 'video'
        : 'image';
      
      // Handle remotion:// marker URLs — these are NOT real loadable URLs.
      // They indicate the shot has Remotion code for programmatic rendering.
      // Replace with empty string so the clip falls back to transparent placeholder,
      // but preserve the remotionCode/usedIcons for downstream rendering.
      const isRemotionMarker = media.media_url.startsWith('remotion://');
      const url = isRemotionMarker ? '' : rewriteR2Url(media.media_url);
      
      if (isRemotionMarker) {
        console.log(`[WizardDataImport] Shot ${media.shot_index} uses Remotion code (no static URL)`);
      }
      
      map.set(media.shot_index, { url, type, remotionCode: media.remotion_code, usedIcons: media.used_icons });
    }
  }
  console.log(`[WizardDataImport] buildMediaUrlMap: ${map.size}/${generatedMedia.length} shots have URLs`);
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
      for (const agentClip of agentEdl.clips) {
        const internalTrackId = agentToInternalTrackId.get(agentClip.trackId);
        if (!internalTrackId) {
          console.warn(`[WizardDataImport] Unknown agent track: ${agentClip.trackId}, skipping clip`);
          continue;
        }

        if (agentClip.type === 'text') {
          // ─── Text clip ────────────────────────────────────
          const clipId = generateId('clip');
          const text = agentClip.text || { text: '' };
          const fontSize = text.fontSize || 48;

          // Guard against undefined/NaN timing from agent EDL
          const textStart = Number.isFinite(agentClip.startTime) ? agentClip.startTime : 0;
          const textDur = Number.isFinite(agentClip.duration) ? agentClip.duration : 3;
          if (!Number.isFinite(agentClip.startTime) || !Number.isFinite(agentClip.duration)) {
            console.warn(`[WizardDataImport] Text clip has NaN timing: startTime=${agentClip.startTime}, duration=${agentClip.duration}`);
          }

          clipsToAdd[clipId] = {
            id: clipId,
            trackId: internalTrackId,
            startTime: textStart,
            duration: textDur,
            type: 'text',
            sourceId: `text-${textStart}`,
            label: agentClip.label || text.text?.substring(0, 30),
            transform: {
              x: agentClip.transform?.x ?? 460,
              y: agentClip.transform?.y ?? 440,
              width: agentClip.transform?.width ?? 1000,
              height: agentClip.transform?.height ?? (fontSize * 2),
              rotation: agentClip.transform?.rotation ?? 0,
              opacity: agentClip.transform?.opacity ?? 1,
            },
            text: {
              text: text.text,
              fontFamily: text.fontFamily || 'Inter',
              fontSize,
              color: text.color || '#ffffff',
              backgroundColor: text.backgroundColor || 'transparent',
              textAlign: text.textAlign || 'center',
            },
            // Apply keyframes if provided
            keyframes: agentClip.keyframes
              ? agentKeyframesToPropertyKeyframes(agentClip.keyframes)
              : undefined,
            data: {
              edlStyle: text.textAlign,
            },
            createdAt: now,
            updatedAt: now,
          };
        } else if (agentClip.type === 'audio') {
          // Audio clips handled in Phase 1, skip
          continue;
        } else {
          // ─── Visual clip (image, video, motion-graphics) ──────
          const shot = shotList.find(s => s.segment_index === agentClip.shotIndex);
          if (!shot && agentClip.shotIndex != null) {
            console.warn(`[WizardDataImport] No shot found for index ${agentClip.shotIndex}`);
            continue;
          }

          const resolvedMedia = agentClip.shotIndex != null
            ? mediaUrlMap.get(agentClip.shotIndex)
            : undefined;
          const src = resolvedMedia?.url || transparentPng;
          const clipType = resolvedMedia?.type || (agentClip.type as ClipType);
          const color = shot ? contentTypeColors[shot.content_type] || '#6b7280' : '#6b7280';
          const clipId = generateId('clip');

          // Guard against undefined/NaN timing from agent EDL
          const visualStart = Number.isFinite(agentClip.startTime) ? agentClip.startTime : 0;
          const visualDur = Number.isFinite(agentClip.duration) ? agentClip.duration : 3;
          if (!Number.isFinite(agentClip.startTime) || !Number.isFinite(agentClip.duration)) {
            console.warn(`[WizardDataImport] Visual clip (shot ${agentClip.shotIndex}) has NaN timing: startTime=${agentClip.startTime}, duration=${agentClip.duration}`);
          }

          // Build motion-graphics properties if this clip has remotionCode
          const mgProperties = (clipType === 'motion-graphics' && resolvedMedia?.remotionCode)
            ? {
                template: {
                  id: `mg-wizard-${clipId}`,
                  name: shot?.text?.substring(0, 40) || `Shot ${agentClip.shotIndex}`,
                  description: shot?.visual_prompt || 'AI-generated motion graphic',
                  category: MotionGraphicsCategory.CUSTOM,
                  duration: Math.round(visualDur * 30), // seconds → frames at 30fps
                  editableProperties: [],
                },
                compositionDefinition: {
                  id: `comp-${clipId}`,
                  name: shot?.text?.substring(0, 40) || `Shot ${agentClip.shotIndex}`,
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
              }
            : undefined;

          clipsToAdd[clipId] = {
            id: clipId,
            trackId: internalTrackId,
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
              shotIndex: agentClip.shotIndex,
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

          if (agentClip.shotIndex != null) {
            clipIdByShotIndex.set(agentClip.shotIndex, clipId);
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
        const src = resolvedMedia?.url || transparentPng;
        const color = contentTypeColors[shot.content_type] || '#6b7280';
        const clipId = generateId('clip');

        // Build motion-graphics properties if this clip has remotionCode
        const mgProperties = (clipType === 'motion-graphics' && resolvedMedia?.remotionCode)
          ? {
              template: {
                id: `mg-wizard-${clipId}`,
                name: shot.text?.substring(0, 40) || `Shot ${shot.segment_index}`,
                description: shot.visual_prompt || 'AI-generated motion graphic',
                category: MotionGraphicsCategory.CUSTOM,
                duration: Math.round(shot.duration_seconds * 30),
                editableProperties: [],
              },
              compositionDefinition: {
                id: `comp-${clipId}`,
                name: shot.text?.substring(0, 40) || `Shot ${shot.segment_index}`,
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
            }
          : undefined;

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
      // Create a dedicated 'Motion Graphics' overlay track
      const mgTrackId = generateId('track');
      const mgTrack: TimelineTrack = {
        id: mgTrackId,
        type: 'video',
        name: 'Motion Graphics',
        order: 1, // Will be re-ordered at commit time
        group: 'overlays',
        locked: false,
        visible: true,
        muted: false,
        allowOverlap: true,
        createdAt: now,
        updatedAt: now,
      };
      tracksToAdd[mgTrackId] = mgTrack;

      // Insert MG track right after the first video track in track order
      const firstVideoIdx = trackOrderToAdd.findIndex(
        id => tracksToAdd[id]?.type === 'video'
      );
      if (firstVideoIdx >= 0) {
        trackOrderToAdd.splice(firstVideoIdx + 1, 0, mgTrackId);
      } else {
        trackOrderToAdd.unshift(mgTrackId);
      }

      for (const { shotIndex, remotionCode, usedIcons, isPureMG } of mgShotEntries) {
        const shot = shotList?.find(s => s.segment_index === shotIndex);
        if (!shot) continue;

        const existingClipId = clipIdByShotIndex.get(shotIndex);
        const durationFrames = Math.round(shot.duration_seconds * 30);

        // Build the MG template from the generated Remotion code
        // CRITICAL: Wrap remotionCode into a CompositionDefinition so that
        // MotionGraphicsLayerContent → DynamicComposition can render the preview.
        // The rendering chain checks compositionDefinition.originalRemotionCode + generatedFromJSX.
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
          // Pure MG: Convert the existing clip to motion-graphics type on the MG track
          const clip = clipsToAdd[existingClipId];
          clip.trackId = mgTrackId;
          clip.type = 'motion-graphics';
          clip.sourceId = `mg-${shotIndex}`;
          clip.color = '#9333ea'; // Purple for MG clips
          clip.properties = {
            template: mgTemplate,
          };
        } else if (!isPureMG) {
          // Hybrid: Base media stays on its track; create a NEW MG clip on the overlay track
          const mgClipId = generateId('clip');
          clipsToAdd[mgClipId] = {
            id: mgClipId,
            trackId: mgTrackId,
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
        `[WizardDataImport] Created Motion Graphics track with ${mgShotEntries.length} clips ` +
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
  const clipsArr = Object.values(postCommitState.clips);
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

  // ─── Post-commit: Media issues (separate store, no cascade risk)
  const activeEdl = agentEdl || edl;
  if (activeEdl) {
    const issues = 'mediaIssues' in activeEdl ? activeEdl.mediaIssues : [];
    if (issues && issues.length > 0) {
      const { addIssues } = useMediaIssuesStore.getState();
      addIssues(
        issues.map((issue) => ({
          shotIndex: issue.shotIndex,
          clipId: clipIdByShotIndex.get(issue.shotIndex),
          severity: issue.severity as 'error' | 'warning' | 'info',
          type: issue.type as 'generation_failed' | 'placeholder' | 'missing_media' | 'quality_warning' | 'format_unsupported',
          title: issue.title,
          description: issue.description,
          availableActions: ['dismiss', 'remove'],
        }))
      );
      console.log(`[WizardDataImport] Added ${issues.length} media issues`);
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
