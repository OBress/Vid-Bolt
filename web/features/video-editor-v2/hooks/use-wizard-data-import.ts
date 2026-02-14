/**
 * Wizard Data Bridge Hook
 * =======================
 * Converts video creation wizard output (audioChunks, shotList, generatedMedia)
 * into V2 timeline clips and tracks. This replaces the ~460 lines of
 * auto-population logic from the old V1 editor.
 *
 * Flow:
 *   1. Create audio track + sequential audio clips from audioChunks
 *   2. Create video track + visual clips from shotList
 *   3. Resolve generatedMedia URLs (R2 rewrite) and match to shots
 *   4. Populate the V2 store via addTrack() / addClip()
 *   5. (NEW) Apply EDL: transitions, text overlays, audio fades
 */

import { useEffect, useRef, useMemo } from 'react';
import type { AudioChunk, ShotEvent, GeneratedMedia } from '@/types/video';
import { useVideoEditorStore } from '../stores/video-editor-store';
import type { ClipType } from '../types/timeline-v2';
import { VideoTransitionType, AudioTransitionType } from '../types';
import type { EditDecisionList, EDLTransition } from '@/lib/services/edit-assembly/edit-assembly-prompts';
import { useMediaIssuesStore } from '../stores/media-issues-store';

// R2 public URL base (for CORS rewriting)
// Note: R2_PUBLIC_URL env var is server-only. This client-side constant
// matches the value and the /r2-media rewrite in next.config.ts.
const R2_PUBLIC_URL = 'https://assets.vidbolt.app';

interface UseWizardDataImportOptions {
  audioChunks?: AudioChunk[];
  audioUrl?: string | null;
  shotList?: ShotEvent[];
  generatedMedia?: GeneratedMedia[];
  /** AI-generated Edit Decision List */
  edl?: EditDecisionList | null;
}

/**
 * Rewrite R2 public URLs to same-origin /r2-media/ path for CORS safety.
 */
function rewriteR2Url(url: string): string {
  if (url.startsWith(R2_PUBLIC_URL)) {
    return url.replace(R2_PUBLIC_URL, '/r2-media');
  }
  return url;
}

/**
 * Determine the visual clip type from a shot event.
 */
function getVisualClipType(
  shot: ShotEvent,
  mediaMap: Map<number, { url: string; type: 'image' | 'video' }>,
): ClipType {
  const media = mediaMap.get(shot.segment_index);
  if (media) return media.type;

  // Fallback heuristic based on content type
  switch (shot.content_type) {
    case 'transition':
    case 'emotional-beat':
      return 'video';
    default:
      return 'image';
  }
}

/**
 * Build a shot_index → media info map from generatedMedia,
 * rewriting R2 URLs to same-origin paths.
 */
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

/**
 * Map EDL transition type string to the V2 VideoTransitionType enum
 */
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

  // Get store actions
  const addTrack = useVideoEditorStore((s) => s.addTrack);
  const addClip = useVideoEditorStore((s) => s.addClip);
  const addTransition = useVideoEditorStore((s) => s.addTransition);
  const addBetweenTransition = useVideoEditorStore((s) => s.addBetweenTransition);
  const clips = useVideoEditorStore((s) => s.clips);

  useEffect(() => {
    // Guard: only populate once
    if (hasPopulatedRef.current) return;

    // Guard: store already has clips (e.g. loaded from persistence)
    const existingClipCount = Object.keys(clips).length;
    if (existingClipCount > 0) {
      console.log(
        '[WizardDataImport] Store already has clips, skipping population',
      );
      hasPopulatedRef.current = true;
      return;
    }

    const hasAudio = audioChunks && audioChunks.length > 0;
    const hasShots = shotList && shotList.length > 0;

    if (!hasAudio && !hasShots) {
      console.log('[WizardDataImport] No wizard data to import');
      return;
    }

    // Mark as populated immediately to prevent race conditions
    hasPopulatedRef.current = true;

    console.log('[WizardDataImport] Importing wizard data:', {
      audioChunks: audioChunks?.length || 0,
      shots: shotList?.length || 0,
      generatedMedia: generatedMedia?.length || 0,
      hasEDL: !!edl,
    });

    // Track clip IDs by shot index for EDL phase
    const clipIdByShotIndex = new Map<number, string>();
    const audioClipIds: string[] = [];

    // ─── Phase 1: Audio Track ──────────────────────────────────────────
    let audioTrackId: string | null = null;

    if (hasAudio) {
      audioTrackId = addTrack('audio', {
        name: 'Narration',
        locked: false,
        muted: false,
        allowOverlap: false,
      });

      // Sort chunks by chapter and place sequentially
      const sortedChunks = [...audioChunks].sort(
        (a, b) => a.chapterNumber - b.chapterNumber,
      );

      let currentTime = 0; // seconds

      for (const chunk of sortedChunks) {
        const durationSec = chunk.duration_seconds || 5;
        const audioSrc = rewriteR2Url(chunk.url);

        const clipId = addClip({
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
        });

        audioClipIds.push(clipId);
        currentTime += durationSec;
      }

      console.log(
        `[WizardDataImport] Added ${sortedChunks.length} audio clips on track ${audioTrackId}`,
      );
    }

    // ─── Phase 2: Visual Track ─────────────────────────────────────────
    if (hasShots) {
      const videoTrackId = addTrack('video', {
        name: 'Visuals',
        locked: false,
        allowOverlap: true,
      });

      // Transparent 1x1 PNG fallback for shots without generated media
      const transparentPng =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      // Content type color mapping for timeline display
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

        const clipId = addClip({
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
            volume: clipType === 'video' ? 0 : undefined, // Mute stock video audio
            mediaStartTime: 0,
            mediaDuration: shot.duration_seconds,
          },
          data: {
            shotIndex: shot.segment_index,
            contentType: shot.content_type,
            visualPrompt: shot.visual_prompt || shot.text,
            text: shot.text,
          },
        });

        clipIdByShotIndex.set(shot.segment_index, clipId);
      }

      console.log(
        `[WizardDataImport] Added ${shotList.length} visual clips on track ${videoTrackId}`,
      );

      // ─── Phase 3: Apply EDL (Transitions, Text, Audio) ──────────────
      if (edl) {
        console.log('[WizardDataImport] Applying EDL:', {
          transitions: edl.transitions?.length || 0,
          textOverlays: edl.textOverlays?.length || 0,
          audioEffects: edl.audioEffects?.length || 0,
        });

        // 3a. Transitions (between clips)
        if (edl.transitions && edl.transitions.length > 0) {
          for (const transition of edl.transitions) {
            const fromClipId = clipIdByShotIndex.get(transition.fromShotIndex);
            const toClipId = clipIdByShotIndex.get(transition.toShotIndex);

            if (fromClipId && toClipId && transition.position === 'between') {
              try {
                addBetweenTransition({
                  firstClipId: fromClipId,
                  secondClipId: toClipId,
                  type: mapTransitionType(transition.type),
                  isAudio: false,
                  duration: transition.duration,
                });
              } catch (err) {
                console.warn(`[WizardDataImport] Failed to add transition between shots ${transition.fromShotIndex}→${transition.toShotIndex}:`, err);
              }
            }
          }
          console.log(`[WizardDataImport] Applied ${edl.transitions.length} transitions`);
        }

        // 3b. Text overlays
        if (edl.textOverlays && edl.textOverlays.length > 0) {
          // Create a text track if we have text overlays
          const textTrackId = addTrack('video', {
            name: 'Text',
            group: 'text',
            locked: false,
            allowOverlap: true,
          });

          for (const overlay of edl.textOverlays) {
            const fontSize = overlay.fontSize || (overlay.style === 'chapterTitle' ? 72 : 36);
            const posX = overlay.position?.x ?? 0.5;
            const posY = overlay.position?.y ?? (overlay.style === 'chapterTitle' ? 0.5 : 0.85);

            addClip({
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
            });
          }
          console.log(`[WizardDataImport] Applied ${edl.textOverlays.length} text overlays`);
        }

        // 3c. Audio fades
        if (edl.audioEffects && edl.audioEffects.length > 0 && audioClipIds.length > 0) {
          for (const effect of edl.audioEffects) {
            if (effect.type === 'fadeIn' && audioClipIds[0]) {
              try {
                addTransition({
                  clipId: audioClipIds[0],
                  position: 'in',
                  type: AudioTransitionType.FADE_IN_LINEAR,
                  isAudio: true,
                  duration: effect.duration,
                });
              } catch (err) {
                console.warn('[WizardDataImport] Failed to add audio fade in:', err);
              }
            } else if (effect.type === 'fadeOut' && audioClipIds[audioClipIds.length - 1]) {
              try {
                addTransition({
                  clipId: audioClipIds[audioClipIds.length - 1],
                  position: 'out',
                  type: AudioTransitionType.FADE_OUT_LINEAR,
                  isAudio: true,
                  duration: effect.duration,
                });
              } catch (err) {
                console.warn('[WizardDataImport] Failed to add audio fade out:', err);
              }
            }
          }
          console.log(`[WizardDataImport] Applied audio effects`);
        }

        console.log('[WizardDataImport] EDL application complete');

        // 3d. Populate media issues
        if (edl.mediaIssues && edl.mediaIssues.length > 0) {
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
      }
    }
  }, [audioChunks, audioUrl, shotList, generatedMedia, edl, mediaUrlMap, addTrack, addClip, addTransition, addBetweenTransition, clips]);
}
