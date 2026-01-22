import { useMemo, useState } from "react";
import { AudioChunk } from "@/types/video";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronDown,
  Loader2,
  Download,
} from "lucide-react";
import { PLAYBACK_SPEEDS, PlaybackSpeed } from "@/hooks/use-sequenced-audio";

interface AudioTimelineProps {
  chunks: AudioChunk[];
  totalDuration: number;
  currentTime: number;
  currentChunkIndex: number;
  isPlaying: boolean;
  isLoading: boolean;
  playbackSpeed: PlaybackSpeed;
  audioUrl?: string | null;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onSkipPrev: () => void;
  onSkipNext: () => void;
  onSpeedChange: (speed: PlaybackSpeed) => void;
}

export function AudioTimeline({
  chunks,
  totalDuration,
  currentTime,
  currentChunkIndex,
  isPlaying,
  isLoading,
  playbackSpeed,
  audioUrl,
  onSeek,
  onTogglePlay,
  onSkipPrev,
  onSkipNext,
  onSpeedChange,
}: AudioTimelineProps) {
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // Calculate width percentages for each chunk based on total duration
  const chunkWidths = useMemo(() => {
    if (totalDuration === 0 || chunks.length === 0) {
      // Equal distribution when durations not loaded yet
      return chunks.map(() => 100 / chunks.length);
    }
    return chunks.map(
      (chunk) =>
        ((chunk.duration_seconds || totalDuration / chunks.length) /
          totalDuration) *
        100,
    );
  }, [chunks, totalDuration]);

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isLoading || totalDuration === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const time = percentage * totalDuration;
    onSeek(time);
  };

  const hasPrev = currentChunkIndex > 0;
  const hasNext = currentChunkIndex < chunks.length - 1;

  return (
    <div className="w-full px-6 py-4 bg-neutral-900/80 border-t border-white/10 backdrop-blur-md">
      <div className="max-w-6xl mx-auto space-y-3">
        {/* Playback Controls Row */}
        <div className="flex items-center justify-center gap-2">
          {/* Skip Previous */}
          <button
            onClick={onSkipPrev}
            disabled={!hasPrev || isLoading}
            className={`p-2 rounded-lg transition-all ${
              hasPrev && !isLoading
                ? "hover:bg-white/10 text-neutral-300 hover:text-white"
                : "text-neutral-600 cursor-not-allowed"
            }`}
            title="Previous section"
          >
            <SkipBack className="w-5 h-5" />
          </button>

          {/* Play/Pause */}
          <button
            onClick={onTogglePlay}
            disabled={isLoading}
            className={`p-3 rounded-full transition-all shadow-lg shadow-orange-900/30 ${
              isLoading
                ? "bg-neutral-700 cursor-wait"
                : "bg-orange-600 hover:bg-orange-500 hover:scale-105"
            } text-white`}
            title={isLoading ? "Loading..." : isPlaying ? "Pause" : "Play"}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
            )}
          </button>

          {/* Skip Next */}
          <button
            onClick={onSkipNext}
            disabled={!hasNext || isLoading}
            className={`p-2 rounded-lg transition-all ${
              hasNext && !isLoading
                ? "hover:bg-white/10 text-neutral-300 hover:text-white"
                : "text-neutral-600 cursor-not-allowed"
            }`}
            title="Next section"
          >
            <SkipForward className="w-5 h-5" />
          </button>

          {/* Download Button */}
          {audioUrl && (
            <a
              href={audioUrl}
              download="combined-audio.mp3"
              className="p-2 rounded-lg transition-all hover:bg-white/10 text-neutral-300 hover:text-white"
              title="Download combined audio"
            >
              <Download className="w-5 h-5" />
            </a>
          )}

          {/* Speed Control */}
          <div className="relative ml-4">
            <button
              onClick={() => setShowSpeedMenu(!showSpeedMenu)}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-sm font-medium transition-all"
            >
              {playbackSpeed}x
              <ChevronDown
                className={`w-3 h-3 transition-transform ${
                  showSpeedMenu ? "rotate-180" : ""
                }`}
              />
            </button>

            {showSpeedMenu && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl overflow-hidden z-50">
                {PLAYBACK_SPEEDS.map((speed) => (
                  <button
                    key={speed}
                    onClick={() => {
                      onSpeedChange(speed);
                      setShowSpeedMenu(false);
                    }}
                    className={`block w-full px-4 py-2 text-sm text-left transition-colors ${
                      speed === playbackSpeed
                        ? "bg-orange-600 text-white"
                        : "text-neutral-300 hover:bg-neutral-700 hover:text-white"
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Chunk Counter */}
          <div className="ml-4 px-3 py-1 bg-neutral-800/50 rounded-full text-xs font-mono text-neutral-400">
            {currentChunkIndex + 1} of {chunks.length}
          </div>
        </div>

        {/* Timeline Bar */}
        <div className="space-y-1">
          {/* Timestamp indicators */}
          <div className="flex justify-between text-xs font-mono text-neutral-500 px-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(totalDuration)}</span>
          </div>

          <div
            className="relative h-10 bg-neutral-800 rounded-lg overflow-hidden cursor-pointer group"
            onClick={handleTimelineClick}
          >
            {/* Chunks background */}
            <div className="absolute inset-0 flex">
              {chunks.map((chunk, i) => (
                <div
                  key={i}
                  className={`h-full border-r border-black/30 last:border-0 relative overflow-hidden ${
                    i === currentChunkIndex ? "bg-orange-900/30" : ""
                  }`}
                  style={{ width: `${chunkWidths[i]}%` }}
                >
                  {/* Waveform placeholder visual - static heights based on index */}
                  <div className="absolute inset-y-0 inset-x-1 flex items-center justify-center gap-[2px] opacity-30">
                    {[30, 55, 40, 70, 45, 60, 35, 50].map((height, j) => (
                      <div
                        key={j}
                        className="w-0.5 bg-white rounded-full"
                        style={{ height: `${height}%` }}
                      />
                    ))}
                  </div>
                  <div className="absolute bottom-1 left-2 text-[9px] font-mono text-neutral-500">
                    {i + 1}
                  </div>
                </div>
              ))}
            </div>

            {/* Progress Overlay */}
            <div
              className="absolute top-0 left-0 h-full bg-orange-500/25 pointer-events-none"
              style={{
                width: `${(currentTime / (totalDuration || 1)) * 100}%`,
              }}
            >
              {/* Playhead */}
              <div className="absolute top-0 right-0 w-0.5 h-full bg-orange-500 shadow-sm shadow-orange-500/50" />
            </div>

            {/* Hover Indicator */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-white/5 pointer-events-none" />
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
