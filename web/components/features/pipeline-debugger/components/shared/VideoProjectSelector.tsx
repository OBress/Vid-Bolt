"use client";

/**
 * Video Project Selector
 * ============================================================================
 * Dropdown for selecting a video project to inspect in the Pipeline Debugger.
 * Fetches video projects and displays them with status indicators.
 */

import { useState, useEffect, useMemo } from "react";
import { Search, ChevronDown, Film, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface VideoProject {
  id: string;
  name: string;
  current_stage: string;
  created_at: string;
  updated_at: string;
  idea?: string;
}

interface VideoProjectSelectorProps {
  selectedVideoId: string | null;
  onSelect: (videoId: string) => void;
  className?: string;
}

export function VideoProjectSelector({
  selectedVideoId,
  onSelect,
  className = "",
}: VideoProjectSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [videos, setVideos] = useState<VideoProject[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch video projects (need userId for the API)
  useEffect(() => {
    async function fetchVideos() {
      setIsLoading(true);
      try {
        // Get current user ID from Supabase auth
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.error("[VideoProjectSelector] Not authenticated");
          setIsLoading(false);
          return;
        }

        const response = await fetch(`/api/videos?userId=${user.id}&limit=100`);
        if (response.ok) {
          const data = await response.json();
          setVideos(data.videos || []);
        }
      } catch (err) {
        console.error("[VideoProjectSelector] Failed to fetch videos:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchVideos();
  }, []);

  const filteredVideos = useMemo(() => {
    if (!search.trim()) return videos;
    const q = search.toLowerCase();
    return videos.filter(
      (v) =>
        v.name?.toLowerCase().includes(q) ||
        v.idea?.toLowerCase().includes(q) ||
        v.current_stage?.toLowerCase().includes(q)
    );
  }, [videos, search]);

  const selectedVideo = videos.find((v) => v.id === selectedVideoId);

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 transition-colors text-sm w-full max-w-xs"
      >
        <Film className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
        <span className="text-neutral-300 truncate flex-1 text-left">
          {selectedVideo?.name || "Select video..."}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-neutral-500 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-[60]"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full right-0 mt-1 w-80 max-h-80 rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl z-[70] overflow-hidden">
            {/* Search */}
            <div className="p-2 border-b border-neutral-800">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search videos..."
                  className="w-full pl-7 pr-3 py-1.5 text-sm bg-neutral-800 border border-neutral-700 rounded-md text-neutral-300 placeholder-neutral-600 focus:outline-none focus:border-neutral-600"
                  autoFocus
                />
              </div>
            </div>

            {/* List */}
            <div className="max-h-60 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-4 h-4 text-neutral-500 animate-spin" />
                </div>
              ) : filteredVideos.length === 0 ? (
                <div className="text-center py-8 text-neutral-500 text-sm">
                  No videos found
                </div>
              ) : (
                filteredVideos.map((video) => (
                  <button
                    key={video.id}
                    onClick={() => {
                      onSelect(video.id);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 hover:bg-neutral-800 transition-colors flex items-center gap-2 ${
                      video.id === selectedVideoId ? "bg-neutral-800/50" : ""
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-neutral-200 truncate">
                        {video.name || "Untitled"}
                      </div>
                      <div className="text-xs text-neutral-500 flex items-center gap-2">
                        <span className="capitalize">{video.current_stage?.replace("_", " ")}</span>
                        <span>·</span>
                        <span>{new Date(video.updated_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <StageDot stage={video.current_stage} />
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StageDot({ stage }: { stage: string }) {
  const isComplete = stage === "completed" || stage === "export";
  const isError = stage === "failed";
  const color = isComplete
    ? "bg-green-400"
    : isError
    ? "bg-red-400"
    : "bg-amber-400";

  return <span className={`w-2 h-2 rounded-full ${color} flex-shrink-0`} />;
}
