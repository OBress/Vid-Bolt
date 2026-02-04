import React from "react";
import {
  AlignVerticalJustifyStart,
  AlignVerticalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyEnd,
  SquareDot,
  Move,
  Maximize,
} from "lucide-react";
import { useEditorContext } from "../../../contexts/editor-context";

type PositionPreset =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"
  | "fullscreen";

interface PositionSettingsProps {
  overlayWidth: number;
  overlayHeight: number;
  onPositionChange: (updates: {
    left?: number;
    top?: number;
    width?: number;
    height?: number;
  }) => void;
}

export const PositionSettings: React.FC<PositionSettingsProps> = ({
  overlayWidth,
  overlayHeight,
  onPositionChange,
}) => {
  const { getAspectRatioDimensions } = useEditorContext();

  const handlePositionPreset = (preset: PositionPreset) => {
    const canvasDimensions = getAspectRatioDimensions();

    let updates: {
      left?: number;
      top?: number;
      width?: number;
      height?: number;
    } = {};

    switch (preset) {
      case "fullscreen":
        updates = {
          left: 0,
          top: 0,
          width: canvasDimensions.width,
          height: canvasDimensions.height,
        };
        break;

      case "center":
        updates = {
          left: (canvasDimensions.width - overlayWidth) / 2,
          top: (canvasDimensions.height - overlayHeight) / 2,
        };
        break;

      case "top-left":
        updates = { left: 0, top: 0 };
        break;

      case "top-center":
        updates = {
          left: (canvasDimensions.width - overlayWidth) / 2,
          top: 0,
        };
        break;

      case "top-right":
        updates = {
          left: canvasDimensions.width - overlayWidth,
          top: 0,
        };
        break;

      case "center-left":
        updates = {
          left: 0,
          top: (canvasDimensions.height - overlayHeight) / 2,
        };
        break;

      case "center-right":
        updates = {
          left: canvasDimensions.width - overlayWidth,
          top: (canvasDimensions.height - overlayHeight) / 2,
        };
        break;

      case "bottom-left":
        updates = {
          left: 0,
          top: canvasDimensions.height - overlayHeight,
        };
        break;

      case "bottom-center":
        updates = {
          left: (canvasDimensions.width - overlayWidth) / 2,
          top: canvasDimensions.height - overlayHeight,
        };
        break;

      case "bottom-right":
        updates = {
          left: canvasDimensions.width - overlayWidth,
          top: canvasDimensions.height - overlayHeight,
        };
        break;
    }

    onPositionChange(updates);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Move className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Position</span>
      </div>

      {/* 3x3 grid for position presets */}
      <div className="grid grid-cols-3 gap-1">
        <button
          onClick={() => handlePositionPreset("top-left")}
          className="h-8 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 transition-colors"
          title="Top Left"
        >
          <AlignHorizontalJustifyStart className="h-3.5 w-3.5 rotate-90 text-muted-foreground" />
        </button>
        <button
          onClick={() => handlePositionPreset("top-center")}
          className="h-8 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 transition-colors"
          title="Top Center"
        >
          <AlignVerticalJustifyStart className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <button
          onClick={() => handlePositionPreset("top-right")}
          className="h-8 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 transition-colors"
          title="Top Right"
        >
          <AlignHorizontalJustifyEnd className="h-3.5 w-3.5 rotate-90 text-muted-foreground" />
        </button>
        
        <button
          onClick={() => handlePositionPreset("center-left")}
          className="h-8 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 transition-colors"
          title="Center Left"
        >
          <AlignHorizontalJustifyStart className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <button
          onClick={() => handlePositionPreset("center")}
          className="h-8 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 transition-colors"
          title="Center"
        >
          <SquareDot className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <button
          onClick={() => handlePositionPreset("center-right")}
          className="h-8 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 transition-colors"
          title="Center Right"
        >
          <AlignHorizontalJustifyEnd className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        
        <button
          onClick={() => handlePositionPreset("bottom-left")}
          className="h-8 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 transition-colors"
          title="Bottom Left"
        >
          <AlignHorizontalJustifyStart className="h-3.5 w-3.5 rotate-90 transform scale-y-[-1] text-muted-foreground" />
        </button>
        <button
          onClick={() => handlePositionPreset("bottom-center")}
          className="h-8 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 transition-colors"
          title="Bottom Center"
        >
          <AlignVerticalJustifyEnd className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <button
          onClick={() => handlePositionPreset("bottom-right")}
          className="h-8 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 transition-colors"
          title="Bottom Right"
        >
          <AlignHorizontalJustifyEnd className="h-3.5 w-3.5 rotate-90 transform scale-y-[-1] text-muted-foreground" />
        </button>
      </div>
      
      {/* Fullscreen button */}
      <button
        onClick={() => handlePositionPreset("fullscreen")}
        className="w-full h-8 flex items-center justify-center gap-1.5 rounded bg-neutral-800 hover:bg-neutral-700 transition-colors"
        title="Fill Canvas"
      >
        <Maximize className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Fill Canvas</span>
      </button>
    </div>
  );
};
