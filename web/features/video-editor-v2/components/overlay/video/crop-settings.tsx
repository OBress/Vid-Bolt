import React from "react";
import { ClipOverlay } from "../../../types";
import { generateClipPath } from "../../../utils/crop-utils";
import { Crop } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";

const ASPECT_RATIOS = [
  { value: "original", label: "Original", ratio: null },
  { value: "16:9", label: "16:9", ratio: 16 / 9 },
  { value: "9:16", label: "9:16", ratio: 9 / 16 },
  { value: "1:1", label: "1:1", ratio: 1 },
  { value: "4:5", label: "4:5", ratio: 4 / 5 },
  { value: "5:4", label: "5:4", ratio: 5 / 4 },
  { value: "4:3", label: "4:3", ratio: 4 / 3 },
  { value: "3:4", label: "3:4", ratio: 3 / 4 },
  { value: "21:9", label: "21:9 (Cinematic)", ratio: 21 / 9 },
];

interface CropSettingsProps {
  localOverlay: ClipOverlay;
  handleStyleChange: (updates: Partial<ClipOverlay["styles"]>) => void;
}

/**
 * CropSettings Component
 * Provides crop aspect ratio selection for video/image overlays.
 */
export const CropSettings: React.FC<CropSettingsProps> = ({
  localOverlay,
  handleStyleChange,
}) => {
  // Determine current aspect ratio selection
  const getCurrentAspectRatio = (): string => {
    if (!localOverlay?.styles?.cropEnabled) return "original";
    
    const cropWidth = localOverlay.styles.cropWidth ?? 100;
    const cropHeight = localOverlay.styles.cropHeight ?? 100;
    
    // If full crop (no actual cropping), it's original
    if (cropWidth === 100 && cropHeight === 100) return "original";
    
    // Calculate the effective crop ratio
    const videoWidth = localOverlay.width;
    const videoHeight = localOverlay.height;
    const effectiveWidth = (cropWidth / 100) * videoWidth;
    const effectiveHeight = (cropHeight / 100) * videoHeight;
    const effectiveRatio = effectiveWidth / effectiveHeight;
    
    // Find matching preset (with tolerance)
    for (const preset of ASPECT_RATIOS) {
      if (preset.ratio && Math.abs(effectiveRatio - preset.ratio) < 0.05) {
        return preset.value;
      }
    }
    
    return "custom";
  };

  const handleAspectRatioChange = (value: string) => {
    if (value === "original") {
      // Reset to no crop
      handleStyleChange({
        cropEnabled: false,
        cropX: undefined,
        cropY: undefined,
        cropWidth: undefined,
        cropHeight: undefined,
        clipPath: undefined,
      });
      return;
    }

    const preset = ASPECT_RATIOS.find(ar => ar.value === value);
    if (!preset || !preset.ratio) return;

    const targetRatio = preset.ratio;
    const videoWidth = localOverlay.width;
    const videoHeight = localOverlay.height;
    const videoRatio = videoWidth / videoHeight;

    let cropWidth: number;
    let cropHeight: number;
    let cropX: number;
    let cropY: number;

    if (videoRatio > targetRatio) {
      cropHeight = 100;
      cropWidth = (targetRatio * videoHeight / videoWidth) * 100;
      cropX = (100 - cropWidth) / 2;
      cropY = 0;
    } else {
      cropWidth = 100;
      cropHeight = (videoWidth / (targetRatio * videoHeight)) * 100;
      cropX = 0;
      cropY = (100 - cropHeight) / 2;
    }

    const roundedCropX = Math.round(cropX * 100) / 100;
    const roundedCropY = Math.round(cropY * 100) / 100;
    const roundedCropWidth = Math.round(cropWidth * 100) / 100;
    const roundedCropHeight = Math.round(cropHeight * 100) / 100;

    const clipPath = generateClipPath(roundedCropX, roundedCropY, roundedCropWidth, roundedCropHeight);

    handleStyleChange({
      cropEnabled: true,
      cropX: roundedCropX,
      cropY: roundedCropY,
      cropWidth: roundedCropWidth,
      cropHeight: roundedCropHeight,
      clipPath,
    });
  };

  const currentValue = getCurrentAspectRatio();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Crop className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Crop</span>
      </div>

      <Select value={currentValue} onValueChange={handleAspectRatioChange}>
        <SelectTrigger className="w-full h-9 bg-neutral-800 border-none text-sm">
          <SelectValue placeholder="Select aspect ratio" />
        </SelectTrigger>
        <SelectContent>
          {ASPECT_RATIOS.map((ratio) => (
            <SelectItem key={ratio.value} value={ratio.value}>
              <div className="flex items-center gap-2">
                {ratio.ratio && (
                  <div
                    className="bg-neutral-500 rounded-sm"
                    style={{
                      width: ratio.ratio >= 1 ? '16px' : `${16 * ratio.ratio}px`,
                      height: ratio.ratio >= 1 ? `${16 / ratio.ratio}px` : '16px',
                    }}
                  />
                )}
                <span>{ratio.label}</span>
              </div>
            </SelectItem>
          ))}
          {currentValue === "custom" && (
            <SelectItem value="custom" disabled>
              Custom (drag to adjust)
            </SelectItem>
          )}
        </SelectContent>
      </Select>

      {currentValue !== "original" && (
        <p className="text-xs text-muted-foreground">
          Drag handles on canvas to fine-tune
        </p>
      )}
    </div>
  );
};
