/**
 * Wizard Data Import
 * ==================
 * Converts video creation wizard output (audioChunks, shotList, generatedMedia)
 * into V2 timeline clips and tracks.
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
import type { TransitionEasing } from '../types';
import type { EditDecisionList, EDLTransition } from '@/lib/services/edit-assembly/edit-assembly-prompts';
import { useMediaIssuesStore } from '../stores/media-issues-store';

// R2 public URL base (for CORS rewriting)
const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://assets.vidbolt.app';

export interface UseWizardDataImportOptions {
  audioChunks?: AudioChunk[];
  audioUrl?: string | null;
  shotList?: ShotEvent[];
  generatedMedia?: GeneratedMedia[];
  /** AI-generated Edit Decision List */
  edl?: EditDecisionList | null;
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
  mediaMap: Map<number, { url: string; type: 'image' | 'video' }>,
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

/** Build a shot_index → media info map, rewriting R2 URLs. */
function buildMediaUrlMap(
  generatedMedia?: GeneratedMedia[],
): Map<number, { url: string; type: 'image' | 'video' }> {
  const map = new Map<number, { url: string; type: 'image' | 'video' }>();
  if (!generatedMedia) return map;
  for (const media of generatedMedia) {
    if (media.generation_status === 'completed' && media.media_url) {
      const type = media.media_type === 'video' ? 'video' : 'image';
      const url = rewriteR2Url(media.media_url);
      map.set(media.shot_index, { url, type });
    }
  }
  return map;
}

/** Map EDL transition type to V2 VideoTransitionType */
function mapTransitionType(edlType: EDLTransition['type']): VideoTransitionType {
  switch (edlType) {
    case 'crossfade': return VideoTransitionType.CROSSFADE;
    case 'fadeToBlack': return VideoTransitionType.FADE_TO_BLACK;
    case 'fade': return VideoTransitionType.FADE;
    case 'wipeLeft': return VideoTransitionType.WIPE_LEFT;
    case 'dissolve': return VideoTransitionType.DISSOLVE;
    default: return VideoTransitionType.CROSSFADE;
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
 * @returns true if data was imported, false if skipped
 */
export function importWizardDataToStore(options: WizardData): boolean {
  const {
    audioChunks,
    shotList,
    generatedMedia,
    edl,
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
    hasEDL: !!edl,
  });

  const mediaUrlMap = buildMediaUrlMap(generatedMedia);
  const now = Date.now();

  // ─── Build all data in memory first ────────────────────────────
  // These will be committed in a SINGLE set() call at the end.
  const tracksToAdd: Record<string, TimelineTrack> = {};
  const trackOrderToAdd: string[] = [];
  const clipsToAdd: Record<string, TimelineClip> = {};
  const transitionsToAdd: Record<string, TransitionEntity> = {};

  // Track clip IDs by shot index for EDL phase
  const clipIdByShotIndex = new Map<number, string>();
  const audioClipIds: string[] = [];

  // ─── Phase 1: Audio Track ──────────────────────────────────────
  if (hasAudio) {
    const audioTrackId = generateId('track');
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
      const durationSec = chunk.duration_seconds || 5;
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

  // ─── Phase 2: Visual Track ─────────────────────────────────────
  if (hasShots) {
    const videoTrackId = generateId('track');
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
    // Video tracks go before audio tracks
    trackOrderToAdd.unshift(videoTrackId);

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

    for (const shot of shotList) {
      const clipType = getVisualClipType(shot, mediaUrlMap);
      const resolvedMedia = mediaUrlMap.get(shot.segment_index);
      const src = resolvedMedia?.url || transparentPng;
      const color = contentTypeColors[shot.content_type] || '#6b7280';
      const clipId = generateId('clip');

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
        data: {
          shotIndex: shot.segment_index,
          contentType: shot.content_type,
          visualPrompt: shot.visual_prompt || shot.text,
          text: shot.text,
        },
        createdAt: now,
        updatedAt: now,
      };

      clipIdByShotIndex.set(shot.segment_index, clipId);
    }

    console.log(`[WizardDataImport] Built ${shotList.length} visual clips`);

    // ─── Phase 3: Apply EDL (Transitions, Text, Audio) ──────────
    if (edl) {
      console.log('[WizardDataImport] Building EDL data:', {
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
        const textTrackId = generateId('track');
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
        // Insert after video track but before audio
        const videoIdx = trackOrderToAdd.findIndex(id => tracksToAdd[id]?.type === 'video');
        trackOrderToAdd.splice(videoIdx + 1, 0, textTrackId);

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

  // ─── COMMIT: Single atomic set() call ──────────────────────────
  // This is the ONLY Zustand mutation — one set() = one subscriber notification.
  const clipCount = Object.keys(clipsToAdd).length;
  const trackCount = Object.keys(tracksToAdd).length;
  const transitionCount = Object.keys(transitionsToAdd).length;

  console.log(`[WizardDataImport] Committing: ${trackCount} tracks, ${clipCount} clips, ${transitionCount} transitions`);

  useVideoEditorStore.setState((state) => {
    // Merge tracks
    Object.assign(state.tracks, tracksToAdd);

    // Build correct track order: video tracks first, then audio
    const existingVideoOrder = state.trackOrder.filter(
      id => state.tracks[id]?.type === 'video'
    );
    const existingAudioOrder = state.trackOrder.filter(
      id => state.tracks[id]?.type === 'audio'
    );
    const newVideoTracks = trackOrderToAdd.filter(id => tracksToAdd[id]?.type === 'video');
    const newAudioTracks = trackOrderToAdd.filter(id => tracksToAdd[id]?.type === 'audio');
    state.trackOrder = [
      ...existingVideoOrder,
      ...newVideoTracks,
      ...existingAudioOrder,
      ...newAudioTracks,
    ];

    // Update track orders
    state.trackOrder.forEach((id, index) => {
      if (state.tracks[id]) {
        state.tracks[id].order = index;
      }
    });

    // Merge clips
    Object.assign(state.clips, clipsToAdd);

    // Merge transitions
    Object.assign(state.transitions, transitionsToAdd);

    // Mark dirty for auto-save
    state.isDirty = true;
  });

  console.log('[WizardDataImport] Import complete ✓');

  // ─── Post-commit: Media issues (separate store, no cascade risk)
  if (edl?.mediaIssues && edl.mediaIssues.length > 0) {
    const { addIssues } = useMediaIssuesStore.getState();
    addIssues(
      edl.mediaIssues.map((issue) => ({
        shotIndex: issue.shotIndex,
        clipId: clipIdByShotIndex.get(issue.shotIndex),
        severity: issue.severity as 'error' | 'warning' | 'info',
        type: issue.type as 'generation_failed' | 'placeholder' | 'missing_media' | 'quality_warning' | 'format_unsupported',
        title: issue.title,
        description: issue.description,
        availableActions: ['dismiss', 'remove'],
      }))
    );
    console.log(`[WizardDataImport] Added ${edl.mediaIssues.length} media issues`);
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
    importWizardDataToStore({ audioChunks, audioUrl, shotList, generatedMedia, edl });
  }, [audioChunks, audioUrl, shotList, generatedMedia, edl, mediaUrlMap, addTrack, addClip]);
}
