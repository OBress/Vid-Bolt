import React from "react";
import { AlertCircle } from "lucide-react";
import { useState, useEffect, useRef } from "react";

import { useVideoEditorStore } from "../../../stores/video-editor-store";
import type { TimelineClip } from "../../../types/timeline-v2";
import { useMediaAdaptors } from "../../../contexts/media-adaptor-context";
import { SoundDetails } from "./sound-details";
import { UnifiedTabs } from "../shared/unified-tabs";
import SoundCard, { AudioWithSource } from "./sound-card";
import { getSrcDuration } from "../../../hooks/use-src-duration";

/**
 * Ensure audio track exists
 */
const ensureAudioTrack = () => {
  const state = useVideoEditorStore.getState();
  let trackId = Object.values(state.tracks).find(t => t.type === 'audio')?.id;
  if (!trackId) {
    trackId = state.addTrack('audio');
  }
  return trackId;
};

/**
 * SoundsOverlayPanel Component
 *
 * A panel component that manages sound clips in the editor. It provides functionality for:
 * - Displaying a list of available sound tracks from all configured audio adaptors
 * - Playing/pausing sound previews
 * - Adding sounds to the timeline
 * - Managing selected sound clips and their properties
 *
 * The component switches between two views:
 * 1. Sound library view: Shows available sounds that can be added
 * 2. Sound details view: Shows controls for the currently selected sound clip
 * 
 * Uses Timeline V2 clip-based API directly.
 *
 * @component
 */
const SoundsOverlayPanel: React.FC = () => {
  const [playingTrack, setPlayingTrack] = useState<string | null>(null);
  const [audioTracks, setAudioTracks] = useState<AudioWithSource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string>("all");
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});
  
  const { searchAudio, audioAdaptors } = useMediaAdaptors();
  
  // Use VideoEditorStore for state - get selected audio clip directly
  const selectedClip = useVideoEditorStore(s => {
    const ids = s.selection?.clipIds;
    if (!ids || ids.length !== 1) return null;
    const clip = s.clips[ids[0]];
    return clip?.type === 'audio' ? clip : null;
  }) as TimelineClip | null;
  
  const addClip = useVideoEditorStore(s => s.addClip);
  const selectClip = useVideoEditorStore(s => s.selectClip);
  const currentTime = useVideoEditorStore(s => s.playback?.currentTime || 0);

  /**
   * Load audio tracks from adaptors on component mount
   */
  useEffect(() => {
    const loadAudioTracks = async () => {
      if (audioAdaptors.length === 0) return;
      
      setIsLoading(true);
      try {
        // Search with empty query to get all available audio tracks
        const results = await searchAudio({ query: '' });
        setAudioTracks(results.items);
        setSearchResults(results);
      } catch (error) {
        console.error('Failed to load audio tracks:', error);
        setAudioTracks([]);
        setSearchResults(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadAudioTracks();
  }, [searchAudio, audioAdaptors]);

  /**
   * Initialize audio elements for each sound and handle cleanup
   */
  useEffect(() => {
    audioTracks.forEach((sound: AudioWithSource) => {
      if (sound.file) {
        audioRefs.current[sound.id] = new Audio(sound.file);
      }
    });

    const currentAudioRefs = audioRefs.current;
    return () => {
      Object.values(currentAudioRefs).forEach((audio) => {
        audio.pause();
        audio.currentTime = 0;
      });
    };
  }, [audioTracks]);

  /**
   * Toggles play/pause state for a sound track
   * Ensures only one track plays at a time
   *
   * @param soundId - Unique identifier of the sound to toggle
   */
  const togglePlay = (soundId: string) => {
    const audio = audioRefs.current[soundId];
    if (!audio) {
      console.error('Audio element not found for sound:', soundId);
      return;
    }
    
    if (playingTrack === soundId) {
      audio.pause();
      setPlayingTrack(null);
    } else {
      if (playingTrack && audioRefs.current[playingTrack]) {
        audioRefs.current[playingTrack].pause();
      }
      audio
        .play()
        .catch((error) => console.error("Error playing audio:", error));
      setPlayingTrack(soundId);
    }
  };

  /**
   * Adds a sound clip to the timeline at the current playhead position
   * Calculates duration based on the sound length
   *
   * @param {AudioWithSource} sound - The audio track to add to the timeline
   */
  const handleAddToTimeline = async (sound: AudioWithSource) => {
    // Check if the sound has a valid URL
    if (!sound.file || sound.file.trim() === '') {
      console.error('Cannot add sound to timeline: No URL provided for sound', sound.title);
      alert(`Cannot add "${sound.title}": No audio file URL provided`);
      return;
    }

    // Get actual audio duration using media-parser
    let duration = sound.duration; // fallback to existing duration
    
    try {
      const result = await getSrcDuration(sound.file);
      duration = result.durationInSeconds;
    } catch (error) {
      console.warn("Failed to get audio duration, using fallback:", error);
    }

    const trackId = ensureAudioTrack();
    
    const clipId = addClip({
      trackId,
      startTime: currentTime,
      duration,
      type: 'audio',
      sourceId: sound.file,
      label: sound.title,
      transform: {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        rotation: 0,
        opacity: 1,
        zIndex: 0,
      },
      media: {
        mediaStartTime: 0,
        mediaDuration: duration,
        speed: 1,
        volume: 1,
      },
      data: {
        src: sound.file,
        originalUrl: sound.file,
      },
    });
    
    if (clipId) {
      selectClip(clipId);
    }
  };

  // Filter audio tracks based on active tab
  const filteredAudioTracks = activeTab === "all" 
    ? audioTracks 
    : audioTracks.filter(track => track._source === activeTab);

  return (
    <div className="h-full overflow-y-auto sidepanel-scrollbar p-2">
      {!selectedClip ? (
        <>
          {/* Source Tabs */}
          {searchResults && searchResults.sourceResults && searchResults.sourceResults.length > 0 && (
            <div className="mb-4">
              <UnifiedTabs
                sourceResults={searchResults.sourceResults}
                activeTab={activeTab}
                onTabChange={setActiveTab}
              />
            </div>
          )}

          {/* Audio List */}
          <div>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={`skeleton-${index}`}
                  className="flex items-center gap-3 p-2.5 bg-accent/20 animate-pulse rounded-md"
                >
                    <div className="h-8 w-8 bg-accent rounded-full" />
                    <div className="flex-1 space-y-1">
                      <div className="h-4 bg-accent rounded w-3/4" />
                      <div className="h-3 bg-accent rounded w-1/2" />
                    </div>
                </div>
              ))}
            </div>
          ) : filteredAudioTracks.length > 0 ? (
            <div className="space-y-2">
              {filteredAudioTracks.map((sound) => (
                <SoundCard
                  key={`${sound._source}-${sound.id}`}
                  sound={sound}
                  playingTrack={playingTrack}
                  onTogglePlay={togglePlay}
                  onAddToTimeline={handleAddToTimeline}
                  showSourceBadge={activeTab === "all"}
                  enableTimelineDrag={!selectedClip}
                />
              ))}
            </div>
          ) : audioAdaptors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-center">
              <AlertCircle className="h-8 w-8 mb-2" />
              <p>No audio available</p>
            </div>
          ) : searchResults && searchResults.sourceResults && searchResults.sourceResults.length > 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-center">
              <AlertCircle className="h-8 w-8 mb-2" />
              <p>No audio tracks found{activeTab !== "all" ? ` in ${searchResults.sourceResults.find((s: any) => s.adaptorName === activeTab)?.adaptorDisplayName}` : ""}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-center">
              <AlertCircle className="h-8 w-8 mb-2" />
              <p>No audio tracks found</p>
            </div>
          )}
          </div>
        </>
      ) : (
        <SoundDetails
          clip={selectedClip}
        />
      )}
    </div>
  );
};

export default SoundsOverlayPanel;
