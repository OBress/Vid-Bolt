"use client";

import { useState, useRef, useEffect } from "react";
import {
  ArrowLeft,
  Check,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Video,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export interface AVScriptItem {
  timestamp: string;
  visual: string;
  audio: string;
}

interface Step4AVVerificationProps {
  audioUrl: string | null;
  avScript: AVScriptItem[];
  onConfirm: () => void;
  onBack: () => void;
  isLocked?: boolean;
  lockedMessage?: string;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function Step4AVVerification({
  audioUrl,
  avScript,
  onConfirm,
  onBack,
  isLocked,
  lockedMessage,
}: Step4AVVerificationProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [activeSegment, setActiveSegment] = useState<number | null>(null);

  // Handle audio loaded
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoading(false);
      setHasError(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleError = () => {
      setHasError(true);
      setIsLoading(false);
      setIsPlaying(false);
    };

    const handleCanPlay = () => {
      setIsLoading(false);
    };

    const handleWaiting = () => {
      setIsLoading(true);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("waiting", handleWaiting);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("waiting", handleWaiting);
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (isLocked || !audioRef.current || hasError) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {
        setHasError(true);
      });
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || hasError) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * duration;

    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const hasValidAudio = audioUrl && audioUrl !== "/placeholder-audio.mp3";

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Hidden audio element */}
      {hasValidAudio && (
        <audio ref={audioRef} src={audioUrl} preload="metadata" />
      )}

      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-full text-orange-500 text-xs font-mono uppercase tracking-widest">
          <Video className="w-3 h-3" />
          Step 8 of 10
        </div>
        <h2 className="text-3xl font-bold tracking-tight">
          Verify Audio & AV Script
        </h2>
        <p className="text-neutral-500 text-sm max-w-md">
          Review the generated audio and visual timeline before video assembly.
        </p>
      </div>

      {/* Audio player */}
      <div
        className={`w-full bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 ${
          isLocked ? "opacity-50" : ""
        }`}
      >
        {!hasValidAudio ? (
          <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-yellow-500">
                No audio available
              </p>
              <p className="text-xs text-yellow-500/70">
                Audio generation may have failed or is still in progress.
              </p>
            </div>
          </div>
        ) : hasError ? (
          <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-500">
                Failed to load audio
              </p>
              <p className="text-xs text-red-500/70">
                The audio file could not be loaded. Please try again.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <button
              onClick={togglePlay}
              disabled={isLocked || isLoading}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                isLocked || isLoading
                  ? "bg-neutral-800 cursor-not-allowed"
                  : "bg-orange-500 hover:bg-orange-400"
              }`}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-5 h-5 text-white" />
              ) : (
                <Play className="w-5 h-5 text-white ml-0.5" />
              )}
            </button>

            <div className="flex-1">
              <div
                className="h-2 bg-neutral-800 rounded-full overflow-hidden cursor-pointer"
                onClick={handleProgressClick}
              >
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-orange-400 rounded-full transition-all duration-100"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between mt-1 text-[10px] font-mono text-neutral-500">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <button
              onClick={toggleMute}
              className="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
            >
              {isMuted ? (
                <VolumeX className="w-5 h-5 text-neutral-500" />
              ) : (
                <Volume2 className="w-5 h-5 text-neutral-500" />
              )}
            </button>
          </div>
        )}
      </div>

      {/* AV Script timeline */}
      <div className={`w-full ${isLocked ? "opacity-50" : ""}`}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-mono text-neutral-500 uppercase tracking-wider">
            AV Script Timeline
          </span>
          <span className="text-xs text-neutral-600">
            {avScript.length} segments
          </span>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
          {avScript.map((item, index) => (
            <div
              key={index}
              onClick={() => {
                if (isLocked) return;
                setActiveSegment(activeSegment === index ? null : index);
              }}
              className={`
                p-3 rounded-lg border transition-all duration-200
                ${isLocked ? "cursor-not-allowed" : "cursor-pointer"}
                ${
                  activeSegment === index
                    ? "bg-orange-500/10 border-orange-500/50"
                    : "bg-neutral-900/50 border-neutral-800 hover:border-neutral-700"
                }
              `}
            >
              <div className="flex items-start gap-3">
                <span className="text-[10px] font-mono text-orange-500 bg-orange-500/10 px-2 py-1 rounded whitespace-nowrap">
                  {item.timestamp}
                </span>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Video className="w-3 h-3 text-blue-400" />
                    <span className="text-xs text-neutral-300">
                      {item.visual}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-3 h-3 text-green-400" />
                    <span className="text-xs text-neutral-500">
                      {item.audio}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4 w-full">
        {isLocked ? (
          <div className="w-full h-12 flex items-center justify-center bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-500 font-mono text-xs uppercase tracking-widest">
            {lockedMessage}
          </div>
        ) : (
          <>
            <Button
              onClick={onBack}
              variant="outline"
              className="flex-1 h-12 border-neutral-700 text-neutral-400 hover:text-white hover:bg-neutral-800 gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <Button
              onClick={onConfirm}
              className="flex-[2] h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold uppercase tracking-widest gap-2"
            >
              <Check className="w-4 h-4" />
              Generate Video
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
