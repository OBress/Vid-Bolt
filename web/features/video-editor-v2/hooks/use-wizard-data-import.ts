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
 */

import { useEffect, useRef, useMemo } from 'react';
import type { AudioChunk, ShotEvent, GeneratedMedia } from '@/types/video';
import { useVideoEditorStore } from '../stores/video-editor-store';
import type { ClipType } from '../types/timeline-v2';

// R2 public URL base (for CORS rewriting)
// Note: R2_PUBLIC_URL env var is server-only. This client-side constant
// matches the value and the /r2-media rewrite in next.config.ts.
const R2_PUBLIC_URL = 'https://assets.vidbolt.app';

interface UseWizardDataImportOptions {
  audioChunks?: AudioChunk[];
  audioUrl?: string | null;
  shotList?: ShotEvent[];
  generatedMedia?: GeneratedMedia[];
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
 * Hook that imports wizard data into the V2 editor store.
 * Auto-populates the timeline on mount when data is available.
 * Guards against duplicate population via a ref.
 */
export function useWizardDataImport({
  audioChunks,
  audioUrl,
  shotList,
  generatedMedia,
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
    });

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

        addClip({
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

        addClip({
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
      }

      console.log(
        `[WizardDataImport] Added ${shotList.length} visual clips on track ${videoTrackId}`,
      );
    }
  }, [audioChunks, audioUrl, shotList, generatedMedia, mediaUrlMap, addTrack, addClip, clips]);
}
