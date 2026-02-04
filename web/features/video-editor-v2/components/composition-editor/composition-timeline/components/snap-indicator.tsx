/**
 * SnapIndicator - Visual indicator line shown when snapping during drag
 * 
 * Shows a vertical line where the layer is snapping to, with animation.
 */

import React from 'react';
import { AE_COLORS } from '../constants';

interface SnapIndicatorProps {
  x: number;
  visible: boolean;
}

export const SnapIndicator: React.FC<SnapIndicatorProps> = ({ x, visible }) => {
  if (!visible) return null;
  
  return (
    <div
      className="absolute top-0 bottom-0 pointer-events-none z-30"
      style={{
        left: x,
        width: 1,
        backgroundColor: AE_COLORS.playhead,
        boxShadow: `0 0 6px ${AE_COLORS.playhead}, 0 0 12px ${AE_COLORS.playhead}`,
        opacity: 0.9,
      }}
    >
      {/* Top indicator diamond */}
      <div
        className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45"
        style={{ backgroundColor: AE_COLORS.playhead }}
      />
      {/* Bottom indicator diamond */}
      <div
        className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45"
        style={{ backgroundColor: AE_COLORS.playhead }}
      />
    </div>
  );
};

export default SnapIndicator;
