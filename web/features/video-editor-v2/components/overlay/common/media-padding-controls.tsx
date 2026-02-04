import React from "react";
import { ClipOverlay, ImageOverlay } from "../../../types";
import { Slider } from "../../ui/slider";
import { Button } from "../../ui/button";
import ColorPicker from "react-best-gradient-color-picker";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { BoxSelect, Palette, RotateCcw } from "lucide-react";

interface MediaPaddingControlsProps {
  localOverlay: ClipOverlay | ImageOverlay;
  handleStyleChange: (
    updates: Partial<ClipOverlay["styles"] | ImageOverlay["styles"]>
  ) => void;
}

/**
 * MediaPaddingControls Component
 * Controls for padding and padding background color.
 */
export const MediaPaddingControls: React.FC<MediaPaddingControlsProps> = ({
  localOverlay,
  handleStyleChange,
}) => {
  const paddingValue = localOverlay?.styles?.padding || "0px";
  const paddingMatch = paddingValue.match(/^(\d+)px$/);
  const numericPadding = paddingMatch ? parseInt(paddingMatch[1], 10) : 0;
  const paddingBackgroundColor = localOverlay?.styles?.paddingBackgroundColor || "white";
  const hasChanges = numericPadding > 0 || paddingBackgroundColor !== "white";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BoxSelect className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Padding</span>
      </div>

      {/* Padding Slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Size</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {numericPadding}px
          </span>
        </div>
        <Slider
          value={[numericPadding]}
          onValueChange={(value) =>
            handleStyleChange({ padding: `${value[0]}px` })
          }
          min={0}
          max={100}
          step={5}
          className="w-full"
        />
      </div>

      {/* Padding Background Color */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Palette className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Background Color</span>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="h-8 w-8 rounded-md cursor-pointer shrink-0 ring-1 ring-neutral-700 hover:ring-neutral-600 transition-colors"
                style={{ backgroundColor: paddingBackgroundColor }}
              />
            </PopoverTrigger>
            <PopoverContent
              className="w-[330px] bg-neutral-900 border-neutral-700 p-3"
              side="right"
            >
              <ColorPicker
                value={paddingBackgroundColor}
                onChange={(color) => handleStyleChange({ paddingBackgroundColor: color })}
                hideHue
                hideControls
                hideColorTypeBtns
                hideAdvancedSliders
                hideColorGuide
                hideInputType
                height={200}
              />
            </PopoverContent>
          </Popover>
          <input
            type="text"
            value={paddingBackgroundColor}
            onChange={(e) =>
              handleStyleChange({ paddingBackgroundColor: e.target.value })
            }
            placeholder="white"
            className="flex-1 bg-neutral-800 rounded-md text-xs p-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Reset Button */}
      {hasChanges && (
        <Button
          onClick={() =>
            handleStyleChange({ padding: "0px", paddingBackgroundColor: "white" })
          }
          variant="ghost"
          size="sm"
          className="w-full text-xs h-8 text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3 mr-2" />
          Reset Padding
        </Button>
      )}
    </div>
  );
};
