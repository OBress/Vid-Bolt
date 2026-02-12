/**
 * TextSection - Inspector section for text-specific properties
 *
 * Properties organized by usage frequency:
 * 1. Font, Size, Color, Align (most used)
 * 2. Weight, Style, Spacing (frequently used)
 * 3. Background, Content (less common)
 */

import React, { useCallback, useState, useMemo, useEffect } from "react";
import { cn } from "../../../utils/general/utils";
import { Label } from "../../ui/label";
import { Input } from "../../ui/input";
import { Button } from "../../ui/button";
import { Textarea } from "../../ui/textarea";
import { Slider } from "../../ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { ColorPicker } from "../../ui/color-picker";
import { TextOverlay } from "../../../types";
import {
  Type,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Palette,
  Edit3,
} from "lucide-react";
import { getAvailableWeights, getClosestWeight, isWeightAvailable } from "../../../data/font-weights";

// ==========================================
// TYPES
// ==========================================

interface TextSectionProps {
  overlay: TextOverlay;
  onUpdate: (updates: Partial<TextOverlay>) => void;
  onUpdateStyles: (updates: Partial<TextOverlay["styles"]>) => void;
}

// ==========================================
// SECTION HEADER
// ==========================================

interface SectionHeaderProps {
  icon: React.ElementType;
  title: string;
  children?: React.ReactNode;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ icon: Icon, title, children }) => (
  <div className="flex items-center justify-between mb-3">
    <div className="flex items-center gap-2">
      {React.createElement(Icon, { className: "h-3.5 w-3.5 text-muted-foreground" })}
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {title}
      </span>
    </div>
    {children}
  </div>
);

// ==========================================
// FONT FAMILIES
// ==========================================

const FONT_FAMILIES = [
  { value: "Inter", label: "Inter" },
  { value: "Arial", label: "Arial" },
  { value: "Helvetica", label: "Helvetica" },
  { value: "Georgia", label: "Georgia" },
  { value: "Times New Roman", label: "Times New Roman" },
  { value: "Verdana", label: "Verdana" },
  { value: "Roboto", label: "Roboto" },
  { value: "Open Sans", label: "Open Sans" },
  { value: "Montserrat", label: "Montserrat" },
  { value: "Playfair Display", label: "Playfair Display" },
  { value: "Oswald", label: "Oswald" },
  { value: "Poppins", label: "Poppins" },
  { value: "Lato", label: "Lato" },
  { value: "Source Sans Pro", label: "Source Sans Pro" },
  { value: "PT Sans", label: "PT Sans" },
  { value: "Ubuntu", label: "Ubuntu" },
  { value: "Raleway", label: "Raleway" },
  { value: "Merriweather", label: "Merriweather" },
  { value: "Nunito", label: "Nunito" },
  { value: "Comic Sans MS", label: "Comic Sans MS" },
];

// ==========================================
// TEXT SECTION COMPONENT
// ==========================================

export const TextSection: React.FC<TextSectionProps> = ({
  overlay,
  onUpdate,
  onUpdateStyles,
}) => {
  const styles = overlay.styles;
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [localContent, setLocalContent] = useState(overlay.content);

  const fontSizeNum = parseInt(styles.fontSize || "48", 10);
  const currentFontFamily = styles.fontFamily || "Inter";
  
  const availableWeights = useMemo(() => 
    getAvailableWeights(currentFontFamily),
    [currentFontFamily]
  );

  useEffect(() => {
    const currentWeight = styles.fontWeight || "400";
    if (!isWeightAvailable(currentFontFamily, currentWeight)) {
      const closestWeight = getClosestWeight(currentFontFamily, currentWeight);
      if (closestWeight !== currentWeight) {
        onUpdateStyles({ fontWeight: closestWeight });
      }
    }
  }, [currentFontFamily, styles.fontWeight, onUpdateStyles]);

  const isBold = styles.fontWeight && parseInt(styles.fontWeight) >= 700;
  const isItalic = styles.fontStyle === "italic";
  const isUnderline = styles.textDecoration?.includes("underline");
  const isStrikethrough = styles.textDecoration?.includes("line-through");

  const toggleBold = useCallback(() => {
    const currentWeight = parseInt(styles.fontWeight || "400");
    onUpdateStyles({ fontWeight: currentWeight >= 700 ? "400" : "700" });
  }, [styles.fontWeight, onUpdateStyles]);

  const toggleItalic = useCallback(() => {
    onUpdateStyles({ fontStyle: isItalic ? "normal" : "italic" });
  }, [isItalic, onUpdateStyles]);

  const toggleUnderline = useCallback(() => {
    let newDecoration = (styles.textDecoration || "").replace("underline", "").trim();
    if (!isUnderline) newDecoration += " underline";
    onUpdateStyles({ textDecoration: newDecoration.trim() || undefined });
  }, [isUnderline, styles.textDecoration, onUpdateStyles]);

  const toggleStrikethrough = useCallback(() => {
    let newDecoration = (styles.textDecoration || "").replace("line-through", "").trim();
    if (!isStrikethrough) newDecoration += " line-through";
    onUpdateStyles({ textDecoration: newDecoration.trim() || undefined });
  }, [isStrikethrough, styles.textDecoration, onUpdateStyles]);

  const handleContentBlur = useCallback(() => {
    setIsEditingContent(false);
    if (localContent !== overlay.content) {
      onUpdate({ content: localContent });
    }
  }, [localContent, overlay.content, onUpdate]);

  return (
    <div className="space-y-3">
      {/* Font & Size */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={Type} title="Typography" />
        
        <div className="space-y-2">
          <Select
            value={styles.fontFamily || "Inter"}
            onValueChange={(value) => onUpdateStyles({ fontFamily: value })}
          >
            <SelectTrigger className="h-8 text-xs bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_FAMILIES.map((font) => (
                <SelectItem
                  key={font.value}
                  value={font.value}
                  style={{ fontFamily: font.value }}
                >
                  {font.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Size</Label>
              <Input
                type="number"
                value={fontSizeNum}
                onChange={(e) => onUpdateStyles({ fontSize: `${e.target.value}px` })}
                className="h-7 text-xs bg-background"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Weight</Label>
              <Select
                value={styles.fontWeight || "400"}
                onValueChange={(value) => onUpdateStyles({ fontWeight: value })}
              >
                <SelectTrigger className="h-7 text-xs bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableWeights.map((weight) => (
                    <SelectItem key={weight.value} value={weight.value}>
                      {weight.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Color</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-8 w-full justify-start gap-2">
                  <div
                    className="w-4 h-4 rounded border border-border"
                    style={{ backgroundColor: styles.color || "#ffffff" }}
                  />
                  <span className="text-xs font-mono uppercase">
                    {styles.color || "#ffffff"}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3" align="start">
                <ColorPicker
                  color={styles.color || "#ffffff"}
                  onChange={(color) => onUpdateStyles({ color })}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* Style & Alignment */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={Bold} title="Style" />
        
        <div className="flex items-center gap-1 flex-wrap">
          <Button
            variant={isBold ? "default" : "outline"}
            size="icon"
            className="h-8 w-8"
            onClick={toggleBold}
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            variant={isItalic ? "default" : "outline"}
            size="icon"
            className="h-8 w-8"
            onClick={toggleItalic}
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            variant={isUnderline ? "default" : "outline"}
            size="icon"
            className="h-8 w-8"
            onClick={toggleUnderline}
          >
            <Underline className="h-4 w-4" />
          </Button>
          <Button
            variant={isStrikethrough ? "default" : "outline"}
            size="icon"
            className="h-8 w-8"
            onClick={toggleStrikethrough}
          >
            <Strikethrough className="h-4 w-4" />
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          <Button
            variant={styles.textAlign === "left" ? "default" : "outline"}
            size="icon"
            className="h-8 w-8"
            onClick={() => onUpdateStyles({ textAlign: "left" })}
          >
            <AlignLeft className="h-4 w-4" />
          </Button>
          <Button
            variant={styles.textAlign === "center" || !styles.textAlign ? "default" : "outline"}
            size="icon"
            className="h-8 w-8"
            onClick={() => onUpdateStyles({ textAlign: "center" })}
          >
            <AlignCenter className="h-4 w-4" />
          </Button>
          <Button
            variant={styles.textAlign === "right" ? "default" : "outline"}
            size="icon"
            className="h-8 w-8"
            onClick={() => onUpdateStyles({ textAlign: "right" })}
          >
            <AlignRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Spacing */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={Type} title="Spacing" />
        
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Line Height</Label>
            <Input
              type="number"
              value={parseFloat(styles.lineHeight || "1.2")}
              onChange={(e) => onUpdateStyles({ lineHeight: e.target.value })}
              className="h-7 text-xs bg-background"
              step="0.1"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Letter Spacing</Label>
            <Input
              type="number"
              value={parseFloat(styles.letterSpacing || "0")}
              onChange={(e) => onUpdateStyles({ letterSpacing: `${e.target.value}px` })}
              className="h-7 text-xs bg-background"
              step="0.5"
            />
          </div>
        </div>
      </div>

      {/* Background */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={Palette} title="Background" />
        
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-8 w-full justify-start gap-2">
              <div
                className={cn(
                  "w-4 h-4 rounded border border-border",
                  (styles.backgroundColor === "transparent" || !styles.backgroundColor) &&
                    "bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNjY2MiLz48cmVjdCB4PSI0IiB5PSI0IiB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjY2NjIi8+PC9zdmc+')] bg-repeat"
                )}
                style={{
                  backgroundColor:
                    styles.backgroundColor === "transparent"
                      ? undefined
                      : styles.backgroundColor,
                }}
              />
              <span className="text-xs font-mono">
                {styles.backgroundColor || "transparent"}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="start">
            <ColorPicker
              color={styles.backgroundColor || "transparent"}
              onChange={(color) => onUpdateStyles({ backgroundColor: color })}
              showAlpha
            />
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-2 text-xs"
              onClick={() => onUpdateStyles({ backgroundColor: "transparent" })}
            >
              Clear Background
            </Button>
          </PopoverContent>
        </Popover>
      </div>

      {/* Content */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={Edit3} title="Content" />
        
        {isEditingContent ? (
          <Textarea
            value={localContent}
            onChange={(e) => setLocalContent(e.target.value)}
            onBlur={handleContentBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleContentBlur();
              }
            }}
            className="min-h-[60px] text-sm bg-background"
            autoFocus
          />
        ) : (
          <button
            onClick={() => {
              setLocalContent(overlay.content);
              setIsEditingContent(true);
            }}
            className={cn(
              "w-full text-left px-3 py-2 rounded-md border border-input",
              "bg-background hover:bg-muted/50 transition-colors",
              "text-sm truncate"
            )}
          >
            {overlay.content || "Click to edit text..."}
          </button>
        )}
      </div>
    </div>
  );
};
