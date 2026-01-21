import React, { useState } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Step5ShotCreationProps {
  onNext: () => void;
  onBack: () => void;
  isLocked?: boolean;
}

type ElementType = "all" | "character" | "object" | "location" | "stock";

interface ElementItem {
  id: number;
  type: ElementType;
  name: string;
  image: string | null;
  prompt?: string;
}

export function Step5ShotCreation({
  onNext,
  onBack,
  isLocked = false,
}: Step5ShotCreationProps) {
  const [activeTab, setActiveTab] = useState<ElementType>("all");

  // State for elements
  const [elements, setElements] = useState<ElementItem[]>([
    {
      id: 1,
      type: "character",
      name: "Isabella Moretti",
      image:
        "https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=300&auto=format&fit=crop",
      prompt:
        "A portrait of Isabella Moretti, warm lighting, detailed features",
    },
    {
      id: 2,
      type: "object",
      name: "Watch",
      image: null,
      prompt: "A vintage gold watch",
    },
    {
      id: 3,
      type: "location",
      name: "Villa Archway",
      image:
        "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?q=80&w=300&auto=format&fit=crop",
      prompt: "An ancient roman villa archway, sunny day",
    },
    {
      id: 4,
      type: "location",
      name: "Villa Threshold",
      image:
        "https://images.unsplash.com/photo-1528642474498-1af0c17fd8c3?q=80&w=300&auto=format&fit=crop",
      prompt: "Stone threshold of a mediterranean villa",
    },
    {
      id: 5,
      type: "character",
      name: "Marcus (Test)",
      image:
        "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=300&auto=format&fit=crop",
      prompt: "Marcus, a middle aged man with a beard, serious expression",
    },
    {
      id: 6,
      type: "location",
      name: "Garden",
      image:
        "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?q=80&w=300&auto=format&fit=crop",
      prompt: "Lush green garden with blooming flowers",
    },
    {
      id: 7,
      type: "stock",
      name: "Italian Vineyard",
      image:
        "https://images.unsplash.com/photo-1506306449619-735a22543c8d?q=80&w=300&auto=format&fit=crop",
      prompt: "Aerial view of an italian vineyard at sunset",
    },
  ]);

  // Delete State
  const [deleteId, setDeleteId] = useState<number | null>(null);

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

  const handleDeleteClick = (id: number) => {
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
              <div className="p-6 border-b border-neutral-800 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Elements</h2>
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

              {/* Tabs */}
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
            </div>

            {/* Scrollable Elements Grid */}
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
                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
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
                Total Duration: <span className="text-neutral-300">0:21</span>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-6">
          <div className="max-w-4xl mx-auto space-y-6 pb-24">
            {/* Scene 1 */}
            <div className="border border-neutral-800 rounded-xl bg-neutral-900/20 overflow-hidden shadow-sm">
              <div className="flex items-center justify-between p-4 bg-neutral-900/50 cursor-pointer hover:bg-neutral-800/50 transition-colors border-b border-neutral-800/50">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                  <h3 className="font-semibold text-lg text-neutral-200">
                    Commanding the Courtyard
                  </h3>
                </div>
                <ChevronDown className="w-5 h-5 text-neutral-500" />
              </div>

              {/* Shots List */}
              <div className="p-1 space-y-[1px] bg-neutral-900/30">
                {/* Shot 1 */}
                <div className="flex gap-4 p-4 bg-neutral-950 hover:bg-neutral-900/80 transition-colors group relative border-b border-neutral-800/50 last:border-0">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-transparent group-hover:bg-blue-500/50 transition-colors"></div>
                  <div className="flex flex-col items-center pt-1 gap-2 min-w-[60px]">
                    <span className="text-[10px] font-bold text-neutral-600 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800 group-hover:border-neutral-700 transition-colors">
                      SHOT 1
                    </span>
                    <MoreHorizontal className="w-4 h-4 text-neutral-700 group-hover:text-neutral-500 cursor-grab active:cursor-grabbing" />
                  </div>

                  <div className="flex-1">
                    <div className="text-sm text-neutral-300 leading-7 font-light">
                      <span className="inline-flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded-full text-xs text-blue-200 font-medium mx-1 align-middle">
                        <User className="w-3 h-3" /> Isabella Moretti
                      </span>
                      standing poised in the
                      <span className="inline-flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded-full text-xs text-emerald-200 font-medium mx-1 align-middle">
                        <MapPin className="w-3 h-3" /> Villa Courtyard
                      </span>
                      during the golden hour, her deep emerald green velvet slip
                      dress reflecting the warm sunlight; lush green ivy climbs
                      the ochre-colored stucco walls.
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-[10px] font-medium text-neutral-500 bg-neutral-900 px-2 py-1 rounded">
                        Medium shot
                      </span>
                    </div>
                  </div>

                  {/* Shot Thumbnail Mock */}
                  <div className="w-24 aspect-video bg-neutral-900 rounded border border-neutral-800 group-hover:border-neutral-700 flex items-center justify-center shrink-0">
                    <Smartphone className="w-4 h-4 text-neutral-700" />
                  </div>
                </div>

                {/* Shot 2 */}
                <div className="flex gap-4 p-4 bg-neutral-950 hover:bg-neutral-900/80 transition-colors group relative">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-transparent group-hover:bg-blue-500/50 transition-colors"></div>
                  <div className="flex flex-col items-center pt-1 gap-2 min-w-[60px]">
                    <span className="text-[10px] font-bold text-neutral-600 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800 group-hover:border-neutral-700 transition-colors">
                      SHOT 2
                    </span>
                    <MoreHorizontal className="w-4 h-4 text-neutral-700 group-hover:text-neutral-500 cursor-grab active:cursor-grabbing" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-neutral-300 leading-7 font-light">
                      Close-up of
                      <span className="inline-flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded-full text-xs text-blue-200 font-medium mx-1 align-middle">
                        <User className="w-3 h-3" /> Isabella Moretti
                      </span>
                      &apos;s face as she gazes confidently into the distance,
                      her long dark wavy hair framing her oval face.
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-[10px] font-medium text-neutral-500 bg-neutral-900 px-2 py-1 rounded">
                        Close-up
                      </span>
                    </div>
                  </div>

                  {/* Shot Thumbnail Mock */}
                  <div className="w-24 aspect-video bg-neutral-900 rounded border border-neutral-800 group-hover:border-neutral-700 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-neutral-700" />
                  </div>
                </div>
              </div>
            </div>

            {/* Scene 2 (Collapsed) */}
            <div className="border border-neutral-800 rounded-xl bg-neutral-900/20 overflow-hidden shadow-sm opacity-70 hover:opacity-100 transition-opacity">
              <div className="flex items-center justify-between p-4 bg-neutral-900/50 cursor-pointer hover:bg-neutral-800/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-neutral-600"></div>
                  <h3 className="font-semibold text-lg text-neutral-400">
                    Reclining in Niche
                  </h3>
                </div>
                <ChevronDown className="w-5 h-5 text-neutral-600 transform rotate-[-90deg]" />
              </div>
            </div>
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
    </div>
  );
}
