/**
 * After Effects Timeline Constants
 * 
 * These values are designed to match Adobe After Effects timeline appearance
 */

// Layout dimensions
export const LAYER_LIST_WIDTH = 280;
export const CONTROLS_WIDTH = 84; // Solo, Vis, Lock columns
export const LAYER_NAME_MIN_WIDTH = 120;
export const TRACK_HEIGHT = 28; // Base height for layer row (increased from 24)
export const PROPERTY_ROW_HEIGHT = 24; // Height for property rows (increased from 20)
export const RULER_HEIGHT = 26; // Increased from 24
export const TOOLBAR_HEIGHT = 40; // Increased for better padding
export const NAVIGATOR_HEIGHT = 24; // h-6 in Tailwind

// Zoom limits
export const MIN_PIXELS_PER_FRAME = 0.5;
export const MAX_PIXELS_PER_FRAME = 30;
export const DEFAULT_PIXELS_PER_FRAME = 4;

// Colors - After Effects style dark theme with improved text visibility
export const AE_COLORS = {
  // Backgrounds - Darker overall
  bg: '#1e1e1e',
  bgDark: '#181818',
  bgDarker: '#141414',
  bgLight: '#282828',
  bgLighter: '#323232',
  
  // Borders
  border: '#3a3a3a',
  borderLight: '#4a4a4a',
  
  // Text - Improved visibility
  textPrimary: '#f0f0f0', // Brighter from #e0e0e0
  textSecondary: '#b8b8b8', // Brighter from #9a9a9a
  textDim: '#888888', // Brighter from #666666
  
  // Selection/Active
  selection: '#4a90d9',
  selectionDim: '#4a90d9aa',
  active: '#5a9ae9',
  
  // Playhead - Vibrant red for maximum visibility
  playhead: '#ff3b3b',
  playheadHead: '#ff5252',
  
  // Work area
  workArea: '#576575',
  workAreaHandle: '#8a9aaa',
  
  // Keyframes
  keyframe: '#f9a825', // Yellow/orange
  keyframeSelected: '#ffffff',
  keyframeHover: '#ffc107',
  
  // Stopwatch
  stopwatchEnabled: '#f9a825',
  stopwatchDisabled: '#666666',
  
  // Layer type colors
  layerText: '#5c9fd4',
  layerShape: '#4caf50',
  layerSolid: '#9e9e9e',
  layerImage: '#ff9800',
  layerVideo: '#e91e63',
  layerNull: '#9c27b0',
  layerAdjustment: '#00bcd4',
  
  // Controls
  soloActive: '#f9a825',
  visibilityActive: '#e0e0e0',
  lockActive: '#e91e63',
} as const;

// Property groups that can be expanded
export const TRANSFORM_PROPERTIES = [
  { path: 'transform.anchorX', name: 'Anchor Point X', shortName: 'X', unit: '%' },
  { path: 'transform.anchorY', name: 'Anchor Point Y', shortName: 'Y', unit: '%' },
  { path: 'transform.x', name: 'Position X', shortName: 'X', unit: 'px' },
  { path: 'transform.y', name: 'Position Y', shortName: 'Y', unit: 'px' },
  { path: 'transform.scaleX', name: 'Scale X', shortName: 'X', unit: '%' },
  { path: 'transform.scaleY', name: 'Scale Y', shortName: 'Y', unit: '%' },
  { path: 'transform.rotation', name: 'Rotation', shortName: 'Rotation', unit: '°' },
  { path: 'transform.opacity', name: 'Opacity', shortName: 'Opacity', unit: '%' },
] as const;

// Grouped for AE-style display
export const PROPERTY_GROUPS = {
  transform: {
    name: 'Transform',
    shortcut: null,
    properties: [
      { path: 'transform.anchorX', name: 'Anchor Point', subPath: 'anchorY', shortcut: 'A' },
      { path: 'transform.x', name: 'Position', subPath: 'y', shortcut: 'P' },
      { path: 'transform.scaleX', name: 'Scale', subPath: 'scaleY', shortcut: 'S' },
      { path: 'transform.rotation', name: 'Rotation', shortcut: 'R' },
      { path: 'transform.opacity', name: 'Opacity', shortcut: 'T' },
    ],
  },
} as const;

// Keyboard shortcuts for properties
export const PROPERTY_SHORTCUTS: Record<string, string> = {
  'A': 'transform.anchorX', // Also reveals anchorY
  'P': 'transform.x', // Also reveals y
  'S': 'transform.scaleX', // Also reveals scaleY
  'R': 'transform.rotation',
  'T': 'transform.opacity',
};

/**
 * After Effects Keyboard Shortcuts Reference
 * 
 * Navigation:
 * - Space: Play/Pause
 * - Home: Go to start
 * - End: Go to end
 * - Left/Right Arrow: Previous/Next frame
 * - Shift + Left/Right: Previous/Next second
 * - J/K: Jump to previous/next keyframe
 * 
 * Work Area:
 * - B: Set work area beginning
 * - N: Set work area end
 * - [: Set layer in-point to current time
 * - ]: Set layer out-point to current time
 * - Double-click ruler: Reset work area
 * 
 * Property Reveal:
 * - P: Position
 * - S: Scale
 * - R: Rotation
 * - T: Opacity (Transparency)
 * - A: Anchor Point
 * - U: Show only keyframed properties
 * 
 * Layer Controls:
 * - L: Toggle lock
 * - Delete/Backspace: Delete selected layers
 * - Ctrl+D: Duplicate layer
 * - Ctrl+A: Select all layers
 * - Escape: Deselect all
 * 
 * Zoom:
 * - +/=: Zoom in
 * - -: Zoom out
 * - Ctrl+Scroll: Zoom timeline
 * - Shift+Scroll: Horizontal scroll
 */
export const KEYBOARD_SHORTCUTS_REFERENCE = {
  // Navigation
  'Space': 'Play/Pause',
  'Home': 'Go to start',
  'End': 'Go to end',
  'ArrowLeft': 'Previous frame',
  'ArrowRight': 'Next frame',
  'Shift+ArrowLeft': 'Previous second',
  'Shift+ArrowRight': 'Next second',
  'J': 'Previous keyframe',
  'K': 'Next keyframe',
  
  // Work Area
  'B': 'Set work area start',
  'N': 'Set work area end',
  '[': 'Set in-point',
  ']': 'Set out-point',
  
  // Property Reveal
  'P': 'Reveal Position',
  'S': 'Reveal Scale',
  'R': 'Reveal Rotation',
  'T': 'Reveal Opacity',
  'A': 'Reveal Anchor Point',
  'U': 'Reveal keyframed properties',
  
  // Layer Controls
  'L': 'Toggle lock',
  'Delete': 'Delete selected',
  'Ctrl+D': 'Duplicate',
  'Ctrl+A': 'Select all',
  'Escape': 'Deselect all',
  
  // Zoom
  '+': 'Zoom in',
  '-': 'Zoom out',
} as const;
