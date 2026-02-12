// Timeline dimension constants
export const TIMELINE_CONSTANTS = {
  // Header height - matches the actual TimelineHeader component (py-2.5 + button height)
  HEADER_HEIGHT: 52, // Height of timeline header (2x10px padding + ~32px content)
  
  // Track height - used for both timeline tracks and row handles
  TRACK_HEIGHT: 48, // Height of each track row

  TRACK_ITEM_HEIGHT: 40, // Height of each track item

  // Group header height - section dividers between track groups (Video, Audio, Text, etc.)
  GROUP_HEADER_HEIGHT: 24, // Height of each group header bar
  
  // Row handles width - increased to fit track name + controls (like Premiere Pro)
  HANDLE_WIDTH: 130, // Width of row handles column
  
  // Timeline markers
  MARKERS_HEIGHT: 40, // Height of time markers area - increased to show labels
};

// Virtual scroll constants - centralized for consistency
export const VIRTUAL_SCROLL_CONSTANTS = {
  // Base duration at zoom 1.0 (seconds visible in viewport)
  // This is the foundation of all zoom calculations
  FIXED_BASE_DURATION: 60,
  
  // Minimum buffer beyond content (ensures comfortable editing space)
  MIN_BUFFER_SECONDS: 30,
  
  // Calculate scrollable duration from content duration
  // Used by both virtual scroll and timeline content
  getScrollableDuration: (contentDuration: number): number => {
    // Add 50% buffer or minimum 30 seconds, whichever is larger
    const bufferSeconds = Math.max(contentDuration * 0.5, VIRTUAL_SCROLL_CONSTANTS.MIN_BUFFER_SECONDS);
    return Math.max(
      contentDuration + bufferSeconds, 
      VIRTUAL_SCROLL_CONSTANTS.FIXED_BASE_DURATION
    );
  },
};

export const ZOOM_CONSTRAINTS = {
  min: 0.1, // Minimum zoom level (10x zoom out capability - like Premiere Pro)
  max: 30, // Maximum zoom level (5x zoom in capability)
  step: 0.15, // Smallest increment for manual zoom controls
  default: 1, // Default zoom level
  zoomStep: 0.15, // Zoom increment for zoom in/out buttons
  wheelStep: 0.1, // Zoom increment for mouse wheel (reduced sensitivity)
  transitionDuration: 100, // Animation duration in milliseconds
  easing: "cubic-bezier(0.4, 0.0, 0.2, 1)", // Smooth easing function for zoom transitions
};

// Enhanced snapping configuration for timeline items
export const SNAPPING_CONFIG = {
  gridSize: 0.1, // Snap to 0.1 second intervals
  edgeSnapTolerance: 0.1, // Tolerance for edge snapping (in seconds) - magnetic range when near other items
  prioritizeEdgeSnap: true, // Prioritize edge snapping over grid snapping when both are available
};