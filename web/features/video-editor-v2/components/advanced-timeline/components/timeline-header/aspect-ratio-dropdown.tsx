
import React from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../ui/dropdown-menu';
import {
  Monitor,
  Square,
  Smartphone,
  Instagram,
  Settings2,
  Check,
  ChevronDown
} from 'lucide-react';
import { Button } from '../../../ui/button';
import type { AspectRatio } from '../../../../types';

// Resolution options with display names and dimensions
export const RESOLUTION_OPTIONS = [
  {
    value: "720p" as const,
    label: "720p",
    description: "1280x720",
    dimensions: { width: 1280, height: 720 },
    icon: Monitor,
    color: "text-blue-500"
  },
  {
    value: "1080p" as const,
    label: "1080p",
    description: "1920x1080",
    dimensions: { width: 1920, height: 1080 },
    icon: Monitor,
    color: "text-green-500"
  },
  {
    value: "1440p" as const,
    label: "1440p",
    description: "2560x1440",
    dimensions: { width: 2560, height: 1440 },
    icon: Monitor,
    color: "text-purple-500"
  },
  {
    value: "4K" as const,
    label: "4K",
    description: "3840x2160",
    dimensions: { width: 3840, height: 2160 },
    icon: Monitor,
    color: "text-red-500"
  },
];

export type ResolutionPreset = typeof RESOLUTION_OPTIONS[number]["value"];

interface AspectRatioDropdownProps {
  /** Current aspect ratio */
  aspectRatio: AspectRatio;
  /** Callback when aspect ratio changes */
  onAspectRatioChange: (ratio: AspectRatio) => void;
  /** Whether the dropdown is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// Aspect ratio options with icons and display names
const ASPECT_RATIO_OPTIONS = [
  {
    value: "16:9" as AspectRatio,
    label: "16:9",
    description: "Widescreen",
    icon: Monitor,
    color: "text-blue-500"
  },
  {
    value: "9:16" as AspectRatio,
    label: "9:16", 
    description: "Vertical",
    icon: Smartphone,
    color: "text-purple-500"
  },
  {
    value: "1:1" as AspectRatio,
    label: "1:1",
    description: "Square",
    icon: Square,
    color: "text-green-500"
  },
  {
    value: "4:5" as AspectRatio,
    label: "4:5",
    description: "Portrait",
    icon: Instagram,
    color: "text-pink-500"
  }
];

export const AspectRatioDropdown: React.FC<AspectRatioDropdownProps> = ({
  aspectRatio,
  onAspectRatioChange,
  disabled = false,
  className = "",
}) => {
  // Find the current aspect ratio option
  const currentOption = ASPECT_RATIO_OPTIONS.find(option => option.value === aspectRatio);
  
  /**
   * When aspect ratio changes, all overlays are automatically transformed
   * to maintain their relative positions on the new canvas size.
   * This is handled by the editor provider using aspect-ratio-transform utility.
   */

  return (
    <div className="hidden md:block">
    <div className="bg-neutral-800/60 rounded-md px-1 py-1">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm"
          disabled={disabled}
          className={`gap-2 min-w-[90px] h-7 justify-between hover:bg-muted/50 shadow-none border-0 ${className}`}
          onTouchStart={(e) => e.preventDefault()}
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <div className="flex items-center gap-2">
            {currentOption && (
              <>
                <currentOption.icon className="h-3.5 w-3.5 text-white" />
                <span className="text-white font-extralight text-xs">{currentOption.label}</span>
              </>
            )}
          </div>
          <ChevronDown className="h-3 w-3 text-white/70" />
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent className="w-56 border-border bg-popover" align="start">
        <DropdownMenuLabel className="flex items-center gap-2 text-popover-foreground font-extralight">
          <Settings2 className="h-4 w-4" />
          Aspect Ratio
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        <DropdownMenuRadioGroup 
          value={aspectRatio} 
          onValueChange={(value) => onAspectRatioChange(value as AspectRatio)}
        >
          {ASPECT_RATIO_OPTIONS.map((option) => (
            <DropdownMenuRadioItem 
              key={option.value} 
              value={option.value}
              className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
            >
              <option.icon className={`h-4 w-4 ${option.color}`} />
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-extralight">{option.label}</span>
                  {aspectRatio === option.value && (
                    <Check className="h-3 w-3 text-primary" />
                  )}
                </div>
                <span className="text-xs text-muted-foreground font-extralight">{option.description}</span>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
    </div>
    </div>
  );
};

interface ResolutionDropdownProps {
  /** Current resolution preset */
  resolution: ResolutionPreset;
  /** Callback when resolution changes */
  onResolutionChange: (resolution: ResolutionPreset) => void;
  /** Whether the dropdown is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export const ResolutionDropdown: React.FC<ResolutionDropdownProps> = ({
  resolution,
  onResolutionChange,
  disabled = false,
  className = "",
}) => {
  // Find the current resolution option
  const currentOption = RESOLUTION_OPTIONS.find(option => option.value === resolution);

  return (
    <div className="bg-neutral-800/60 rounded-md px-1 py-1">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          className={`gap-2 min-w-[90px] h-7 justify-between hover:bg-muted/50 shadow-none border-0 ${className}`}
          onTouchStart={(e) => e.preventDefault()}
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <div className="flex items-center gap-2">
            {currentOption && (
              <>
                <currentOption.icon className="h-3.5 w-3.5 text-white" />
                <span className="text-white font-extralight text-xs">{currentOption.label}</span>
              </>
            )}
          </div>
          <ChevronDown className="h-3 w-3 text-white/70" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-56 border-border bg-popover" align="start">
        <DropdownMenuLabel className="flex items-center gap-2 text-popover-foreground font-extralight">
          <Settings2 className="h-4 w-4" />
          Resolution
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuRadioGroup
          value={resolution}
          onValueChange={(value) => onResolutionChange(value as ResolutionPreset)}
        >
          {RESOLUTION_OPTIONS.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
            >
              <option.icon className={`h-4 w-4 ${option.color}`} />
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-extralight">{option.label}</span>
                  {resolution === option.value && (
                    <Check className="h-3 w-3 text-primary" />
                  )}
                </div>
                <span className="text-xs text-muted-foreground font-extralight">{option.description}</span>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
    </div>
  );
}; 
