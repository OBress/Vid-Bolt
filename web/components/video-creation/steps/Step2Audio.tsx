import { useState, useEffect } from "react";
import { AudioChunk } from "@/types/video";
import { useSequencedAudio, PlaybackSpeed } from "@/hooks/use-sequenced-audio";
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
  const {
    state,
    togglePlay,
    seekTo,
    skipToPrevChunk,
    skipToNextChunk,
    goToChunk,
    playbackSpeed,
    setPlaybackSpeed,
  } = useSequencedAudio(audioChunks);

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
    }
  };

  const activeChunk = audioChunks[currentIndex];
  const prevChunk = audioChunks[currentIndex - 1];
  const nextChunk = audioChunks[currentIndex + 1];

  // Handle clicking on side cards to navigate
  const handlePrevCardClick = () => {
    if (prevChunk) {
      goToChunk(currentIndex - 1);
    }
  };

  const handleNextCardClick = () => {
    if (nextChunk) {
      goToChunk(currentIndex + 1);
    }
  };

  return (
    <div className="flex flex-col h-full bg-black/40 rounded-xl overflow-hidden border border-white/5 relative">
      <div className="flex-1 relative flex flex-col">
        {/* Top Controls / Header */}
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-20 pointer-events-none">
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
        <div className="flex-1 flex items-center justify-center relative overflow-hidden pt-16 pb-4">
          <div className="flex items-stretch justify-center w-full max-w-7xl px-2 gap-3">
            {/* Previous Card */}
            <div
              className={`hidden lg:flex lg:items-center lg:justify-center w-1/4 transition-all duration-300 ${
                prevChunk
                  ? "cursor-pointer opacity-60 hover:opacity-80"
                  : "opacity-0 pointer-events-none"
              }`}
              onClick={handlePrevCardClick}
            >
              {prevChunk && (
                <AudioCard
                  chunk={prevChunk}
                  isActive={false}
                  isPlaying={false}
                  onPlayClick={() => {}}
                  onRegenerate={async (text) =>
                    handleRegenerate(currentIndex - 1, text)
                  }
                  index={currentIndex - 1}
                  compact
                />
              )}
            </div>

            {/* Active Card */}
            <div className="w-full lg:w-1/2 flex items-center justify-center transition-all duration-300">
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

            {/* Next Card */}
            <div
              className={`hidden lg:flex lg:items-center lg:justify-center w-1/4 transition-all duration-300 ${
                nextChunk
                  ? "cursor-pointer opacity-60 hover:opacity-80"
                  : "opacity-0 pointer-events-none"
              }`}
              onClick={handleNextCardClick}
            >
              {nextChunk && (
                <AudioCard
                  chunk={nextChunk}
                  isActive={false}
                  isPlaying={false}
                  onPlayClick={() => {}}
                  onRegenerate={async (text) =>
                    handleRegenerate(currentIndex + 1, text)
                  }
                  index={currentIndex + 1}
                  compact
                />
              )}
            </div>
          </div>

          {/* Mobile Navigation Arrows */}
          <div className="lg:hidden absolute inset-x-4 flex justify-between pointer-events-none">
            <button
              onClick={handlePrevCardClick}
              className={`pointer-events-auto p-3 rounded-full bg-white/5 hover:bg-white/10 backdrop-blur transition-all ${
                !prevChunk ? "opacity-0" : "opacity-100"
              }`}
              disabled={!prevChunk}
            >
              <ChevronLeft className="w-6 h-6 text-white/50 hover:text-white" />
            </button>

            <button
              onClick={handleNextCardClick}
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
        <div className="z-20">
          <AudioTimeline
            chunks={audioChunks}
            totalDuration={state.duration}
            currentTime={state.totalTime}
            currentChunkIndex={currentIndex}
            isPlaying={state.isPlaying}
            isLoading={state.isLoading}
            playbackSpeed={playbackSpeed}
            onSeek={seekTo}
            onTogglePlay={togglePlay}
            onSkipPrev={skipToPrevChunk}
            onSkipNext={skipToNextChunk}
            onSpeedChange={setPlaybackSpeed}
          />
        </div>
      </div>
    </div>
  );
}
