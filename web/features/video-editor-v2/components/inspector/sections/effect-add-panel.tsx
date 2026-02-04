/**
 * EffectAddPanel - Professional effect browser panel
 * 
 * A polished UI for adding effects with:
 * - Color-coded categories with visual previews
 * - Animated hover states
 * - Effect preview thumbnails
 * - Built into the Effects tab
 */

import React, { useState } from "react";
import { cn } from "../../../utils/general/utils";
import {
  EffectType,
  EFFECT_METADATA,
  getAddableEffectTypes,
} from "../../../types/effects";
import {
  Circle,
  Square,
  Sun,
  Aperture,
  Triangle,
  Sparkles,
  ImageOff,
  Palette,
  RefreshCw,
  ChevronDown,
  Droplets,
  Contrast,
  Blend,
  Zap,
  Focus,
  Wand2,
} from "lucide-react";

// ==========================================
// TYPES
// ==========================================

interface EffectAddPanelProps {
  onAddEffect: (type: EffectType) => void;
  onCancel?: () => void;
  className?: string;
}

interface EffectItemConfig {
  type: EffectType;
  name: string;
  description: string;
  icon: React.ElementType;
  category: string;
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
// CATEGORY COLORS
// ==========================================

const CATEGORY_CONFIGS: Record<string, CategoryConfig> = {
  blur: {
    title: "Blur & Sharpen",
    icon: Droplets,
    accentColor: "text-cyan-400",
    bgGradient: "from-cyan-500/20 to-cyan-600/5",
  },
  shadow: {
    title: "Shadow & Glow",
    icon: Sun,
    accentColor: "text-amber-400",
    bgGradient: "from-amber-500/20 to-amber-600/5",
  },
  color: {
    title: "Color & Light",
    icon: Contrast,
    accentColor: "text-violet-400",
    bgGradient: "from-violet-500/20 to-violet-600/5",
  },
  stylize: {
    title: "Stylize",
    icon: Palette,
    accentColor: "text-rose-400",
    bgGradient: "from-rose-500/20 to-rose-600/5",
  },
};

// ==========================================
// EFFECT CONFIGS WITH VISUALS
// ==========================================

const EFFECT_CONFIGS: Record<EffectType, { 
  icon: React.ElementType; 
  accentColor: string;
  previewGradient: string;
}> = {
  [EffectType.MOTION]: { 
    icon: Square, 
    accentColor: "text-blue-400",
    previewGradient: "from-blue-500/30 to-blue-600/10"
  },
  [EffectType.OPACITY]: { 
    icon: Blend, 
    accentColor: "text-gray-400",
    previewGradient: "from-gray-500/30 to-gray-600/10"
  },
  [EffectType.BLUR]: { 
    icon: Droplets, 
    accentColor: "text-cyan-400",
    previewGradient: "from-cyan-500/30 to-cyan-600/10"
  },
  [EffectType.DROP_SHADOW]: { 
    icon: Square, 
    accentColor: "text-amber-400",
    previewGradient: "from-amber-500/30 to-amber-600/10"
  },
  [EffectType.GLOW]: { 
    icon: Sun, 
    accentColor: "text-yellow-400",
    previewGradient: "from-yellow-500/30 to-yellow-600/10"
  },
  [EffectType.VIGNETTE]: { 
    icon: Aperture, 
    accentColor: "text-violet-400",
    previewGradient: "from-violet-500/30 to-violet-600/10"
  },
  [EffectType.SHARPEN]: { 
    icon: Focus, 
    accentColor: "text-emerald-400",
    previewGradient: "from-emerald-500/30 to-emerald-600/10"
  },
  [EffectType.NOISE]: { 
    icon: Sparkles, 
    accentColor: "text-pink-400",
    previewGradient: "from-pink-500/30 to-pink-600/10"
  },
  [EffectType.GRAYSCALE]: { 
    icon: ImageOff, 
    accentColor: "text-slate-400",
    previewGradient: "from-slate-500/30 to-slate-600/10"
  },
  [EffectType.SEPIA]: { 
    icon: Palette, 
    accentColor: "text-orange-400",
    previewGradient: "from-orange-500/30 to-orange-600/10"
  },
  [EffectType.INVERT]: { 
    icon: RefreshCw, 
    accentColor: "text-fuchsia-400",
    previewGradient: "from-fuchsia-500/30 to-fuchsia-600/10"
  },
};

// ==========================================
// EFFECT PREVIEW COMPONENT
// ==========================================

interface EffectPreviewProps {
  type: EffectType;
  isHovered: boolean;
}

const EffectPreview: React.FC<EffectPreviewProps> = ({ type, isHovered }) => {
  const config = EFFECT_CONFIGS[type];
  
  // Custom previews for each effect type
  const renderPreview = () => {
    switch (type) {
      case EffectType.BLUR:
        return (
          <div className="relative w-full h-full flex items-center justify-center">
            <div className={cn(
              "w-5 h-5 rounded-full bg-gradient-to-br from-cyan-400 to-cyan-600",
              "transition-all duration-300",
              isHovered ? "blur-[3px] scale-110" : "blur-[1px]"
            )} />
          </div>
        );
      case EffectType.DROP_SHADOW:
        return (
          <div className="relative w-full h-full flex items-center justify-center">
            <div className={cn(
              "absolute w-4 h-4 rounded bg-black/40 transition-all duration-300",
              isHovered ? "translate-x-1.5 translate-y-1.5 blur-sm" : "translate-x-1 translate-y-1 blur-[2px]"
            )} />
            <div className="relative w-4 h-4 rounded bg-gradient-to-br from-amber-400 to-amber-600" />
          </div>
        );
      case EffectType.GLOW:
        return (
          <div className="relative w-full h-full flex items-center justify-center">
            <div className={cn(
              "absolute w-6 h-6 rounded-full bg-yellow-400/60 transition-all duration-300",
              isHovered ? "blur-md scale-125" : "blur-sm"
            )} />
            <div className="relative w-3 h-3 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-500" />
          </div>
        );
      case EffectType.VIGNETTE:
        return (
          <div className="relative w-full h-full overflow-hidden rounded">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-400/40 to-violet-500/40" />
            <div className={cn(
              "absolute inset-0 transition-all duration-300",
              "bg-[radial-gradient(circle_at_center,transparent_30%,rgba(0,0,0,0.8)_100%)]",
              isHovered ? "opacity-100" : "opacity-60"
            )} />
          </div>
        );
      case EffectType.SHARPEN:
        return (
          <div className="relative w-full h-full flex items-center justify-center">
            <div className={cn(
              "w-5 h-5 transition-all duration-300",
              isHovered ? "scale-110" : ""
            )}>
              <div className="absolute inset-0 border-2 border-emerald-400 rounded-sm" />
              <div className={cn(
                "absolute inset-1 border border-emerald-500/50 rounded-sm transition-opacity",
                isHovered ? "opacity-100" : "opacity-50"
              )} />
            </div>
          </div>
        );
      case EffectType.NOISE:
        return (
          <div className="relative w-full h-full overflow-hidden rounded">
            <div className="absolute inset-0 bg-gradient-to-br from-pink-400/30 to-pink-500/30" />
            <div 
              className={cn(
                "absolute inset-0 transition-opacity duration-300",
                isHovered ? "opacity-80" : "opacity-40"
              )}
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
              }}
            />
          </div>
        );
      case EffectType.GRAYSCALE:
        return (
          <div className="relative w-full h-full flex items-center justify-center">
            <div className={cn(
              "w-6 h-4 rounded-sm overflow-hidden flex transition-all duration-300",
              isHovered ? "scale-110" : ""
            )}>
              <div className="flex-1 bg-red-400" style={{ filter: isHovered ? 'grayscale(100%)' : 'grayscale(50%)' }} />
              <div className="flex-1 bg-green-400" style={{ filter: isHovered ? 'grayscale(100%)' : 'grayscale(50%)' }} />
              <div className="flex-1 bg-blue-400" style={{ filter: isHovered ? 'grayscale(100%)' : 'grayscale(50%)' }} />
            </div>
          </div>
        );
      case EffectType.SEPIA:
        return (
          <div className="relative w-full h-full flex items-center justify-center">
            <div className={cn(
              "w-5 h-5 rounded transition-all duration-300",
              isHovered 
                ? "bg-gradient-to-br from-amber-700 to-amber-900" 
                : "bg-gradient-to-br from-amber-600/70 to-amber-800/70"
            )} />
          </div>
        );
      case EffectType.INVERT:
        return (
          <div className="relative w-full h-full flex items-center justify-center">
            <div className={cn(
              "w-5 h-5 rounded-full overflow-hidden transition-all duration-300",
              isHovered ? "scale-110" : ""
            )}>
              <div className="absolute inset-0 bg-gradient-to-br from-white to-gray-200" 
                   style={{ filter: isHovered ? 'invert(100%)' : 'invert(50%)' }} />
            </div>
          </div>
        );
      default:
        return (
          <config.icon className={cn(
            "w-5 h-5 transition-all duration-300",
            isHovered ? config.accentColor : "text-muted-foreground"
          )} />
        );
    }
  };

  return (
    <div className={cn(
      "w-8 h-8 rounded-md flex items-center justify-center shrink-0",
      "bg-gradient-to-br",
      config.previewGradient,
      "border border-neutral-700/30",
      "transition-all duration-200",
      isHovered && "border-neutral-600/50"
    )}>
      {renderPreview()}
    </div>
  );
};

// ==========================================
// EFFECT ITEM COMPONENT
// ==========================================

interface EffectItemProps {
  item: EffectItemConfig;
  onAdd: () => void;
}

const EffectItem: React.FC<EffectItemProps> = ({ item, onAdd }) => {
  const [isHovered, setIsHovered] = useState(false);
  const config = EFFECT_CONFIGS[item.type];

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
      {/* Effect Preview */}
      <EffectPreview type={item.type} isHovered={isHovered} />

      {/* Text content */}
      <div className="flex-1 min-w-0">
        <div className={cn(
          "text-xs font-medium transition-colors duration-200",
          isHovered ? config.accentColor : "text-foreground/80"
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
  items: EffectItemConfig[];
  onAddEffect: (type: EffectType) => void;
  defaultOpen?: boolean;
}

const CategorySection: React.FC<CategorySectionProps> = ({
  categoryKey,
  items,
  onAddEffect,
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
        <Icon className={cn("w-3.5 h-3.5", config.accentColor)} />
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
            <EffectItem
              key={item.type}
              item={item}
              onAdd={() => onAddEffect(item.type)}
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

export const EffectAddPanel: React.FC<EffectAddPanelProps> = ({
  onAddEffect,
  onCancel,
  className,
}) => {
  const addableTypes = getAddableEffectTypes();

  // Build effect item configurations
  const buildEffectItem = (type: EffectType): EffectItemConfig => {
    const metadata = EFFECT_METADATA[type];
    const config = EFFECT_CONFIGS[type];
    return {
      type,
      name: metadata.name,
      description: metadata.description,
      icon: config.icon,
      category: metadata.category,
      accentColor: config.accentColor,
      previewGradient: config.previewGradient,
    };
  };

  // Group effects by category
  const blurEffects = addableTypes
    .filter(t => EFFECT_METADATA[t].category === 'blur')
    .map(buildEffectItem);

  const shadowEffects = addableTypes
    .filter(t => EFFECT_METADATA[t].category === 'shadow')
    .map(buildEffectItem);

  const colorEffects = addableTypes
    .filter(t => EFFECT_METADATA[t].category === 'color')
    .map(buildEffectItem);

  const adjustmentEffects = addableTypes
    .filter(t => EFFECT_METADATA[t].category === 'adjustment')
    .map(buildEffectItem);

  const distortEffects = addableTypes
    .filter(t => EFFECT_METADATA[t].category === 'distort')
    .map(buildEffectItem);

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
            <Wand2 className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Add Effect</span>
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
          categoryKey="blur"
          items={[...blurEffects, ...distortEffects.filter(e => e.type === EffectType.SHARPEN)]}
          onAddEffect={onAddEffect}
          defaultOpen={true}
        />

        <CategorySection
          categoryKey="shadow"
          items={shadowEffects}
          onAddEffect={onAddEffect}
          defaultOpen={true}
        />

        <CategorySection
          categoryKey="color"
          items={colorEffects}
          onAddEffect={onAddEffect}
          defaultOpen={true}
        />

        <CategorySection
          categoryKey="stylize"
          items={[
            ...adjustmentEffects,
            ...distortEffects.filter(e => e.type === EffectType.NOISE),
          ]}
          onAddEffect={onAddEffect}
          defaultOpen={true}
        />
      </div>

      {/* Footer tip */}
      <div className="px-3 py-2 border-t border-neutral-700/30">
        <p className="text-[10px] text-muted-foreground/50 flex items-center gap-1.5">
          <Zap className="w-3 h-3" />
          Click to add effect
        </p>
      </div>
    </div>
  );
};

export default EffectAddPanel;
