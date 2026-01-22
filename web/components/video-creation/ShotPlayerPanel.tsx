"use client";

import React, { useMemo, useEffect, useRef } from "react";
import { AudioChunk } from "@/types/video";
import {
  useSequencedAudio,
  PlaybackSpeed,
  PLAYBACK_SPEEDS,
} from "@/hooks/use-sequenced-audio";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronDown,
  Loader2,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ShotPlayerPanelProps {
  audioChunks: AudioChunk[];
  script: string;
  shots: Array<{
    segment_index: number;
    start_seconds: number;
    end_seconds: number;
    duration_seconds: number;
    text: string;
    summary?: string;
  }>;
  onShotHighlight: (shotIndex: number | null) => void;
}

export function ShotPlayerPanel({
  audioChunks,
  script,
  shots,
  onShotHighlight,
}: ShotPlayerPanelProps) {
  const [showSpeedMenu, setShowSpeedMenu] = React.useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeParaRef = useRef<HTMLDivElement>(null);

  const {
    state,
    togglePlay,
    seekTo,
    skipToPrevChunk,
    skipToNextChunk,
    playbackSpeed,
    setPlaybackSpeed,
  } = useSequencedAudio(audioChunks);

  // Split script into paragraphs
  const paragraphs = useMemo(() => {
    return script.split(/\n\n+/).filter((p) => p.trim().length > 0);
  }, [script]);

  // Find current shot based on playback time
  const currentShot = useMemo(() => {
    return shots.find(
      (s) =>
        state.totalTime >= s.start_seconds && state.totalTime < s.end_seconds,
    );
  }, [shots, state.totalTime]);

  // Find current paragraph based on shots
  // Each shot has text - we need to find which paragraph contains the current shot's text
  const currentParagraphIndex = useMemo(() => {
    if (!currentShot) return -1;

    // Find paragraph that contains any word from current shot text
    const shotWords = currentShot.text.split(/\s+/).slice(0, 5).join(" ");
    for (let i = 0; i < paragraphs.length; i++) {
      if (paragraphs[i].includes(shotWords)) {
        return i;
      }
    }
    // Fallback: estimate based on time proportion
    const progress = state.totalTime / (state.duration || 1);
    return Math.floor(progress * paragraphs.length);
  }, [currentShot, paragraphs, state.totalTime, state.duration]);

  // Notify parent of current shot for highlighting
  useEffect(() => {
    onShotHighlight(currentShot?.segment_index ?? null);
  }, [currentShot?.segment_index, onShotHighlight]);

  // Auto-scroll to active paragraph
  useEffect(() => {
    if (activeParaRef.current && scrollContainerRef.current) {
      activeParaRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentParagraphIndex]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Handle clicking on the timeline to seek
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const time = percentage * state.duration;
    seekTo(Math.max(0, Math.min(time, state.duration)));
  };

  const hasPrev = state.currentChunkIndex > 0;
  const hasNext = state.currentChunkIndex < audioChunks.length - 1;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-orange-500" />
          <span className="text-sm font-medium text-neutral-300">
            Script Player
          </span>
        </div>
      </div>

      {/* Controls - FIXED at top */}
      <div className="shrink-0 px-4 py-3 bg-neutral-900 border-b border-neutral-800 flex items-center justify-center gap-2">
        {/* Skip Previous */}
        <button
          onClick={skipToPrevChunk}
          disabled={!hasPrev || state.isLoading}
          className={cn(
            "p-2 rounded-lg transition-all",
            hasPrev && !state.isLoading
              ? "hover:bg-white/10 text-neutral-300 hover:text-white"
              : "text-neutral-600 cursor-not-allowed",
          )}
        >
          <SkipBack className="w-4 h-4" />
        </button>

        {/* Play/Pause */}
        <button
          onClick={togglePlay}
          disabled={state.isLoading}
          className={cn(
            "p-3 rounded-full transition-all shadow-lg",
            state.isLoading
              ? "bg-neutral-700 cursor-wait"
              : "bg-orange-600 hover:bg-orange-500 hover:scale-105 shadow-orange-900/30",
          )}
        >
          {state.isLoading ? (
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          ) : state.isPlaying ? (
            <Pause className="w-5 h-5 text-white fill-current" />
          ) : (
            <Play className="w-5 h-5 text-white fill-current ml-0.5" />
          )}
        </button>

        {/* Skip Next */}
        <button
          onClick={skipToNextChunk}
          disabled={!hasNext || state.isLoading}
          className={cn(
            "p-2 rounded-lg transition-all",
            hasNext && !state.isLoading
              ? "hover:bg-white/10 text-neutral-300 hover:text-white"
              : "text-neutral-600 cursor-not-allowed",
          )}
        >
          <SkipForward className="w-4 h-4" />
        </button>

        {/* Speed Control */}
        <div className="relative ml-2">
          <button
            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-medium transition-all"
          >
            {playbackSpeed}x
            <ChevronDown
              className={cn(
                "w-3 h-3 transition-transform",
                showSpeedMenu && "rotate-180",
              )}
            />
          </button>

          {showSpeedMenu && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl overflow-hidden z-50">
              {PLAYBACK_SPEEDS.map((speed) => (
                <button
                  key={speed}
                  onClick={() => {
                    setPlaybackSpeed(speed);
                    setShowSpeedMenu(false);
                  }}
                  className={cn(
                    "block w-full px-4 py-1.5 text-xs text-left transition-colors",
                    speed === playbackSpeed
                      ? "bg-orange-600 text-white"
                      : "text-neutral-300 hover:bg-neutral-700 hover:text-white",
                  )}
                >
                  {speed}x
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Clickable Progress Bar - FIXED below controls */}
      <div className="shrink-0 px-4 py-2 bg-neutral-900/80 border-b border-neutral-800">
        <div className="flex items-center gap-2 text-[10px] text-neutral-500">
          <span className="w-8">{formatTime(state.totalTime)}</span>
          <div
            className="flex-1 h-2 bg-neutral-800 rounded-full overflow-hidden cursor-pointer group"
            onClick={handleTimelineClick}
          >
            <div
              className="h-full bg-orange-500 transition-all duration-100 relative"
              style={{
                width: `${(state.totalTime / (state.duration || 1)) * 100}%`,
              }}
            >
              {/* Playhead */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
          <span className="w-8 text-right">{formatTime(state.duration)}</span>
        </div>
      </div>

      {/* Transcript Area - SCROLLABLE */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3 custom-scrollbar min-h-0"
      >
        {paragraphs.map((para, i) => (
          <div
            key={i}
            ref={i === currentParagraphIndex ? activeParaRef : null}
            className={cn(
              "p-3 rounded-lg text-sm leading-relaxed transition-all duration-300",
              i === currentParagraphIndex
                ? "bg-orange-900/30 text-neutral-100 border border-orange-700/50"
                : "bg-neutral-900/50 text-neutral-500 border border-transparent",
            )}
          >
            {para}
          </div>
        ))}
      </div>

      {/* Current Shot Indicator - at bottom */}
      {currentShot && (
        <div className="shrink-0 px-4 py-2 bg-neutral-900/50 border-t border-neutral-800">
          <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">
            Now Playing: Shot {currentShot.segment_index + 1}
          </div>
          <div className="text-xs text-neutral-400 line-clamp-2">
            {currentShot.summary || currentShot.text.substring(0, 100)}
          </div>
        </div>
      )}
    </div>
  );
}
