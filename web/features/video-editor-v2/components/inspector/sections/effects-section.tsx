/**
 * EffectsSection - Premiere Pro-style Effect Controls
 * 
 * Architecture matches Adobe Premiere Pro:
 * - Built-in effects (Motion, Opacity) always visible at top
 * - User-added effects below in a stack
 * - Each effect is collapsible with disclosure triangle
 * - "fx" toggle button to enable/disable effect
 * - Masks are nested inside effects (per-effect masking)
 * - Effects can be reordered via drag
 */

import React, { useState, useCallback } from "react";
import { Overlay } from "../../../types";
import { 
  Effect, 
  EffectType, 
  EFFECT_METADATA, 
  createEffect,
  isBuiltInEffect,
  BlurEffect,
  DropShadowEffect,
  GlowEffect,
  SharpenEffect,
  NoiseEffect,
  VignetteEffect,
  GrayscaleEffect,
  SepiaEffect,
  InvertEffect,
  OpacityEffect,
  MotionEffect,
} from "../../../types/effects";
import { Mask, ShapeMaskType, createRectangleMask, createEllipseMask } from "../../../types/masks";
import { Button } from "../../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { EffectAddPanel } from "./effect-add-panel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import {
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  Circle,
  Square,
  Pentagon,
  Layers,
  RotateCcw,
  GripVertical,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../../ui/context-menu";
import { cn } from "../../../utils/general/utils";
import { DEFAULT_EFFECT_VALUES } from "../../../types/effects";
import {
  DraggableValue,
  ProSlider,
  HueWheel,
  ColorInput,
  Vector2DInput,
  GradientSpectrum,
  AngleDial,
  ProToggle,
} from "../components/effect-controls";

// ==========================================
// TYPES
// ==========================================

interface EffectsSectionProps {
  overlay: Overlay;
  onUpdate: (updates: Partial<Overlay>) => void;
}

type OverlayWithEffects = Overlay & {
  effects?: Effect[];
};

// ==========================================
// MISSING EFFECT TYPE STUBS
// (Used by color grading config components below)
// ==========================================

type CurvePoint = { x: number; y: number };

type LevelsEffect = Effect & {
  channel: 'rgb' | 'red' | 'green' | 'blue';
  inputBlack: number;
  inputWhite: number;
  gamma: number;
  outputBlack: number;
  outputWhite: number;
};

type CurvesEffect = Effect & {
  activeChannel: 'rgb' | 'red' | 'green' | 'blue';
  rgb: CurvePoint[];
  red: CurvePoint[];
  green: CurvePoint[];
  blue: CurvePoint[];
  [key: string]: any;
};

type ColorWheelValue = {
  hue: number;
  saturation: number;
  luminance: number;
};

type ColorWheelsEffect = Effect & {
  lift: ColorWheelValue;
  gamma: ColorWheelValue;
  gain: ColorWheelValue;
  globalSaturation: number;
};

type WhiteBalanceEffect = Effect & {
  temperature: number;
  tint: number;
};

// ==========================================
// EFFECT CONFIG COMPONENTS
// ==========================================

interface EffectConfigProps<T extends Effect> {
  effect: T;
  onUpdate: (updates: Partial<T>) => void;
}

// Motion Effect Config (built-in) - Professional UI
const MotionConfig: React.FC<EffectConfigProps<MotionEffect>> = ({ effect, onUpdate }) => (
  <div className="space-y-3">
    {/* Position */}
    <div className="space-y-1.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Position</span>
      <div className="grid grid-cols-2 gap-2">
        <DraggableValue
          value={effect.positionX}
          onChange={(v) => onUpdate({ positionX: v })}
          min={-2000}
          max={2000}
          suffix="px"
          label="X"
          sensitivity={0.5}
        />
        <DraggableValue
          value={effect.positionY}
          onChange={(v) => onUpdate({ positionY: v })}
          min={-2000}
          max={2000}
          suffix="px"
          label="Y"
          sensitivity={0.5}
        />
      </div>
    </div>
    
    {/* Scale */}
    <div className="space-y-1.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Scale</span>
      <DraggableValue
        value={effect.scale}
        onChange={(v) => onUpdate({ scale: v, scaleX: v, scaleY: v })}
        min={0}
        max={500}
        suffix="%"
        showReset
        defaultValue={100}
        sensitivity={0.5}
      />
    </div>
    
    {/* Rotation with dial */}
    <div className="space-y-1.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Rotation</span>
      <div className="flex items-center gap-3">
        <AngleDial
          value={effect.rotation}
          onChange={(v) => onUpdate({ rotation: v })}
          size={40}
        />
        <DraggableValue
          value={effect.rotation}
          onChange={(v) => onUpdate({ rotation: v })}
          min={-360}
          max={360}
          step={0.1}
          suffix="°"
          decimals={1}
          showReset
          defaultValue={0}
          className="flex-1"
        />
      </div>
    </div>
  </div>
);

// Opacity Effect Config (built-in) - supports masks
const OpacityConfig: React.FC<EffectConfigProps<OpacityEffect> & { onMaskAdd: (type: ShapeMaskType) => void }> = ({ effect, onUpdate, onMaskAdd }) => (
  <div className="space-y-3">
    {/* Opacity slider with scrubable value */}
    <div className="space-y-1.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Opacity</span>
      <div className="flex items-center gap-2">
        <ProSlider
          value={effect.opacity}
          onChange={(v) => onUpdate({ opacity: v })}
          min={0}
          max={100}
          suffix="%"
          showValue={false}
          className="flex-1"
        />
        <DraggableValue
          value={effect.opacity}
          onChange={(v) => onUpdate({ opacity: v })}
          min={0}
          max={100}
          suffix="%"
          className="w-20"
        />
      </div>
    </div>
    
    {/* Blend Mode */}
    <div className="space-y-1.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Blend Mode</span>
      <Select value={effect.blendMode} onValueChange={(v) => onUpdate({ blendMode: v as OpacityEffect['blendMode'] })}>
        <SelectTrigger className="h-8 text-xs bg-neutral-800/50 border-neutral-700/50">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="normal">Normal</SelectItem>
          <SelectItem value="multiply">Multiply</SelectItem>
          <SelectItem value="screen">Screen</SelectItem>
          <SelectItem value="overlay">Overlay</SelectItem>
          <SelectItem value="darken">Darken</SelectItem>
          <SelectItem value="lighten">Lighten</SelectItem>
          <SelectItem value="colorDodge">Color Dodge</SelectItem>
          <SelectItem value="colorBurn">Color Burn</SelectItem>
          <SelectItem value="hardLight">Hard Light</SelectItem>
          <SelectItem value="softLight">Soft Light</SelectItem>
          <SelectItem value="difference">Difference</SelectItem>
          <SelectItem value="exclusion">Exclusion</SelectItem>
        </SelectContent>
      </Select>
    </div>

    {/* Mask tools - like Premiere Pro */}
    <div className="pt-2 border-t border-neutral-700/30">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Masks</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onMaskAdd(ShapeMaskType.ELLIPSE)}>
              <Circle className="h-3.5 w-3.5 mr-2" />
              Ellipse Mask
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMaskAdd(ShapeMaskType.RECTANGLE)}>
              <Square className="h-3.5 w-3.5 mr-2" />
              Rectangle Mask
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMaskAdd(ShapeMaskType.POLYGON)}>
              <Pentagon className="h-3.5 w-3.5 mr-2" />
              Free Draw Bezier
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      
      {/* Masks list */}
      {effect.masks && effect.masks.length > 0 ? (
        <div className="space-y-1">
          {effect.masks.map((mask, i) => (
            <MaskItem key={mask.id} mask={mask} index={i} />
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground/60">
          No masks added
        </p>
      )}
    </div>
  </div>
);

// Mask Item component
const MaskItem: React.FC<{ mask: Mask; index: number }> = ({ mask, index }) => (
  <div className="flex items-center gap-2 py-1.5 px-2.5 rounded-md bg-neutral-800/40 text-xs">
    {mask.type === 'shape' && (
      <>
        {(mask as any).shapeType === 'ellipse' && <Circle className="h-3 w-3 text-blue-400" />}
        {(mask as any).shapeType === 'rectangle' && <Square className="h-3 w-3 text-green-400" />}
        {(mask as any).shapeType === 'polygon' && <Pentagon className="h-3 w-3 text-purple-400" />}
      </>
    )}
    {mask.type === 'trackMatte' && <Layers className="h-3 w-3 text-orange-400" />}
    <span className="flex-1 text-muted-foreground">Mask {index + 1}</span>
    <div className={cn(
      "w-1.5 h-1.5 rounded-full",
      mask.enabled ? "bg-green-500" : "bg-neutral-600"
    )} />
  </div>
);

// Blur Effect Config - Professional UI
const BlurConfig: React.FC<EffectConfigProps<BlurEffect>> = ({ effect, onUpdate }) => (
  <div className="space-y-3">
    <div className="space-y-1.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Blur Radius</span>
      <div className="flex items-center gap-2">
        <ProSlider
          value={effect.radius}
          onChange={(v) => onUpdate({ radius: v })}
          min={0}
          max={100}
          step={0.5}
          suffix="px"
          decimals={1}
          showValue={false}
          gradient="linear-gradient(to right, #374151, #60a5fa)"
          className="flex-1"
        />
        <DraggableValue
          value={effect.radius}
          onChange={(v) => onUpdate({ radius: v })}
          min={0}
          max={100}
          step={0.5}
          suffix="px"
          decimals={1}
          className="w-20"
        />
      </div>
    </div>
    {/* Visual preview of blur strength */}
    <div className="flex gap-1">
      {[0, 5, 10, 25, 50].map((preset) => (
        <button
          key={preset}
          onClick={() => onUpdate({ radius: preset })}
          className={cn(
            "flex-1 py-1.5 text-[10px] rounded-md transition-colors",
            Math.abs(effect.radius - preset) < 1
              ? "bg-primary/20 text-primary border border-primary/30"
              : "bg-neutral-800/50 text-muted-foreground hover:bg-neutral-700/50"
          )}
        >
          {preset}
        </button>
      ))}
    </div>
  </div>
);

// Vignette Config - Professional UI
const VignetteConfig: React.FC<EffectConfigProps<VignetteEffect>> = ({ effect, onUpdate }) => (
  <div className="space-y-3">
    {/* Preview */}
    <div 
      className="h-12 rounded-md relative overflow-hidden"
      style={{
        background: `radial-gradient(ellipse ${100 - effect.size}% ${(100 - effect.size) * (effect.roundness / 100 + 0.5)}% at center, 
          transparent ${100 - effect.feather}%, 
          rgba(0,0,0,0.8) 100%
        ), linear-gradient(135deg, #3b82f6, #8b5cf6)`
      }}
    >
      <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white/60">Preview</span>
    </div>
    
    <div className="space-y-1.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Amount</span>
      <DraggableValue
        value={effect.size}
        onChange={(v) => onUpdate({ size: v })}
        min={0}
        max={100}
        suffix="%"
        showReset
        defaultValue={50}
      />
    </div>
    
    <div className="space-y-1.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Feather</span>
      <ProSlider
        value={effect.feather}
        onChange={(v) => onUpdate({ feather: v })}
        min={0}
        max={100}
        suffix="%"
        gradient="linear-gradient(to right, #1a1a1a, transparent)"
      />
    </div>
    
    <div className="space-y-1.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Roundness</span>
      <ProSlider
        value={effect.roundness}
        onChange={(v) => onUpdate({ roundness: v })}
        min={0}
        max={100}
        suffix="%"
      />
    </div>
  </div>
);

// Stylize effect configs
const GrayscaleConfig: React.FC<EffectConfigProps<GrayscaleEffect>> = ({ effect, onUpdate }) => (
  <div className="space-y-3">
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Amount</span>
        <span className="text-[10px] text-muted-foreground/70 font-mono tabular-nums">{effect.amount}%</span>
      </div>
      <div className="flex items-center gap-2">
        <ProSlider
          value={effect.amount}
          onChange={(v) => onUpdate({ amount: v })}
          min={0}
          max={100}
          showValue={false}
          gradient="linear-gradient(to right, #ef4444, #6b7280)"
          className="flex-1"
        />
        <DraggableValue
          value={effect.amount}
          onChange={(v) => onUpdate({ amount: v })}
          min={0}
          max={100}
          suffix="%"
          className="w-16"
        />
      </div>
    </div>
    
    <div className="flex gap-1">
      {[0, 25, 50, 75, 100].map((preset) => (
        <button
          key={preset}
          onClick={() => onUpdate({ amount: preset })}
          className={cn(
            "flex-1 py-1.5 text-[10px] rounded-md transition-colors",
            effect.amount === preset
              ? "bg-primary/20 text-primary border border-primary/30"
              : "bg-neutral-800/50 text-muted-foreground hover:bg-neutral-700/50"
          )}
        >
          {preset}%
        </button>
      ))}
    </div>
  </div>
);

const SepiaConfig: React.FC<EffectConfigProps<SepiaEffect>> = ({ effect, onUpdate }) => (
  <div className="space-y-3">
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Amount</span>
        <span className="text-[10px] text-muted-foreground/70 font-mono tabular-nums">{effect.amount}%</span>
      </div>
      <div className="flex items-center gap-2">
        <ProSlider
          value={effect.amount}
          onChange={(v) => onUpdate({ amount: v })}
          min={0}
          max={100}
          showValue={false}
          gradient="linear-gradient(to right, #3b82f6, #d4a574)"
          className="flex-1"
        />
        <DraggableValue
          value={effect.amount}
          onChange={(v) => onUpdate({ amount: v })}
          min={0}
          max={100}
          suffix="%"
          className="w-16"
        />
      </div>
    </div>
    
    <div className="flex gap-1">
      {[0, 25, 50, 75, 100].map((preset) => (
        <button
          key={preset}
          onClick={() => onUpdate({ amount: preset })}
          className={cn(
            "flex-1 py-1.5 text-[10px] rounded-md transition-colors",
            effect.amount === preset
              ? "bg-primary/20 text-primary border border-primary/30"
              : "bg-neutral-800/50 text-muted-foreground hover:bg-neutral-700/50"
          )}
        >
          {preset}%
        </button>
      ))}
    </div>
  </div>
);

const InvertConfig: React.FC<EffectConfigProps<InvertEffect>> = ({ effect, onUpdate }) => (
  <div className="space-y-3">
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Amount</span>
        <span className="text-[10px] text-muted-foreground/70 font-mono tabular-nums">{effect.amount}%</span>
      </div>
      <div className="flex items-center gap-2">
        <ProSlider
          value={effect.amount}
          onChange={(v) => onUpdate({ amount: v })}
          min={0}
          max={100}
          showValue={false}
          gradient="linear-gradient(to right, #1a1a1a, #ffffff)"
          className="flex-1"
        />
        <DraggableValue
          value={effect.amount}
          onChange={(v) => onUpdate({ amount: v })}
          min={0}
          max={100}
          suffix="%"
          className="w-16"
        />
      </div>
    </div>
    
    <div className="flex gap-1">
      {[0, 25, 50, 75, 100].map((preset) => (
        <button
          key={preset}
          onClick={() => onUpdate({ amount: preset })}
          className={cn(
            "flex-1 py-1.5 text-[10px] rounded-md transition-colors",
            effect.amount === preset
              ? "bg-primary/20 text-primary border border-primary/30"
              : "bg-neutral-800/50 text-muted-foreground hover:bg-neutral-700/50"
          )}
        >
          {preset}%
        </button>
      ))}
    </div>
  </div>
);

// Drop Shadow Config - Professional UI with visual preview
const DropShadowConfig: React.FC<EffectConfigProps<DropShadowEffect>> = ({ effect, onUpdate }) => (
  <div className="space-y-3">
    {/* Live preview */}
    <div className="h-14 bg-neutral-800/50 rounded-md flex items-center justify-center">
      <div 
        className="w-10 h-10 bg-white rounded-sm"
        style={{
          boxShadow: `${effect.offsetX}px ${effect.offsetY}px ${effect.blur}px ${effect.spread}px ${effect.color}${Math.round(effect.opacity * 255).toString(16).padStart(2, '0')}`
        }}
      />
    </div>
    
    {/* Offset */}
    <div className="space-y-1.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Offset</span>
      <div className="grid grid-cols-2 gap-2">
        <DraggableValue
          value={effect.offsetX}
          onChange={(v) => onUpdate({ offsetX: v })}
          min={-100}
          max={100}
          suffix="px"
          label="X"
          sensitivity={0.3}
        />
        <DraggableValue
          value={effect.offsetY}
          onChange={(v) => onUpdate({ offsetY: v })}
          min={-100}
          max={100}
          suffix="px"
          label="Y"
          sensitivity={0.3}
        />
      </div>
    </div>
    
    {/* Blur & Spread */}
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-1.5">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Blur</span>
        <DraggableValue
          value={effect.blur}
          onChange={(v) => onUpdate({ blur: v })}
          min={0}
          max={100}
          suffix="px"
          sensitivity={0.3}
        />
      </div>
      <div className="space-y-1.5">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Spread</span>
        <DraggableValue
          value={effect.spread}
          onChange={(v) => onUpdate({ spread: v })}
          min={0}
          max={100}
          suffix="px"
          sensitivity={0.3}
        />
      </div>
    </div>
    
    {/* Opacity */}
    <div className="space-y-1.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Opacity</span>
      <div className="flex items-center gap-2">
        <ProSlider
          value={effect.opacity * 100}
          onChange={(v) => onUpdate({ opacity: v / 100 })}
          min={0}
          max={100}
          suffix="%"
          showValue={false}
          className="flex-1"
        />
        <DraggableValue
          value={Math.round(effect.opacity * 100)}
          onChange={(v) => onUpdate({ opacity: v / 100 })}
          min={0}
          max={100}
          suffix="%"
          className="w-16"
        />
      </div>
    </div>
    
    {/* Color */}
    <ColorInput
      value={effect.color}
      onChange={(v) => onUpdate({ color: v })}
      label="Color"
    />
  </div>
);

// Glow Effect Config - Professional UI
const GlowConfig: React.FC<EffectConfigProps<GlowEffect>> = ({ effect, onUpdate }) => (
  <div className="space-y-3">
    {/* Live preview */}
    <div className="h-14 bg-neutral-900/70 rounded-md flex items-center justify-center">
      <div 
        className="w-10 h-10 bg-neutral-800 rounded-sm flex items-center justify-center text-white/60 text-[10px]"
        style={{
          boxShadow: `0 0 ${effect.radius}px ${effect.radius / 2}px ${effect.color}${Math.round(effect.intensity * 255).toString(16).padStart(2, '0')}`
        }}
      >
        Glow
      </div>
    </div>
    
    {/* Radius */}
    <div className="space-y-1.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Radius</span>
      <div className="flex items-center gap-2">
        <ProSlider
          value={effect.radius}
          onChange={(v) => onUpdate({ radius: v })}
          min={0}
          max={100}
          suffix="px"
          showValue={false}
          gradient={`linear-gradient(to right, transparent, ${effect.color})`}
          className="flex-1"
        />
        <DraggableValue
          value={effect.radius}
          onChange={(v) => onUpdate({ radius: v })}
          min={0}
          max={100}
          suffix="px"
          className="w-16"
        />
      </div>
    </div>
    
    {/* Intensity */}
    <div className="space-y-1.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Intensity</span>
      <div className="flex items-center gap-2">
        <ProSlider
          value={effect.intensity * 100}
          onChange={(v) => onUpdate({ intensity: v / 100 })}
          min={0}
          max={100}
          suffix="%"
          showValue={false}
          className="flex-1"
        />
        <DraggableValue
          value={Math.round(effect.intensity * 100)}
          onChange={(v) => onUpdate({ intensity: v / 100 })}
          min={0}
          max={100}
          suffix="%"
          className="w-16"
        />
      </div>
    </div>
    
    {/* Color */}
    <ColorInput
      value={effect.color}
      onChange={(v) => onUpdate({ color: v })}
      label="Color"
    />
  </div>
);

// Sharpen Effect Config - Professional UI
const SharpenConfig: React.FC<EffectConfigProps<SharpenEffect>> = ({ effect, onUpdate }) => (
  <div className="space-y-3">
    {/* Visual indicator */}
    <div className="flex gap-2 h-10">
      <div 
        className="flex-1 rounded-md flex items-center justify-center text-[9px] text-white/60"
        style={{ 
          backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'20\' height=\'20\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 0h10v10H0zM10 10h10v10H10z\' fill=\'%23666\'/%3E%3C/svg%3E")',
          backgroundSize: '10px 10px',
          filter: 'blur(0.5px)'
        }}
      >
        Soft
      </div>
      <div 
        className="flex-1 rounded-md flex items-center justify-center text-[9px] text-white/60"
        style={{ 
          backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'20\' height=\'20\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 0h10v10H0zM10 10h10v10H10z\' fill=\'%23666\'/%3E%3C/svg%3E")',
          backgroundSize: '10px 10px',
        }}
      >
        Sharp
      </div>
    </div>
    
    <div className="space-y-1.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Amount</span>
      <div className="flex items-center gap-2">
        <ProSlider
          value={effect.amount}
          onChange={(v) => onUpdate({ amount: v })}
          min={0}
          max={100}
          suffix="%"
          showValue={false}
          gradient="linear-gradient(to right, #6b7280, #ffffff)"
          className="flex-1"
        />
        <DraggableValue
          value={effect.amount}
          onChange={(v) => onUpdate({ amount: v })}
          min={0}
          max={100}
          suffix="%"
          className="w-16"
        />
      </div>
    </div>
    
    <p className="text-[10px] text-muted-foreground/50">
      Enhances edge contrast for a sharper appearance
    </p>
  </div>
);

// Noise/Grain Effect Config - Professional UI
const NoiseConfig: React.FC<EffectConfigProps<NoiseEffect>> = ({ effect, onUpdate }) => (
  <div className="space-y-3">
    {/* Visual preview */}
    <div 
      className="h-12 rounded-md relative overflow-hidden"
      style={{
        background: effect.monochrome 
          ? 'linear-gradient(135deg, #374151, #1f2937)'
          : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
      }}
    >
      <div 
        className="absolute inset-0"
        style={{
          backgroundImage: effect.monochrome
            ? `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`
            : `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          opacity: effect.amount / 100,
          mixBlendMode: 'overlay',
        }}
      />
      <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white/60">
        {effect.monochrome ? 'Film Grain' : 'RGB Noise'}
      </span>
    </div>
    
    <div className="space-y-1.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Amount</span>
      <div className="flex items-center gap-2">
        <ProSlider
          value={effect.amount}
          onChange={(v) => onUpdate({ amount: v })}
          min={0}
          max={100}
          suffix="%"
          showValue={false}
          className="flex-1"
        />
        <DraggableValue
          value={effect.amount}
          onChange={(v) => onUpdate({ amount: v })}
          min={0}
          max={100}
          suffix="%"
          className="w-16"
        />
      </div>
    </div>
    
    <ProToggle
      checked={effect.monochrome}
      onChange={(checked) => onUpdate({ monochrome: checked })}
      label="Monochrome"
    />
  </div>
);

// ==========================================
// PROFESSIONAL COLOR GRADING EFFECTS
// ==========================================

// Levels Effect Config - Like Photoshop/Premiere Levels
const LevelsConfig: React.FC<EffectConfigProps<LevelsEffect>> = ({ effect, onUpdate }) => (
  <div className="space-y-3">
    {/* Channel selector */}
    <div className="flex gap-1">
      {(['rgb', 'red', 'green', 'blue'] as const).map((channel) => (
        <button
          key={channel}
          onClick={() => onUpdate({ channel })}
          className={cn(
            "flex-1 py-1.5 text-[10px] font-medium rounded-md transition-colors uppercase",
            effect.channel === channel
              ? channel === 'rgb' 
                ? "bg-white/10 text-white border border-white/20" 
                : channel === 'red'
                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                : channel === 'green'
                ? "bg-green-500/20 text-green-400 border border-green-500/30"
                : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
              : "bg-neutral-800/50 text-muted-foreground hover:bg-neutral-700/50"
          )}
        >
          {channel}
        </button>
      ))}
    </div>
    
    {/* Histogram visualization placeholder */}
    <div className="h-14 bg-neutral-900/70 rounded-md border border-neutral-700/50 flex items-center justify-center relative overflow-hidden">
      {/* Simulated histogram bars */}
      <div className="absolute inset-x-2 bottom-1 top-1 flex items-end gap-px">
        {[...Array(32)].map((_, i) => {
          const height = Math.sin((i / 32) * Math.PI) * 0.8 + Math.random() * 0.2;
          return (
            <div 
              key={i} 
              className={cn(
                "flex-1 rounded-t",
                effect.channel === 'rgb' ? "bg-white/40" :
                effect.channel === 'red' ? "bg-red-500/50" :
                effect.channel === 'green' ? "bg-green-500/50" : "bg-blue-500/50"
              )}
              style={{ height: `${height * 100}%` }}
            />
          );
        })}
      </div>
      {/* Input range indicator */}
      <div 
        className="absolute bottom-0 h-1 bg-white/30"
        style={{
          left: `${(effect.inputBlack / 255) * 100}%`,
          right: `${100 - (effect.inputWhite / 255) * 100}%`,
        }}
      />
    </div>
    
    {/* Input Levels */}
    <div className="space-y-2">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Input Levels</span>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <span className="text-[9px] text-muted-foreground/60">Black</span>
          <DraggableValue
            value={effect.inputBlack}
            onChange={(v) => onUpdate({ inputBlack: v })}
            min={0}
            max={254}
          />
        </div>
        <div className="space-y-1">
          <span className="text-[9px] text-muted-foreground/60">Gamma</span>
          <DraggableValue
            value={effect.gamma}
            onChange={(v) => onUpdate({ gamma: v })}
            min={0.1}
            max={10}
            step={0.01}
            decimals={2}
          />
        </div>
        <div className="space-y-1">
          <span className="text-[9px] text-muted-foreground/60">White</span>
          <DraggableValue
            value={effect.inputWhite}
            onChange={(v) => onUpdate({ inputWhite: v })}
            min={1}
            max={255}
          />
        </div>
      </div>
    </div>
    
    {/* Output Levels */}
    <div className="space-y-2">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Output Levels</span>
      <div className="flex items-center gap-2">
        <DraggableValue
          value={effect.outputBlack}
          onChange={(v) => onUpdate({ outputBlack: v })}
          min={0}
          max={255}
          className="flex-1"
        />
        <div 
          className="flex-1 h-4 rounded-md"
          style={{
            background: `linear-gradient(to right, 
              rgb(${effect.outputBlack}, ${effect.outputBlack}, ${effect.outputBlack}),
              rgb(${effect.outputWhite}, ${effect.outputWhite}, ${effect.outputWhite})
            )`
          }}
        />
        <DraggableValue
          value={effect.outputWhite}
          onChange={(v) => onUpdate({ outputWhite: v })}
          min={0}
          max={255}
          className="flex-1"
        />
      </div>
    </div>
    
    {/* Quick presets */}
    <div className="flex gap-1 pt-1">
      <button
        onClick={() => onUpdate({ inputBlack: 0, inputWhite: 255, gamma: 1, outputBlack: 0, outputWhite: 255 })}
        className="flex-1 py-1.5 text-[10px] rounded-md bg-neutral-800/50 text-muted-foreground hover:bg-neutral-700/50"
      >
        Reset
      </button>
      <button
        onClick={() => onUpdate({ inputBlack: 20, inputWhite: 235, gamma: 1.2 })}
        className="flex-1 py-1.5 text-[10px] rounded-md bg-neutral-800/50 text-muted-foreground hover:bg-neutral-700/50"
      >
        Auto
      </button>
      <button
        onClick={() => onUpdate({ inputBlack: 30, inputWhite: 225, gamma: 0.9 })}
        className="flex-1 py-1.5 text-[10px] rounded-md bg-neutral-800/50 text-muted-foreground hover:bg-neutral-700/50"
      >
        Cinematic
      </button>
    </div>
  </div>
);

// Curves Effect Config - Professional RGB curves
const CurvesConfig: React.FC<EffectConfigProps<CurvesEffect>> = ({ effect, onUpdate }) => {
  const activePoints = effect[effect.activeChannel];
  
  // Simple curve visualization
  const getPathD = (points: CurvePoint[]) => {
    if (points.length < 2) return '';
    const sortedPoints = [...points].sort((a, b) => a.x - b.x);
    return sortedPoints.map((p, i) => 
      `${i === 0 ? 'M' : 'L'} ${(p.x / 255) * 100} ${100 - (p.y / 255) * 100}`
    ).join(' ');
  };
  
  const handleCurveClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 255);
    const y = Math.round((1 - (e.clientY - rect.top) / rect.height) * 255);
    
    // Add new point
    const newPoints = [...activePoints, { x, y }].sort((a, b) => a.x - b.x);
    onUpdate({ [effect.activeChannel]: newPoints });
  };
  
  return (
    <div className="space-y-3">
      {/* Channel selector */}
      <div className="flex gap-1">
        {(['rgb', 'red', 'green', 'blue'] as const).map((channel) => (
          <button
            key={channel}
            onClick={() => onUpdate({ activeChannel: channel })}
            className={cn(
              "flex-1 py-1.5 text-[10px] font-medium rounded-md transition-colors uppercase",
              effect.activeChannel === channel
                ? channel === 'rgb' 
                  ? "bg-white/10 text-white border border-white/20" 
                  : channel === 'red'
                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                  : channel === 'green'
                  ? "bg-green-500/20 text-green-400 border border-green-500/30"
                  : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                : "bg-neutral-800/50 text-muted-foreground hover:bg-neutral-700/50"
            )}
          >
            {channel}
          </button>
        ))}
      </div>
      
      {/* Curve editor */}
      <div className="relative aspect-square bg-neutral-900/70 rounded-md border border-neutral-700/50 overflow-hidden">
        {/* Grid lines */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
          {/* Grid */}
          {[25, 50, 75].map((v) => (
            <React.Fragment key={v}>
              <line x1={v} y1={0} x2={v} y2={100} stroke="white" strokeOpacity={0.1} />
              <line x1={0} y1={v} x2={100} y2={v} stroke="white" strokeOpacity={0.1} />
            </React.Fragment>
          ))}
          {/* Diagonal reference line */}
          <line x1={0} y1={100} x2={100} y2={0} stroke="white" strokeOpacity={0.2} strokeDasharray="2,2" />
        </svg>
        
        {/* Curve */}
        <svg 
          className="absolute inset-0 w-full h-full cursor-crosshair" 
          viewBox="0 0 100 100"
          onClick={handleCurveClick}
        >
          <path
            d={getPathD(activePoints)}
            fill="none"
            stroke={
              effect.activeChannel === 'rgb' ? 'white' :
              effect.activeChannel === 'red' ? '#ef4444' :
              effect.activeChannel === 'green' ? '#22c55e' : '#3b82f6'
            }
            strokeWidth={2}
          />
          {/* Control points */}
          {activePoints.map((point, i) => (
            <circle
              key={i}
              cx={(point.x / 255) * 100}
              cy={100 - (point.y / 255) * 100}
              r={4}
              fill={
                effect.activeChannel === 'rgb' ? 'white' :
                effect.activeChannel === 'red' ? '#ef4444' :
                effect.activeChannel === 'green' ? '#22c55e' : '#3b82f6'
              }
              className="cursor-move"
            />
          ))}
        </svg>
        
        {/* Labels */}
        <div className="absolute bottom-1 left-1 text-[8px] text-muted-foreground/50">Shadows</div>
        <div className="absolute bottom-1 right-1 text-[8px] text-muted-foreground/50">Highlights</div>
      </div>
      
      <p className="text-[10px] text-muted-foreground/50">
        Click on the curve to add control points
      </p>
      
      {/* Reset button */}
      <button
        onClick={() => onUpdate({
          rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
          red: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
          green: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
          blue: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
        })}
        className="w-full py-1.5 text-[10px] rounded-md bg-neutral-800/50 text-muted-foreground hover:bg-neutral-700/50"
      >
        Reset All Curves
      </button>
    </div>
  );
};

// Color Wheel Component for 3-Way Color Corrector
const ColorWheelControl: React.FC<{
  value: ColorWheelValue;
  onChange: (value: ColorWheelValue) => void;
  label: string;
  description: string;
}> = ({ value, onChange, label, description }) => {
  const wheelRef = React.useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  
  // Convert hue/saturation to x/y position
  const indicatorAngle = (value.hue - 90) * (Math.PI / 180);
  const indicatorRadius = (value.saturation / 100) * 32;
  const indicatorX = Math.cos(indicatorAngle) * indicatorRadius;
  const indicatorY = Math.sin(indicatorAngle) * indicatorRadius;
  
  const handleMouseDown = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  
  React.useEffect(() => {
    if (!isDragging) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!wheelRef.current) return;
      const rect = wheelRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      
      // Calculate hue from angle
      let hue = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
      if (hue < 0) hue += 360;
      
      // Calculate saturation from distance (max radius = 40px)
      const distance = Math.sqrt(dx * dx + dy * dy);
      const saturation = Math.min(100, (distance / 40) * 100);
      
      onChange({ ...value, hue: Math.round(hue), saturation: Math.round(saturation) });
    };
    
    const handleMouseUp = () => setIsDragging(false);
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onChange, value]);
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
        <span className="text-[9px] text-muted-foreground/60">{description}</span>
      </div>
      
      <div className="flex items-center gap-3">
        {/* Color wheel */}
        <div
          ref={wheelRef}
          className={cn(
            "relative w-20 h-20 rounded-full shrink-0 cursor-crosshair select-none",
            "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]",
            isDragging && "ring-2 ring-primary"
          )}
          style={{
            background: `conic-gradient(from 0deg, 
              hsl(0, 70%, 50%), hsl(60, 70%, 50%), hsl(120, 70%, 50%),
              hsl(180, 70%, 50%), hsl(240, 70%, 50%), hsl(300, 70%, 50%), hsl(360, 70%, 50%)
            )`,
          }}
          onMouseDown={handleMouseDown}
        >
          {/* Center fade */}
          <div 
            className="absolute inset-0 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(128,128,128,1) 0%, rgba(128,128,128,0) 70%)'
            }}
          />
          {/* Indicator */}
          <div 
            className="absolute w-3 h-3 rounded-full bg-white border-2 border-neutral-900 pointer-events-none"
            style={{
              left: `calc(50% + ${indicatorX}px - 6px)`,
              top: `calc(50% + ${indicatorY}px - 6px)`,
              boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
            }}
          />
        </div>
        
        {/* Luminance slider */}
        <div className="flex-1 space-y-1">
          <span className="text-[9px] text-muted-foreground/60">Luminance</span>
          <ProSlider
            value={value.luminance}
            onChange={(v) => onChange({ ...value, luminance: v })}
            min={-100}
            max={100}
            showValue={false}
          />
          <div className="flex justify-between text-[8px] text-muted-foreground/40">
            <span>-100</span>
            <span>0</span>
            <span>+100</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// 3-Way Color Corrector Config
const ColorWheelsConfig: React.FC<EffectConfigProps<ColorWheelsEffect>> = ({ effect, onUpdate }) => (
  <div className="space-y-4">
    <ColorWheelControl
      value={effect.lift}
      onChange={(lift) => onUpdate({ lift })}
      label="Lift"
      description="Shadows"
    />
    
    <ColorWheelControl
      value={effect.gamma}
      onChange={(gamma) => onUpdate({ gamma })}
      label="Gamma"
      description="Midtones"
    />
    
    <ColorWheelControl
      value={effect.gain}
      onChange={(gain) => onUpdate({ gain })}
      label="Gain"
      description="Highlights"
    />
    
    {/* Global Saturation */}
    <div className="space-y-1.5 pt-2 border-t border-neutral-700/30">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Global Saturation</span>
        <span className="text-[10px] text-muted-foreground/70 font-mono tabular-nums">{effect.globalSaturation}%</span>
      </div>
      <ProSlider
        value={effect.globalSaturation}
        onChange={(v) => onUpdate({ globalSaturation: v })}
        min={0}
        max={200}
        suffix="%"
        showValue={false}
        gradient="linear-gradient(to right, #6b7280, #ef4444, #22c55e, #3b82f6)"
      />
    </div>
    
    {/* Reset button */}
    <button
      onClick={() => onUpdate({
        lift: { hue: 0, saturation: 0, luminance: 0 },
        gamma: { hue: 0, saturation: 0, luminance: 0 },
        gain: { hue: 0, saturation: 0, luminance: 0 },
        globalSaturation: 100,
      })}
      className="w-full py-1.5 text-[10px] rounded-md bg-neutral-800/50 text-muted-foreground hover:bg-neutral-700/50"
    >
      Reset All
    </button>
  </div>
);

// White Balance Config
const WhiteBalanceConfig: React.FC<EffectConfigProps<WhiteBalanceEffect>> = ({ effect, onUpdate }) => (
  <div className="space-y-3">
    {/* Temperature */}
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Temperature</span>
        <span className="text-[10px] text-muted-foreground/70 font-mono tabular-nums">
          {effect.temperature > 0 ? '+' : ''}{effect.temperature}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <ProSlider
          value={effect.temperature}
          onChange={(v) => onUpdate({ temperature: v })}
          min={-100}
          max={100}
          showValue={false}
          gradient="linear-gradient(to right, #3b82f6, #fbbf24, #f97316)"
          className="flex-1"
        />
        <DraggableValue
          value={effect.temperature}
          onChange={(v) => onUpdate({ temperature: v })}
          min={-100}
          max={100}
          showReset
          defaultValue={0}
          className="w-16"
        />
      </div>
      <div className="flex justify-between text-[8px] text-muted-foreground/40 px-0.5">
        <span>Cool</span>
        <span>Warm</span>
      </div>
    </div>
    
    {/* Tint */}
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Tint</span>
        <span className="text-[10px] text-muted-foreground/70 font-mono tabular-nums">
          {effect.tint > 0 ? '+' : ''}{effect.tint}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <ProSlider
          value={effect.tint}
          onChange={(v) => onUpdate({ tint: v })}
          min={-100}
          max={100}
          showValue={false}
          gradient="linear-gradient(to right, #22c55e, #d946ef)"
          className="flex-1"
        />
        <DraggableValue
          value={effect.tint}
          onChange={(v) => onUpdate({ tint: v })}
          min={-100}
          max={100}
          showReset
          defaultValue={0}
          className="w-16"
        />
      </div>
      <div className="flex justify-between text-[8px] text-muted-foreground/40 px-0.5">
        <span>Green</span>
        <span>Magenta</span>
      </div>
    </div>
    
    {/* Presets */}
    <div className="space-y-1.5 pt-2 border-t border-neutral-700/30">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Presets</span>
      <div className="grid grid-cols-3 gap-1">
        <button
          onClick={() => onUpdate({ temperature: 0, tint: 0 })}
          className="py-1.5 text-[10px] rounded-md bg-neutral-800/50 text-muted-foreground hover:bg-neutral-700/50"
        >
          Auto
        </button>
        <button
          onClick={() => onUpdate({ temperature: -30, tint: 0 })}
          className="py-1.5 text-[10px] rounded-md bg-blue-900/30 text-blue-400 hover:bg-blue-900/50"
        >
          Daylight
        </button>
        <button
          onClick={() => onUpdate({ temperature: 50, tint: 10 })}
          className="py-1.5 text-[10px] rounded-md bg-orange-900/30 text-orange-400 hover:bg-orange-900/50"
        >
          Tungsten
        </button>
        <button
          onClick={() => onUpdate({ temperature: 20, tint: 30 })}
          className="py-1.5 text-[10px] rounded-md bg-green-900/30 text-green-400 hover:bg-green-900/50"
        >
          Fluorescent
        </button>
        <button
          onClick={() => onUpdate({ temperature: -10, tint: -5 })}
          className="py-1.5 text-[10px] rounded-md bg-neutral-800/50 text-muted-foreground hover:bg-neutral-700/50"
        >
          Cloudy
        </button>
        <button
          onClick={() => onUpdate({ temperature: -50, tint: -20 })}
          className="py-1.5 text-[10px] rounded-md bg-cyan-900/30 text-cyan-400 hover:bg-cyan-900/50"
        >
          Shade
        </button>
      </div>
    </div>
  </div>
);

// ==========================================
// EFFECT ITEM COMPONENT (Premiere Pro style)
// ==========================================

interface EffectItemProps {
  effect: Effect;
  isBuiltIn: boolean;
  onToggle: (enabled: boolean) => void;
  onUpdate: (updates: Partial<Effect>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onReset: () => void;
  onAddMask?: (type: ShapeMaskType) => void;
}

const EffectItem: React.FC<EffectItemProps> = ({
  effect,
  isBuiltIn,
  onToggle,
  onUpdate,
  onRemove,
  onReset,
  onDuplicate,
  onAddMask,
}) => {
  // Default to expanded (Premiere Pro shows effects expanded by default)
  const [expanded, setExpanded] = useState(true);
  const metadata = EFFECT_METADATA[effect.type];

  const renderConfig = () => {
    switch (effect.type) {
      case EffectType.MOTION:
        return <MotionConfig effect={effect as MotionEffect} onUpdate={onUpdate as any} />;
      case EffectType.OPACITY:
        return <OpacityConfig effect={effect as OpacityEffect} onUpdate={onUpdate as any} onMaskAdd={onAddMask!} />;
      case EffectType.BLUR:
        return <BlurConfig effect={effect as BlurEffect} onUpdate={onUpdate as any} />;
      case EffectType.VIGNETTE:
        return <VignetteConfig effect={effect as VignetteEffect} onUpdate={onUpdate as any} />;
      case EffectType.GRAYSCALE:
        return <GrayscaleConfig effect={effect as GrayscaleEffect} onUpdate={onUpdate as any} />;
      case EffectType.SEPIA:
        return <SepiaConfig effect={effect as SepiaEffect} onUpdate={onUpdate as any} />;
      case EffectType.INVERT:
        return <InvertConfig effect={effect as InvertEffect} onUpdate={onUpdate as any} />;
      case EffectType.DROP_SHADOW:
        return <DropShadowConfig effect={effect as DropShadowEffect} onUpdate={onUpdate as any} />;
      case EffectType.GLOW:
        return <GlowConfig effect={effect as GlowEffect} onUpdate={onUpdate as any} />;
      case EffectType.SHARPEN:
        return <SharpenConfig effect={effect as SharpenEffect} onUpdate={onUpdate as any} />;
      case EffectType.NOISE:
        return <NoiseConfig effect={effect as NoiseEffect} onUpdate={onUpdate as any} />;
      default:
        return (
          <div className="pt-2">
            <p className="text-xs text-muted-foreground">
              Configuration coming soon
            </p>
          </div>
        );
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className={cn(
          "bg-neutral-900/50 border border-neutral-700/50 rounded-lg overflow-hidden",
          !effect.enabled && "opacity-60"
        )}>
          {/* Header */}
          <div className="flex items-center gap-1.5 px-3 py-2 hover:bg-neutral-800/30 transition-colors">
            {/* Drag handle (visual only for now) */}
            {!isBuiltIn && (
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 cursor-grab" />
            )}
            
            {/* Expand/Collapse triangle */}
            <button
              className="h-5 w-5 shrink-0 flex items-center justify-center hover:bg-neutral-700/50 rounded transition-colors"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>

            {/* Eye toggle button */}
            <button
              className={cn(
                "h-5 w-5 shrink-0 flex items-center justify-center rounded transition-colors",
                effect.enabled 
                  ? "text-primary hover:bg-primary/10" 
                  : "text-muted-foreground/50 hover:bg-neutral-700/50"
              )}
              onClick={() => onToggle(!effect.enabled)}
              title={effect.enabled ? "Disable effect" : "Enable effect"}
            >
              {effect.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>

            {/* Effect name */}
            <span className="text-xs font-medium text-foreground/90 flex-1 truncate">
              {metadata?.name || effect.type}
            </span>

            {/* Quick actions */}
            <div className="flex items-center gap-0.5 opacity-60 hover:opacity-100 transition-opacity">
              {/* Reset to defaults */}
              <button
                className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-neutral-700/50 rounded transition-colors"
                onClick={onReset}
                title="Reset to defaults"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
              
              {!isBuiltIn && (
                <>
                  <button
                    className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-neutral-700/50 rounded transition-colors"
                    onClick={onDuplicate}
                    title="Duplicate effect"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                  <button
                    className="h-6 w-6 flex items-center justify-center text-red-400/70 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                    onClick={onRemove}
                    title="Remove effect"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Content - collapsible */}
          {expanded && (
            <div className="px-3 pb-3 pt-1">
              {renderConfig()}
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      
      {/* Context Menu */}
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={onReset}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset to Defaults
        </ContextMenuItem>
        {!isBuiltIn && (
          <>
            <ContextMenuItem onClick={onDuplicate}>
              <Copy className="h-4 w-4 mr-2" />
              Duplicate Effect
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onRemove} className="text-destructive focus:text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Effect
            </ContextMenuItem>
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onToggle(!effect.enabled)}>
          {effect.enabled ? (
            <>
              <EyeOff className="h-4 w-4 mr-2" />
              Disable Effect
            </>
          ) : (
            <>
              <Eye className="h-4 w-4 mr-2" />
              Enable Effect
            </>
          )}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

// ==========================================
// EFFECTS SECTION COMPONENT
// ==========================================

export const EffectsSection: React.FC<EffectsSectionProps> = ({
  overlay,
  onUpdate,
}) => {
  const overlayWithEffects = overlay as OverlayWithEffects;
  const effects = overlayWithEffects.effects || [];

  // State for showing the add panel
  const [showAddPanel, setShowAddPanel] = useState(false);

  // Separate built-in effects from user effects
  const builtInEffects = effects.filter(e => isBuiltInEffect(e.type));
  const userEffects = effects.filter(e => !isBuiltInEffect(e.type));

  const handleAddEffect = useCallback((type: EffectType) => {
    const newEffect = createEffect(type, effects.length);
    onUpdate({ effects: [...effects, newEffect] } as any);
  }, [effects, onUpdate]);

  const handleToggleEffect = useCallback((effectId: string, enabled: boolean) => {
    const updatedEffects = effects.map(e =>
      e.id === effectId ? { ...e, enabled } : e
    );
    onUpdate({ effects: updatedEffects } as any);
  }, [effects, onUpdate]);

  const handleUpdateEffect = useCallback((effectId: string, updates: Partial<Effect>) => {
    const updatedEffects = effects.map(e =>
      e.id === effectId ? { ...e, ...updates } : e
    );
    onUpdate({ effects: updatedEffects } as any);
  }, [effects, onUpdate]);

  const handleRemoveEffect = useCallback((effectId: string) => {
    const updatedEffects = effects
      .filter(e => e.id !== effectId)
      .map((e, i) => ({ ...e, order: i }));
    onUpdate({ effects: updatedEffects } as any);
  }, [effects, onUpdate]);

  const handleDuplicateEffect = useCallback((effectId: string) => {
    const effectToDuplicate = effects.find(e => e.id === effectId);
    if (!effectToDuplicate) return;
    
    const newEffect = {
      ...effectToDuplicate,
      id: `effect-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      order: effects.length,
    };
    onUpdate({ effects: [...effects, newEffect] } as any);
  }, [effects, onUpdate]);

  const handleAddMaskToEffect = useCallback((effectId: string, maskType: ShapeMaskType) => {
    const effect = effects.find(e => e.id === effectId);
    if (!effect) return;

    const newMask = maskType === ShapeMaskType.ELLIPSE 
      ? createEllipseMask()
      : createRectangleMask();

    const updatedEffects = effects.map(e =>
      e.id === effectId 
        ? { ...e, masks: [...(e.masks || []), newMask] }
        : e
    );
    onUpdate({ effects: updatedEffects } as any);
  }, [effects, onUpdate]);

  const handleResetEffect = useCallback((effectId: string) => {
    const effect = effects.find(e => e.id === effectId);
    if (!effect) return;

    // Get default values for this effect type
    const defaults = DEFAULT_EFFECT_VALUES[effect.type];
    if (!defaults) return;

    // Reset to defaults but keep id, order, and masks
    const updatedEffects = effects.map(e =>
      e.id === effectId 
        ? { 
            ...defaults, 
            id: e.id, 
            order: e.order,
            masks: e.masks, // Preserve masks
            enabled: e.enabled, // Preserve enabled state
          }
        : e
    );
    onUpdate({ effects: updatedEffects } as any);
  }, [effects, onUpdate]);

  return (
    <div className="space-y-3">
      {/* Built-in effects (Motion, Opacity) - always visible like Premiere Pro */}
      {builtInEffects.length > 0 && (
        <div className="space-y-2">
          {builtInEffects
            .sort((a, b) => a.order - b.order)
            .map(effect => (
              <EffectItem
                key={effect.id}
                effect={effect}
                isBuiltIn={true}
                onToggle={(enabled) => handleToggleEffect(effect.id, enabled)}
                onUpdate={(updates) => handleUpdateEffect(effect.id, updates)}
                onRemove={() => {}} // Can't remove built-in effects
                onDuplicate={() => {}} // Can't duplicate built-in effects
                onReset={() => handleResetEffect(effect.id)}
                onAddMask={(maskType) => handleAddMaskToEffect(effect.id, maskType)}
              />
            ))
          }
        </div>
      )}

      {/* Separator between built-in and user effects */}
      {builtInEffects.length > 0 && userEffects.length > 0 && (
        <div className="border-t border-border pt-2" />
      )}

      {/* User-added effects */}
      {userEffects.length > 0 && (
        <div className="space-y-2">
          {userEffects
            .sort((a, b) => a.order - b.order)
            .map(effect => (
              <EffectItem
                key={effect.id}
                effect={effect}
                isBuiltIn={false}
                onToggle={(enabled) => handleToggleEffect(effect.id, enabled)}
                onUpdate={(updates) => handleUpdateEffect(effect.id, updates)}
                onRemove={() => handleRemoveEffect(effect.id)}
                onDuplicate={() => handleDuplicateEffect(effect.id)}
                onReset={() => handleResetEffect(effect.id)}
                onAddMask={(maskType) => handleAddMaskToEffect(effect.id, maskType)}
              />
            ))
          }
        </div>
      )}

      {/* Add Effect Panel */}
      {showAddPanel ? (
        <div className="relative">
          <EffectAddPanel
            onAddEffect={(type) => {
              handleAddEffect(type);
              setShowAddPanel(false);
            }}
            onCancel={() => setShowAddPanel(false)}
          />
        </div>
      ) : (
        <button
          className="w-full h-9 rounded-lg flex items-center justify-center gap-2 text-xs font-medium
                     bg-neutral-800/50 border border-neutral-700/50
                     text-muted-foreground hover:text-foreground
                     hover:bg-neutral-700/50 hover:border-neutral-600/50
                     active:scale-[0.98] transition-all duration-200"
          onClick={() => setShowAddPanel(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Effect
        </button>
      )}
    </div>
  );
};

export default EffectsSection;
