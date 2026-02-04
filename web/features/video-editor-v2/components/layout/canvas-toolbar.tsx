/**
 * CanvasToolbar - Minimal top toolbar
 * 
 * Now just shows project info/title - tools moved to timeline header
 */

import React from "react";

// ==========================================
// CANVAS TOOLBAR PROPS
// ==========================================

export interface CanvasToolbarProps {
  /** Project title (optional) */
  title?: string;
}

// ==========================================
// CANVAS TOOLBAR COMPONENT  
// ==========================================

export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  title = "Video Editor",
}) => {
  return (
    <div className="flex items-center h-10 px-3 bg-muted/30 border-b border-border gap-2 shrink-0">
      {/* Project Title */}
      <span className="text-sm font-medium text-foreground/80">
        {title}
      </span>
    </div>
  );
};

export default CanvasToolbar;
