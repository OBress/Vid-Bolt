import React, { useMemo, useRef, useEffect, useCallback } from "react";
import { useCurrentFrame } from "remotion";
import type { FontInfo } from "@remotion/google-fonts";
import { TextOverlay } from "../../../types";
import { animationTemplates } from "../../../templates/animation-templates";
import { getAnimationKey } from "../../../adaptors/default-animation-adaptors";
import { useLoadFontFromTextItem } from "../../text/load-font-from-text-item";
import { Shadow } from "../../../types/shadows";
import { Gradient, GradientType } from "../../../types/gradients";
import { useTypedStore } from "../../../stores/video-editor-store";
import { _lastEditClickPosition } from "../../../components/selection/selected-outline";

export interface TextLayerContentProps {
  overlay: TextOverlay;
  fontInfos?: Record<string, FontInfo>;
  /** Whether this overlay is in inline text editing mode */
  isEditing?: boolean;
}

export const TextLayerContent: React.FC<TextLayerContentProps> = ({
  overlay,
  fontInfos,
  isEditing = false,
}) => {
  const frame = useCurrentFrame();
  const editableRef = useRef<HTMLDivElement>(null);
  const originalContentRef = useRef<string>(overlay.content);

  // Store access for persisting text changes
  const updateClip = useTypedStore(s => s.updateClip);
  const setEditingOverlayId = useTypedStore(s => s.setEditingOverlayId);
  const clips = useTypedStore(s => s.clips);

  // Find the matching clip ID for this overlay
  const clipId = useMemo(() => {
    const found = Object.values(clips).find((c: any) => {
      const numericId = parseInt(c.id.replace(/\D/g, ''), 10) || 0;
      return numericId === overlay.id;
    });
    return found?.id ?? null;
  }, [clips, overlay.id]);

  // When entering edit mode, store original content and place cursor at click position
  useEffect(() => {
    if (isEditing && editableRef.current) {
      originalContentRef.current = overlay.content;
      editableRef.current.focus();

      const selection = window.getSelection();
      if (!selection) return;

      // Try to place the caret at the exact double-click position
      let placed = false;
      if (_lastEditClickPosition) {
        const { x, y } = _lastEditClickPosition;
        // caretRangeFromPoint is widely supported (Chrome, Safari, Edge)
        if (document.caretRangeFromPoint) {
          const range = document.caretRangeFromPoint(x, y);
          if (range) {
            selection.removeAllRanges();
            selection.addRange(range);
            placed = true;
          }
        }
      }

      // Fallback: place cursor at the end of the text
      if (!placed) {
        const range = document.createRange();
        range.selectNodeContents(editableRef.current);
        range.collapse(false); // collapse to end
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }, [isEditing, overlay.content]);

  // Commit the edited text to the store
  const commitText = useCallback(() => {
    if (!editableRef.current || !clipId) return;
    const newText = editableRef.current.innerText;
    if (newText !== originalContentRef.current) {
      updateClip(clipId, {
        content: newText,
        text: { text: newText },
      } as any);
    }
    setEditingOverlayId(null);
  }, [clipId, updateClip, setEditingOverlayId]);

  // Cancel editing without saving
  const cancelEditing = useCallback(() => {
    if (editableRef.current) {
      editableRef.current.innerText = originalContentRef.current;
    }
    setEditingOverlayId(null);
  }, [setEditingOverlayId]);

  // Handle keyboard events in editing mode
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancelEditing();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      commitText();
    }
    // Stop propagation for all keys while editing so editor shortcuts don't fire
    e.stopPropagation();
  }, [commitText, cancelEditing]);

  const handleBlur = useCallback(() => {
    if (isEditing) {
      commitText();
    }
  }, [isEditing, commitText]);
  
  // Get font family - handle legacy Tailwind classes for backward compatibility
  const getFontFamily = (): string => {
    const fontValue = overlay.styles.fontFamily;
    
    // Handle legacy Tailwind font classes for backward compatibility
    if (fontValue?.startsWith('font-')) {
      switch (fontValue) {
        case "font-sans":
          return "Inter";
        case "font-serif":
          return "Merriweather";
        case "font-mono":
          return "Roboto Mono";
        case "font-retro":
          return "VT323";
        case "font-league-spartan":
          return "League Spartan";
        case "font-bungee-inline":
          return "Bungee Inline";
        default:
          return "Inter"; // Default fallback for unknown Tailwind classes
      }
    }
    
    // If it's not a Tailwind class, it's already a font family name
    return fontValue || "Inter";
  };

  const fontFamily = getFontFamily();
  const fontWeight = String(overlay.styles.fontWeight || '400');
  const fontStyle = (overlay.styles.fontStyle || 'normal') as 'normal' | 'italic';
  
  // Use the proper font loading hook
  // During rendering, fontInfos will be provided and fontInfo will be extracted from it
  // In editor, fontInfos will be undefined and font will be fetched from API
  const fontInfo = fontInfos?.[fontFamily] || null;
  const isFontLoaded = useLoadFontFromTextItem({
    fontFamily: fontFamily,
    fontWeight: fontWeight,
    fontStyle: fontStyle,
    fontInfosDuringRendering: fontInfo,
  });

  // Calculate if we're in the exit phase (last 30 frames)
  const isExitPhase = frame >= overlay.durationInFrames - 30;

  // Apply enter animation only during entry phase
  const enterAnimation =
    !isExitPhase && overlay.styles.animation?.enter
      ? animationTemplates[getAnimationKey(overlay.styles.animation.enter)]?.enter(
          frame,
          overlay.durationInFrames
        )
      : {};

  // Apply exit animation only during exit phase
  const exitAnimation =
    isExitPhase && overlay.styles.animation?.exit
      ? animationTemplates[getAnimationKey(overlay.styles.animation.exit)]?.exit(
          frame,
          overlay.durationInFrames
        )
      : {};

  // Memoize font size calculation for performance during resizing
  const fontSize = useMemo(() => {
    // Check if user has explicitly set a font size (not using auto-sizing)
    // fontSizeScale != 1 indicates manual control, or check if fontSize looks user-defined
    const fontSizeScale = overlay.styles.fontSizeScale;
    const userFontSize = overlay.styles.fontSize;
    
    // If fontSizeScale is explicitly set to something other than 1 or undefined,
    // OR if fontSize is a valid pixel value that was manually set,
    // respect the user's choice
    if (fontSizeScale !== undefined && fontSizeScale !== 1) {
      // User has manually adjusted the scale - calculate base and apply scale
      const baseFontSize = parseUserFontSize(userFontSize) || 48;
      return baseFontSize * fontSizeScale;
    }
    
    // Check if user set an explicit fontSize (not the default "48px" from templates)
    // We can detect manual override by checking if it's a round number typically set by user
    const parsedUserSize = parseUserFontSize(userFontSize);
    if (parsedUserSize && userFontSize !== "48px") {
      // User likely set this manually, respect it
      return parsedUserSize;
    }
    
    // Auto-calculate font size based on container
    const lines = overlay.content.split("\n");
    const numLines = lines.length;
    const maxLineLength = Math.max(...lines.map((line) => line.length));
    
    // If no content, return a reasonable default based on container size
    if (!overlay.content.trim() || maxLineLength === 0) {
      return Math.min(48, overlay.height * 0.6);
    }
    
    // Extract actual padding from styles and convert to pixels
    const extractPadding = (paddingStr: string | undefined) => {
      if (!paddingStr) return { vertical: 0, horizontal: 0 };
      
      // Handle different padding formats: "24px", "24px 48px", "24px 48px 24px 48px"
      const values = paddingStr.split(' ').map(v => {
        if (v.endsWith('px')) return parseInt(v);
        if (v.endsWith('em')) return parseInt(v) * 16; // Rough conversion
        return 0;
      });
      
      if (values.length === 1) {
        // Same padding all around: "24px"
        return { vertical: values[0] * 2, horizontal: values[0] * 2 };
      } else if (values.length === 2) {
        // Vertical and horizontal: "24px 48px"
        return { vertical: values[0] * 2, horizontal: values[1] * 2 };
      } else if (values.length === 4) {
        // Top, right, bottom, left: "24px 48px 24px 48px"
        return { vertical: values[0] + values[2], horizontal: values[1] + values[3] };
      }
      return { vertical: values[0] * 2, horizontal: values[0] * 2 }; // fallback
    };
    
    const padding = extractPadding(overlay.styles.padding);
    const actualPaddingVertical = padding.vertical;
    const actualPaddingHorizontal = padding.horizontal;
    
    // Account for borders too
    const borderWidth = overlay.styles.border ? 2 : 0; // Rough estimate for border
    
    const lineHeightFactor = parseFloat(overlay.styles.lineHeight || "1.2");
    
    // Calculate available space accounting for actual padding and borders
    const availableWidth = Math.max(20, overlay.width - actualPaddingHorizontal - (borderWidth * 2));
    const availableHeight = Math.max(20, overlay.height - actualPaddingVertical - (borderWidth * 2));
    
    // Height-based calculation (primary constraint)
    const heightBasedSize = (availableHeight / numLines) / lineHeightFactor;
    
    // Width-based calculation with more realistic character width
    // Use a more generous character width ratio for better scaling
    const avgCharWidthRatio = 0.5; // Less conservative
    const widthBasedSize = availableWidth / (maxLineLength * avgCharWidthRatio);
    
    // Use the more restrictive constraint
    let calculatedSize = Math.min(heightBasedSize, widthBasedSize);
    
    // Apply minimal safety margin - users can resize if needed
    calculatedSize *= 0.95; // Only 5% safety margin
    
    // Gentler penalties for challenging text layouts
    if (maxLineLength > 40) {
      calculatedSize *= Math.max(0.85, 1 - (maxLineLength - 40) / 200);
    }
    
    if (numLines > 4) {
      calculatedSize *= Math.max(0.9, 1 - (numLines - 4) * 0.02);
    }
    
    // Only apply small container penalty for very tiny containers
    if (overlay.width < 60 || overlay.height < 20) {
      calculatedSize *= 0.9;
    }
    
    // Set more generous bounds
    const minSize = Math.max(8, Math.min(16, overlay.height * 0.1));
    const maxSize = Math.min(
      overlay.height * 0.8,  // Much more generous - 80% of height
      overlay.width * 0.15,  // More generous width ratio
      200 // Higher absolute maximum
    );
    
    const finalSize = Math.max(minSize, Math.min(calculatedSize, maxSize));
    
    return finalSize;
  }, [overlay.width, overlay.height, overlay.content, overlay.styles.padding, overlay.styles.border, overlay.styles.lineHeight, overlay.styles.fontSizeScale, overlay.styles.fontSize]);

  // Helper to parse user-set font size
  function parseUserFontSize(fontSize: string | undefined): number | null {
    if (!fontSize) return null;
    const match = fontSize.match(/^(\d+(?:\.\d+)?)(px)?$/);
    if (match) {
      return parseFloat(match[1]);
    }
    return null;
  }

  const containerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center", // Center vertically
    textAlign: overlay.styles.textAlign,
    justifyContent:
      overlay.styles.textAlign === "center"
        ? "center"
        : overlay.styles.textAlign === "right"
        ? "flex-end"
        : "flex-start",
    overflow: "hidden",
    boxSizing: "border-box",
    position: "relative",
    // Enable text selection when editing
    userSelect: isEditing ? "text" : "none",
    WebkitUserSelect: isEditing ? "text" : "none",
    ...(isExitPhase ? exitAnimation : enterAnimation),
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { fontSize: _templateFontSize, ...restStyles } = overlay.styles;

  // Generate text shadow CSS from shadows array
  const generateTextShadowCSS = (shadows: Shadow[]): string => {
    return shadows
      .map(s => `${s.offsetX}px ${s.offsetY}px ${s.blur}px ${s.color}`)
      .join(', ');
  };

  // Generate gradient CSS for text
  const generateTextGradientCSS = (gradient: Gradient): string => {
    const stops = gradient.stops
      .map(stop => `${stop.color} ${stop.offset}%`)
      .join(', ');

    if (gradient.type === GradientType.RADIAL) {
      return `radial-gradient(circle, ${stops})`;
    } else {
      const angle = gradient.angle || 0;
      return `linear-gradient(${angle}deg, ${stops})`;
    }
  };

  // Build text style with advanced features
  const textStyle: React.CSSProperties = {
    ...(restStyles as any),
    animation: undefined,
    fontSize: `${fontSize}px`, // Always use our calculated fontSize
    fontFamily: fontFamily, // Use original font name, not loadedFontFamily
    maxWidth: "100%",
    maxHeight: "100%",
    wordWrap: "break-word",
    whiteSpace: "pre-wrap",
    lineHeight: overlay.styles.lineHeight || "1.2",
    // Only add default padding if template doesn't have padding
    padding: overlay.styles.padding || "0.1em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    boxSizing: "border-box",
    // Enable text selection and editing when in edit mode
    userSelect: isEditing ? "text" : "none",
    WebkitUserSelect: isEditing ? "text" : "none",
    cursor: isEditing ? "text" : "inherit",
    outline: "none", // Remove focus outline, selection outline handles visual feedback
    ...(isExitPhase ? exitAnimation : enterAnimation),
  };

  // Apply text stroke
  if (overlay.styles.textStroke) {
    textStyle.WebkitTextStroke = `${overlay.styles.textStroke.width}px ${overlay.styles.textStroke.color}`;
    textStyle.paintOrder = 'stroke fill';
  }

  // Apply advanced text shadows (takes priority over basic textShadow)
  if (overlay.styles.textShadows && overlay.styles.textShadows.length > 0) {
    textStyle.textShadow = generateTextShadowCSS(overlay.styles.textShadows);
  } else if (overlay.styles.glowEffect) {
    // Generate glow effect as multiple shadows
    const glowShadows: Shadow[] = [
      { offsetX: 0, offsetY: 0, blur: overlay.styles.glowEffect.intensity, color: overlay.styles.glowEffect.color, opacity: 0.8 },
      { offsetX: 0, offsetY: 0, blur: overlay.styles.glowEffect.intensity * 2, color: overlay.styles.glowEffect.color, opacity: 0.4 },
      { offsetX: 0, offsetY: 0, blur: overlay.styles.glowEffect.intensity * 3, color: overlay.styles.glowEffect.color, opacity: 0.2 },
    ];
    textStyle.textShadow = generateTextShadowCSS(glowShadows);
  }

  // Apply text gradient fill
  if (overlay.styles.textGradient) {
    textStyle.background = generateTextGradientCSS(overlay.styles.textGradient);
    textStyle.WebkitBackgroundClip = 'text';
    textStyle.WebkitTextFillColor = 'transparent';
    textStyle.backgroundClip = 'text';
  }

  // Procedural behaviors keyed off animation.enter for text-only effects
  const enterKey = overlay.styles.animation?.enter;
  const content = overlay.content || "Enter text...";
  let renderedContent: React.ReactNode = content;

  // Handle character animation presets
  if (overlay.styles.characterAnimation) {
    const { preset, duration, stagger } = overlay.styles.characterAnimation;
    const characters = content.split('');
    
    renderedContent = (
      <>
        {characters.map((char, index) => {
          const charStartFrame = index * stagger;
          const charProgress = Math.max(0, Math.min(1, (frame - charStartFrame) / duration));
          
          let charStyle: React.CSSProperties = {
            display: 'inline-block',
            whiteSpace: char === ' ' ? 'pre' : 'normal',
          };

          switch (preset) {
            case 'fadeIn':
              charStyle.opacity = charProgress;
              break;
            case 'slideIn':
              charStyle.transform = `translateY(${(1 - charProgress) * 20}px)`;
              charStyle.opacity = charProgress;
              break;
            case 'scaleIn':
              charStyle.transform = `scale(${charProgress})`;
              charStyle.opacity = charProgress;
              break;
            case 'rotateIn':
              charStyle.transform = `rotate(${(1 - charProgress) * 180}deg)`;
              charStyle.opacity = charProgress;
              break;
            case 'wave':
              const waveOffset = Math.sin((frame - index * 2) * 0.2) * 5;
              charStyle.transform = `translateY(${waveOffset}px)`;
              break;
            case 'typewriter':
              charStyle.opacity = frame >= charStartFrame ? 1 : 0;
              break;
          }

          return (
            <span key={index} style={charStyle}>
              {char}
            </span>
          );
        })}
      </>
    );
  } else if (enterKey === 'typing') {
    const charDelay = 2; // frames per char
    const speed = 0.5; // multiplier
    const visibleCount = Math.min(
      content.length,
      Math.floor((frame * speed) / Math.max(1, charDelay))
    );
    renderedContent = content.slice(0, visibleCount);
  }

  // Don't render text until font is loaded to prevent flash of wrong font
  // This ensures the correct font displays immediately without fallback artifacts
  // IMPORTANT: This check is AFTER all hooks to comply with Rules of Hooks
  if (!isFontLoaded) {
    return null;
  }

  return (
    <div style={containerStyle}>
      <div
        ref={editableRef}
        style={textStyle}
        contentEditable={isEditing}
        suppressContentEditableWarning
        onBlur={isEditing ? handleBlur : undefined}
        onKeyDown={isEditing ? handleKeyDown : undefined}
      >
        {isEditing ? overlay.content || "Enter text..." : renderedContent}
      </div>
    </div>
  );
}; 