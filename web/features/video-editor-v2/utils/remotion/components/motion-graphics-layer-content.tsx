/**
 * MotionGraphicsLayerContent Component
 * 
 * Renders motion graphics overlays in Remotion.
 * 
 * SIMPLIFIED ARCHITECTURE:
 * - CompositionDefinition is the PRIMARY and PREFERRED source of truth
 * - CompositionRenderer handles all AI-generated motion graphics
 * - Built-in templates use category-based components as fallback
 * - Mapbox is a special case for map animations
 * 
 * Rendering Priority:
 * 1. Mapbox animations (special case for map-based graphics)
 * 2. CompositionDefinition → CompositionRenderer (PRIMARY for AI-generated)
 * 3. Built-in components by category (for legacy built-in templates)
 */

import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import type { MotionGraphicsOverlay } from "../../../types/motion-graphics";
import { MotionGraphicsCategory } from "../../../types/motion-graphics";
import type { CompositionDefinition } from "../../../types/composition";
import { MapboxAnimation } from "./mapbox-animation";
import { CompositionRenderer } from "../../../components/composition-editor/composition-preview/composition-renderer";
import { DynamicComposition } from "../dynamic-composition";

// ==========================================
// TYPES
// ==========================================

interface MotionGraphicsLayerContentProps {
  overlay: MotionGraphicsOverlay;
}

interface BaseComponentProps {
  frame: number;
  durationInFrames: number;
  fps: number;
}

// ==========================================
// ANIMATION UTILITIES
// ==========================================

const getEntryProgress = (frame: number, fps: number, delay = 0) => {
  return spring({ 
    frame: Math.max(0, frame - delay), 
    fps, 
    config: { damping: 15, stiffness: 100 } 
  });
};

const getExitProgress = (frame: number, durationInFrames: number, exitDuration = 20) => {
  const exitStart = durationInFrames - exitDuration;
  if (frame <= exitStart) return 0;
  return interpolate(frame, [exitStart, durationInFrames], [0, 1], { 
    extrapolateLeft: 'clamp', 
    extrapolateRight: 'clamp' 
  });
};

// ==========================================
// BUILT-IN COMPONENTS
// ==========================================

const LowerThirdModern: React.FC<BaseComponentProps & {
  name: string;
  title: string;
  primaryColor: string;
  textColor: string;
}> = ({ name, title, primaryColor, textColor, frame, durationInFrames, fps }) => {
  const entryProgress = getEntryProgress(frame, fps);
  const exitProgress = getExitProgress(frame, durationInFrames, 30);
  
  const slideX = interpolate(entryProgress, [0, 1], [-100, 0]);
  const titleSlide = interpolate(entryProgress, [0, 1], [-50, 0], { extrapolateRight: 'clamp' });
  
  return (
    <div style={{
      position: 'absolute',
      bottom: '10%',
      left: 40,
      display: 'flex',
      flexDirection: 'column',
      transform: `translateX(${slideX + exitProgress * 100}%)`,
      opacity: 1 - exitProgress,
    }}>
      <div style={{
        backgroundColor: primaryColor,
        padding: '14px 28px',
        marginBottom: 4,
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
      }}>
        <span style={{ 
          color: textColor, 
          fontSize: 32, 
          fontWeight: 700, 
          fontFamily: 'Inter, system-ui, sans-serif',
          letterSpacing: '-0.02em',
        }}>{name}</span>
      </div>
      <div style={{
        backgroundColor: 'rgba(0,0,0,0.85)',
        padding: '10px 28px',
        transform: `translateX(${titleSlide}px)`,
        backdropFilter: 'blur(8px)',
      }}>
        <span style={{ 
          color: textColor, 
          fontSize: 20, 
          fontFamily: 'Inter, system-ui, sans-serif',
          opacity: 0.9,
        }}>{title}</span>
      </div>
    </div>
  );
};

const TitleCardCentered: React.FC<BaseComponentProps & {
  title: string;
  subtitle: string;
  backgroundColor: string;
  accentColor: string;
  textColor?: string;
}> = ({ title, subtitle, backgroundColor, accentColor, textColor = '#FFFFFF', frame, durationInFrames, fps }) => {
  const titleEntry = getEntryProgress(frame, fps);
  const subtitleEntry = getEntryProgress(frame, fps, 10);
  const lineScale = spring({ frame: Math.max(0, frame - 5), fps, config: { damping: 25 } });
  const exitProgress = getExitProgress(frame, durationInFrames);
  
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      backgroundColor,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      opacity: 1 - exitProgress,
    }}>
      <h1 style={{
        color: textColor,
        fontSize: 80,
        fontWeight: 900,
        letterSpacing: '0.08em',
        fontFamily: 'Inter, system-ui, sans-serif',
        transform: `scale(${interpolate(titleEntry, [0, 1], [0.6, 1])})`,
        opacity: titleEntry,
        margin: 0,
        textTransform: 'uppercase',
      }}>{title}</h1>
      <div style={{
        width: 120,
        height: 4,
        backgroundColor: accentColor,
        margin: '24px 0',
        transform: `scaleX(${lineScale})`,
        borderRadius: 2,
      }} />
      <p style={{
        color: textColor,
        fontSize: 26,
        fontFamily: 'Inter, system-ui, sans-serif',
        opacity: subtitleEntry * 0.8,
        transform: `translateY(${interpolate(subtitleEntry, [0, 1], [20, 0])}px)`,
        margin: 0,
        letterSpacing: '0.05em',
      }}>{subtitle}</p>
    </div>
  );
};

const SubscribeCTA: React.FC<BaseComponentProps & {
  buttonText: string;
  buttonColor: string;
  showBell: boolean;
}> = ({ buttonText, buttonColor, showBell, frame, durationInFrames, fps }) => {
  const bounceProgress = spring({ frame, fps, config: { damping: 10, stiffness: 100 } });
  const bellShake = Math.sin(frame * 0.5) * (frame < 60 ? 10 : 0);
  const exitProgress = getExitProgress(frame, durationInFrames, 15);
  
  return (
    <div style={{
      position: 'absolute',
      bottom: '12%',
      right: 60,
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      transform: `scale(${interpolate(bounceProgress, [0, 1], [0, 1])}) translateY(${exitProgress * 60}px)`,
      opacity: 1 - exitProgress,
    }}>
      <div style={{
        backgroundColor: buttonColor,
        padding: '18px 36px',
        borderRadius: 6,
        boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
      }}>
        <span style={{ 
          color: '#FFFFFF', 
          fontSize: 20, 
          fontWeight: 700, 
          fontFamily: 'Inter, system-ui, sans-serif',
          letterSpacing: '0.03em',
        }}>{buttonText}</span>
      </div>
      {showBell && (
        <div style={{
          backgroundColor: 'rgba(255,255,255,0.95)',
          padding: 14,
          borderRadius: '50%',
          transform: `rotate(${bellShake}deg)`,
          fontSize: 28,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          🔔
        </div>
      )}
    </div>
  );
};

const CountdownTimer: React.FC<BaseComponentProps & {
  startNumber: number;
  textColor: string;
  backgroundColor: string;
  accentColor?: string;
}> = ({ startNumber, textColor, backgroundColor, accentColor = '#3B82F6', frame, durationInFrames, fps }) => {
  const currentSecond = Math.max(0, startNumber - Math.floor(frame / fps));
  const secondProgress = (frame % fps) / fps;
  
  const scale = interpolate(secondProgress, [0, 0.1, 0.9, 1], [1.3, 1, 1, 0.8]);
  const opacity = interpolate(secondProgress, [0, 0.1, 0.9, 1], [1, 1, 1, 0]);
  
  const ringProgress = 1 - secondProgress;
  const circumference = 2 * Math.PI * 120;
  
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      backgroundColor,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <svg style={{ position: 'absolute', width: 280, height: 280 }}>
        <circle cx="140" cy="140" r="120" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
        <circle
          cx="140" cy="140" r="120" fill="none" stroke={accentColor} strokeWidth="8"
          strokeLinecap="round" strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ringProgress)}
          transform="rotate(-90 140 140)"
        />
      </svg>
      <div style={{ transform: `scale(${scale})`, opacity }}>
        <span style={{ color: textColor, fontSize: 180, fontWeight: 900, fontFamily: 'Inter, system-ui, sans-serif' }}>
          {currentSecond}
        </span>
      </div>
    </div>
  );
};

const SocialMediaCTA: React.FC<BaseComponentProps & {
  handle: string;
  platform: string;
  primaryColor: string;
}> = ({ handle, platform, primaryColor, frame, durationInFrames, fps }) => {
  const slideUp = getEntryProgress(frame, fps);
  const exitProgress = getExitProgress(frame, durationInFrames);
  
  const getPlatformIcon = () => {
    switch (platform?.toLowerCase()) {
      case 'instagram': return '📷';
      case 'twitter': case 'x': return '𝕏';
      case 'youtube': return '▶️';
      case 'tiktok': return '🎵';
      case 'facebook': return '👤';
      case 'linkedin': return '💼';
      default: return '🔗';
    }
  };
  
  return (
    <div style={{
      position: 'absolute',
      bottom: '8%',
      left: '50%',
      transform: `translateX(-50%) translateY(${interpolate(slideUp, [0, 1], [100, 0])}px)`,
      opacity: slideUp * (1 - exitProgress),
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        backgroundColor: primaryColor,
        padding: '14px 28px',
        borderRadius: 50,
        boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
      }}>
        <span style={{ fontSize: 28 }}>{getPlatformIcon()}</span>
        <span style={{ color: '#FFFFFF', fontSize: 22, fontWeight: 600, fontFamily: 'Inter, system-ui, sans-serif' }}>
          @{handle}
        </span>
      </div>
    </div>
  );
};

// ==========================================
// CATEGORY-BASED FALLBACK RENDERING
// ==========================================

const renderBuiltInComponent = (
  category: MotionGraphicsCategory,
  templateId: string,
  props: Record<string, any>,
  frame: number,
  durationInFrames: number,
  fps: number
): React.ReactNode => {
  const baseProps = { frame, durationInFrames, fps };
  const id = templateId.toLowerCase();
  
  switch (category) {
    case MotionGraphicsCategory.LOWER_THIRD:
      return <LowerThirdModern {...baseProps} {...props as any} />;
      
    case MotionGraphicsCategory.TITLE_CARD:
      return <TitleCardCentered {...baseProps} {...props as any} />;
      
    case MotionGraphicsCategory.CALL_TO_ACTION:
      if (id.includes('social') || id.includes('follow')) {
        return <SocialMediaCTA {...baseProps} {...props as any} />;
      }
      return <SubscribeCTA {...baseProps} {...props as any} />;
      
    case MotionGraphicsCategory.COUNTDOWN:
      return <CountdownTimer {...baseProps} {...props as any} />;
      
    case MotionGraphicsCategory.SOCIAL_MEDIA:
      return <SocialMediaCTA {...baseProps} {...props as any} />;
      
    default:
      return null;
  }
};

// ==========================================
// MAIN COMPONENT
// ==========================================

export const MotionGraphicsLayerContent: React.FC<MotionGraphicsLayerContentProps> = ({
  overlay,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { template, propertyValues, mapboxConfig, compositionDefinition } = overlay;

  // Get the effective composition definition (from overlay or template)
  const effectiveComposition = useMemo((): CompositionDefinition | undefined => {
    // Priority 1: Composition definition on overlay (edited in composition editor)
    if (compositionDefinition) {
      return compositionDefinition;
    }
    // Priority 2: Composition definition on template (generated by AI)
    if (template?.compositionDefinition) {
      return template.compositionDefinition;
    }
    return undefined;
  }, [compositionDefinition, template?.compositionDefinition]);

  // Merge template defaults with current property values
  const resolvedProps = useMemo(() => {
    const props: Record<string, any> = {};
    
    if (template?.editableProperties) {
      template.editableProperties.forEach((prop) => {
        props[prop.id] = propertyValues?.[prop.id] ?? prop.value ?? prop.defaultValue;
      });
    }

    return props;
  }, [template?.editableProperties, propertyValues]);

  // Check for map animation
  const effectiveMapboxConfig = mapboxConfig || template?.mapboxConfig;

  // Render content using simplified priority order:
  // 1. Mapbox animations (special case)
  // 2. CompositionDefinition → CompositionRenderer (PRIMARY)
  // 3. Built-in components by category (for legacy built-in templates)
  const content = useMemo(() => {
    // PRIORITY 1: Mapbox animations
    if (effectiveMapboxConfig) {
      return (
        <MapboxAnimation
          config={effectiveMapboxConfig}
          width={overlay.width}
          height={overlay.height}
          durationInFrames={overlay.durationInFrames}
        />
      );
    }

    // No template - show informative placeholder
    if (!template) {
      console.warn(`[MotionGraphicsLayerContent] ⚠️ No template data for overlay: id=${overlay.id}, hasCompositionDef=${!!compositionDefinition}`);
      return (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#1a1a2e',
          color: '#FFFFFF',
          fontFamily: 'Inter, system-ui, sans-serif',
          gap: 8,
        }}>
          <span style={{ fontSize: 28 }}>✨</span>
          <span style={{ fontSize: 14, opacity: 0.7 }}>Motion graphic loading…</span>
        </div>
      );
    }

    // PRIORITY 2: CompositionDefinition - PRIMARY rendering method
    // This is the single source of truth for AI-generated motion graphics
    if (effectiveComposition) {
      // JSX-first compositions: Use DynamicComposition to compile and render the JSX code
      // This is for AI-generated animations that have originalRemotionCode
      if (effectiveComposition.originalRemotionCode && effectiveComposition.generatedFromJSX) {
        console.log('[MotionGraphicsLayerContent] Rendering JSX-first composition via DynamicComposition');
        console.log('[MotionGraphicsLayerContent] Icons from composition:', effectiveComposition.usedIcons || 'none');
        return (
          <DynamicComposition 
            code={effectiveComposition.originalRemotionCode}
            usedIcons={effectiveComposition.usedIcons}
          />
        );
      }
      
      // Layer-based compositions: Use CompositionRenderer for layer data
      // This is for compositions edited in the composition editor
      if (effectiveComposition.layers.length > 0) {
        console.log('[MotionGraphicsLayerContent] Rendering layer-based composition via CompositionRenderer');
        return (
          <CompositionRenderer composition={effectiveComposition} />
        );
      }
      
      // Fallback: If we have code but no generatedFromJSX flag, try rendering it
      if (effectiveComposition.originalRemotionCode) {
        console.log('[MotionGraphicsLayerContent] Fallback: Rendering code via DynamicComposition');
        return (
          <DynamicComposition 
            code={effectiveComposition.originalRemotionCode}
            usedIcons={effectiveComposition.usedIcons}
          />
        );
      }
    }

    // PRIORITY 3: Built-in components by category (for legacy templates without compositionDefinition)
    console.log(`[MotionGraphicsLayerContent] No effectiveComposition, falling through to built-in: category=${template.category}, templateId=${template.id}, templateName=${template.name}`);
    const categoryContent = renderBuiltInComponent(
      template.category,
      template.id,
      resolvedProps,
      frame,
      overlay.durationInFrames,
      fps
    );
    
    if (categoryContent) {
      return categoryContent;
    }

    // Final fallback - show template info
    console.warn(`[MotionGraphicsLayerContent] ⚠️ Final fallback for: template=${template.name} (${template.category}), hasComposition=${!!effectiveComposition}, hasRemotionCode=${!!(effectiveComposition as any)?.originalRemotionCode}`);
    return (
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1a1a2e',
        color: '#FFFFFF',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        <div style={{
          width: 60,
          height: 60,
          borderRadius: 12,
          backgroundColor: 'rgba(139, 92, 246, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
        }}>
          <span style={{ fontSize: 28 }}>✨</span>
        </div>
        <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
          {template.name || 'Motion Graphic'}
        </h3>
        <p style={{ fontSize: 14, opacity: 0.6 }}>
          {template.category || 'Custom'}
        </p>
      </div>
    );
  }, [template, resolvedProps, effectiveMapboxConfig, effectiveComposition, overlay, frame, fps]);

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      opacity: overlay.styles?.opacity ?? 1,
      overflow: 'hidden',
    }}>
      {content}
    </div>
  );
};

export default MotionGraphicsLayerContent;
