"use client";

import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { SceneReviewSidebar } from "./scene-review/SceneReviewSidebar";
import { SceneList } from "./scene-review/SceneList";
import { MediaEditModal } from "./scene-review/MediaEditModal";
import { Save, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GeneratedMedia, RoutingTag, SoundEffect } from "@/types/video";
import type { ImageAsset } from "@/lib/services/motion-graphics/pipeline-motion-graphics";

// Shot data type (from av-script worker - ShotPart1)
export interface ShotData {
  segment_index: number;
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  content_type: string;
  media_type?: "image" | "video" | "motiongraphic";
  text: string;
  summary?: string;
  character_refs?: string[];
  location_refs?: string[];
  object_refs?: string[];
  // NEW: Routing tags from Step 5
  visual_source?: 'ai_video' | 'motiongraphic';
  visual_description?: string;
  visual_elements?: RoutingTag[];
  sound_effects?: SoundEffect[];
}

// Asset registry from outline
interface AssetRegistry {
  characters?: Array<{ id: string; name: string; role: string }>;
  locations?: Array<{ id: string; name: string; essence: string }>;
  objects?: Array<{ id: string; name: string; type: string }>;
}

interface Step6SceneReviewProps {
  videoId: string;
  projectId: string;
  shots: ShotData[];
  outlineAssets?: AssetRegistry;
  generatedMedia?: GeneratedMedia[];
  gpuEnabled?: boolean;
  onUpdateMedia: (media: GeneratedMedia[]) => Promise<void>;
  onContinue: () => void;
  onBack: () => void;
  isLocked?: boolean;
  lockedMessage?: string;
}

export function Step6SceneReview({
  videoId,
  projectId: _projectId,
  shots = [],
  outlineAssets: _outlineAssets,
  generatedMedia = [],
  gpuEnabled = true,
  onUpdateMedia,
  onContinue: _onContinue,
  onBack,
  isLocked: _isLocked,
  lockedMessage: _lockedMessage,
}: Step6SceneReviewProps) {
  // =========================================================================
  // STATE
  // =========================================================================

  // Convert generatedMedia array to Map for efficient lookup
  const [mediaMap, setMediaMap] = useState<Map<number, GeneratedMedia>>(() => {
    const map = new Map<number, GeneratedMedia>();
    generatedMedia.forEach((m) => map.set(m.shot_index, m));
    return map;
  });

  // Track pending changes (not yet saved to database)
  const [pendingChanges, setPendingChanges] = useState<
    Map<number, GeneratedMedia>
  >(new Map());

  // Track which shots are currently generating
  const [generatingShots, setGeneratingShots] = useState<Set<number>>(
    new Set(),
  );

  // Currently selected shot for highlighting
  const [selectedShotIndex, setSelectedShotIndex] = useState<number | null>(
    null,
  );

  // Modal state
  const [editingShotIndex, setEditingShotIndex] = useState<number | null>(null);

  // Saving state
  const [isSaving, setIsSaving] = useState(false);

  // Update mediaMap when generatedMedia prop changes
  useEffect(() => {
    const map = new Map<number, GeneratedMedia>();
    generatedMedia.forEach((m) => map.set(m.shot_index, m));
    setMediaMap(map);
  }, [generatedMedia]);

  // =========================================================================
  // COMPUTED VALUES
  // =========================================================================

  // Get the shot being edited
  const editingShot = useMemo(
    () =>
      editingShotIndex !== null
        ? shots.find((s) => s.segment_index === editingShotIndex)
        : null,
    [editingShotIndex, shots],
  );

  // Get media for the shot being edited (pending changes take priority)
  const editingMedia = useMemo(
    () =>
      editingShotIndex !== null
        ? pendingChanges.get(editingShotIndex) ||
          mediaMap.get(editingShotIndex) ||
          null
        : null,
    [editingShotIndex, pendingChanges, mediaMap],
  );

  // Pending changes count
  const pendingChangesCount = pendingChanges.size;

  // =========================================================================
  // HANDLERS
  // =========================================================================

  // Open edit modal for a shot
  const handleEditShot = useCallback((shotIndex: number) => {
    setEditingShotIndex(shotIndex);
  }, []);

  // Close edit modal
  const handleCloseEdit = useCallback(() => {
    setEditingShotIndex(null);
  }, []);

  // Save changes from edit modal to pending changes
  const handleSaveEdit = useCallback((updatedMedia: GeneratedMedia) => {
    setPendingChanges((prev) => {
      const newMap = new Map(prev);
      newMap.set(updatedMedia.shot_index, updatedMedia);
      return newMap;
    });
  }, []);

  // Select a shot (for highlighting)
  const handleSelectShot = useCallback((shotIndex: number) => {
    setSelectedShotIndex(shotIndex);
  }, []);

  // Determine generation type from routing tags
  const getGenerationType = useCallback((elements?: RoutingTag[]): 'image' | 'video' | 'motiongraphic' | 'stock' => {
    if (!elements || elements.length === 0) return 'image';
    
    // Stock - already assigned in Step 5, skip generation
    if (elements.some(e => e.startsWith('stock_'))) return 'stock';
    
    // AI Video
    if (elements.includes('ai_video')) return 'video';
    
    // AI Image
    if (elements.includes('ai_image')) return 'image';
    
    // Remotion/Motion Graphics
    if (elements.some(e => e.startsWith('remotion_'))) return 'motiongraphic';
    
    return 'image';
  }, []);

  // =========================================================================
  // IMAGE ASSET COLLECTION (for MG prompt enrichment)
  // =========================================================================

  /**
   * Collect R2 image/video URLs from generated media for a given shot.
   * Used to enrich motion graphic prompts with real asset references.
   */
  const collectImageAssets = useCallback(
    (shotIndex: number): ImageAsset[] => {
      const assets: ImageAsset[] = [];
      const media = pendingChanges.get(shotIndex) || mediaMap.get(shotIndex);

      if (!media) return assets;

      // Primary media URL
      if (media.media_url && media.generation_status === 'completed') {
        assets.push({
          url: media.media_url,
          description: media.visual_prompt || 'Generated image',
          suggestedUsage: media.media_type === 'video'
            ? 'Use as the main video background with <OffthreadVideo src={url} />'
            : 'Use as the main background image, apply slow Ken Burns zoom-in over the duration',
        });
      }

      // Multi-image items
      if (media.media_items && media.media_items.length > 0) {
        media.media_items.forEach((item, i) => {
          if (item.media_url && item.generation_status === 'completed') {
            assets.push({
              url: item.media_url,
              description: item.visual_prompt || `Image ${i + 1}`,
              suggestedUsage: `Layer or transition element ${i + 1}`,
            });
          }
        });
      }

      // Keyframe images
      if (media.keyframes?.start?.image_url) {
        assets.push({
          url: media.keyframes.start.image_url,
          description: media.keyframes.start.prompt || 'Start keyframe',
          suggestedUsage: 'Reference keyframe — use as starting visual state',
        });
      }

      return assets;
    },
    [pendingChanges, mediaMap]
  );

  // Track failed shots for Media Issues panel
  const failedShotsRef = useRef<number[]>([]);

  // =========================================================================
  // GENERATION HANDLERS
  // =========================================================================

  // Generate shot using routing-based endpoints
  const handleGenerateShot = useCallback(
    async (shotIndex: number) => {
      // Add to generating set
      setGeneratingShots((prev) => new Set(prev).add(shotIndex));

      // Get the shot and any existing/pending media
      const shot = shots.find((s) => s.segment_index === shotIndex);
      if (!shot) {
        console.error(`[Step6] Shot ${shotIndex} not found`);
        setGeneratingShots((prev) => {
          const newSet = new Set(prev);
          newSet.delete(shotIndex);
          return newSet;
        });
        return;
      }

      const existingMedia = pendingChanges.get(shotIndex) || mediaMap.get(shotIndex);
      const generationType = getGenerationType(shot.visual_elements);

      console.log(`[Step6] Generating shot ${shotIndex} with type: ${generationType}`);

      // Stock media - skip generation, already assigned in Step 5
      if (generationType === 'stock') {
        console.log(`[Step6] Shot ${shotIndex} uses stock media, skipping generation`);
        setGeneratingShots((prev) => {
          const newSet = new Set(prev);
          newSet.delete(shotIndex);
          return newSet;
        });
        return;
      }

      // GPU disabled - skip AI/motion graphic generation
      if (!gpuEnabled && ['image', 'video', 'motiongraphic'].includes(generationType)) {
        console.log(`[Step6] GPU disabled, skipping ${generationType} generation for shot ${shotIndex}`);
        setGeneratingShots((prev) => {
          const newSet = new Set(prev);
          newSet.delete(shotIndex);
          return newSet;
        });
        return;
      }

      try {
        let response: Response;
        const prompt = existingMedia?.visual_prompt || shot.summary || shot.text.substring(0, 200);

        if (generationType === 'video') {
          // Video requires keyframe
          const keyframeUrl = existingMedia?.keyframes?.start?.image_url;
          if (!keyframeUrl) {
            throw new Error('Keyframe image required for video generation. Please generate a start frame first.');
          }
          response = await fetch(`/api/videos/${videoId}/generate/video`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              shotIndex,
              prompt,
              keyframeUrl,
            }),
          });
        } else if (generationType === 'motiongraphic') {
          // Collect R2 image assets for prompt enrichment
          const imageAssets = collectImageAssets(shotIndex);
          const routingTags = shot.visual_elements || [];

          // Determine context hint from routing tags
          let contextHint: string | undefined;
          if (routingTags.includes('remotion_overlay')) contextHint = 'text/graphics overlay';
          else if (routingTags.includes('remotion_image_manipulation')) contextHint = 'image manipulation with Ken Burns/montage';
          else if (routingTags.includes('remotion_video_manipulation')) contextHint = 'video annotation/overlay';

          response = await fetch(`/api/videos/${videoId}/generate/motiongraphic`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              shotIndex,
              prompt,
              duration: shot.duration_seconds,
              routingTags,
              imageAssets,
              contextHint,
            }),
          });
        } else {
          // Default: image generation
          response = await fetch(`/api/videos/${videoId}/generate/image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              shotIndex,
              prompt,
            }),
          });
        }

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to generate media');
        }

        const result = await response.json();
        console.log(`[Step6] Shot ${shotIndex} generation result:`, result);

        // Create pending media entry
        const generatedItem: GeneratedMedia = {
          shot_index: shotIndex,
          media_type: generationType === 'motiongraphic' ? 'motiongraphic' : generationType === 'video' ? 'video' : 'image',
          generation_status: generationType === 'motiongraphic' ? 'completed' : 'generating',
          visual_prompt: prompt,
          visual_elements: shot.visual_elements,
          visual_description: shot.visual_description,
          // Store Remotion code for motion graphics
          ...(generationType === 'motiongraphic' && result.remotion_code ? {
            media_url: `remotion://${shotIndex}`, // Marker URL for Remotion-rendered content
          } : {}),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        // Store remotion_code in metadata if available
        if (result.remotion_code) {
          (generatedItem as GeneratedMedia & { remotion_code?: string }).remotion_code = result.remotion_code;
        }

        setPendingChanges((prev) => {
          const newMap = new Map(prev);
          newMap.set(shotIndex, generatedItem);
          return newMap;
        });

        console.log(`[Step6] Shot ${shotIndex} generation triggered, taskId: ${result.taskId}`);
      } catch (error) {
        console.error(`[Step6] Shot ${shotIndex} generation failed:`, error);
        // Track failed shot for Media Issues panel
        failedShotsRef.current = [...failedShotsRef.current, shotIndex];

        const errorItem: GeneratedMedia = {
          shot_index: shotIndex,
          media_type: generationType === 'motiongraphic' ? 'motiongraphic' : generationType === 'video' ? 'video' : 'image',
          generation_status: "failed",
          visual_prompt: existingMedia?.visual_prompt || shot.summary || "",
          error_message: error instanceof Error ? error.message : 'Unknown error',
          updated_at: new Date().toISOString(),
        };
        setPendingChanges((prev) => {
          const newMap = new Map(prev);
          newMap.set(shotIndex, errorItem);
          return newMap;
        });
      } finally {
        setGeneratingShots((prev) => {
          const newSet = new Set(prev);
          newSet.delete(shotIndex);
          return newSet;
        });
      }
    },
    [shots, mediaMap, pendingChanges, videoId, getGenerationType, gpuEnabled, collectImageAssets],
  );

  // =========================================================================
  // PARALLELIZED GENERATE ALL (with dependency ordering)
  // =========================================================================

  const handleGenerateAll = useCallback(async () => {
    console.log("[Step6] Generate all shots (parallelized)");

    // Find all shots without completed media
    const pendingShotsList = shots.filter((shot) => {
      const media =
        pendingChanges.get(shot.segment_index) ||
        mediaMap.get(shot.segment_index);
      // For motiongraphics, check if remotion_code exists; for others, check media_url
      const isCompleted = media?.generation_status === 'completed' && media?.media_url;
      return !isCompleted;
    });

    if (pendingShotsList.length === 0) {
      console.log("[Step6] No pending shots to generate");
      return;
    }

    // Separate into two phases: images/video first, then motion graphics
    // This ensures R2 URLs are available before MG prompts need them
    const phase1Shots: ShotData[] = []; // images + video
    const phase2Shots: ShotData[] = []; // motion graphics (depend on images)

    pendingShotsList.forEach((shot) => {
      const genType = getGenerationType(shot.visual_elements);
      if (genType === 'motiongraphic') {
        phase2Shots.push(shot);
      } else if (genType !== 'stock') {
        phase1Shots.push(shot);
      }
    });

    console.log(`[Step6] Generation plan: Phase 1 (images/video): ${phase1Shots.length}, Phase 2 (MG): ${phase2Shots.length}`);

    // Concurrency-limited parallel execution
    const CONCURRENCY_LIMIT = 3;

    const runWithConcurrency = async (shotList: ShotData[]) => {
      const results: PromiseSettledResult<void>[] = [];
      const queue = [...shotList];
      const active: Promise<void>[] = [];

      while (queue.length > 0 || active.length > 0) {
        // Fill up to concurrency limit
        while (queue.length > 0 && active.length < CONCURRENCY_LIMIT) {
          const shot = queue.shift()!;
          const promise = handleGenerateShot(shot.segment_index).then(
            () => { /* resolved */ },
            () => { /* rejected - error already handled in handleGenerateShot */ }
          );
          active.push(promise);
        }

        // Wait for at least one to complete
        if (active.length > 0) {
          await Promise.race(active);
          // Remove completed promises
          for (let i = active.length - 1; i >= 0; i--) {
            const result = await Promise.race([
              active[i].then(() => 'done' as const),
              Promise.resolve('pending' as const),
            ]);
            if (result === 'done') {
              results.push({ status: 'fulfilled', value: undefined });
              active.splice(i, 1);
            }
          }
        }
      }

      return results;
    };

    // Phase 1: Generate all images and videos first
    if (phase1Shots.length > 0) {
      console.log(`[Step6] Phase 1: Generating ${phase1Shots.length} images/videos...`);
      await runWithConcurrency(phase1Shots);
      console.log(`[Step6] Phase 1 complete`);
    }

    // Phase 2: Generate motion graphics (images are now available for prompt enrichment)
    if (phase2Shots.length > 0) {
      console.log(`[Step6] Phase 2: Generating ${phase2Shots.length} motion graphics...`);
      await runWithConcurrency(phase2Shots);
      console.log(`[Step6] Phase 2 complete`);
    }

    console.log(`[Step6] All generation complete. Failed shots: ${failedShotsRef.current.length}`);
  }, [shots, mediaMap, pendingChanges, handleGenerateShot, getGenerationType]);

  // Save all pending changes to database
  const handleSaveAll = useCallback(async () => {
    if (pendingChangesCount === 0) return;

    setIsSaving(true);
    console.log(`[Step6] Saving ${pendingChangesCount} changes...`);

    try {
      // Merge pending changes with existing media
      const allMedia: GeneratedMedia[] = [];
      const mergedMap = new Map(mediaMap);

      pendingChanges.forEach((media, index) => {
        mergedMap.set(index, media);
      });

      mergedMap.forEach((media) => {
        allMedia.push(media);
      });

      // Sort by shot index
      allMedia.sort((a, b) => a.shot_index - b.shot_index);

      // Call the update callback
      await onUpdateMedia(allMedia);

      // Clear pending changes and update local map
      setPendingChanges(new Map());
      setMediaMap(mergedMap);

      console.log("[Step6] Save complete");
    } catch (error) {
      console.error("[Step6] Save failed:", error);
    } finally {
      setIsSaving(false);
    }
  }, [pendingChangesCount, mediaMap, pendingChanges, onUpdateMedia]);

  // Regenerate from modal
  const handleRegenerateFromModal = useCallback(
    (shotIndex: number) => {
      handleGenerateShot(shotIndex);
    },
    [handleGenerateShot],
  );

  // =========================================================================
  // RENDER
  // =========================================================================

  // Empty state if no shots
  if (shots.length === 0) {
    return (
      <div className="flex flex-col h-full w-full bg-black items-center justify-center p-8">
        <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">
          No Shots Available
        </h2>
        <p className="text-neutral-400 text-center max-w-md">
          Shot data is required to proceed. Please go back to Step 5 and ensure
          the shot breakdown was generated successfully.
        </p>
        <Button
          variant="outline"
          className="mt-6 border-neutral-700 text-neutral-300 hover:bg-neutral-800"
          onClick={onBack}
        >
          Return to Shot Creation
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-black">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-6 py-4 bg-neutral-900 border-b border-neutral-800 flex-shrink-0">
        <div>
          <h2 className="text-lg font-bold text-white">Scene Review</h2>
          <p className="text-sm text-neutral-400">
            Review and generate media for each shot ({shots.length} shots)
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Total duration */}
          <div className="text-xs text-neutral-500 font-medium px-3 py-1 bg-neutral-800 rounded-full">
            Total:{" "}
            <span className="text-neutral-300">
              {Math.floor(
                shots.reduce((sum, s) => sum + s.duration_seconds, 0) / 60,
              )}
              :
              {Math.floor(
                shots.reduce((sum, s) => sum + s.duration_seconds, 0) % 60,
              )
                .toString()
                .padStart(2, "0")}
            </span>
          </div>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <SceneReviewSidebar
          shots={shots}
          mediaMap={mediaMap}
          pendingChanges={pendingChanges}
          generatingShots={generatingShots}
          onGenerateAll={handleGenerateAll}
          onSaveAll={handleSaveAll}
          isSaving={isSaving}
        />

        {/* Content Area */}
        <div className="flex-1 overflow-hidden relative bg-[#0a0a0a]">
          {/* Top gradient overlay for depth */}
          <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-black/50 to-transparent pointer-events-none z-10" />

          <SceneList
            shots={shots}
            mediaMap={mediaMap}
            selectedShotIndex={selectedShotIndex ?? undefined}
            pendingChanges={pendingChanges}
            onSelectShot={handleSelectShot}
            onEditShot={handleEditShot}
            onGenerateShot={handleGenerateShot}
          />
        </div>
      </div>

      {/* Floating Save Button (when there are pending changes) */}
      {pendingChangesCount > 0 && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3">
          <div className="bg-amber-900/90 text-amber-200 px-4 py-2 rounded-lg text-sm font-medium shadow-lg border border-amber-700/50">
            {pendingChangesCount} unsaved{" "}
            {pendingChangesCount === 1 ? "change" : "changes"}
          </div>
          <Button
            onClick={handleSaveAll}
            disabled={isSaving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg px-6 py-5"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save All Changes
              </>
            )}
          </Button>
        </div>
      )}

      {/* Edit Modal */}
      <MediaEditModal
        isOpen={editingShotIndex !== null}
        onClose={handleCloseEdit}
        videoId={videoId}
        shot={editingShot || null}
        media={editingMedia}
        onSave={handleSaveEdit}
        onRegenerate={handleRegenerateFromModal}
        isRegenerating={
          editingShotIndex !== null && generatingShots.has(editingShotIndex)
        }
      />
    </div>
  );
}
