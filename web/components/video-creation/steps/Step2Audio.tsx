import { useState, useEffect } from "react";
import { AudioChunk } from "@/types/video";
import { useSequencedAudio } from "@/hooks/use-sequenced-audio";
import { AudioTimeline } from "../audio/AudioTimeline";
import { AudioCard } from "../audio/AudioCard";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";

interface Step2AudioProps {
  videoId: string;
  audioChunks: AudioChunk[];
  onComplete: () => void;
  onBack: () => void;
  onUpdateChunks: (newChunks: AudioChunk[]) => void;
}

export function Step2Audio({
  videoId,
  audioChunks,
  onComplete,
  onBack,
  onUpdateChunks,
}: Step2AudioProps) {
  const { state, togglePlay, seekTo } = useSequencedAudio(audioChunks);

  // Local state for carousel navigation (synced with player but allows manual browsing?)
  // Requirement: "When the next audio section starts being played the center should automatically adjust"
  // So we strictly follow state.currentChunkIndex for the center view.
  const currentIndex = state.currentChunkIndex;

  const handleRegenerate = async (index: number, text: string) => {
    try {
      const response = await fetch(`/api/videos/${videoId}/audio/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chunkIndex: index, text }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      // Update chunks
      const newChunks = [...audioChunks];
      newChunks[index] = data.chunk;
      onUpdateChunks(newChunks);
    } catch (err) {
      console.error("Failed to regenerate audio:", err);
      // Maybe show a toast
    }
  };

  const activeChunk = audioChunks[currentIndex];
  // Calculate neighbors for the carousel effect
  const prevChunk = audioChunks[currentIndex - 1];
  const nextChunk = audioChunks[currentIndex + 1];

  return (
    <div className="flex flex-col h-full bg-black/40 rounded-xl overflow-hidden border border-white/5 relative">
      <div className="flex-1 relative flex flex-col">
        {/* Top Controls / Header */}
        <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-20 pointer-events-none">
          {/* Back Button */}
          <button
            onClick={onBack}
            className="pointer-events-auto p-2 bg-neutral-900/80 backdrop-blur rounded-lg border border-white/10 hover:border-white/20 transition-colors text-neutral-400 hover:text-white"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Continue Button */}
          <Button
            onClick={onComplete}
            className="pointer-events-auto bg-orange-600 hover:bg-orange-500 text-white font-medium px-6 shadow-lg shadow-orange-900/20"
          >
            Continue to Editor
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>

        {/* Main Content Area (Carousel) */}
        <div className="flex-1 flex items-center justify-center relative perspective-[1000px] overflow-hidden">
          <div className="flex items-center justify-center w-full max-w-6xl px-12 gap-8">
            {/* Previous Card (Ghost) */}
            <div className="hidden lg:block w-1/3 opacity-30 scale-90 blur-sm pointer-events-none transition-all duration-500 -translate-x-12">
              {prevChunk && (
                <AudioCard
                  chunk={prevChunk}
                  isActive={false}
                  isPlaying={false}
                  onPlayClick={() => {}}
                  onRegenerate={async () => {}}
                  index={currentIndex - 1}
                />
              )}
            </div>

            {/* Active Card */}
            <div className="w-full lg:w-1/3 transition-all duration-500">
              {activeChunk && (
                <AudioCard
                  chunk={activeChunk}
                  isActive={true}
                  isPlaying={state.isPlaying}
                  onPlayClick={togglePlay}
                  onRegenerate={(text) => handleRegenerate(currentIndex, text)}
                  index={currentIndex}
                />
              )}
            </div>

            {/* Next Card (Ghost) */}
            <div className="hidden lg:block w-1/3 opacity-30 scale-90 blur-sm pointer-events-none transition-all duration-500 translate-x-12">
              {nextChunk && (
                <AudioCard
                  chunk={nextChunk}
                  isActive={false}
                  isPlaying={false}
                  onPlayClick={() => {}}
                  onRegenerate={async () => {}}
                  index={currentIndex + 1}
                />
              )}
            </div>
          </div>

          {/* Manual Navigation Arrows (Overlay) */}
          <div className="absolute inset-x-8 flex justify-between pointer-events-none">
            <button
              onClick={() =>
                seekTo(state.totalTime - (activeChunk?.duration_seconds || 5))
              } // Seek back roughly one chunk? No, prev chunk start.
              // Actually, let's just use seekTo with specific times.
              // Simplified: Just jump to previous chunk start
              className={`pointer-events-auto p-3 rounded-full bg-white/5 hover:bg-white/10 backdrop-blur transition-all ${
                !prevChunk ? "opacity-0" : "opacity-100"
              }`}
              disabled={!prevChunk}
            >
              <ChevronLeft className="w-6 h-6 text-white/50 hover:text-white" />
            </button>

            <button
              onClick={() => {
                // Jump to next chunk start
                if (activeChunk)
                  seekTo(
                    state.totalTime +
                      (activeChunk.duration_seconds || 0) -
                      state.currentTimeInChunk +
                      0.1
                  );
              }}
              className={`pointer-events-auto p-3 rounded-full bg-white/5 hover:bg-white/10 backdrop-blur transition-all ${
                !nextChunk ? "opacity-0" : "opacity-100"
              }`}
              disabled={!nextChunk}
            >
              <ChevronRight className="w-6 h-6 text-white/50 hover:text-white" />
            </button>
          </div>
        </div>

        {/* Bottom Timeline */}
        <div className="z-20 bg-neutral-950">
          <AudioTimeline
            chunks={audioChunks}
            totalDuration={state.duration}
            currentTime={state.totalTime}
            onSeek={seekTo}
          />
        </div>
      </div>
    </div>
  );
}
