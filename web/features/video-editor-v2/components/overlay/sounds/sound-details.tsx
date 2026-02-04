/**
 * SoundDetails Component
 *
 * Provides audio playback controls and settings for a sound clip.
 * Features include:
 * - Audio preview playback
 * - Volume control (dB scale)
 * - Playback speed control
 * - Pitch control
 *
 * Uses Timeline V2 clip-based API directly.
 *
 * @component
 */

import React, { useRef, useState, useEffect, useCallback } from "react";
import type { TimelineClip } from "../../../types/timeline-v2";
import { useVideoEditorStore } from "../../../stores/video-editor-store";
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX,
  Music2,
  Gauge,
  RotateCcw
} from "lucide-react";
import { Button } from "../../ui/button";
import { Slider } from "../../ui/slider";
import { Input } from "../../ui/input";

/**
 * Convert decibels to linear volume
 */
const dbToLinear = (db: number): number => {
  if (db <= -60) return 0;
  return Math.pow(10, db / 20);
};

/**
 * Format dB value for display
 */
const formatDb = (db: number): string => {
  if (db <= -60) return "-∞";
  if (db >= 0) return `+${db.toFixed(1)}`;
  return db.toFixed(1);
};

/**
 * Format seconds to MM:SS format
 */
const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

interface SoundDetailsProps {
  /** The audio clip to edit */
  clip: TimelineClip;
}

export const SoundDetails: React.FC<SoundDetailsProps> = ({
  clip,
}) => {
  const updateClip = useVideoEditorStore(s => s.updateClip);
  const fps = useVideoEditorStore(s => s.fps) || 30;
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState<number>(clip.media?.mediaDuration ?? 10);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Get current values with defaults
  const volumeDb = clip.styles?.volumeDb ?? 0;
  const playbackRate = clip.media?.speed ?? 1;
  const pitch = clip.styles?.toneFrequency ?? 1;
  const isMuted = volumeDb <= -60;

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current && audioRef.current.duration) {
      setDuration(audioRef.current.duration);
    }
  }, []);

  useEffect(() => {
    audioRef.current = new Audio(clip.sourceId);
    audioRef.current.addEventListener('loadedmetadata', handleLoadedMetadata);
    
    return () => {
      if (audioRef.current) {
        audioRef.current.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, [clip.sourceId, clip.media?.mediaDuration, handleLoadedMetadata]);

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.volume = Math.min(1, dbToLinear(volumeDb));
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.play().catch((error) => console.error("Error playing audio:", error));
    }
    setIsPlaying(!isPlaying);
  };

  // Volume in dB (-60 to +12)
  const handleVolumeChange = (value: number[]) => {
    updateClip(clip.id, {
      styles: {
        ...clip.styles,
        volumeDb: value[0],
      },
    });
  };

  // Playback rate (0.25 to 4.0)
  const handleSpeedChange = (value: number[]) => {
    updateClip(clip.id, {
      media: {
        ...clip.media,
        speed: value[0],
      },
    });
  };

  const handleSpeedInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value >= 0.1 && value <= 4) {
      updateClip(clip.id, {
        media: {
          ...clip.media,
          speed: value,
        },
      });
    }
  };

  // Pitch control (0.5 to 2.0)
  const handlePitchChange = (value: number[]) => {
    updateClip(clip.id, {
      styles: {
        ...clip.styles,
        toneFrequency: value[0],
      },
    });
  };

  const handlePitchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value >= 0.5 && value <= 2) {
      updateClip(clip.id, {
        styles: {
          ...clip.styles,
          toneFrequency: value,
        },
      });
    }
  };

  const handleMuteToggle = () => {
    updateClip(clip.id, {
      styles: {
        ...clip.styles,
        volumeDb: isMuted ? 0 : -60,
      },
    });
  };

  const resetAll = () => {
    updateClip(clip.id, {
      media: {
        ...clip.media,
        speed: 1,
      },
      styles: {
        ...clip.styles,
        volumeDb: 0,
      toneFrequency: 1,
      },
    });
  };

  const hasChanges = volumeDb !== 0 || playbackRate !== 1 || pitch !== 1;

  return (
    <div className="space-y-3">
      {/* Audio Preview */}
      <div className="bg-neutral-900/50 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="h-10 w-10 rounded-full bg-primary/20 hover:bg-primary/30 flex items-center justify-center transition-colors shrink-0"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4 text-primary" />
            ) : (
              <Play className="h-4 w-4 text-primary ml-0.5" />
            )}
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {clip.label || 'Audio'}
            </p>
            <p className="text-xs text-muted-foreground">
              Duration: {formatDuration(duration)} • {Math.round(duration * fps)} frames
            </p>
          </div>
        </div>
      </div>

      {/* Volume (dB) */}
      <div className="bg-neutral-900/50 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isMuted ? (
              <VolumeX className="h-4 w-4 text-red-400" />
            ) : (
              <Volume2 className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-sm font-medium text-foreground">Volume</span>
          </div>
          <button
            onClick={handleMuteToggle}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              isMuted 
                ? 'bg-red-500/20 text-red-400' 
                : 'bg-neutral-800 text-muted-foreground hover:bg-neutral-700'
            }`}
          >
            {isMuted ? "Unmute" : "Mute"}
          </button>
        </div>
        
        {/* Current Value Display */}
        <div className="flex items-center justify-center py-2 px-3 bg-neutral-800 rounded-md">
          <span className="text-lg font-mono text-foreground tabular-nums">
            {formatDb(volumeDb)}
          </span>
          <span className="text-sm text-muted-foreground ml-1">dB</span>
        </div>
        
        <div className="space-y-1">
          <Slider
            value={[volumeDb]}
            onValueChange={handleVolumeChange}
            min={-60}
            max={12}
            step={0.5}
            className="flex-1"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>-∞</span>
            <span>-24</span>
            <span>-12</span>
            <span>0</span>
            <span>+12</span>
          </div>
        </div>
      </div>

      {/* Playback Speed */}
      <div className="bg-neutral-900/50 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Playback Speed</span>
        </div>

        {/* Current Value Display */}
        <div className="flex items-center justify-center py-2 px-3 bg-neutral-800 rounded-md">
          <Input
            type="number"
            value={playbackRate}
            onChange={handleSpeedInput}
            min={0.1}
            max={4}
            step={0.05}
            className="w-20 h-8 text-lg font-mono text-center bg-transparent border-none focus:ring-0 tabular-nums"
          />
          <span className="text-sm text-muted-foreground">×</span>
        </div>

        <div className="space-y-1">
          <Slider
            value={[playbackRate]}
            onValueChange={handleSpeedChange}
            min={0.25}
            max={4}
            step={0.05}
            className="flex-1"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0.25×</span>
            <span>1×</span>
            <span>2×</span>
            <span>4×</span>
          </div>
        </div>
      </div>

      {/* Pitch Control */}
      <div className="bg-neutral-900/50 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Music2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Pitch</span>
        </div>

        {/* Current Value Display */}
        <div className="flex items-center justify-center py-2 px-3 bg-neutral-800 rounded-md">
          <Input
            type="number"
            value={pitch}
            onChange={handlePitchInput}
            min={0.5}
            max={2}
            step={0.01}
            className="w-20 h-8 text-lg font-mono text-center bg-transparent border-none focus:ring-0 tabular-nums"
          />
          <span className="text-sm text-muted-foreground ml-1">
            {pitch < 1 ? `(${((1 - pitch) * 100).toFixed(0)}% lower)` : 
             pitch > 1 ? `(${((pitch - 1) * 100).toFixed(0)}% higher)` : 
             "(normal)"}
          </span>
        </div>

        <div className="space-y-1">
          <Slider
            value={[pitch]}
            onValueChange={handlePitchChange}
            min={0.5}
            max={2}
            step={0.01}
            className="flex-1"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0.5 (-1 oct)</span>
            <span>1.0</span>
            <span>2.0 (+1 oct)</span>
          </div>
        </div>
      </div>

      {/* Reset Button */}
      {hasChanges && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs h-8 text-muted-foreground hover:text-foreground"
          onClick={resetAll}
        >
          <RotateCcw className="h-3 w-3 mr-2" />
          Reset All Audio Settings
        </Button>
      )}
    </div>
  );
};
