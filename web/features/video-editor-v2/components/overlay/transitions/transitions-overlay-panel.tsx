import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Film, Music, Info, Blend, MoveHorizontal, ZoomIn, Waves, CircleDot, Rotate3D, Sparkles, Volume2, VolumeX, Shuffle } from "lucide-react";
import { 
  VideoTransitionType, 
  AudioTransitionType,
} from "../../../types";
import { 
  videoTransitionTemplates, 
  audioTransitionTemplates,
  getVideoTransitionsByCategory,
  getAudioTransitionsByCategory,
  transitionCategoryNames,
  audioTransitionCategoryNames,
  VideoTransitionTemplate,
  AudioTransitionTemplate,
} from "../../../templates/transition-templates";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../ui/tabs";
import { 
  startVideoTransitionDrag, 
  startAudioTransitionDrag, 
  endDrag 
} from "../../../stores/video-editor-store";

// Get icon for transition category
const getCategoryIcon = (category: string, isVideo: boolean) => {
  if (isVideo) {
    switch (category) {
      case "fade":
        return <Blend className="h-4 w-4" />;
      case "wipe":
        return <MoveHorizontal className="h-4 w-4" />;
      case "slide":
        return <MoveHorizontal className="h-4 w-4" />;
      case "zoom":
        return <ZoomIn className="h-4 w-4" />;
      case "blur":
        return <Waves className="h-4 w-4" />;
      case "iris":
        return <CircleDot className="h-4 w-4" />;
      case "3d":
        return <Rotate3D className="h-4 w-4" />;
      case "stylized":
        return <Sparkles className="h-4 w-4" />;
      default:
        return <Shuffle className="h-4 w-4" />;
    }
  } else {
    switch (category) {
      case "crossfade":
        return <Shuffle className="h-4 w-4" />;
      case "fadeIn":
        return <Volume2 className="h-4 w-4" />;
      case "fadeOut":
        return <VolumeX className="h-4 w-4" />;
      default:
        return <Waves className="h-4 w-4" />;
    }
  }
};

// Get color for transition category
const getCategoryColor = (category: string, isVideo: boolean): string => {
  if (isVideo) {
    switch (category) {
      case "fade":
        return "from-blue-500/20 to-blue-600/20";
      case "wipe":
        return "from-purple-500/20 to-purple-600/20";
      case "slide":
        return "from-green-500/20 to-green-600/20";
      case "zoom":
        return "from-orange-500/20 to-orange-600/20";
      case "blur":
        return "from-cyan-500/20 to-cyan-600/20";
      case "iris":
        return "from-pink-500/20 to-pink-600/20";
      case "3d":
        return "from-yellow-500/20 to-yellow-600/20";
      case "stylized":
        return "from-red-500/20 to-red-600/20";
      default:
        return "from-gray-500/20 to-gray-600/20";
    }
  } else {
    switch (category) {
      case "crossfade":
        return "from-emerald-500/20 to-emerald-600/20";
      case "fadeIn":
        return "from-teal-500/20 to-teal-600/20";
      case "fadeOut":
        return "from-rose-500/20 to-rose-600/20";
      default:
        return "from-gray-500/20 to-gray-600/20";
    }
  }
};

interface TransitionCardProps {
  type: VideoTransitionType | AudioTransitionType;
  template: VideoTransitionTemplate | AudioTransitionTemplate;
  isVideo: boolean;
}

const TransitionCard: React.FC<TransitionCardProps> = ({
  type,
  template,
  isVideo,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    
    // Start the drag in the centralized store
    const dragId = isVideo 
      ? startVideoTransitionDrag(type as VideoTransitionType, 1)
      : startAudioTransitionDrag(type as AudioTransitionType, 1);
    
    // Just pass the drag ID - actual data is in the store
    e.dataTransfer.setData('text/plain', dragId);
    e.dataTransfer.effectAllowed = "copy";
    
    // Create a custom drag preview with 50% opacity
    const dragPreview = document.createElement('div');
    dragPreview.style.position = 'absolute';
    dragPreview.style.top = '-1000px'; // Off-screen
    dragPreview.style.padding = '8px 12px';
    dragPreview.style.background = 'rgba(23, 23, 23, 0.5)'; // 50% opacity dark background
    dragPreview.style.border = '2px solid rgba(59, 130, 246, 0.5)'; // 50% opacity blue border
    dragPreview.style.borderRadius = '6px';
    dragPreview.style.color = 'rgba(255, 255, 255, 0.9)';
    dragPreview.style.fontSize = '12px';
    dragPreview.style.fontWeight = '500';
    dragPreview.style.pointerEvents = 'none';
    dragPreview.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
    dragPreview.innerHTML = `
      <div style="display: flex; align-items: center; gap: 6px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(59, 130, 246, 0.9)" stroke-width="2">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          <polyline points="3.29 7 12 12 20.71 7"></polyline>
          <line x1="12" y1="22" x2="12" y2="12"></line>
        </svg>
        <span>${template.name}</span>
      </div>
    `;
    
    document.body.appendChild(dragPreview);
    e.dataTransfer.setDragImage(dragPreview, 0, 0);
    
    // Clean up the preview element after a short delay
    setTimeout(() => {
      document.body.removeChild(dragPreview);
    }, 0);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    // Clean up unified store (this is the ONLY cleanup needed!)
    endDrag();
  };

  const categoryColor = getCategoryColor(template.category, isVideo);

  return (
    <motion.div
      draggable
      onDragStart={handleDragStart as any}
      onDragEnd={handleDragEnd as any}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`
        relative cursor-grab active:cursor-grabbing
        rounded-lg border border-border/50 
        bg-gradient-to-br ${categoryColor}
        backdrop-blur-sm
        overflow-hidden
        transition-all duration-200
        hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5
        ${isDragging ? "opacity-50" : "opacity-100"}
      `}
    >
      {/* Preview Animation Area */}
      <div className="relative h-16 flex items-center justify-center overflow-hidden">
        <div className="relative w-full h-full flex items-center justify-center gap-1 px-2">
          {/* Left square (exiting) */}
          <motion.div
            animate={isHovered ? { opacity: [1, 0], x: [-4, 0] } : { opacity: 1, x: 0 }}
            transition={{ duration: 0.8, repeat: isHovered ? Infinity : 0 }}
            className="w-6 h-6 rounded bg-primary/40 flex items-center justify-center"
          >
            <div className="w-3 h-3 rounded-sm bg-primary/60" />
          </motion.div>
          
          {/* Transition indicator */}
          <div className="flex items-center px-1">
            {getCategoryIcon(template.category, isVideo)}
          </div>
          
          {/* Right square (entering) */}
          <motion.div
            animate={isHovered ? { opacity: [0, 1], x: [4, 0] } : { opacity: 1, x: 0 }}
            transition={{ duration: 0.8, repeat: isHovered ? Infinity : 0 }}
            className="w-6 h-6 rounded bg-secondary/40 flex items-center justify-center"
          >
            <div className="w-3 h-3 rounded-sm bg-secondary/60" />
          </motion.div>
        </div>
      </div>
      
      {/* Card Content */}
      <div className="px-2 py-1.5 bg-background/50">
        <h4 className="text-[10px] font-medium truncate text-foreground">
          {template.name}
        </h4>
      </div>
      
      {/* Drag indicator overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
          <span className="text-xs font-medium text-primary">Dragging...</span>
        </div>
      )}
    </motion.div>
  );
};

export const TransitionsOverlayPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"video" | "audio">("video");

  // Get video transitions grouped by category
  const videoCategories = useMemo(() => {
    const categories = getVideoTransitionsByCategory();
    return Object.entries(categories).map(([key, transitions]) => ({
      key,
      name: transitionCategoryNames[key] || key,
      transitions,
    }));
  }, []);

  // Get audio transitions grouped by category
  const audioCategories = useMemo(() => {
    const categories = getAudioTransitionsByCategory();
    return Object.entries(categories).map(([key, transitions]) => ({
      key,
      name: audioTransitionCategoryNames[key] || key,
      transitions,
    }));
  }, []);

  return (
    <div className="h-full overflow-y-auto sidepanel-scrollbar p-2">
      {/* Tabs */}
      <Tabs 
        value={activeTab} 
        onValueChange={(value) => setActiveTab(value as "video" | "audio")}
      >
        <TabsList className="grid w-full grid-cols-2 mb-3">
          <TabsTrigger value="video" className="flex items-center gap-1.5">
            <Film className="h-3.5 w-3.5" />
            <span className="text-xs">Video</span>
          </TabsTrigger>
          <TabsTrigger value="audio" className="flex items-center gap-1.5">
            <Music className="h-3.5 w-3.5" />
            <span className="text-xs">Audio</span>
          </TabsTrigger>
        </TabsList>

        {/* Video Transitions */}
        <TabsContent value="video" className="mt-0">
          <div className="space-y-4 pb-4">
            {/* Info Banner */}
            <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/50 text-muted-foreground">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <p className="text-[10px] leading-relaxed">
                Drag transitions onto the timeline. Drop at the start or end of clips, 
                or between adjacent clips on the same track.
              </p>
            </div>

            {/* Video Categories */}
            <AnimatePresence>
              {videoCategories.map((category, categoryIndex) => (
                <motion.div
                  key={category.key}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: categoryIndex * 0.05, duration: 0.15 }}
                  className="space-y-2"
                >
                  {/* Category Header */}
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
                    {category.name}
                  </h3>
                  
                  {/* Transition Grid */}
                  <div className="grid grid-cols-3 gap-2">
                    {category.transitions.map(({ type, template }) => (
                      <TransitionCard
                        key={type}
                        type={type}
                        template={template}
                        isVideo={true}
                      />
                    ))}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </TabsContent>

        {/* Audio Transitions */}
        <TabsContent value="audio" className="mt-0">
          <div className="space-y-4 pb-4">
            {/* Info Banner */}
            <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/50 text-muted-foreground">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <p className="text-[10px] leading-relaxed">
                Audio transitions control volume curves during crossfades. 
                Constant Power is recommended for smooth transitions.
              </p>
            </div>

            {/* Audio Categories */}
            <AnimatePresence>
              {audioCategories.map((category, categoryIndex) => (
                <motion.div
                  key={category.key}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: categoryIndex * 0.05, duration: 0.15 }}
                  className="space-y-2"
                >
                  {/* Category Header */}
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
                    {category.name}
                  </h3>
                  
                  {/* Transition Grid */}
                  <div className="grid grid-cols-3 gap-2">
                    {category.transitions.map(({ type, template }) => (
                      <TransitionCard
                        key={type}
                        type={type}
                        template={template}
                        isVideo={false}
                      />
                    ))}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TransitionsOverlayPanel;
