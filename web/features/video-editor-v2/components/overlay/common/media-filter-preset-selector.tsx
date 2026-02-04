import React, { useState } from "react";
import { ChevronDown, Check, Sparkles } from "lucide-react";
import { defaultMediaFilterPresets, MediaFilterPreset } from "../../../types/media-filters";
import { ClipOverlay, ImageOverlay } from "../../../types";

interface MediaFilterPresetSelectorProps {
  localOverlay: ClipOverlay | ImageOverlay;
  handleStyleChange: (
    updates: Partial<ClipOverlay["styles"] | ImageOverlay["styles"]>
  ) => void;
}

/**
 * MediaFilterPresetSelector Component
 * A visual component for selecting predefined filters/presets for media.
 */
export const MediaFilterPresetSelector: React.FC<
  MediaFilterPresetSelectorProps
> = ({ localOverlay, handleStyleChange }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getCurrentPresetId = (): string => {
    const currentFilter = localOverlay?.styles?.filter || "none";

    if (!currentFilter || currentFilter === "none") {
      return "none";
    }

    const matchingPreset = defaultMediaFilterPresets.find(
      (preset: MediaFilterPreset) => preset.filter === currentFilter
    );

    return matchingPreset?.id || "custom";
  };

  const getCurrentPresetName = (): string => {
    const currentId = getCurrentPresetId();
    if (currentId === "custom") return "Custom";
    const preset = defaultMediaFilterPresets.find((p: MediaFilterPreset) => p.id === currentId);
    return preset?.name || "None";
  };

  const handlePresetChange = (presetId: string) => {
    const selectedPreset = defaultMediaFilterPresets.find(
      (preset: MediaFilterPreset) => preset.id === presetId
    );

    if (selectedPreset) {
      let newFilter = selectedPreset.filter;

      if (presetId === "none") {
        newFilter = "none";
      } else {
        const currentFilter = localOverlay?.styles?.filter;
        const brightnessMatch = currentFilter?.match(/brightness\((\d+)%\)/);

        if (
          brightnessMatch &&
          brightnessMatch[1] &&
          !newFilter.includes("brightness") &&
          newFilter !== "none"
        ) {
          newFilter = `${newFilter} brightness(${brightnessMatch[1]}%)`;
        }
      }

      handleStyleChange({ filter: newFilter });
      setIsExpanded(false);
    }
  };

  const getMediaContent = () => {
    if (localOverlay.type === "video") {
      return (localOverlay as ClipOverlay).content;
    } else {
      return (localOverlay as ImageOverlay).src;
    }
  };

  return (
    <div className="space-y-2">
      {/* Current filter display and toggle button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex justify-between items-center w-full bg-neutral-800 rounded-md text-xs p-2.5 hover:bg-neutral-700 transition-colors text-foreground"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{getCurrentPresetName()}</span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Expanded filter grid */}
      {isExpanded && (
        <div className="mt-2 grid grid-cols-3 gap-2 bg-neutral-800 p-2.5 rounded-lg">
          {defaultMediaFilterPresets.map((preset: MediaFilterPreset) => {
            const isActive = getCurrentPresetId() === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => handlePresetChange(preset.id)}
                className={`relative p-1.5 rounded-md overflow-hidden flex flex-col items-center transition-all ${
                  isActive 
                    ? "ring-2 ring-primary bg-neutral-700/50" 
                    : "hover:bg-neutral-700/50"
                }`}
              >
                {/* Media thumbnail with filter applied */}
                <div className="relative h-14 w-full mb-1.5 rounded overflow-hidden bg-neutral-900">
                  <img
                    src={getMediaContent()}
                    alt={`${preset.name} preview`}
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ filter: preset.filter }}
                  />
                  {isActive && (
                    <div className="absolute top-1 right-1 bg-primary rounded-full p-0.5">
                      <Check className="h-2.5 w-2.5 text-primary-foreground" />
                    </div>
                  )}
                </div>
                <span className="text-[10px] leading-tight text-center text-muted-foreground">
                  {preset.name}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
