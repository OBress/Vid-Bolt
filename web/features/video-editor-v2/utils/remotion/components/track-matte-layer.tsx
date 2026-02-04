/**
 * TrackMatteLayer - Renders a layer with track matte masking
 * 
 * Track mattes use one layer's content as a mask for another layer.
 * Supports:
 * - Alpha matte: Uses the source layer's alpha channel as mask
 * - Luma matte: Uses the source layer's luminance (brightness) as mask
 * - Inverted variants of both
 * 
 * Implementation approach:
 * 1. Render the matte source layer inside an SVG mask definition
 * 2. Apply the mask to the target layer
 * 3. For luma mattes, apply a grayscale filter to convert to luminance
 */

import React, { useMemo, useId } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Overlay } from "../../../types";
import { MaskType, TrackMatte, TrackMatteType } from "../../../types/masks";
import { LayerContent } from "../layer-content";
import type { FontInfo } from "@remotion/google-fonts";

// ==========================================
// TYPES
// ==========================================

interface TrackMatteLayerProps {
  /** The target overlay that will be masked */
  targetOverlay: Overlay;
  /** The source overlay used as the matte */
  matteSourceOverlay: Overlay;
  /** The track matte configuration */
  trackMatte: TrackMatte;
  /** Base URL for assets */
  baseUrl?: string;
  /** Font infos for text rendering */
  fontInfos?: Record<string, FontInfo>;
  /** Children to render (the actual layer content) */
  children: React.ReactNode;
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Gets the SVG filter for luma matte conversion
 * Converts RGB to grayscale luminance which is then used as alpha
 */
function getLumaFilter(isInverted: boolean): string {
  // Standard luminance coefficients (ITU-R BT.709)
  const r = 0.2126;
  const g = 0.7152;
  const b = 0.0722;
  
  if (isInverted) {
    // Inverted: white becomes transparent, black becomes opaque
    return `
      <filter id="luma-to-alpha-inverted" color-interpolation-filters="sRGB">
        <feColorMatrix type="matrix" values="
          0 0 0 0 1
          0 0 0 0 1
          0 0 0 0 1
          -${r} -${g} -${b} 0 1
        "/>
      </filter>
    `;
  }
  
  // Normal: white becomes opaque, black becomes transparent
  return `
    <filter id="luma-to-alpha" color-interpolation-filters="sRGB">
      <feColorMatrix type="matrix" values="
        0 0 0 0 1
        0 0 0 0 1
        0 0 0 0 1
        ${r} ${g} ${b} 0 0
      "/>
    </filter>
  `;
}

/**
 * Gets the CSS filter to apply to matte source based on matte type
 */
function getMatteSourceFilter(matteType: TrackMatteType): string {
  switch (matteType) {
    case TrackMatteType.LUMA:
      return 'url(#luma-to-alpha)';
    case TrackMatteType.LUMA_INVERTED:
      return 'url(#luma-to-alpha-inverted)';
    case TrackMatteType.ALPHA_INVERTED:
      // For inverted alpha, we just invert the output
      return 'none';
    default:
      return 'none';
  }
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export const TrackMatteLayer: React.FC<TrackMatteLayerProps> = ({
  targetOverlay,
  matteSourceOverlay,
  trackMatte,
  baseUrl,
  fontInfos,
  children,
}) => {
  const uniqueId = useId();
  const maskId = `track-matte-${uniqueId}`;
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  
  const isLumaMatte = trackMatte.matteType === TrackMatteType.LUMA || 
                      trackMatte.matteType === TrackMatteType.LUMA_INVERTED;
  const isInverted = trackMatte.matteType === TrackMatteType.ALPHA_INVERTED || 
                     trackMatte.matteType === TrackMatteType.LUMA_INVERTED;
  
  // Calculate the matte source position relative to target
  const matteStyle: React.CSSProperties = useMemo(() => {
    return {
      position: 'absolute',
      left: matteSourceOverlay.left - targetOverlay.left,
      top: matteSourceOverlay.top - targetOverlay.top,
      width: matteSourceOverlay.width,
      height: matteSourceOverlay.height,
      transform: matteSourceOverlay.rotation ? `rotate(${matteSourceOverlay.rotation}deg)` : undefined,
      transformOrigin: 'center center',
    };
  }, [
    matteSourceOverlay.left, matteSourceOverlay.top,
    matteSourceOverlay.width, matteSourceOverlay.height,
    matteSourceOverlay.rotation,
    targetOverlay.left, targetOverlay.top,
  ]);

  // Generate SVG mask with the matte source content
  const svgMask = useMemo(() => {
    const lumaFilter = isLumaMatte ? getLumaFilter(isInverted) : '';
    const filterRef = isLumaMatte 
      ? `url(#luma-to-alpha${isInverted ? '-inverted' : ''})`
      : 'none';
    
    return (
      <svg 
        style={{ 
          position: 'absolute', 
          width: 0, 
          height: 0, 
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      >
        <defs>
          {/* Luma conversion filter */}
          {isLumaMatte && (
            <filter 
              id={`luma-to-alpha${isInverted ? '-inverted' : ''}-${uniqueId}`} 
              colorInterpolationFilters="sRGB"
            >
              {isInverted ? (
                <feColorMatrix 
                  type="matrix" 
                  values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -0.2126 -0.7152 -0.0722 0 1"
                />
              ) : (
                <feColorMatrix 
                  type="matrix" 
                  values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.2126 0.7152 0.0722 0 0"
                />
              )}
            </filter>
          )}
          
          {/* The mask definition */}
          <mask id={maskId} maskUnits="userSpaceOnUse">
            <foreignObject 
              x="0" 
              y="0" 
              width={targetOverlay.width} 
              height={targetOverlay.height}
            >
              <div 
                style={{
                  width: targetOverlay.width,
                  height: targetOverlay.height,
                  position: 'relative',
                  overflow: 'hidden',
                  // For inverted alpha (non-luma), use CSS invert filter
                  filter: isInverted && !isLumaMatte ? 'invert(1)' : undefined,
                }}
              >
                {/* Render the matte source layer content */}
                <div 
                  style={{
                    ...matteStyle,
                    // Apply luma filter for luma mattes
                    filter: isLumaMatte 
                      ? `url(#luma-to-alpha${isInverted ? '-inverted' : ''}-${uniqueId})`
                      : undefined,
                  }}
                >
                  <LayerContent 
                    overlay={matteSourceOverlay} 
                    {...(baseUrl && { baseUrl })}
                    {...(fontInfos && { fontInfos })}
                  />
                </div>
              </div>
            </foreignObject>
          </mask>
        </defs>
      </svg>
    );
  }, [
    maskId, 
    uniqueId,
    targetOverlay.width, 
    targetOverlay.height, 
    matteStyle, 
    matteSourceOverlay,
    isLumaMatte,
    isInverted,
    baseUrl,
    fontInfos,
  ]);

  // Apply the mask to the target content
  const maskedStyle: React.CSSProperties = useMemo(() => ({
    width: '100%',
    height: '100%',
    mask: `url(#${maskId})`,
    WebkitMask: `url(#${maskId})`,
  }), [maskId]);

  return (
    <>
      {/* SVG definitions (hidden) */}
      {svgMask}
      
      {/* Masked content */}
      <div style={maskedStyle}>
        {children}
      </div>
    </>
  );
};

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Finds track matte configuration for an overlay
 */
export function getTrackMatte(overlay: Overlay): TrackMatte | null {
  const masks = (overlay as any).masks;
  if (!masks || !Array.isArray(masks)) return null;
  
  const trackMatte = masks.find(
    (m: any) => m.enabled && m.type === MaskType.TRACK_MATTE
  ) as TrackMatte | undefined;
  
  return trackMatte || null;
}

/**
 * Checks if an overlay is used as a track matte source by any other overlay
 */
export function isTrackMatteSource(overlayId: number, allOverlays: Overlay[]): boolean {
  return allOverlays.some(overlay => {
    const trackMatte = getTrackMatte(overlay);
    return trackMatte && trackMatte.sourceOverlayId === overlayId;
  });
}

/**
 * Gets the overlay that this track matte targets
 */
export function getTrackMatteTarget(sourceOverlayId: number, allOverlays: Overlay[]): Overlay | null {
  return allOverlays.find(overlay => {
    const trackMatte = getTrackMatte(overlay);
    return trackMatte && trackMatte.sourceOverlayId === sourceOverlayId;
  }) || null;
}

export default TrackMatteLayer;
