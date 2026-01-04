import { useState, useEffect } from "react";
import { AudioChunk } from "@/types/video";
import { Play, Pause, RefreshCw, Edit2, Check, X } from "lucide-react";

interface AudioCardProps {
  chunk: AudioChunk;
  isActive: boolean;
  isPlaying: boolean;
  onPlayClick: () => void;
  onRegenerate: (text: string) => Promise<void>;
  index: number;
}

export function AudioCard({
  chunk,
  isActive,
  isPlaying,
  onPlayClick,
  onRegenerate,
  index,
}: AudioCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(chunk.text || "");
  const [isRegenerating, setIsRegenerating] = useState(false);

  useEffect(() => {
    setText(chunk.text || "");
  }, [chunk.text]);

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      await onRegenerate(text);
      setIsEditing(false);
    } catch (e) {
      console.error(e);
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div
      className={`
        relative w-full max-w-2xl mx-auto rounded-xl border transition-all duration-300
        ${
          isActive
            ? "bg-neutral-900 border-orange-500/50 shadow-lg shadow-orange-500/10 scale-105 z-10"
            : "bg-neutral-950/50 border-neutral-800 scale-95 opacity-50 blur-[1px]"
        }
      `}
    >
      <div className="p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-neutral-800 text-xs font-mono font-bold text-neutral-400">
              {index + 1}
            </div>
            <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
              {isActive ? "Now Playing" : "Audio Clip"}
            </span>
          </div>

          {isActive && (
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="p-2 hover:bg-neutral-800 rounded-lg transition-colors text-neutral-400 hover:text-white"
              disabled={isRegenerating}
            >
              {isEditing ? (
                <X className="w-4 h-4" />
              ) : (
                <Edit2 className="w-4 h-4" />
              )}
            </button>
          )}
        </div>

        {/* Content */}
        <div className="min-h-[120px] flex items-center justify-center">
          {isEditing ? (
            <div className="w-full space-y-3">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full h-32 bg-black/40 border border-neutral-700 rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-orange-500 transition-colors"
                placeholder="Enter text..."
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRegenerate}
                  disabled={isRegenerating || text === chunk.text}
                  className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-md text-xs font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRegenerating ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <Check className="w-3 h-3" />
                  )}
                  Regenerate Audio
                </button>
              </div>
            </div>
          ) : (
            <p
              className={`text-center leading-relaxed ${
                isActive ? "text-lg text-white" : "text-sm text-neutral-500"
              }`}
            >
              "{chunk.text}"
            </p>
          )}
        </div>

        {/* Play Controls (Only visible if active) */}
        {isActive && !isEditing && (
          <div className="flex justify-center pt-2">
            <button
              onClick={onPlayClick}
              className="w-12 h-12 flex items-center justify-center rounded-full bg-white text-black hover:scale-105 transition-transform"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-1" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
