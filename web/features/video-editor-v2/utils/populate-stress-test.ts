/**
 * Stress Test Timeline Populator
 * ============================================================================
 * Populates the video editor timeline with configurable amounts of media,
 * transitions, and effects to stress-test the editor's performance.
 *
 * Uses media from the DevTools R2 storage (GPU tester).
 * Falls back to placeholder URLs if no R2 media is available.
 */

import { useVideoEditorStore } from "../stores/video-editor-store";
import { useDevToolsMediaStore, type DevToolsMediaItem } from "@/lib/stores/devtools-media-store";
import type { TimelineTrack, TimelineClip, TransitionEntity } from "../types/timeline-v2";
import { VideoTransitionType, AudioTransitionType, EasingPreset } from "../types/index";

// ============================================================================
// TYPES
// ============================================================================

export type StressTestDensity = "light" | "medium" | "heavy" | "extreme";

export interface StressTestConfig {
  /** Total timeline duration in seconds (10–3600) */
  durationSeconds: number;
  /** Edit density preset */
  density: StressTestDensity;
  /** Number of video tracks (1–6) */
  videoTracks: number;
  /** Number of audio tracks (1–4) */
  audioTracks: number;
}

export interface StressTestResult {
  totalClips: number;
  totalTransitions: number;
  totalTracks: number;
  generationTimeMs: number;
}

// ============================================================================
// DENSITY PRESETS
// ============================================================================

interface DensityConfig {
  /** Min clip duration in seconds */
  minClipDur: number;
  /** Max clip duration in seconds */
  maxClipDur: number;
  /** Add a between-transition every N clip pairs (1 = every pair) */
  transitionFrequency: number;
  /** Add standalone fade-in/out on clips */
  addStandaloneFades: boolean;
  /** Add speed/opacity/transform edits */
  addEffects: boolean;
  /** Add text clips on a dedicated video track */
  addTextOverlays: boolean;
}

const DENSITY_CONFIGS: Record<StressTestDensity, DensityConfig> = {
  light: {
    minClipDur: 8,
    maxClipDur: 15,
    transitionFrequency: 3,
    addStandaloneFades: false,
    addEffects: false,
    addTextOverlays: false,
  },
  medium: {
    minClipDur: 4,
    maxClipDur: 8,
    transitionFrequency: 2,
    addStandaloneFades: false,
    addEffects: true,
    addTextOverlays: false,
  },
  heavy: {
    minClipDur: 2,
    maxClipDur: 5,
    transitionFrequency: 1,
    addStandaloneFades: true,
    addEffects: true,
    addTextOverlays: true,
  },
  extreme: {
    minClipDur: 1,
    maxClipDur: 3,
    transitionFrequency: 1,
    addStandaloneFades: true,
    addEffects: true,
    addTextOverlays: true,
  },
};

// ============================================================================
// CONSTANTS
// ============================================================================

const VIDEO_TRANSITION_TYPES = [
  VideoTransitionType.CROSSFADE,
  VideoTransitionType.WIPE_LEFT,
  VideoTransitionType.WIPE_RIGHT,
  VideoTransitionType.SLIDE_UP,
  VideoTransitionType.SLIDE_DOWN,
  VideoTransitionType.ZOOM_IN,
  VideoTransitionType.ZOOM_OUT,
  VideoTransitionType.CROSS_BLUR,
  VideoTransitionType.IRIS_CIRCLE,
  VideoTransitionType.DISSOLVE,
  VideoTransitionType.FADE_TO_BLACK,
  VideoTransitionType.FLIP_HORIZONTAL,
];

const AUDIO_TRANSITION_TYPES = [
  AudioTransitionType.CROSSFADE_LINEAR,
  AudioTransitionType.CROSSFADE_CONSTANT_POWER,
  AudioTransitionType.CROSSFADE_EXPONENTIAL,
];

const EASING_PRESETS = [
  EasingPreset.EASE,
  EasingPreset.EASE_IN_OUT,
  EasingPreset.EASE_IN_CUBIC,
  EasingPreset.EASE_OUT_EXPO,
  EasingPreset.EASE_OUT_CUBIC,
  EasingPreset.LINEAR,
];

const TEXT_LABELS = [
  "Breaking News", "Chapter 1", "Interview", "B-Roll", "Recap",
  "Intro", "Outro", "Title Card", "Lower Third", "Credits",
  "Scene 1", "Act II", "Highlight", "Behind the Scenes", "Montage",
  "Commentary", "Analysis", "Summary", "Transition", "Epilogue",
];

// Track colors are intentionally omitted so clips resolve to
// CLIP_TYPE_COLORS[clip.type] in memoized-selectors.ts, which gives
// distinct colors per clip type (teal for video, green for audio, etc.).

/** Placeholder URLs in case R2 has no media */
const FALLBACK_IMAGES = [
  "https://picsum.photos/seed/st1/1920/1080",
  "https://picsum.photos/seed/st2/1920/1080",
  "https://picsum.photos/seed/st3/1920/1080",
  "https://picsum.photos/seed/st4/1920/1080",
  "https://picsum.photos/seed/st5/1920/1080",
];

// ============================================================================
// HELPERS
// ============================================================================

let idCounter = 0;

function generateId(prefix: string): string {
  return `${prefix}-stress-${Date.now()}-${++idCounter}`;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number): number {
  return Math.floor(randomBetween(min, max + 1));
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickFromPool<T>(pool: T[], index: number): T {
  return pool[index % pool.length];
}

// ============================================================================
// ESTIMATION (for preview in UI)
// ============================================================================

export function estimateStressTest(config: StressTestConfig): {
  estimatedClips: number;
  estimatedTransitions: number;
  estimatedTracks: number;
} {
  const dc = DENSITY_CONFIGS[config.density];
  const avgClipDur = (dc.minClipDur + dc.maxClipDur) / 2;
  const clipsPerTrack = Math.ceil(config.durationSeconds / avgClipDur);
  const totalTracks = config.videoTracks + config.audioTracks;
  const estimatedClips = clipsPerTrack * totalTracks;

  // Transitions: between transitions + standalone fades
  const betweenTransitions = Math.floor(
    (clipsPerTrack - 1) * totalTracks / dc.transitionFrequency
  );
  const standaloneTransitions = dc.addStandaloneFades
    ? Math.floor(estimatedClips * 0.4) // ~40% of clips get standalone fades
    : 0;

  return {
    estimatedClips,
    estimatedTransitions: betweenTransitions + standaloneTransitions,
    estimatedTracks: totalTracks,
  };
}

// ============================================================================
// DURATION STEPS (log-scale for the slider)
// ============================================================================

export const DURATION_STEPS = [
  { value: 10, label: "10s" },
  { value: 30, label: "30s" },
  { value: 60, label: "1 min" },
  { value: 120, label: "2 min" },
  { value: 300, label: "5 min" },
  { value: 600, label: "10 min" },
  { value: 900, label: "15 min" },
  { value: 1800, label: "30 min" },
  { value: 2700, label: "45 min" },
  { value: 3600, label: "60 min" },
];

// ============================================================================
// MAIN FUNCTION
// ============================================================================

export async function populateStressTest(
  config: StressTestConfig,
): Promise<StressTestResult> {
  const startTime = performance.now();
  idCounter = 0;

  // ── 1. Fetch R2 media ──
  const mediaStore = useDevToolsMediaStore.getState();
  if (!mediaStore.hasFetched) {
    await mediaStore.fetchFromR2();
  }

  const allMedia = useDevToolsMediaStore.getState().items;
  const images = allMedia.filter((m) => m.type === "image");
  const videos = allMedia.filter((m) => m.type === "video");
  const audios = allMedia.filter((m) => m.type === "audio");

  // Combine images and videos for video tracks
  const visualMedia = [...videos, ...images];

  // ── 2. Build state in memory ──
  const dc = DENSITY_CONFIGS[config.density];
  const now = Date.now();

  const tracks: Record<string, TimelineTrack> = {};
  const trackOrder: string[] = [];
  const clips: Record<string, TimelineClip> = {};
  const transitions: Record<string, TransitionEntity> = {};

  // ── 3. Create tracks ──
  for (let i = 0; i < config.videoTracks; i++) {
    const id = generateId("track-v");
    tracks[id] = {
      id,
      name: `V${i + 1}`,
      type: "video",
      order: i,
      group: "video",
      locked: false,
      visible: true,
      muted: false,
      allowOverlap: true,
      createdAt: now,
      updatedAt: now,
    };
    trackOrder.push(id);
  }

  for (let i = 0; i < config.audioTracks; i++) {
    const id = generateId("track-a");
    tracks[id] = {
      id,
      name: `A${i + 1}`,
      type: "audio",
      order: config.videoTracks + i,
      group: "audio",
      locked: false,
      visible: true,
      muted: false,
      allowOverlap: false,
      createdAt: now,
      updatedAt: now,
    };
    trackOrder.push(id);
  }

  // ── 4. Populate each track with clips ──
  const videoTrackIds = trackOrder.filter((id) => tracks[id].type === "video");
  const audioTrackIds = trackOrder.filter((id) => tracks[id].type === "audio");

  // Helper to generate clips for a track
  function fillTrackWithClips(
    trackId: string,
    trackType: "video" | "audio",
    trackIndex: number,
  ): string[] {
    const clipIds: string[] = [];
    let cursor = 0;
    let clipIndex = 0;

    while (cursor < config.durationSeconds) {
      const remaining = config.durationSeconds - cursor;
      const clipDuration = Math.min(
        randomBetween(dc.minClipDur, dc.maxClipDur),
        remaining,
      );

      if (clipDuration < 0.1) break; // Skip tiny remnants

      const clipId = generateId("clip");
      const isVideoTrack = trackType === "video";

      // Pick media source
      let src = "";
      let clipType: TimelineClip["type"] = isVideoTrack ? "image" : "audio";
      let thumbnailUrl: string | undefined;

      if (isVideoTrack) {
        if (visualMedia.length > 0) {
          const media = pickFromPool(visualMedia, clipIndex + trackIndex * 100);
          src = media.url;
          clipType = media.type === "video" ? "video" : "image";
          thumbnailUrl = media.type === "image" ? media.url : undefined;
        } else {
          src = pickFromPool(FALLBACK_IMAGES, clipIndex);
          clipType = "image";
          thumbnailUrl = src;
        }
      } else {
        if (audios.length > 0) {
          const media = pickFromPool(audios, clipIndex + trackIndex * 50);
          src = media.url;
          clipType = "audio";
        } else {
          // No audio available, use a placeholder
          src = "";
          clipType = "audio";
        }
      }

      // Transform — PiP for tracks V3+ (index >= 2)
      const isPiP = isVideoTrack && trackIndex >= 2;
      const isTextTrack = isVideoTrack && dc.addTextOverlays && trackIndex === config.videoTracks - 1;

      // If this is the last video track and text overlays are enabled, make text clips
      if (isTextTrack) {
        const textClipId = generateId("clip");
        clips[textClipId] = {
          id: textClipId,
          trackId,
          startTime: cursor,
          duration: clipDuration,
          type: "text",
          sourceId: `text-${clipIndex}`,
          label: pickFromPool(TEXT_LABELS, clipIndex),
          transform: {
            x: 960 - 300,
            y: 800,
            width: 600,
            height: 80,
            rotation: 0,
            opacity: 0.95,
          },
          text: {
            text: pickFromPool(TEXT_LABELS, clipIndex),
            fontFamily: "Inter",
            fontSize: 36,
            color: "#ffffff",
            backgroundColor: "rgba(0,0,0,0.6)",
            textAlign: "center",
          },
          createdAt: now,
          updatedAt: now,
        };
        clipIds.push(textClipId);
      } else {
        // Normal media clip
        clips[clipId] = {
          id: clipId,
          trackId,
          startTime: cursor,
          duration: clipDuration,
          type: clipType,
          sourceId: src || `placeholder-${clipIndex}`,
          label: `${trackType === "video" ? "V" : "A"}${trackIndex + 1} Clip ${clipIndex + 1}`,
          transform: isPiP
            ? {
                x: trackIndex % 2 === 0 ? 50 : 1400,
                y: trackIndex % 2 === 0 ? 50 : 600,
                width: 420,
                height: 236,
                rotation: 0,
                opacity: 0.9,
                scale: 1,
              }
            : {
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
                rotation: 0,
                opacity: 1,
              },
          media: {
            src,
            speed: dc.addEffects && Math.random() > 0.7
              ? pickRandom([0.5, 0.75, 1.25, 1.5, 2.0])
              : 1,
            volume: trackType === "audio" ? randomBetween(0.6, 1.0) : 1,
            mediaDuration: clipDuration,
          },
          thumbnailUrl,
          createdAt: now,
          updatedAt: now,
        };
        clipIds.push(clipId);
      }

      cursor += clipDuration;
      clipIndex++;
    }

    return clipIds;
  }

  // Fill video tracks
  const trackClipIds: Record<string, string[]> = {};

  for (let i = 0; i < videoTrackIds.length; i++) {
    trackClipIds[videoTrackIds[i]] = fillTrackWithClips(videoTrackIds[i], "video", i);
  }

  // Fill audio tracks
  for (let i = 0; i < audioTrackIds.length; i++) {
    trackClipIds[audioTrackIds[i]] = fillTrackWithClips(audioTrackIds[i], "audio", i);
  }

  // ── 5. Add transitions ──
  for (const trackId of trackOrder) {
    const thisClipIds = trackClipIds[trackId] || [];
    const isAudio = tracks[trackId].type === "audio";

    for (let i = 0; i < thisClipIds.length - 1; i++) {
      const clipA = clips[thisClipIds[i]];
      const clipB = clips[thisClipIds[i + 1]];

      if (!clipA || !clipB) continue;

      // Between transitions at configurable frequency
      if ((i + 1) % dc.transitionFrequency === 0) {
        const transId = generateId("trans");
        const boundary = clipA.startTime + clipA.duration;
        const transDuration = randomBetween(0.3, 1.2);
        const halfDur = transDuration / 2;

        const transitionType = isAudio
          ? pickRandom(AUDIO_TRANSITION_TYPES)
          : pickRandom(VIDEO_TRANSITION_TYPES);

        transitions[transId] = {
          id: transId,
          type: transitionType,
          startTime: boundary - halfDur,
          endTime: boundary + halfDur,
          easing: {
            preset: pickRandom(EASING_PRESETS),
          },
          position: "between",
          clipIds: [thisClipIds[i], thisClipIds[i + 1]],
          isAudio,
          duration: transDuration,
          createdAt: now,
          updatedAt: now,
        };
      }
    }

    // Standalone fades (heavy/extreme)
    if (dc.addStandaloneFades) {
      for (let i = 0; i < thisClipIds.length; i++) {
        const clip = clips[thisClipIds[i]];
        if (!clip) continue;

        // ~40% chance of fade-in
        if (Math.random() < 0.4) {
          const fadeDur = randomBetween(0.2, 0.8);
          const fadeId = generateId("trans");
          const fadeType = isAudio
            ? AudioTransitionType.FADE_IN_LINEAR
            : pickRandom([VideoTransitionType.FADE, VideoTransitionType.FADE_TO_BLACK]);

          transitions[fadeId] = {
            id: fadeId,
            type: fadeType,
            startTime: clip.startTime,
            endTime: clip.startTime + fadeDur,
            easing: { preset: pickRandom(EASING_PRESETS) },
            position: "in",
            clipIds: [thisClipIds[i]],
            isAudio,
            duration: fadeDur,
            createdAt: now,
            updatedAt: now,
          };
        }

        // ~40% chance of fade-out
        if (Math.random() < 0.4) {
          const fadeDur = randomBetween(0.2, 0.8);
          const fadeId = generateId("trans");
          const fadeType = isAudio
            ? AudioTransitionType.FADE_OUT_LINEAR
            : pickRandom([VideoTransitionType.FADE, VideoTransitionType.FADE_TO_WHITE]);

          transitions[fadeId] = {
            id: fadeId,
            type: fadeType,
            startTime: clip.startTime + clip.duration - fadeDur,
            endTime: clip.startTime + clip.duration,
            easing: { preset: pickRandom(EASING_PRESETS) },
            position: "out",
            clipIds: [thisClipIds[i]],
            isAudio,
            duration: fadeDur,
            createdAt: now,
            updatedAt: now,
          };
        }
      }
    }
  }

  // ── 6. Apply everything to the store in one batch ──
  const totalClips = Object.keys(clips).length;
  const totalTransitions = Object.keys(transitions).length;
  const totalTracks = trackOrder.length;

  useVideoEditorStore.setState({
    tracks,
    trackOrder,
    clips,
    transitions,
    selection: { clipIds: [], transitionId: null },
    dragState: null,
    dragVisuals: null,
    playback: { currentTime: 0, isPlaying: false, playbackRate: 1 },
    isDirty: true,
  });

  const generationTimeMs = Math.round(performance.now() - startTime);

  console.log(
    `[StressTest] Generated ${totalClips} clips, ${totalTransitions} transitions across ${totalTracks} tracks in ${generationTimeMs}ms`,
  );

  return { totalClips, totalTransitions, totalTracks, generationTimeMs };
}
