/**
 * Canvas Tools Types
 * 
 * Defines the type system for canvas tools (selection, shape creation, text, etc.)
 */

// ==========================================
// TOOL TYPE ENUM
// ==========================================

export enum ToolType {
  /** Selection/move tool - default tool for selecting and moving elements */
  SELECT = 'select',
  /** Rectangle shape creation tool */
  RECTANGLE = 'rectangle',
  /** Ellipse/circle shape creation tool */
  ELLIPSE = 'ellipse',
  /** Triangle shape creation tool */
  TRIANGLE = 'triangle',
  /** Line shape creation tool */
  LINE = 'line',
  /** Text creation tool - click to add text */
  TEXT = 'text',
  /** Hand tool for panning the canvas */
  HAND = 'hand',
  /** Zoom tool */
  ZOOM = 'zoom',
}

// ==========================================
// TOOL METADATA
// ==========================================

export interface ToolMetadata {
  type: ToolType;
  name: string;
  description: string;
  icon: string; // Lucide icon name
  shortcut: string; // Keyboard shortcut
  cursor: string; // CSS cursor value
}

export const TOOL_METADATA: Record<ToolType, ToolMetadata> = {
  [ToolType.SELECT]: {
    type: ToolType.SELECT,
    name: 'Select',
    description: 'Select and move elements',
    icon: 'MousePointer2',
    shortcut: 'V',
    cursor: 'default',
  },
  [ToolType.RECTANGLE]: {
    type: ToolType.RECTANGLE,
    name: 'Rectangle',
    description: 'Draw rectangles and squares',
    icon: 'Square',
    shortcut: 'R',
    cursor: 'crosshair',
  },
  [ToolType.ELLIPSE]: {
    type: ToolType.ELLIPSE,
    name: 'Ellipse',
    description: 'Draw circles and ellipses',
    icon: 'Circle',
    shortcut: 'E',
    cursor: 'crosshair',
  },
  [ToolType.TRIANGLE]: {
    type: ToolType.TRIANGLE,
    name: 'Triangle',
    description: 'Draw triangles',
    icon: 'Triangle',
    shortcut: 'G', // Changed from T to avoid conflict with Text tool
    cursor: 'crosshair',
  },
  [ToolType.LINE]: {
    type: ToolType.LINE,
    name: 'Line',
    description: 'Draw lines',
    icon: 'Minus',
    shortcut: 'L',
    cursor: 'crosshair',
  },
  [ToolType.TEXT]: {
    type: ToolType.TEXT,
    name: 'Text',
    description: 'Add text to the canvas',
    icon: 'Type',
    shortcut: 'T',
    cursor: 'text',
  },
  [ToolType.HAND]: {
    type: ToolType.HAND,
    name: 'Hand',
    description: 'Pan the canvas view',
    icon: 'Hand',
    shortcut: 'H',
    cursor: 'grab',
  },
  [ToolType.ZOOM]: {
    type: ToolType.ZOOM,
    name: 'Zoom',
    description: 'Zoom in and out of the canvas',
    icon: 'ZoomIn',
    shortcut: 'Z',
    cursor: 'zoom-in',
  },
};

// ==========================================
// TOOL CATEGORIES
// ==========================================

export const SHAPE_TOOLS: ToolType[] = [
  ToolType.RECTANGLE,
  ToolType.ELLIPSE,
  ToolType.TRIANGLE,
  ToolType.LINE,
];

export const NAVIGATION_TOOLS: ToolType[] = [
  ToolType.HAND,
  ToolType.ZOOM,
];

export const CREATION_TOOLS: ToolType[] = [
  ...SHAPE_TOOLS,
  ToolType.TEXT,
];

// ==========================================
// TOOL STATE INTERFACE
// ==========================================

export interface ToolState {
  /** Currently active tool */
  activeTool: ToolType;
  /** Previous tool (for temporary tool switching, e.g., holding space for hand) */
  previousTool: ToolType | null;
  /** Whether shift is held (for constrained proportions) */
  shiftHeld: boolean;
  /** Whether alt is held (for center-based drawing) */
  altHeld: boolean;
  /** Whether the user is currently drawing/creating with a tool */
  isDrawing: boolean;
  /** Start position of current draw operation */
  drawStart: { x: number; y: number } | null;
  /** Current position during draw operation */
  drawCurrent: { x: number; y: number } | null;
}

export const DEFAULT_TOOL_STATE: ToolState = {
  activeTool: ToolType.SELECT,
  previousTool: null,
  shiftHeld: false,
  altHeld: false,
  isDrawing: false,
  drawStart: null,
  drawCurrent: null,
};

// ==========================================
// TOOL OPTION INTERFACES
// ==========================================

export interface ShapeToolOptions {
  /** Default fill color for new shapes */
  fillColor: string;
  /** Default stroke color for new shapes */
  strokeColor: string;
  /** Default stroke width in pixels */
  strokeWidth: number;
  /** Whether to fill shapes by default */
  fillEnabled: boolean;
  /** Whether to stroke shapes by default */
  strokeEnabled: boolean;
}

export const DEFAULT_SHAPE_OPTIONS: ShapeToolOptions = {
  fillColor: '#3b82f6', // Blue
  strokeColor: '#1e40af',
  strokeWidth: 2,
  fillEnabled: true,
  strokeEnabled: false,
};

export interface TextToolOptions {
  /** Default font family */
  fontFamily: string;
  /** Default font size */
  fontSize: number;
  /** Default text color */
  textColor: string;
  /** Default font weight */
  fontWeight: string;
}

export const DEFAULT_TEXT_OPTIONS: TextToolOptions = {
  fontFamily: 'Inter',
  fontSize: 48,
  textColor: '#ffffff',
  fontWeight: '600',
};
