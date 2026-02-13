/**
 * CompositionPreview - Remotion Player for Composition
 * 
 * Renders the composition preview using Remotion's Player component.
 * 
 * HYBRID ARCHITECTURE:
 * - Supports two rendering modes: JSX (high fidelity) and Layers (editable)
 * - JSX mode: Renders original AI-generated JSX code directly
 * - Layers mode: Renders from CompositionDefinition layers
 * - User can toggle between modes based on their needs
 */

import React, { useMemo, useRef, useCallback, useEffect, useState } from "react";
import { Player, PlayerRef } from "@remotion/player";
import { useCompositionEditorStore } from "../../../stores/composition-editor-store";
import { CompositionRenderer } from "./composition-renderer";
import { CompositionCanvasLayer } from "./composition-canvas-layer";
import { DynamicComposition } from "../../../utils/remotion/dynamic-composition";
import type { CompositionDefinition } from "../../../types/composition";
import { Layers, Code, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// ==========================================
// PREVIEW RENDERER WRAPPER
// ==========================================

/**
 * Wrapper component that renders either JSX or Layers based on mode
 * 
 * HYBRID ARCHITECTURE:
 * - JSX mode: Uses DynamicComposition to render JSX code (high fidelity)
 * - Layers mode: Shows JSX background with layer overlays for editing
 * - Layers-only mode: Uses CompositionRenderer (for non-JSX compositions)
 */
interface PreviewRendererProps {
  composition: CompositionDefinition;
  renderMode: 'jsx' | 'layers';
  jsxCode?: string;
}

const PreviewRenderer: React.FC<PreviewRendererProps> = ({ composition, renderMode, jsxCode }) => {
  // For JSX-based compositions (AI-generated), always render the JSX
  // The layer selection overlay is handled separately by CompositionCanvasLayer
  if (jsxCode) {
    // In both modes, render the JSX animation for JSX-based compositions
    // The difference is that 'layers' mode enables the layer selection overlay
    // Pass usedIcons so the compiler can inject the right icon components
    return (
      <DynamicComposition 
        code={jsxCode} 
        usedIcons={composition.usedIcons}
      />
    );
  }
  
  // For non-JSX compositions (manually created or legacy), use CompositionRenderer
  return <CompositionRenderer composition={composition} />;
};

// ==========================================
// MAIN COMPONENT
// ==========================================

export const CompositionPreview: React.FC = () => {
  const playerRef = useRef<PlayerRef>(null);

  // Store state
  const composition = useCompositionEditorStore((state) => state.composition);
  const playback = useCompositionEditorStore((state) => state.playback);
  const setCurrentFrame = useCompositionEditorStore((state) => state.setCurrentFrame);
  const renderMode = useCompositionEditorStore((state) => state.renderMode);
  const setRenderMode = useCompositionEditorStore((state) => state.setRenderMode);
  const generatedCode = useCompositionEditorStore((state) => state.generatedCode);
  const isGenerating = useCompositionEditorStore((state) => state.isGenerating);
  
  // Get JSX code - prefer AI-generated code, fall back to original
  const jsxCode = generatedCode || composition?.originalRemotionCode;
  const hasJSXCode = !!jsxCode;
  
  // Debug logging
  useEffect(() => {
    console.log('[CompositionPreview] Render mode:', renderMode);
    console.log('[CompositionPreview] Has JSX code:', hasJSXCode);
    console.log('[CompositionPreview] Generated code length:', generatedCode?.length || 0);
    console.log('[CompositionPreview] Original code length:', composition?.originalRemotionCode?.length || 0);
    if (jsxCode) {
      console.log('[CompositionPreview] JSX code preview:', jsxCode.substring(0, 200) + '...');
    }
  }, [renderMode, hasJSXCode, generatedCode, composition, jsxCode]);
  
  // Auto-switch to layers mode when user starts editing (if in JSX mode)
  // This can be triggered by layer selection, transforms, etc.

  // Sync player state with store
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    if (playback.isPlaying) {
      player.play();
    } else {
      player.pause();
    }
  }, [playback.isPlaying]);

  // Seek to frame when store updates (but only if not playing to avoid jitter)
  useEffect(() => {
    const player = playerRef.current;
    if (!player || playback.isPlaying) return;

    player.seekTo(playback.currentFrame);
  }, [playback.currentFrame, playback.isPlaying]);

  // Poll for frame updates while playing - use requestAnimationFrame for smooth updates
  useEffect(() => {
    if (!playback.isPlaying) return;
    
    let rafId: number;
    
    const updateFrame = () => {
      const player = playerRef.current;
      if (player && composition) {
        const currentFrame = player.getCurrentFrame();
        setCurrentFrame(currentFrame);
      }
      
      if (playback.isPlaying) {
        rafId = requestAnimationFrame(updateFrame);
      }
    };
    
    rafId = requestAnimationFrame(updateFrame);
    
    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [playback.isPlaying, composition, setCurrentFrame]);

  // Input props for the composition
  const inputProps = useMemo(() => {
    if (!composition) return null;
    return {
      composition,
      renderMode,
      jsxCode: hasJSXCode ? jsxCode : undefined,
    };
  }, [composition, renderMode, hasJSXCode, jsxCode]);

  // Calculate responsive player dimensions
  const [containerSize, setContainerSize] = useState({ width: 800, height: 450 }); // Start with reasonable default
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const updateSize = () => {
      const container = containerRef.current;
      if (!container) return;
      
      const rect = container.getBoundingClientRect();
      // Dynamically measure padding so we don't hardcode assumptions about CSS classes
      const style = getComputedStyle(container);
      const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const paddingY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const availableWidth = rect.width - paddingX;
      const availableHeight = rect.height - paddingY;
      
      if (availableWidth > 100 && availableHeight > 100) {
        setContainerSize({
          width: availableWidth,
          height: availableHeight,
        });
      }
    };

    // Use requestAnimationFrame to ensure layout is complete
    requestAnimationFrame(updateSize);
    
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  // Calculate player dimensions maintaining aspect ratio
  const playerDimensions = useMemo(() => {
    // Always use valid dimensions
    const compWidth = composition?.width || 1920;
    const compHeight = composition?.height || 1080;
    const aspectRatio = compWidth / compHeight;
    
    // If container not ready, use a reasonable default
    const contWidth = containerSize.width || 800;
    const contHeight = containerSize.height || 450;
    const containerAspect = contWidth / contHeight;

    let width: number;
    let height: number;

    if (containerAspect > aspectRatio) {
      // Container is wider than video - fit to height
      height = contHeight;
      width = height * aspectRatio;
    } else {
      // Container is taller than video - fit to width
      width = contWidth;
      height = width / aspectRatio;
    }

    // Ensure minimum size
    return {
      width: Math.max(320, Math.floor(width)),
      height: Math.max(180, Math.floor(height)),
    };
  }, [composition, containerSize]);

  if (!composition || !inputProps) {
    return (
      <div className="h-full flex items-center justify-center bg-muted/20">
        <p className="text-sm text-muted-foreground">No composition loaded</p>
      </div>
    );
  }

  // Handle render mode toggle
  const toggleRenderMode = useCallback(() => {
    setRenderMode(renderMode === 'jsx' ? 'layers' : 'jsx');
  }, [renderMode, setRenderMode]);

  return (
    <div 
      ref={containerRef}
      className="h-full flex flex-col overflow-hidden"
      style={{ backgroundColor: '#2a2a2a' }}
    >
      {/* Render mode toggle - only show if JSX code is available */}
      {hasJSXCode && (
        <div className="flex items-center justify-end gap-2 px-4 py-2 border-b border-border/30">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleRenderMode}
                  className={`gap-2 h-7 text-xs ${renderMode === 'layers' ? 'bg-muted' : ''}`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Edit Mode</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Show layer selection controls for editing</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleRenderMode}
                  className={`gap-2 h-7 text-xs ${renderMode === 'jsx' ? 'bg-muted' : ''}`}
                >
                  <Code className="w-3.5 h-3.5" />
                  <span>Preview</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Clean preview without selection controls</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
      
      <div className="flex-1 flex items-center justify-center overflow-hidden p-4">
        <div
          className="relative shadow-2xl overflow-hidden rounded-sm"
          style={{
            width: playerDimensions.width,
            height: playerDimensions.height,
            minWidth: 320,
            minHeight: 180,
            backgroundColor: '#1a1a1a',
            border: '1px solid #3a3a3a',
          }}
        >
          {/* Remotion Player */}
          <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
            <Player
              ref={playerRef}
              component={PreviewRenderer}
              inputProps={inputProps}
              durationInFrames={Math.max(1, composition.duration)}
              compositionWidth={composition.width}
              compositionHeight={composition.height}
              fps={composition.fps}
              style={{
                width: '100%',
                height: '100%',
              }}
              loop={playback.loop}
              autoPlay={false}
              acknowledgeRemotionLicense
            />
          </div>

          {/* Interactive canvas layer for selection - only in layers mode */}
          {renderMode === 'layers' && (
            <CompositionCanvasLayer
              canvasWidth={composition.width}
              canvasHeight={composition.height}
              containerWidth={playerDimensions.width}
              containerHeight={playerDimensions.height}
              currentFrame={playback.currentFrame}
            />
          )}
          
          {/* Mode indicator badge */}
          {hasJSXCode && (
            <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded flex items-center gap-1">
              {renderMode === 'jsx' ? (
                <>
                  {generatedCode ? <Sparkles className="w-3 h-3" /> : <Code className="w-3 h-3" />}
                  <span>{generatedCode ? 'AI Generated' : 'Preview Mode'}</span>
                </>
              ) : (
                <>
                  <Layers className="w-3 h-3" />
                  <span>Edit Mode - Click to Select Layers</span>
                </>
              )}
            </div>
          )}
          
          {/* AI Generating indicator */}
          {isGenerating && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="bg-background/90 rounded-lg px-6 py-4 flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-foreground">Generating motion graphics...</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CompositionPreview;
