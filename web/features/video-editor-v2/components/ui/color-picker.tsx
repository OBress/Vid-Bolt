/**
 * ColorPicker - Wrapper component for color selection
 *
 * Uses react-best-gradient-color-picker under the hood
 */

import React from "react";
import GradientColorPicker from "react-best-gradient-color-picker";

export interface ColorPickerProps {
  /** Current color value */
  color: string;
  /** Callback when color changes */
  onChange: (color: string) => void;
  /** Whether to show alpha/opacity slider */
  showAlpha?: boolean;
  /** Height of the color picker */
  height?: number;
  /** Whether to show gradient controls */
  showGradient?: boolean;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  color,
  onChange,
  showAlpha = false,
  height = 200,
  showGradient = false,
}) => {
  return (
    <GradientColorPicker
      value={color}
      onChange={onChange}
      hideHue={false}
      hideControls={!showGradient}
      hideColorTypeBtns={!showGradient}
      hideAdvancedSliders={!showAlpha}
      hideColorGuide
      hideInputType={false}
      hideEyeDrop
      hideGradientControls={!showGradient}
      hideGradientType={!showGradient}
      hideGradientAngle={!showGradient}
      hideGradientStop={!showGradient}
      height={height}
    />
  );
};

export default ColorPicker;
