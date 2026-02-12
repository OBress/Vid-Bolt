/**
 * MaskAddPanel - Professional mask browser panel
 * 
 * A polished UI for adding masks with:
 * - Color-coded categories with visual previews
 * - Animated hover states
 * - Mask preview thumbnails
 * - Built into the Effects/Masks tab
 */

import React, { useState } from "react";
import { cn } from "../../../utils/general/utils";
import {
  MaskType,
  ShapeMaskType,
  GradientMaskType,
  TrackMatteType,
  createRectangleMask,
  createEllipseMask,
  createPolygonMask,
  createBezierMask,
  createLinearGradientMask,
  createRadialGradientMask,
  createAngularGradientMask,
  createMultiStopGradientMask,
  createTrackMatte,
  Mask,
} from "../../../types/masks";
import {
  Square,
  Circle,
  Pentagon,
  Spline,
  ArrowRight,
  Target,
  RotateCw,
  Sliders,
  Layers,
  Eye,
  Blend,
  ChevronDown,
  Zap,
  Scan,
} from "lucide-react";

// ==========================================
// TYPES
// ==========================================

interface MaskAddPanelProps {
  onAddMask: (mask: Mask) => void;
  onCancel?: () => void;
  availableOverlays?: Array<{ id: number; name: string }>;
  currentOverlayId?: number;
  aspectRatio?: number;
  className?: string;
}

interface MaskItemConfig {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  category: 'shape' | 'gradient' | 'trackMatte';
  create: () => Mask | null;
  accentColor: string;
  previewGradient: string;
}

interface CategoryConfig {
  title: string;
  icon: React.ElementType;
  accentColor: string;
  bgGradient: string;
}

// ==========================================
// CATEGORY CONFIGS
// ==========================================

const CATEGORY_CONFIGS: Record<string, CategoryConfig> = {
  shape: {
    title: "Shape Masks",
    icon: Square,
    accentColor: "text-blue-400",
    bgGradient: "from-blue-500/20 to-blue-600/5",
  },
  gradient: {
    title: "Gradient Masks",
    icon: Blend,
    accentColor: "text-purple-400",
    bgGradient: "from-purple-500/20 to-purple-600/5",
  },
  trackMatte: {
    title: "Track Mattes",
    icon: Layers,
    accentColor: "text-teal-400",
    bgGradient: "from-teal-500/20 to-teal-600/5",
  },
};

// ==========================================
// MASK PREVIEW COMPONENT
// ==========================================

interface MaskPreviewProps {
  maskId: string;
  isHovered: boolean;
  accentColor: string;
}

const MaskPreview: React.FC<MaskPreviewProps> = ({ maskId, isHovered, accentColor }) => {
  const renderPreview = () => {
    switch (maskId) {
      case 'rectangle':
        return (
          <div className="relative w-full h-full flex items-center justify-center p-1.5">
            <div className={cn(
              "w-6 h-4 rounded-sm border-2 transition-all duration-300",
              isHovered ? "border-blue-400 bg-blue-400/20" : "border-blue-400/50 bg-blue-400/10"
            )} />
          </div>
        );
      case 'ellipse':
        return (
          <div className="relative w-full h-full flex items-center justify-center">
            <div className={cn(
              "w-5 h-5 rounded-full border-2 transition-all duration-300",
              isHovered ? "border-sky-400 bg-sky-400/20 scale-110" : "border-sky-400/50 bg-sky-400/10"
            )} />
          </div>
        );
      case 'polygon':
        return (
          <div className="relative w-full h-full flex items-center justify-center">
            <svg viewBox="0 0 24 24" className={cn(
              "w-6 h-6 transition-all duration-300",
              isHovered ? "scale-110" : ""
            )}>
              <polygon
                points="12,2 22,20 2,20"
                className={cn(
                  "transition-all duration-300",
                  isHovered ? "fill-indigo-400/30 stroke-indigo-400" : "fill-indigo-400/10 stroke-indigo-400/50"
                )}
                strokeWidth="2"
                fill="currentColor"
              />
            </svg>
          </div>
        );
      case 'bezier':
        return (
          <div className="relative w-full h-full flex items-center justify-center">
            <svg viewBox="0 0 24 24" className={cn(
              "w-6 h-6 transition-all duration-300",
              isHovered ? "scale-110" : ""
            )}>
              <path
                d="M2,20 Q12,2 22,20"
                fill="none"
                className={cn(
                  "transition-all duration-300",
                  isHovered ? "stroke-violet-400" : "stroke-violet-400/50"
                )}
                strokeWidth="2"
                strokeLinecap="round"
              />
              {/* Control points */}
              <circle cx="2" cy="20" r="2" className={cn(isHovered ? "fill-violet-400" : "fill-violet-400/50")} />
              <circle cx="22" cy="20" r="2" className={cn(isHovered ? "fill-violet-400" : "fill-violet-400/50")} />
              <circle cx="12" cy="2" r="1.5" className={cn(isHovered ? "fill-violet-300" : "fill-violet-300/50")} />
            </svg>
          </div>
        );
      case 'linear':
        return (
          <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded">
            <div className={cn(
              "w-7 h-5 rounded-sm transition-all duration-300",
              isHovered ? "scale-110" : ""
            )}
            style={{
              background: isHovered 
                ? 'linear-gradient(90deg, rgba(168,85,247,0.8) 0%, rgba(168,85,247,0) 100%)'
                : 'linear-gradient(90deg, rgba(168,85,247,0.4) 0%, rgba(168,85,247,0) 100%)'
            }}
            />
          </div>
        );
      case 'radial':
        return (
          <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded">
            <div className={cn(
              "w-6 h-6 rounded-full transition-all duration-300",
              isHovered ? "scale-110" : ""
            )}
            style={{
              background: isHovered
                ? 'radial-gradient(circle, rgba(236,72,153,0.8) 0%, rgba(236,72,153,0) 70%)'
                : 'radial-gradient(circle, rgba(236,72,153,0.4) 0%, rgba(236,72,153,0) 70%)'
            }}
            />
          </div>
        );
      case 'angular':
        return (
          <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded">
            <div className={cn(
              "w-6 h-6 rounded-full transition-all duration-300",
              isHovered ? "scale-110" : ""
            )}
            style={{
              background: isHovered
                ? 'conic-gradient(from 0deg, rgba(251,146,60,0.8), rgba(251,146,60,0) 50%, rgba(251,146,60,0.8))'
                : 'conic-gradient(from 0deg, rgba(251,146,60,0.4), rgba(251,146,60,0) 50%, rgba(251,146,60,0.4))'
            }}
            />
          </div>
        );
      case 'multiStop':
        return (
          <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded">
            <div className={cn(
              "w-7 h-4 rounded-sm transition-all duration-300",
              isHovered ? "scale-110" : ""
            )}
            style={{
              background: isHovered
                ? 'linear-gradient(90deg, rgba(34,211,238,0.8) 0%, rgba(34,211,238,0) 33%, rgba(34,211,238,0.8) 66%, rgba(34,211,238,0) 100%)'
                : 'linear-gradient(90deg, rgba(34,211,238,0.4) 0%, rgba(34,211,238,0) 33%, rgba(34,211,238,0.4) 66%, rgba(34,211,238,0) 100%)'
            }}
            />
          </div>
        );
      case 'trackMatte-alpha':
        return (
          <div className="relative w-full h-full flex items-center justify-center">
            <div className="relative">
              <div className={cn(
                "w-5 h-5 rounded-sm border-2 transition-all duration-300",
                isHovered ? "border-teal-400 bg-teal-400/30" : "border-teal-400/50 bg-teal-400/10"
              )} />
              <Eye className={cn(
                "absolute inset-0 m-auto w-3 h-3 transition-colors duration-300",
                isHovered ? "text-teal-300" : "text-teal-400/50"
              )} />
            </div>
          </div>
        );
      case 'trackMatte-luma':
        return (
          <div className="relative w-full h-full flex items-center justify-center">
            <div className="flex gap-0.5">
              <div className={cn(
                "w-2.5 h-5 rounded-l-sm transition-all duration-300",
                isHovered ? "bg-white" : "bg-white/60"
              )} />
              <div className={cn(
                "w-2.5 h-5 transition-all duration-300",
                isHovered ? "bg-gray-500" : "bg-gray-500/60"
              )} />
              <div className={cn(
                "w-2.5 h-5 rounded-r-sm transition-all duration-300",
                isHovered ? "bg-gray-900" : "bg-gray-900/60"
              )} />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className={cn(
      "w-8 h-8 rounded-md flex items-center justify-center shrink-0",
      "bg-gradient-to-br from-white/5 to-black/20",
      "border border-neutral-700/30",
      "transition-all duration-200",
      isHovered && "border-neutral-600/50"
    )}>
      {renderPreview()}
    </div>
  );
};

// ==========================================
// MASK ITEM COMPONENT
// ==========================================

interface MaskItemProps {
  item: MaskItemConfig;
  onAdd: () => void;
}

const MaskItem: React.FC<MaskItemProps> = ({ item, onAdd }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={onAdd}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "w-full p-2 rounded-md transition-all duration-200",
        "bg-neutral-800/30 hover:bg-neutral-700/40",
        "active:scale-[0.98]",
        "flex items-center gap-2.5 text-left group"
      )}
    >
      {/* Mask Preview */}
      <MaskPreview maskId={item.id} isHovered={isHovered} accentColor={item.accentColor} />

      {/* Text content */}
      <div className="flex-1 min-w-0">
        <div className={cn(
          "text-xs font-medium transition-colors duration-200",
          isHovered ? item.accentColor : "text-foreground/80"
        )}>
          {item.name}
        </div>
        <div className={cn(
          "text-[10px] line-clamp-1 transition-colors duration-200",
          isHovered ? "text-muted-foreground" : "text-muted-foreground/50"
        )}>
          {item.description}
        </div>
      </div>

      {/* Add indicator */}
      <div className={cn(
        "w-5 h-5 rounded flex items-center justify-center shrink-0",
        "transition-all duration-200",
        isHovered 
          ? "bg-primary/20 text-primary scale-100" 
          : "bg-transparent text-transparent scale-90"
      )}>
        <Zap className="w-3 h-3" />
      </div>
    </button>
  );
};

// ==========================================
// CATEGORY SECTION COMPONENT
// ==========================================

interface CategorySectionProps {
  categoryKey: string;
  items: MaskItemConfig[];
  onAddMask: (mask: Mask) => void;
  defaultOpen?: boolean;
}

const CategorySection: React.FC<CategorySectionProps> = ({
  categoryKey,
  items,
  onAddMask,
  defaultOpen = true,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const config = CATEGORY_CONFIGS[categoryKey];
  
  if (!config || items.length === 0) return null;
  
  const Icon = config.icon;

  return (
    <div className="rounded-lg overflow-hidden bg-neutral-800/30 border border-neutral-700/30">
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full px-2.5 py-2 flex items-center gap-2",
          "hover:bg-neutral-700/30 transition-all duration-200",
          "text-left group"
        )}
      >
        {React.createElement(Icon, { className: cn("w-3.5 h-3.5", config.accentColor) })}
        <span className="text-[11px] font-medium flex-1 text-foreground/90">
          {config.title}
        </span>
        <span className="text-[10px] text-muted-foreground/50 tabular-nums">
          {items.length}
        </span>
        <div className={cn(
          "w-4 h-4 flex items-center justify-center",
          "transition-transform duration-200",
          isOpen && "rotate-180"
        )}>
          <ChevronDown className="w-3 h-3 text-muted-foreground/50" />
        </div>
      </button>

      {/* Content */}
      {isOpen && (
        <div className="px-1.5 pb-1.5 space-y-1">
          {items.map((item) => (
            <MaskItem
              key={item.id}
              item={item}
              onAdd={() => {
                const mask = item.create();
                if (mask) onAddMask(mask);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ==========================================
// MAIN COMPONENT
// ==========================================

export const MaskAddPanel: React.FC<MaskAddPanelProps> = ({
  onAddMask,
  onCancel,
  availableOverlays = [],
  currentOverlayId,
  aspectRatio = 16 / 9,
  className,
}) => {
  const trackMatteSources = availableOverlays.filter(
    o => o.id !== currentOverlayId
  );

  // Shape masks
  const shapeMasks: MaskItemConfig[] = [
    {
      id: 'rectangle',
      name: 'Rectangle',
      description: 'Rectangular mask with optional rounded corners',
      icon: Square,
      category: 'shape',
      create: () => createRectangleMask(aspectRatio),
      accentColor: 'text-blue-400',
      previewGradient: 'from-blue-500/30 to-blue-600/10',
    },
    {
      id: 'ellipse',
      name: 'Ellipse',
      description: 'Elliptical or circular mask',
      icon: Circle,
      category: 'shape',
      create: () => createEllipseMask(aspectRatio),
      accentColor: 'text-sky-400',
      previewGradient: 'from-sky-500/30 to-sky-600/10',
    },
    {
      id: 'polygon',
      name: 'Polygon',
      description: 'Custom shape with straight edges',
      icon: Pentagon,
      category: 'shape',
      create: () => createPolygonMask(false),
      accentColor: 'text-indigo-400',
      previewGradient: 'from-indigo-500/30 to-indigo-600/10',
    },
    {
      id: 'bezier',
      name: 'Bezier Path',
      description: 'Smooth curved shape with bezier handles',
      icon: Spline,
      category: 'shape',
      create: () => createBezierMask(),
      accentColor: 'text-violet-400',
      previewGradient: 'from-violet-500/30 to-violet-600/10',
    },
  ];

  // Gradient masks
  const gradientMasks: MaskItemConfig[] = [
    {
      id: 'linear',
      name: 'Linear Gradient',
      description: 'Fade from one edge to another',
      icon: ArrowRight,
      category: 'gradient',
      create: () => createLinearGradientMask(90),
      accentColor: 'text-purple-400',
      previewGradient: 'from-purple-500/30 to-purple-600/10',
    },
    {
      id: 'radial',
      name: 'Radial Gradient',
      description: 'Circular fade from center outward',
      icon: Target,
      category: 'gradient',
      create: () => createRadialGradientMask(),
      accentColor: 'text-pink-400',
      previewGradient: 'from-pink-500/30 to-pink-600/10',
    },
    {
      id: 'angular',
      name: 'Angular Gradient',
      description: 'Sweep fade around a center point',
      icon: RotateCw,
      category: 'gradient',
      create: () => createAngularGradientMask(),
      accentColor: 'text-orange-400',
      previewGradient: 'from-orange-500/30 to-orange-600/10',
    },
    {
      id: 'multiStop',
      name: 'Multi-Stop',
      description: 'Custom gradient with multiple opacity stops',
      icon: Sliders,
      category: 'gradient',
      create: () => createMultiStopGradientMask('linear'),
      accentColor: 'text-cyan-400',
      previewGradient: 'from-cyan-500/30 to-cyan-600/10',
    },
  ];

  // Track mattes
  const trackMatteItems: MaskItemConfig[] = trackMatteSources.length > 0
    ? [
        {
          id: 'trackMatte-alpha',
          name: 'Alpha Matte',
          description: 'Use another layer\'s transparency as mask',
          icon: Eye,
          category: 'trackMatte',
          create: () => trackMatteSources[0] 
            ? createTrackMatte(trackMatteSources[0].id)
            : null,
          accentColor: 'text-teal-400',
          previewGradient: 'from-teal-500/30 to-teal-600/10',
        },
        {
          id: 'trackMatte-luma',
          name: 'Luma Matte',
          description: 'Use another layer\'s brightness as mask',
          icon: Blend,
          category: 'trackMatte',
          create: () => {
            if (!trackMatteSources[0]) return null;
            const matte = createTrackMatte(trackMatteSources[0].id);
            return { ...matte, matteType: 'luma' as TrackMatteType };
          },
          accentColor: 'text-slate-400',
          previewGradient: 'from-slate-500/30 to-slate-600/10',
        },
      ]
    : [];

  return (
    <div className={cn(
      "rounded-lg overflow-hidden",
      "bg-neutral-900/50 border border-neutral-700/50",
      className
    )}>
      {/* Panel Header */}
      <div className="px-3 py-2.5 border-b border-neutral-700/50 bg-neutral-800/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scan className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Add Mask</span>
          </div>
          {onCancel && (
            <button
              onClick={onCancel}
              className="text-[10px] font-medium px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-neutral-700/50 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Categories */}
      <div className="p-2 space-y-1.5 max-h-[400px] overflow-y-auto">
        <CategorySection
          categoryKey="shape"
          items={shapeMasks}
          onAddMask={onAddMask}
          defaultOpen={true}
        />

        <CategorySection
          categoryKey="gradient"
          items={gradientMasks}
          onAddMask={onAddMask}
          defaultOpen={true}
        />

        {trackMatteItems.length > 0 ? (
          <CategorySection
            categoryKey="trackMatte"
            items={trackMatteItems}
            onAddMask={onAddMask}
            defaultOpen={false}
          />
        ) : (
          <div className="rounded-lg overflow-hidden bg-neutral-800/20 border border-neutral-700/20">
            <div className="px-2.5 py-2 flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-muted-foreground/30" />
              <span className="text-[11px] font-medium text-muted-foreground/40 flex-1">Track Mattes</span>
            </div>
            <div className="px-2.5 pb-2">
              <p className="text-[10px] text-muted-foreground/30">
                Add other layers to use as track matte sources
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer tip */}
      <div className="px-3 py-2 border-t border-neutral-700/30">
        <p className="text-[10px] text-muted-foreground/50 flex items-center gap-1.5">
          <Zap className="w-3 h-3" />
          Click to add mask
        </p>
      </div>
    </div>
  );
};

export default MaskAddPanel;
