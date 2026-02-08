import React, { useState, useMemo, useEffect } from "react";
import { AudioChunk, ROUTING_TAG_CONFIG, type RoutingTag } from "@/types/video";
import {
  EntityReference,
  createEntityLookup,
  createStockMediaLookup,
} from "../entity-reference";
import { ShotPlayerPanel } from "../ShotPlayerPanel";
import {
  ChevronRight,
  ChevronDown,
  User,
  Box,
  MapPin,
  MoreHorizontal,
  Smartphone,
  Search,
  Grid,
  Film,
  Edit2,
  Trash2,
  Loader2,
  ArrowRight,
  RefreshCw,
  Save,
  Image,
  Video,
  Layers,
  Check,
  Play,
  Sparkles,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Type for a shot item
type ShotItem = {
  segment_index: number;
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  content_type: string;
  media_type?: "image" | "video" | "motiongraphic" | "ai_generated";
  text: string;
  summary?: string;
  visual_prompt?: string;
  // Visual source for clear UI labeling (binary taxonomy) - LEGACY
  visual_source?: "ai_video" | "motiongraphic";
  // NEW: Descriptive visual intent
  visual_description?: string;
  visual_elements?: import("@/types/video").RoutingTag[];
  // Sound effects with millisecond-precise timing
  sound_effects?: import("@/types/video").SoundEffect[];
  // Number of images AI requested for this shot (for multi-image motiongraphics)
  image_count?: number;
  character_refs?: string[];
  location_refs?: string[];
  object_refs?: string[];
  // Stock media reference from director matching (single image)
  stock_media_ref?: {
    id: string;
    url: string;
    thumbnailUrl: string;
    description: string;
    similarity: number;
  };
  // Stock media references (multiple images when image_count > 1)
  stock_media_refs?: Array<{
    id: string;
    url: string;
    thumbnailUrl: string;
    description: string;
    similarity: number;
  }>;
  // Fallback type when no stock media matched
  fallback_type?: "motiongraphic" | "ai_generated" | "video";
};

// Content type options for the dropdown
const CONTENT_TYPE_OPTIONS = [
  {
    value: "concept",
    label: "Concept",
    color: "bg-purple-900/50 text-purple-300",
  },
  {
    value: "list-item",
    label: "List Item",
    color: "bg-blue-900/50 text-blue-300",
  },
  {
    value: "comparison",
    label: "Comparison",
    color: "bg-amber-900/50 text-amber-300",
  },
  {
    value: "transition",
    label: "Transition",
    color: "bg-neutral-800 text-neutral-400",
  },
  {
    value: "emotional-beat",
    label: "Emotional Beat",
    color: "bg-rose-900/50 text-rose-300",
  },
] as const;

// Descriptions for helper text
const CONTENT_TYPE_DESCRIPTIONS: Record<string, string> = {
  concept:
    "A rich, detailed scene or illustration representing a core idea or theme.",
  "list-item":
    "Focused imagery highlighting a specific point, item, or step in a sequence.",
  comparison:
    "A split-screen or contrasted visual showing difference between two elements.",
  transition:
    "Neutral or abstract imagery used to bridge two distinct topics smoothly.",
  "emotional-beat":
    "Atmospheric, evocative imagery designed to emphasize a feeling or moment.",
};

interface Step5ShotCreationProps {
  onNext: () => void;
  onBack: () => void;
  isLocked?: boolean;
  outlineAssets?: {
    characters?: Array<{
      id: string;
      name: string;
      role: string;
      physicalCharacteristics?: any;
    }>;
    locations?: Array<{ id: string; name: string; essence: string }>;
    objects?: Array<{
      id: string;
      name: string;
      type: string;
      physicalDescription?: any;
    }>;
  };
  avScriptShots?: ShotItem[];
  onUpdateShots?: (shots: ShotItem[]) => Promise<void>;
  audioChunks?: AudioChunk[];
  script?: string;
  stockMediaResults?: Array<{
    id: string;
    title?: string;
    url?: string;
    thumbnailUrl?: string;
    source?: string;
  }> | null;
  assetReferenceImages?: Record<string, string> | null;
}

type ElementType = "all" | "character" | "object" | "location" | "stock";

interface ElementItem {
  id: string;
  type: ElementType;
  name: string;
  image: string | null; // null = placeholder
  prompt?: string;
  originalId?: string; // Reference to outline asset ID
}

export function Step5ShotCreation({
  onNext,
  onBack,
  isLocked = false,
  outlineAssets,
  avScriptShots,
  onUpdateShots,
  audioChunks,
  script,
  stockMediaResults,
  assetReferenceImages,
}: Step5ShotCreationProps) {
  // Debug logging for shot data
  useEffect(() => {
    console.log("[Step5] avScriptShots received:", avScriptShots?.length || 0);
    if (avScriptShots && avScriptShots.length > 0) {
      console.log(
        "[Step5] First shot:",
        JSON.stringify(avScriptShots[0]).slice(0, 200),
      );
    }
  }, [avScriptShots]);
  const [activeTab, setActiveTab] = useState<ElementType>("all");
  const [sidebarMode, setSidebarMode] = useState<"elements" | "player">(
    "elements",
  );
  const [highlightedShotIndex, setHighlightedShotIndex] = useState<
    number | null
  >(null);

  // Convert outline assets to element format, or use mock data as fallback
  const [elements, setElements] = useState<ElementItem[]>(() => {
    const converted: ElementItem[] = [];
    let idCounter = 1;

    if (outlineAssets) {
      // Add characters
      (outlineAssets.characters || []).forEach((char) => {
        converted.push({
          id: String(idCounter++),
          type: "character",
          name: char.name,
          image: assetReferenceImages?.[char.id] || null, // Use reference image if available
          prompt: char.role,
          originalId: char.id,
        });
      });

      // Add locations
      (outlineAssets.locations || []).forEach((loc) => {
        converted.push({
          id: String(idCounter++),
          type: "location",
          name: loc.name,
          image: assetReferenceImages?.[loc.id] || null, // Use reference image if available
          prompt: loc.essence,
          originalId: loc.id,
        });
      });

      // Add objects
      (outlineAssets.objects || []).forEach((obj) => {
        converted.push({
          id: String(idCounter++),
          type: "object",
          name: obj.name,
          image: assetReferenceImages?.[obj.id] || null, // Use reference image if available
          prompt: obj.type,
          originalId: obj.id,
        });
      });
    }

    // Add stock media from Step 2 results
    if (stockMediaResults && stockMediaResults.length > 0) {
      console.log(
        "[Step5] Adding stock media to elements:",
        stockMediaResults.length,
      );
      stockMediaResults.forEach((media) => {
        converted.push({
          id: `stock-${media.id}`,
          type: "stock",
          name: media.title || `Stock ${media.source || "Image"}`,
          image: media.thumbnailUrl || media.url || null,
          originalId: media.id,
        });
      });
    }

    return converted;
  });

  // Sync stockMediaResults prop changes to elements state
  // This is needed because useState initializer only runs once on mount
  useEffect(() => {
    setElements((prevElements) => {
      // Filter out existing stock elements
      const nonStockElements = prevElements.filter((e) => e.type !== "stock");

      // If stock media is null/empty, just remove all stock elements
      if (!stockMediaResults || stockMediaResults.length === 0) {
        if (prevElements.length !== nonStockElements.length) {
          console.log("[Step5] Clearing stale stock elements");
        }
        return nonStockElements;
      }

      console.log(
        "[Step5] Syncing stock media to elements:",
        stockMediaResults.length,
      );

      // Add updated stock media elements
      const stockElements: ElementItem[] = stockMediaResults.map((media) => ({
        id: `stock-${media.id}`,
        type: "stock" as ElementType,
        name: media.title || `Stock ${media.source || "Image"}`,
        image: media.thumbnailUrl || media.url || null,
        originalId: media.id,
      }));

      return [...nonStockElements, ...stockElements];
    });
  }, [stockMediaResults]);

  // Sync assetReferenceImages prop changes to elements state
  // Reference images are generated asynchronously by a background GPU task,
  // so they arrive after the initial elements state is created
  useEffect(() => {
    if (!assetReferenceImages) return;

    console.log(
      "[Step5] Syncing asset reference images to elements:",
      Object.keys(assetReferenceImages).length,
      "images",
    );

    setElements((prevElements) =>
      prevElements.map((el) => {
        if (el.originalId && assetReferenceImages[el.originalId] && !el.image) {
          return { ...el, image: assetReferenceImages[el.originalId] };
        }
        return el;
      }),
    );
  }, [assetReferenceImages]);

  // Check if we have missing elements (outline was lost)
  const hasNoElements = elements.length === 0 && !outlineAssets;

  // Create entity lookup for rendering @(EntityName) references
  const entityLookup = useMemo(
    () => createEntityLookup(outlineAssets),
    [outlineAssets],
  );

  // Create stock media lookup for rendering @(StockMedia:id) references
  const stockMediaLookup = useMemo(
    () => createStockMediaLookup(avScriptShots),
    [avScriptShots],
  );

  // Delete State
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Edit State
  const [editingElement, setEditingElement] = useState<ElementItem | null>(
    null,
  );
  const [editPrompt, setEditPrompt] = useState("");
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Filtering
  const filteredElements =
    activeTab === "all"
      ? elements
      : elements.filter((e) => e.type === activeTab);

  // --- Handlers ---

  const handleDeleteClick = (id: string) => {
    setDeleteId(id);
  };

  const confirmDelete = () => {
    if (deleteId) {
      setElements((prev) => prev.filter((e) => e.id !== deleteId));
      setDeleteId(null);
    }
  };

  const handleEditClick = (element: ElementItem) => {
    setEditingElement(element);
    setEditPrompt(element.prompt || "");
    setGeneratedImage(null); // Reset generated image
    setIsGenerating(false);
  };

  const handleRegenerate = () => {
    setIsGenerating(true);
    setGeneratedImage(null);

    // Mock generation delay
    setTimeout(() => {
      // In a real app, this would be the API response
      // For now, we just use a different placeholder or same image to simulate "new"
      // Let's use a placeholder service or just a different unsplash ID for demo if possible,
      // or just a gray box as requested initially for "before", but "after" needs an image.
      // User said: "before it should just be a placeholder gray box" -> we did that (null)
      // User said: "after they click generate... shows the newly generated one"

      // Simulating a new image URL
      const mockNewImage = `https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?q=80&w=300&auto=format&fit=crop&t=${Date.now()}`;
      setGeneratedImage(mockNewImage);
      setIsGenerating(false);
    }, 2000);
  };

  const handleSaveEdit = () => {
    if (editingElement) {
      setElements((prev) =>
        prev.map((e) =>
          e.id === editingElement.id
            ? {
                ...e,
                image: generatedImage || e.image, // Only update image if generated
                prompt: editPrompt,
              }
            : e,
        ),
      );
      setEditingElement(null);
    }
  };

  // =========================================================================
  // SHOT EDITING STATE & HANDLERS
  // =========================================================================

  // Track which shot is currently being edited
  const [editingShot, setEditingShot] = useState<ShotItem | null>(null);

  // Form state for the shot being edited
  const [editedShotSummary, setEditedShotSummary] = useState("");
  const [editedShotContentType, setEditedShotContentType] = useState("");
  const [editedShotMediaType, setEditedShotMediaType] = useState<
    "image" | "video" | "motiongraphic" | "ai_generated"
  >("image");

  // Track all pending changes (key = segment_index, value = modified shot)
  const [pendingShotChanges, setPendingShotChanges] = useState<
    Map<number, ShotItem>
  >(new Map());

  // Saving state
  const [isSavingShots, setIsSavingShots] = useState(false);

  // Count of pending changes
  const pendingChangesCount = pendingShotChanges.size;

  // Open shot edit modal
  const handleShotClick = (shot: ShotItem) => {
    // Check if there's a pending change for this shot
    const pendingShot = pendingShotChanges.get(shot.segment_index);
    const shotToEdit = pendingShot || shot;

    setEditingShot(shotToEdit);
    setEditedShotSummary(shotToEdit.summary || "");
    setEditedShotContentType(shotToEdit.content_type);
    setEditedShotMediaType(shotToEdit.media_type || "image");
  };

  // Save changes from modal to pending changes map
  const handleSaveShotEdit = () => {
    if (!editingShot) return;

    const updatedShot: ShotItem = {
      ...editingShot,
      summary: editedShotSummary,
      content_type: editedShotContentType,
      media_type: editedShotMediaType,
    };

    // Add to pending changes
    setPendingShotChanges((prev) => {
      const newMap = new Map(prev);
      newMap.set(editingShot.segment_index, updatedShot);
      return newMap;
    });

    // Close modal
    setEditingShot(null);
  };

  // Cancel editing without saving
  const handleCancelShotEdit = () => {
    setEditingShot(null);
  };

  // Save all pending changes to database
  const handleSaveAllShots = async () => {
    if (!onUpdateShots || pendingChangesCount === 0 || !avScriptShots) return;

    setIsSavingShots(true);

    try {
      // Merge pending changes with original shots
      const updatedShots = avScriptShots.map((shot) => {
        const pendingChange = pendingShotChanges.get(shot.segment_index);
        return pendingChange || shot;
      });

      // Call the update callback
      await onUpdateShots(updatedShots);

      // Clear pending changes on success
      setPendingShotChanges(new Map());

      console.log("[Step5] Saved all shot changes successfully");
    } catch (error) {
      console.error("[Step5] Failed to save shot changes:", error);
    } finally {
      setIsSavingShots(false);
    }
  };

  // Check if a shot has pending changes
  const hasPendingChange = (segmentIndex: number) =>
    pendingShotChanges.has(segmentIndex);

  // Get display data for a shot (pending changes take priority)
  const getDisplayShot = (shot: ShotItem): ShotItem => {
    return pendingShotChanges.get(shot.segment_index) || shot;
  };

  return (
    <div
      id="shot-creation-layout-static"
      className="flex h-full w-full bg-black text-white overflow-hidden"
    >
      {/* LEFT COLUMN: Configuration & Assets (40% fixed) */}
      <div className="flex flex-col w-[40%] border-r border-neutral-800 bg-neutral-900/10 shrink-0">
        <div className="flex flex-col h-full w-full shrink-0">
          {/* Elements Section */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="shrink-0 bg-neutral-900/10">
              {/* Mode Toggle (Elements / Player) */}
              <div className="p-4 border-b border-neutral-800">
                <div className="flex gap-1 bg-neutral-900 p-1 rounded-lg border border-neutral-800">
                  <button
                    onClick={() => setSidebarMode("elements")}
                    className={cn(
                      "flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2",
                      sidebarMode === "elements"
                        ? "bg-neutral-800 text-white shadow-sm"
                        : "text-neutral-400 hover:text-white hover:bg-neutral-800/50",
                    )}
                  >
                    <Grid className="w-4 h-4" />
                    Elements
                  </button>
                  <button
                    onClick={() => setSidebarMode("player")}
                    className={cn(
                      "flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2",
                      sidebarMode === "player"
                        ? "bg-orange-600 text-white shadow-sm"
                        : "text-neutral-400 hover:text-white hover:bg-neutral-800/50",
                    )}
                  >
                    <Play className="w-4 h-4" />
                    Player
                  </button>
                </div>
              </div>

              {/* Elements Header (only show when in elements mode) */}
              {sidebarMode === "elements" && (
                <>
                  <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-white">Elements</h2>
                      <p className="text-neutral-400 text-sm">
                        Manage consistency assets
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-neutral-400 hover:text-white"
                    >
                      <Search className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Element Type Tabs */}
                  <div className="px-6 py-4">
                    <div className="flex gap-1 bg-neutral-900/50 p-1 rounded-lg border border-neutral-800 overflow-x-auto no-scrollbar">
                      {["all", "character", "location", "object", "stock"].map(
                        (tab) => (
                          <button
                            key={tab}
                            onClick={() => setActiveTab(tab as ElementType)}
                            className={cn(
                              "px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize whitespace-nowrap flex-1",
                              activeTab === tab
                                ? "bg-neutral-700 text-white shadow-sm"
                                : "text-neutral-400 hover:text-white hover:bg-neutral-800/50",
                            )}
                          >
                            {tab === "stock" ? "Stock" : tab}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Sidebar Content (Elements Grid OR Player Panel) */}
            {sidebarMode === "elements" ? (
              <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-6 pt-0">
                <div className="grid grid-cols-2 gap-3">
                  {filteredElements.map((element) => (
                    <div
                      key={element.id}
                      className="group relative aspect-[3/4] bg-neutral-800 rounded-lg overflow-hidden border border-neutral-800 hover:border-neutral-600 transition-all cursor-pointer"
                      onClick={() => handleEditClick(element)}
                    >
                      {/* Hover Actions (Top Right) */}
                      <div className="absolute top-2 right-2 z-20 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="icon"
                          variant="secondary"
                          className="h-7 w-7 bg-black/60 hover:bg-black/80 text-white border border-white/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditClick(element);
                          }}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="destructive"
                          className="h-7 w-7 bg-red-900/80 hover:bg-red-900 text-white border border-red-500/20"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(element.id);
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>

                      {/* Type Icon Badge */}
                      <div className="absolute top-2 left-2 z-10 p-1 bg-black/50 backdrop-blur-sm rounded border border-white/10 pointer-events-none">
                        {element.type === "character" && (
                          <User className="w-3 h-3 text-white" />
                        )}
                        {element.type === "object" && (
                          <Box className="w-3 h-3 text-white" />
                        )}
                        {element.type === "location" && (
                          <MapPin className="w-3 h-3 text-white" />
                        )}
                        {element.type === "stock" && (
                          <Film className="w-3 h-3 text-white" />
                        )}
                      </div>

                      {/* Image or Placeholder */}
                      {element.image ? (
                        <img
                          src={element.image}
                          alt={element.name}
                          className="w-full h-full object-contain bg-black opacity-80 group-hover:opacity-100 transition-opacity"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-neutral-800 to-neutral-700 flex flex-col items-center justify-center gap-2">
                          <Box className="w-8 h-8 text-neutral-600" />
                        </div>
                      )}

                      {/* Label Overlay */}
                      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-8 pointer-events-none">
                        <p className="font-medium text-white text-sm leading-tight truncate">
                          {element.name}
                        </p>
                        <p className="text-[10px] text-neutral-400 uppercase tracking-wider mt-0.5">
                          {element.type}
                        </p>
                      </div>
                    </div>
                  ))}

                  {/* Add New Empty State */}
                  <div className="aspect-[3/4] flex flex-col items-center justify-center rounded-lg border border-dashed border-neutral-700 bg-neutral-900/30 text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900/50 hover:border-neutral-500 transition-all cursor-pointer gap-2">
                    <div className="p-2 rounded-full bg-neutral-800">
                      <Grid className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-medium">Add New</span>
                  </div>
                </div>
              </div>
            ) : /* Player Panel */
            audioChunks && audioChunks.length > 0 && script ? (
              <ShotPlayerPanel
                audioChunks={audioChunks}
                script={script}
                shots={avScriptShots || []}
                onShotHighlight={setHighlightedShotIndex}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-neutral-500">
                <p className="text-sm">Audio not available</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Shot Planning (Flex Grow) */}
      <div
        id="shot-planning-main"
        className="flex flex-col flex-1 bg-black/40 relative min-w-0"
      >
        {/* Header */}
        <div className="shrink-0 z-10">
          <div className="p-6 border-b border-neutral-800 flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-white">Scenes & Shots</h2>
              <p className="text-neutral-400 text-sm">
                Edit and rearrange your shot breakdown
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xs text-neutral-500 font-medium px-3 py-1 bg-neutral-900 rounded-full border border-neutral-800">
                Total Duration:{" "}
                <span className="text-neutral-300">
                  {avScriptShots && avScriptShots.length > 0
                    ? formatDuration(
                        avScriptShots.reduce(
                          (sum, s) => sum + s.duration_seconds,
                          0,
                        ),
                      )
                    : "0:00"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-6">
          <div className="max-w-4xl mx-auto space-y-6 pb-24">
            {/* Dynamic shots from avScriptShots */}
            {avScriptShots && avScriptShots.length > 0 ? (
              <div className="border border-neutral-800 rounded-xl bg-neutral-900/20 overflow-hidden shadow-sm">
                <div className="flex items-center justify-between p-4 bg-neutral-900/50 cursor-pointer hover:bg-neutral-800/50 transition-colors border-b border-neutral-800/50">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                    <h3 className="font-semibold text-lg text-neutral-200">
                      All Shots ({avScriptShots.length})
                    </h3>
                  </div>
                  <ChevronDown className="w-5 h-5 text-neutral-500" />
                </div>

                {/* Shots List */}
                <div className="p-1 space-y-[1px] bg-neutral-900/30">
                  {avScriptShots.map((shot, index) => {
                    const displayShot = getDisplayShot(shot);
                    const hasChanges = hasPendingChange(shot.segment_index);

                    return (
                      <div
                        key={shot.segment_index}
                        onClick={() => handleShotClick(shot)}
                        className={cn(
                          "flex gap-4 p-4 bg-neutral-950 hover:bg-neutral-900/80 transition-colors group relative border-b border-neutral-800/50 last:border-0 cursor-pointer",
                          hasChanges && "ring-1 ring-amber-500/50",
                          highlightedShotIndex === shot.segment_index &&
                            "ring-2 ring-orange-500 bg-orange-950/20",
                        )}
                      >
                        {/* Left accent bar - shows amber when has pending changes, orange when playing */}
                        <div
                          className={cn(
                            "absolute left-0 top-0 bottom-0 w-1 transition-colors",
                            highlightedShotIndex === shot.segment_index
                              ? "bg-orange-500"
                              : hasChanges
                                ? "bg-amber-500"
                                : "bg-transparent group-hover:bg-blue-500/50",
                          )}
                        ></div>

                        <div className="flex flex-col items-center pt-1 gap-2 min-w-[60px]">
                          <span
                            className={cn(
                              "text-[10px] font-bold px-2 py-0.5 rounded border transition-colors",
                              hasChanges
                                ? "text-amber-400 bg-amber-900/30 border-amber-700"
                                : "text-neutral-600 bg-neutral-900 border-neutral-800 group-hover:border-neutral-700",
                            )}
                          >
                            SHOT {shot.segment_index + 1}
                          </span>
                          {hasChanges ? (
                            <span className="text-[9px] text-amber-400 font-medium">
                              EDITED
                            </span>
                          ) : (
                            <Edit2 className="w-3.5 h-3.5 text-neutral-700 group-hover:text-neutral-400 transition-colors" />
                          )}
                        </div>

                        <div className="flex-1">
                          <div className="text-sm text-neutral-300 leading-7 font-light">
                            <EntityReference
                              text={
                                displayShot.summary ||
                                displayShot.text.substring(0, 150) +
                                  (displayShot.text.length > 150 ? "..." : "")
                              }
                              entities={entityLookup}
                              stockMediaLookup={stockMediaLookup}
                            />
                          </div>
                          <div className="mt-3 flex items-center gap-2 flex-wrap">
                            <span
                              className={cn(
                                "text-[10px] font-medium px-2 py-1 rounded",
                                displayShot.content_type === "concept"
                                  ? "bg-purple-900/50 text-purple-300"
                                  : displayShot.content_type === "list-item"
                                    ? "bg-blue-900/50 text-blue-300"
                                    : displayShot.content_type === "comparison"
                                      ? "bg-amber-900/50 text-amber-300"
                                      : displayShot.content_type ===
                                          "transition"
                                        ? "bg-neutral-800 text-neutral-400"
                                        : displayShot.content_type ===
                                            "emotional-beat"
                                          ? "bg-rose-900/50 text-rose-300"
                                          : "bg-neutral-900 text-neutral-500",
                              )}
                            >
                              {displayShot.content_type}
                            </span>
                            <span className="text-[10px] text-neutral-600">
                              {shot.duration_seconds.toFixed(1)}s
                            </span>
                            {/* Visual elements routing tags (filter out audio tags) */}
                            {displayShot.visual_elements && displayShot.visual_elements.length > 0 ? (
                              displayShot.visual_elements
                                .filter(tag => !['sound_effects', 'music'].includes(tag))
                                .slice(0, 3)
                                .map((tag) => {
                                const config = ROUTING_TAG_CONFIG[tag as RoutingTag];
                                return (
                                  <span 
                                    key={tag} 
                                    className={cn("text-[10px] font-medium px-2 py-1 rounded", config?.style || "bg-neutral-800 text-neutral-300")}
                                    title={displayShot.visual_description}
                                  >
                                    {config?.label || tag}
                                  </span>
                                );
                              })
                            ) : (
                              <>
                                {/* Fallback to legacy visual_source badges */}
                                {displayShot.visual_source === "ai_video" && (
                                  <span className="text-[10px] font-medium bg-violet-900/50 text-violet-300 px-2 py-1 rounded">
                                    <Sparkles className="w-3 h-3 inline mr-1" />
                                    AI Video
                                  </span>
                                )}
                                {displayShot.visual_source === "motiongraphic" && (
                                  <span className="text-[10px] font-medium bg-indigo-900/50 text-indigo-300 px-2 py-1 rounded">
                                    <Layers className="w-3 h-3 inline mr-1" />
                                    Motion Graphic
                                  </span>
                                )}
                                {/* Fallback for missing visual_source - show based on media_type */}
                                {!displayShot.visual_source &&
                                  displayShot.media_type === "video" && (
                                    <span className="text-[10px] font-medium bg-emerald-900/50 text-emerald-300 px-2 py-1 rounded">
                                      <Film className="w-3 h-3 inline mr-1" />
                                      Video
                                    </span>
                                  )}
                                {!displayShot.visual_source &&
                                  displayShot.media_type === "motiongraphic" && (
                                    <span className="text-[10px] font-medium bg-indigo-900/50 text-indigo-300 px-2 py-1 rounded">
                                      <Layers className="w-3 h-3 inline mr-1" />
                                      Motion Graphic
                                    </span>
                                  )}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Right side: Audio indicators + Thumbnail */}
                        <div className="flex items-center gap-3 shrink-0">
                          {/* Audio Indicator - Descriptive Sound Effects */}
                          {displayShot.sound_effects && displayShot.sound_effects.length > 0 && (
                            <div 
                              className="flex items-center gap-1.5"
                              title={displayShot.sound_effects.map(sfx => 
                                `${sfx.type}${sfx.anchor_word ? ` @ "${sfx.anchor_word}"` : ''} (${sfx.trigger_at_seconds?.toFixed(2)}s)`
                              ).join('\n')}
                            >
                              {displayShot.sound_effects.slice(0, 2).map((sfx, idx) => (
                                <span 
                                  key={idx}
                                  className="text-[10px] font-medium px-2 py-1 rounded bg-emerald-900/50 text-emerald-300 flex items-center gap-1"
                                >
                                  <span>🔊</span>
                                  <span>{sfx.type}</span>
                                </span>
                              ))}
                              {displayShot.sound_effects.length > 2 && (
                                <span className="text-[9px] text-neutral-500">
                                  +{displayShot.sound_effects.length - 2}
                                </span>
                              )}
                            </div>
                          )}
                          
                          {/* Shot Thumbnail */}
                          <div className="w-24 aspect-video bg-neutral-900 rounded border border-neutral-800 group-hover:border-neutral-700 flex items-center justify-center shrink-0 overflow-hidden">
                          {displayShot.stock_media_ref?.thumbnailUrl ? (
                            <img
                              src={displayShot.stock_media_ref.thumbnailUrl}
                              alt="Stock media"
                              className="w-full h-full object-cover"
                            />
                          ) : displayShot.media_type === "video" ? (
                            <Film className="w-4 h-4 text-neutral-700" />
                          ) : displayShot.media_type === "motiongraphic" ? (
                            <Layers className="w-4 h-4 text-neutral-700" />
                          ) : displayShot.media_type === "ai_generated" ? (
                            <Box className="w-4 h-4 text-neutral-700" />
                          ) : (
                            <Image className="w-4 h-4 text-neutral-700" />
                          )}
                        </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Fallback empty state */
              <div className="border border-dashed border-neutral-700 rounded-xl p-8 text-center">
                <Grid className="w-8 h-8 text-neutral-600 mx-auto mb-3" />
                <h3 className="text-neutral-400 font-medium mb-1">
                  No shots available
                </h3>
                <p className="text-neutral-600 text-sm">
                  Shot breakdown will appear here after generation
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- MODALS --- */}

      {/* Delete Confirmation Modal */}
      <Dialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <DialogContent className="bg-neutral-900 border-neutral-800 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Element</DialogTitle>
            <DialogDescription className="text-neutral-400">
              Are you sure you want to delete this element? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              onClick={() => setDeleteId(null)}
              className="text-neutral-300 hover:bg-neutral-800"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog
        open={!!editingElement}
        onOpenChange={(open) => !open && setEditingElement(null)}
      >
        <DialogContent className="bg-neutral-950 border-neutral-800 text-white sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Image</DialogTitle>
            <DialogDescription className="text-neutral-400">
              Regenerate the image using a new prompt or modify existing
              settings.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 my-4">
            {/* Left: Current Image & Prompt Settings */}
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-neutral-300 mb-2">
                  Prompt
                </h4>
                <Textarea
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  className="bg-neutral-900 border-neutral-800 min-h-[120px] focus:ring-blue-600"
                  placeholder="Describe the image..."
                />
              </div>

              <div className="pt-2">
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={handleRegenerate}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Regenerate Image
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Right: Compare View (Current vs New) */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-neutral-300 mb-2">
                Preview
              </h4>

              <div className="grid grid-cols-2 gap-4">
                {/* Current */}
                <div className="space-y-2">
                  <div className="text-xs text-neutral-500 uppercase tracking-wide">
                    Current
                  </div>
                  <div className="aspect-square bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden relative">
                    {editingElement?.image ? (
                      <img
                        src={editingElement.image}
                        alt="Current"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <Box className="w-8 h-8 text-neutral-700" />
                      </div>
                    )}
                  </div>
                </div>

                {/* New */}
                <div className="space-y-2">
                  <div className="text-xs text-neutral-500 uppercase tracking-wide">
                    New Result
                  </div>
                  <div className="aspect-square bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden relative flex items-center justify-center">
                    {isGenerating ? (
                      <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    ) : generatedImage ? (
                      <img
                        src={generatedImage}
                        alt="New"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-neutral-800/50 flex flex-col items-center justify-center text-neutral-600 p-4 text-center">
                        <Grid className="w-8 h-8 mb-2 opacity-50" />
                        <span className="text-xs">
                          Preview will appear here
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex gap-2 justify-end pt-4 border-t border-neutral-800">
            <Button
              variant="ghost"
              onClick={() => setEditingElement(null)}
              className="text-neutral-300 hover:bg-neutral-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={isGenerating}
            >
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shot Edit Modal */}
      <Dialog
        open={!!editingShot}
        onOpenChange={(open) => !open && handleCancelShotEdit()}
      >
        <DialogContent className="bg-neutral-950 border-neutral-800 text-white sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Edit Shot {editingShot ? editingShot.segment_index + 1 : ""}
            </DialogTitle>
            <DialogDescription className="text-neutral-400">
              Modify the shot details. Changes will be saved when you click
              "Save All Changes".
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 my-4">
            {/* Timing Info (Read-only) */}
            <div className="flex items-center gap-4 p-3 bg-neutral-900/50 rounded-lg border border-neutral-800">
              <div className="text-center">
                <div className="text-xs text-neutral-500 uppercase">Start</div>
                <div className="text-sm font-mono text-neutral-300">
                  {editingShot?.start_seconds.toFixed(1)}s
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-neutral-600" />
              <div className="text-center">
                <div className="text-xs text-neutral-500 uppercase">End</div>
                <div className="text-sm font-mono text-neutral-300">
                  {editingShot?.end_seconds.toFixed(1)}s
                </div>
              </div>
              <div className="ml-auto text-center">
                <div className="text-xs text-neutral-500 uppercase">
                  Duration
                </div>
                <div className="text-sm font-mono text-neutral-300">
                  {editingShot?.duration_seconds.toFixed(1)}s
                </div>
              </div>
            </div>

            {/* Visual Assets Section - Show all images that will be used */}
            {(editingShot?.visual_source === "motiongraphic" ||
              editingShot?.stock_media_ref ||
              editingShot?.stock_media_refs?.length) && (
              <div className="space-y-2">
                <Label className="text-neutral-300 flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  Visual Assets
                  {editingShot.image_count && editingShot.image_count > 1 && (
                    <span className="text-[10px] bg-sky-900/50 text-sky-300 px-2 py-0.5 rounded">
                      {editingShot.image_count} images planned
                    </span>
                  )}
                </Label>

                <div className="grid grid-cols-4 gap-2">
                  {/* Render stock images first */}
                  {(
                    editingShot?.stock_media_refs ||
                    (editingShot?.stock_media_ref
                      ? [editingShot.stock_media_ref]
                      : [])
                  ).map((ref, i) => (
                    <div
                      key={ref.id}
                      className="aspect-video bg-neutral-800 rounded-lg overflow-hidden border border-neutral-700 relative group"
                    >
                      <img
                        src={ref.thumbnailUrl || ref.url}
                        alt={ref.description || `Stock image ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
                        <span className="text-[9px] text-green-400 font-medium flex items-center gap-1">
                          <Package className="w-2.5 h-2.5" />
                          Stock
                        </span>
                      </div>
                      {/* Similarity score on hover */}
                      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[9px] bg-black/70 text-neutral-300 px-1.5 py-0.5 rounded">
                          {(ref.similarity * 100).toFixed(0)}% match
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* AI-generated placeholders for remaining slots */}
                  {(() => {
                    const stockCount =
                      editingShot?.stock_media_refs?.length ||
                      (editingShot?.stock_media_ref ? 1 : 0);
                    const totalNeeded = editingShot?.image_count || 1;
                    const aiSlots = Math.max(0, totalNeeded - stockCount);

                    return Array.from({ length: aiSlots }).map((_, i) => (
                      <div
                        key={`ai-placeholder-${i}`}
                        className="aspect-video bg-gradient-to-br from-violet-950/50 to-purple-900/30 rounded-lg border border-dashed border-violet-700/50 flex flex-col items-center justify-center gap-1"
                      >
                        <Sparkles className="w-5 h-5 text-violet-400/70" />
                        <span className="text-[9px] text-violet-400/70 font-medium">
                          AI Gen
                        </span>
                      </div>
                    ));
                  })()}
                </div>

                {/* Info message */}
                {editingShot?.image_count && editingShot.image_count > 1 && (
                  <p className="text-[10px] text-neutral-500 italic">
                    {editingShot.stock_media_refs?.length ||
                      (editingShot.stock_media_ref ? 1 : 0)}{" "}
                    stock image(s) matched, remaining will be AI-generated
                  </p>
                )}
              </div>
            )}

            {/* Show placeholder for AI Video shots */}
            {editingShot?.visual_source === "ai_video" && (
              <div className="space-y-2">
                <Label className="text-neutral-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Visual Preview
                </Label>
                <div className="aspect-video max-w-xs bg-gradient-to-br from-violet-950/50 to-purple-900/30 rounded-lg border border-violet-700/50 flex flex-col items-center justify-center gap-2">
                  <Video className="w-8 h-8 text-violet-400/70" />
                  <span className="text-xs text-violet-400/70 font-medium">
                    AI-Generated Video
                  </span>
                  <span className="text-[10px] text-neutral-500">
                    Will be generated during render
                  </span>
                </div>
              </div>
            )}

            {/* Summary/Description */}
            <div className="space-y-2">
              <Label htmlFor="shot-summary" className="text-neutral-300">
                Visual Summary
              </Label>
              <Textarea
                id="shot-summary"
                value={editedShotSummary}
                onChange={(e) => setEditedShotSummary(e.target.value)}
                className="bg-neutral-900 border-neutral-800 min-h-[100px] focus:ring-blue-600 text-white"
                placeholder="Describe what should be shown visually in this shot..."
              />
            </div>

            {/* Content Type Select */}
            <div className="space-y-2">
              <Label htmlFor="shot-content-type" className="text-neutral-300">
                Content Type
              </Label>
              <Select
                value={editedShotContentType}
                onValueChange={setEditedShotContentType}
              >
                <SelectTrigger className="bg-neutral-900 border-neutral-800 text-white">
                  <SelectValue placeholder="Select content type" />
                </SelectTrigger>
                <SelectContent className="bg-neutral-900 border-neutral-800">
                  {CONTENT_TYPE_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="text-white hover:bg-neutral-800 focus:bg-neutral-800"
                    >
                      <span
                        className={cn(
                          "inline-block px-2 py-0.5 rounded text-xs font-medium mr-2",
                          option.color,
                        )}
                      >
                        {option.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editedShotContentType &&
                CONTENT_TYPE_DESCRIPTIONS[editedShotContentType] && (
                  <p className="text-xs text-neutral-500 mt-1 italic">
                    {CONTENT_TYPE_DESCRIPTIONS[editedShotContentType]}
                  </p>
                )}
            </div>

            {/* Media Type Toggle */}
            <div className="space-y-2">
              <Label className="text-neutral-300">Media Type</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={
                    editedShotMediaType === "image" ? "default" : "outline"
                  }
                  className={cn(
                    "flex-1",
                    editedShotMediaType === "image"
                      ? "bg-sky-600 hover:bg-sky-700 text-white"
                      : "border-neutral-700 text-neutral-400 hover:text-white hover:bg-neutral-800",
                  )}
                  onClick={() => setEditedShotMediaType("image")}
                >
                  <Image className="w-4 h-4 mr-2" />
                  Image
                </Button>
                <Button
                  type="button"
                  variant={
                    editedShotMediaType === "video" ? "default" : "outline"
                  }
                  className={cn(
                    "flex-1",
                    editedShotMediaType === "video"
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                      : "border-neutral-700 text-neutral-400 hover:text-white hover:bg-neutral-800",
                  )}
                  onClick={() => setEditedShotMediaType("video")}
                >
                  <Video className="w-4 h-4 mr-2" />
                  Video
                </Button>
                <Button
                  type="button"
                  variant={
                    editedShotMediaType === "motiongraphic"
                      ? "default"
                      : "outline"
                  }
                  className={cn(
                    "flex-1",
                    editedShotMediaType === "motiongraphic"
                      ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                      : "border-neutral-700 text-neutral-400 hover:text-white hover:bg-neutral-800",
                  )}
                  onClick={() => setEditedShotMediaType("motiongraphic")}
                >
                  <Layers className="w-4 h-4 mr-2" />
                  Motion
                </Button>
              </div>
            </div>

            {/* Original Script Text (Read-only) */}
            <div className="space-y-2">
              <Label className="text-neutral-500">
                Script Text (read-only)
              </Label>
              <div className="p-3 bg-neutral-900/30 rounded-lg border border-neutral-800/50 text-sm text-neutral-400 max-h-32 overflow-y-auto">
                {editingShot?.text}
              </div>
            </div>
          </div>

          <DialogFooter className="flex gap-2 justify-end pt-4 border-t border-neutral-800">
            <Button
              variant="ghost"
              onClick={handleCancelShotEdit}
              className="text-neutral-300 hover:bg-neutral-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveShotEdit}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Check className="w-4 h-4 mr-2" />
              Apply Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating Save All Changes Button */}
      {pendingChangesCount > 0 && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3">
          <div className="bg-amber-900/90 text-amber-200 px-4 py-2 rounded-lg text-sm font-medium shadow-lg border border-amber-700/50">
            {pendingChangesCount} unsaved{" "}
            {pendingChangesCount === 1 ? "change" : "changes"}
          </div>
          <Button
            onClick={handleSaveAllShots}
            disabled={isSavingShots}
            className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg px-6 py-5"
          >
            {isSavingShots ? (
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
    </div>
  );
}

// Helper to format seconds as mm:ss
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
