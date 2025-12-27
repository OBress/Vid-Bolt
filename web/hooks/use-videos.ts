"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { VideoProject, CreateVideoInput, VideoStatus, VideoStage } from "@/types/video";

interface UseVideosOptions {
  projectId?: string;
  status?: VideoStatus;
  stage?: VideoStage;
  limit?: number;
  autoFetch?: boolean;
}

interface UseVideosReturn {
  videos: VideoProject[];
  isLoading: boolean;
  error: string | null;
  fetchVideos: () => Promise<void>;
  createVideo: (input: CreateVideoInput) => Promise<VideoProject | null>;
  updateVideo: (videoId: string, updates: Partial<VideoProject>) => Promise<boolean>;
  deleteVideo: (videoId: string, hard?: boolean) => Promise<boolean>;
  getIncompleteVideos: () => Promise<VideoProject[]>;
}

export function useVideos(options: UseVideosOptions = {}): UseVideosReturn {
  const { projectId, status, stage, limit = 50, autoFetch = true } = options;
  
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [videos, setVideos] = useState<VideoProject[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Use ref to avoid stale closure issues
  const userIdRef = useRef<string | null>(null);

  // Get user on mount
  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        userIdRef.current = user.id;
      }
    }
    getUser();
  }, [supabase]);

  // Fetch videos
  const fetchVideos = useCallback(async () => {
    const currentUserId = userIdRef.current || userId;
    if (!currentUserId) return;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ userId: currentUserId });
      if (projectId) params.append("projectId", projectId);
      if (status) params.append("status", status);
      if (stage) params.append("stage", stage);
      params.append("limit", limit.toString());

      const response = await fetch(`/api/videos?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch videos");
      }

      setVideos(data.videos || []);
    } catch (err) {
      console.error("Failed to fetch videos:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch videos");
    } finally {
      setIsLoading(false);
    }
  }, [userId, projectId, status, stage, limit]);

  // Realtime subscription
  useEffect(() => {
    const currentUserId = userIdRef.current || userId;
    if (!currentUserId) return;

    // Create a channel for realtime updates
    const channel = supabase
      .channel('videos-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'videos',
          filter: projectId ? `project_id=eq.${projectId}` : `user_id=eq.${currentUserId}`,
        },
        (payload) => {
          console.log('Realtime update:', payload);

          if (payload.eventType === 'INSERT') {
            const newVideo = payload.new as VideoProject;
            // Only add if it matches our filters (basic client-side check)
            if (status && newVideo.status !== status) return;
            if (stage && newVideo.current_stage !== stage) return;
            
            setVideos((prev) => [newVideo, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const updatedVideo = payload.new as VideoProject;
            
            setVideos((prev) => {
              // If it no longer matches filters (e.g. status changed and we are filtering by status), remove it
              if (status && updatedVideo.status !== status) {
                 return prev.filter(v => v.id !== updatedVideo.id);
              }
              if (stage && updatedVideo.current_stage !== stage) {
                 return prev.filter(v => v.id !== updatedVideo.id);
              }
              return prev.map((v) => (v.id === updatedVideo.id ? updatedVideo : v));
            });
          } else if (payload.eventType === 'DELETE') {
             setVideos((prev) => prev.filter((v) => v.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, projectId, userId, status, stage]);

  const createVideo = useCallback(async (input: CreateVideoInput): Promise<VideoProject | null> => {
    // Get userId fresh from supabase if not available in state
    let currentUserId = userIdRef.current || userId;
    
    if (!currentUserId) {
      // Try to get user directly
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        currentUserId = user.id;
        userIdRef.current = user.id;
        setUserId(user.id);
      }
    }
    
    if (!currentUserId) {
      console.error("createVideo: User not authenticated");
      setError("User not authenticated");
      return null;
    }

    console.log("createVideo: Creating video with input:", input);

    try {
      const response = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      const data = await response.json();
      console.log("createVideo: Response:", response.status, data);

      if (!response.ok) {
        throw new Error(data.error || "Failed to create video");
      }

      const newVideo = data.video as VideoProject;
      setVideos((prev) => [newVideo, ...prev]);
      return newVideo;
    } catch (err) {
      console.error("Failed to create video:", err);
      setError(err instanceof Error ? err.message : "Failed to create video");
      return null;
    }
  }, [userId, supabase]);

  const updateVideo = useCallback(async (videoId: string, updates: Partial<VideoProject>): Promise<boolean> => {
    try {
      const response = await fetch(`/api/videos/${videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update video");
      }

      setVideos((prev) =>
        prev.map((v) => (v.id === videoId ? data.video : v))
      );
      return true;
    } catch (err) {
      console.error("Failed to update video:", err);
      setError(err instanceof Error ? err.message : "Failed to update video");
      return false;
    }
  }, []);

  const deleteVideo = useCallback(async (videoId: string, hard = false): Promise<boolean> => {
    try {
      const url = hard ? `/api/videos/${videoId}?hard=true` : `/api/videos/${videoId}`;
      const response = await fetch(url, { method: "DELETE" });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete video");
      }

      if (hard) {
        setVideos((prev) => prev.filter((v) => v.id !== videoId));
      } else {
        setVideos((prev) =>
          prev.map((v) => (v.id === videoId ? { ...v, status: "cancelled" as VideoStatus } : v))
        );
      }
      return true;
    } catch (err) {
      console.error("Failed to delete video:", err);
      setError(err instanceof Error ? err.message : "Failed to delete video");
      return false;
    }
  }, []);

  const getIncompleteVideos = useCallback(async (): Promise<VideoProject[]> => {
    try {
      const response = await fetch("/api/videos/incomplete");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch incomplete videos");
      }

      return data.videos || [];
    } catch (err) {
      console.error("Failed to fetch incomplete videos:", err);
      return [];
    }
  }, []);

  // Auto-fetch on mount if enabled (and when userId becomes available)
  useEffect(() => {
    if (autoFetch && userId) {
      fetchVideos();
    }
  }, [autoFetch, userId, fetchVideos]);

  return {
    videos,
    isLoading,
    error,
    fetchVideos,
    createVideo,
    updateVideo,
    deleteVideo,
    getIncompleteVideos,
  };
}
