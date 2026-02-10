import { useCurrentFrame, interpolate, Audio, getRemotionEnvironment, useVideoConfig } from "remotion";
import { SoundOverlay } from "../../../types";
import { toAbsoluteUrl } from "../../general/url-helper";
import { useEditorContext } from "../../../contexts/editor-context";
import { useMemo, useState, useEffect } from "react";
import { getAudioEffectsCache } from "../../audio-effects-cache";

interface SoundLayerContentProps {
  overlay: SoundOverlay;
  baseUrl?: string;
}

/**
 * Convert decibels to linear volume
 * 0 dB = 1.0 (unity gain)
 * -6 dB ≈ 0.5
 * +6 dB ≈ 2.0
 * -60 dB ≈ 0.001 (effectively silent)
 */
const dbToLinear = (db: number): number => {
  if (db <= -60) return 0; // Treat -60dB as silence
  return Math.pow(10, db / 20);
};

/**
 * Hook to safely use editor context only when available
 */
const useSafeEditorContext = () => {
  try {
    return useEditorContext();
  } catch {
    return { baseUrl: undefined };
  }
};

export const SoundLayerContent: React.FC<SoundLayerContentProps> = ({
  overlay,
  baseUrl,
}) => {
  const { baseUrl: contextBaseUrl } = useSafeEditorContext();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const environment = getRemotionEnvironment();
  const isRendering = environment.isRendering;
  const [cacheVersion, setCacheVersion] = useState(0);
  
  const resolvedBaseUrl = baseUrl || contextBaseUrl;
  
  // Listen for audio processing completion
  useEffect(() => {
    const handleProcessed = (e: CustomEvent) => {
      if (e.detail.clipId === `sound-${overlay.id}`) {
        setCacheVersion(v => v + 1);
      }
    };
    
    window.addEventListener('audio-effects-processed' as any, handleProcessed);
    return () => window.removeEventListener('audio-effects-processed' as any, handleProcessed);
  }, [overlay.id]);

  // Safety check - don't render Audio if src is missing
  if (!overlay.src || overlay.src.trim() === '') {
    console.warn('SoundLayerContent: No src provided for sound overlay', overlay);
    return null;
  }

  // Determine the audio source URL
  let audioSrc = overlay.src;

  if (overlay.src.startsWith("/api/")) {
    audioSrc = toAbsoluteUrl(overlay.src, resolvedBaseUrl);
  } else if (overlay.src.startsWith("/") && resolvedBaseUrl) {
    audioSrc = `${resolvedBaseUrl}${overlay.src}`;
  } else if (overlay.src.startsWith("/")) {
    audioSrc = toAbsoluteUrl(overlay.src, resolvedBaseUrl);
  }
  
  // Check if we have audio effects - if so, use cached processed version
  const hasAudioEffects = overlay.audioEffects && 
                         overlay.audioEffects.length > 0 && 
                         overlay.audioEffects.some(e => e.enabled);
  
  if (hasAudioEffects && !isRendering) {
    // In preview mode with effects, use cached processed audio
    const cache = getAudioEffectsCache();
    const processedSrc = cache.getCachedAudio(`sound-${overlay.id}`, audioSrc, overlay.audioEffects!);
    const isProcessing = cache.isProcessing(`sound-${overlay.id}`, audioSrc, overlay.audioEffects!);
    
    audioSrc = processedSrc || audioSrc;
  }

  // Check if track is muted
  const isMuted = (overlay as any).muted === true;
  
  // Calculate volume from dB or linear (backwards compatibility)
  let baseVolume: number;
  if (isMuted) {
    baseVolume = 0;
  } else if (overlay.styles?.volumeDb !== undefined) {
    // Use dB-based volume
    baseVolume = dbToLinear(overlay.styles.volumeDb);
  } else {
    // Fallback to linear volume for backwards compatibility
    baseVolume = overlay.styles?.volume ?? 1;
  }
  
  // Apply transition-based fades if present
  // Uses absolute startTime/endTime from TransitionEntity
  // Handles both standalone and between transitions consistently with video
  const clipStartTime = overlay.from / fps;
  let fadeMultiplier = 1;
  
  // IN transition: volume goes from 0 to 1
  // Before transition: silent. During: fading in. After: full volume.
  if (overlay.inTransition && !isMuted) {
    const trans = overlay.inTransition as any;
    const absStart = trans._absoluteStartTime;
    const absEnd = trans._absoluteEndTime;
    
    if (absStart !== undefined && absEnd !== undefined) {
      const transitionStartFrame = Math.round((absStart - clipStartTime) * fps);
      const transitionEndFrame = Math.round((absEnd - clipStartTime) * fps);
      
      // Before transition starts: silent
      if (frame < transitionStartFrame) {
        fadeMultiplier = 0;
      } else if (frame < transitionEndFrame) {
        // During transition: fade in
        fadeMultiplier *= interpolate(
          frame,
          [transitionStartFrame, transitionEndFrame],
          [0, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
      }
      // After transition: fadeMultiplier stays at 1
    }
  }
  
  // OUT transition: volume goes from 1 to 0
  // Before transition: full volume. During: fading out. After: silent.
  if (overlay.outTransition && !isMuted) {
    const trans = overlay.outTransition as any;
    const absStart = trans._absoluteStartTime;
    const absEnd = trans._absoluteEndTime;
    
    if (absStart !== undefined && absEnd !== undefined) {
      const transitionStartFrame = Math.round((absStart - clipStartTime) * fps);
      const transitionEndFrame = Math.round((absEnd - clipStartTime) * fps);
      
      // After transition ends: silent
      if (frame >= transitionEndFrame) {
        fadeMultiplier = 0;
      } else if (frame >= transitionStartFrame) {
        // During transition: fade out
        fadeMultiplier *= interpolate(
          frame,
          [transitionStartFrame, transitionEndFrame],
          [1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
      }
      // Before transition: fadeMultiplier stays at 1
    }
  }
  
  const finalVolume = baseVolume * fadeMultiplier;

  // Playback rate (speed)
  const playbackRate = overlay.playbackRate ?? 1;
  
  // Pitch control (toneFrequency)
  const toneFrequency = overlay.toneFrequency ?? 1;

  // At this point, audioSrc is either:
  // - Original source (if no effects or still processing)
  // - Processed source with effects baked in (if effects applied and cached)
  
  // Use standard Remotion Audio for both preview and render
  return (
    <Audio
      src={audioSrc}
      startFrom={overlay.startFromSound || 0}
      endAt={overlay.endAtSound}
      volume={finalVolume}
      playbackRate={playbackRate}
      toneFrequency={toneFrequency}
    />
  );
};
