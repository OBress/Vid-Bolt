import { useMemo } from "react";
import { AudioChunk } from "@/types/video";

interface AudioTimelineProps {
  chunks: AudioChunk[];
  totalDuration: number;
  currentTime: number;
  onSeek: (time: number) => void;
}

export function AudioTimeline({
  chunks,
  totalDuration,
  currentTime,
  onSeek,
}: AudioTimelineProps) {
  // Calculate width percentages for each chunk
  const chunkWidths = useMemo(() => {
    if (totalDuration === 0) return chunks.map(() => 0);
    return chunks.map(
      (chunk) => ((chunk.duration_seconds || 0) / totalDuration) * 100
    );
  }, [chunks, totalDuration]);

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const time = percentage * totalDuration;
    onSeek(time);
  };

  return (
    <div className="w-full px-4 py-6 bg-neutral-900/50 border-t border-white/10 backdrop-blur-md">
      <div className="max-w-4xl mx-auto space-y-2">
        {/* Timestamp indicators */}
        <div className="flex justify-between text-xs font-mono text-neutral-500">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(totalDuration)}</span>
        </div>

        {/* Timeline Bar */}
        <div
          className="relative h-12 bg-neutral-800 rounded-lg overflow-hidden cursor-pointer group"
          onClick={handleTimelineClick}
        >
          {/* Chunks background */}
          <div className="absolute inset-0 flex">
            {chunks.map((chunk, i) => (
              <div
                key={i}
                className="h-full border-r border-black/20 last:border-0 relative overflow-hidden"
                style={{ width: `${chunkWidths[i]}%` }}
              >
                {/* Waveform placeholder visual */}
                <div className="absolute inset-y-0 inset-x-1 flex items-center justify-center gap-[2px] opacity-20">
                  {[...Array(10)].map((_, j) => (
                    <div
                      key={j}
                      className="w-1 bg-white rounded-full"
                      style={{ height: `${20 + Math.random() * 60}%` }}
                    />
                  ))}
                </div>
                <div className="absolute bottom-1 left-2 text-[10px] font-mono text-neutral-500 truncate max-w-full px-1">
                  {i + 1}
                </div>
              </div>
            ))}
          </div>

          {/* Progress Overlay */}
          <div
            className="absolute top-0 left-0 h-full bg-orange-500/20 pointer-events-none transition-all duration-100 ease-linear border-r-2 border-orange-500"
            style={{ width: `${(currentTime / (totalDuration || 1)) * 100}%` }}
          />

          {/* Hover Indicator */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-white/5 pointer-events-none" />
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
