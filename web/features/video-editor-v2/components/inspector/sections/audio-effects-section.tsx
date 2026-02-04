/**
 * AudioEffectsSection - Premiere Pro-style Audio Effect Controls
 * 
 * Architecture matches Adobe Premiere Pro's audio mixer:
 * - Stackable audio effects (EQ, Compressor, Reverb, etc.)
 * - Each effect is collapsible with disclosure triangle
 * - Enable/disable toggle per effect
 * - Effects can be reordered via drag
 * - Visual feedback for audio levels
 */

import React, { useState, useCallback, useMemo } from "react";
import { 
  AudioEffect, 
  AudioEffectType,
  AUDIO_EFFECT_METADATA, 
  createAudioEffect,
  ParametricEQEffect,
  CompressorEffect,
  NoiseGateEffect,
  LimiterEffect,
  ReverbEffect,
  DelayEffect,
  ChorusEffect,
  DistortionEffect,
  GainEffect,
  StereoEnhancerEffect,
  DEFAULT_AUDIO_EFFECT_VALUES,
  getAudioEffectsByCategory,
  AUDIO_EFFECT_CATEGORY_NAMES,
  EQBand,
  createEQBand,
} from "../../../types/audio-effects";
import { Button } from "../../ui/button";
import { Slider } from "../../ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Switch } from "../../ui/switch";
import { Label } from "../../ui/label";
import { Input } from "../../ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "../../ui/dropdown-menu";
import {
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  Copy,
  GripVertical,
  Activity,
  Gauge,
  VolumeX,
  BarChart3,
  Waves,
  Timer,
  Users,
  Zap,
  Volume2,
  PanelLeftClose,
  RotateCcw,
  Power,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../../ui/context-menu";
import { cn } from "../../../utils/general/utils";

// ==========================================
// TYPES
// ==========================================

interface AudioEffectsSectionProps {
  audioEffects: AudioEffect[];
  onUpdate: (effects: AudioEffect[]) => void;
}

// ==========================================
// ICON MAP
// ==========================================

const EFFECT_ICONS: Record<AudioEffectType, React.ElementType> = {
  [AudioEffectType.PARAMETRIC_EQ]: Activity,
  [AudioEffectType.COMPRESSOR]: Gauge,
  [AudioEffectType.NOISE_GATE]: VolumeX,
  [AudioEffectType.LIMITER]: BarChart3,
  [AudioEffectType.REVERB]: Waves,
  [AudioEffectType.DELAY]: Timer,
  [AudioEffectType.CHORUS]: Users,
  [AudioEffectType.DISTORTION]: Zap,
  [AudioEffectType.GAIN]: Volume2,
  [AudioEffectType.STEREO_ENHANCER]: PanelLeftClose,
};

// ==========================================
// HELPER COMPONENTS
// ==========================================

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

const SliderControl: React.FC<SliderControlProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
}) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <span className="text-xs tabular-nums text-muted-foreground">
        {value.toFixed(step < 1 ? 1 : 0)}{unit}
      </span>
    </div>
    <Slider
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={([v]) => onChange(v)}
      className="w-full"
    />
  </div>
);

// ==========================================
// EQ BAND COMPONENT
// ==========================================

interface EQBandControlProps {
  band: EQBand;
  index: number;
  onUpdate: (updates: Partial<EQBand>) => void;
  onRemove: () => void;
}

const EQBandControl: React.FC<EQBandControlProps> = ({
  band,
  index,
  onUpdate,
  onRemove,
}) => {
  const bandColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];
  const color = bandColors[index % bandColors.length];
  
  return (
    <div className={cn(
      "p-2 rounded border",
      band.enabled ? "border-border" : "border-border/50 opacity-60"
    )}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div 
            className="w-3 h-3 rounded-full" 
            style={{ backgroundColor: color }}
          />
          <Select
            value={band.type}
            onValueChange={(type) => onUpdate({ type: type as any })}
          >
            <SelectTrigger className="h-6 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="highpass">High Pass</SelectItem>
              <SelectItem value="lowShelf">Low Shelf</SelectItem>
              <SelectItem value="peaking">Peaking</SelectItem>
              <SelectItem value="highShelf">High Shelf</SelectItem>
              <SelectItem value="lowpass">Low Pass</SelectItem>
              <SelectItem value="notch">Notch</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Switch
            checked={band.enabled}
            onCheckedChange={(enabled) => onUpdate({ enabled })}
            className="scale-75"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onRemove}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-[10px] text-muted-foreground">Freq (Hz)</Label>
          <Input
            type="number"
            value={band.frequency}
            onChange={(e) => onUpdate({ frequency: Number(e.target.value) })}
            className="h-6 text-xs"
            min={20}
            max={20000}
          />
        </div>
        {['lowShelf', 'highShelf', 'peaking'].includes(band.type) && (
          <div>
            <Label className="text-[10px] text-muted-foreground">Gain (dB)</Label>
            <Input
              type="number"
              value={band.gain}
              onChange={(e) => onUpdate({ gain: Number(e.target.value) })}
              className="h-6 text-xs"
              min={-24}
              max={24}
              step={0.5}
            />
          </div>
        )}
        <div>
          <Label className="text-[10px] text-muted-foreground">Q</Label>
          <Input
            type="number"
            value={band.q}
            onChange={(e) => onUpdate({ q: Number(e.target.value) })}
            className="h-6 text-xs"
            min={0.1}
            max={18}
            step={0.1}
          />
        </div>
      </div>
    </div>
  );
};

// ==========================================
// EFFECT CONFIG COMPONENTS
// ==========================================

interface EffectConfigProps<T extends AudioEffect> {
  effect: T;
  onUpdate: (updates: Partial<T>) => void;
}

const ParametricEQConfig: React.FC<EffectConfigProps<ParametricEQEffect>> = ({
  effect,
  onUpdate,
}) => {
  const handleBandUpdate = (index: number, updates: Partial<EQBand>) => {
    const newBands = [...effect.bands];
    newBands[index] = { ...newBands[index], ...updates };
    onUpdate({ bands: newBands } as Partial<ParametricEQEffect>);
  };
  
  const handleRemoveBand = (index: number) => {
    const newBands = effect.bands.filter((_, i) => i !== index);
    onUpdate({ bands: newBands } as Partial<ParametricEQEffect>);
  };
  
  const handleAddBand = () => {
    const newBand = createEQBand('peaking', 1000);
    onUpdate({ bands: [...effect.bands, newBand] } as Partial<ParametricEQEffect>);
  };
  
  return (
    <div className="space-y-3">
      {/* EQ Bands */}
      <div className="space-y-2">
        {effect.bands.map((band, index) => (
          <EQBandControl
            key={band.id}
            band={band}
            index={index}
            onUpdate={(updates) => handleBandUpdate(index, updates)}
            onRemove={() => handleRemoveBand(index)}
          />
        ))}
      </div>
      
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={handleAddBand}
        disabled={effect.bands.length >= 8}
      >
        <Plus className="h-3 w-3 mr-1" />
        Add Band
      </Button>
      
      <SliderControl
        label="Output Gain"
        value={effect.outputGain}
        min={-24}
        max={24}
        step={0.5}
        unit=" dB"
        onChange={(outputGain) => onUpdate({ outputGain } as Partial<ParametricEQEffect>)}
      />
    </div>
  );
};

const CompressorConfig: React.FC<EffectConfigProps<CompressorEffect>> = ({
  effect,
  onUpdate,
}) => (
  <div className="space-y-3">
    <SliderControl
      label="Threshold"
      value={effect.threshold}
      min={-60}
      max={0}
      step={0.5}
      unit=" dB"
      onChange={(threshold) => onUpdate({ threshold } as Partial<CompressorEffect>)}
    />
    <SliderControl
      label="Ratio"
      value={effect.ratio}
      min={1}
      max={20}
      step={0.5}
      unit=":1"
      onChange={(ratio) => onUpdate({ ratio } as Partial<CompressorEffect>)}
    />
    <SliderControl
      label="Attack"
      value={effect.attack}
      min={0.1}
      max={1000}
      step={1}
      unit=" ms"
      onChange={(attack) => onUpdate({ attack } as Partial<CompressorEffect>)}
    />
    <SliderControl
      label="Release"
      value={effect.release}
      min={10}
      max={3000}
      step={10}
      unit=" ms"
      onChange={(release) => onUpdate({ release } as Partial<CompressorEffect>)}
    />
    <SliderControl
      label="Knee"
      value={effect.knee}
      min={0}
      max={40}
      step={1}
      unit=" dB"
      onChange={(knee) => onUpdate({ knee } as Partial<CompressorEffect>)}
    />
    <SliderControl
      label="Makeup Gain"
      value={effect.makeupGain}
      min={0}
      max={24}
      step={0.5}
      unit=" dB"
      onChange={(makeupGain) => onUpdate({ makeupGain } as Partial<CompressorEffect>)}
    />
    <div className="flex items-center justify-between">
      <Label className="text-xs">Auto Makeup</Label>
      <Switch
        checked={effect.autoMakeup}
        onCheckedChange={(autoMakeup) => onUpdate({ autoMakeup } as Partial<CompressorEffect>)}
      />
    </div>
  </div>
);

const NoiseGateConfig: React.FC<EffectConfigProps<NoiseGateEffect>> = ({
  effect,
  onUpdate,
}) => (
  <div className="space-y-3">
    <SliderControl
      label="Threshold"
      value={effect.threshold}
      min={-80}
      max={0}
      step={1}
      unit=" dB"
      onChange={(threshold) => onUpdate({ threshold } as Partial<NoiseGateEffect>)}
    />
    <SliderControl
      label="Attack"
      value={effect.attack}
      min={0.1}
      max={100}
      step={0.1}
      unit=" ms"
      onChange={(attack) => onUpdate({ attack } as Partial<NoiseGateEffect>)}
    />
    <SliderControl
      label="Hold"
      value={effect.hold}
      min={0}
      max={500}
      step={5}
      unit=" ms"
      onChange={(hold) => onUpdate({ hold } as Partial<NoiseGateEffect>)}
    />
    <SliderControl
      label="Release"
      value={effect.release}
      min={10}
      max={1000}
      step={10}
      unit=" ms"
      onChange={(release) => onUpdate({ release } as Partial<NoiseGateEffect>)}
    />
    <SliderControl
      label="Range"
      value={effect.range}
      min={-80}
      max={0}
      step={1}
      unit=" dB"
      onChange={(range) => onUpdate({ range } as Partial<NoiseGateEffect>)}
    />
  </div>
);

const LimiterConfig: React.FC<EffectConfigProps<LimiterEffect>> = ({
  effect,
  onUpdate,
}) => (
  <div className="space-y-3">
    <SliderControl
      label="Ceiling"
      value={effect.ceiling}
      min={-12}
      max={0}
      step={0.1}
      unit=" dB"
      onChange={(ceiling) => onUpdate({ ceiling } as Partial<LimiterEffect>)}
    />
    <SliderControl
      label="Release"
      value={effect.release}
      min={10}
      max={1000}
      step={10}
      unit=" ms"
      onChange={(release) => onUpdate({ release } as Partial<LimiterEffect>)}
    />
    <SliderControl
      label="Lookahead"
      value={effect.lookahead}
      min={0}
      max={10}
      step={0.5}
      unit=" ms"
      onChange={(lookahead) => onUpdate({ lookahead } as Partial<LimiterEffect>)}
    />
  </div>
);

const ReverbConfig: React.FC<EffectConfigProps<ReverbEffect>> = ({
  effect,
  onUpdate,
}) => (
  <div className="space-y-3">
    <div>
      <Label className="text-xs text-muted-foreground">Preset</Label>
      <Select
        value={effect.preset}
        onValueChange={(preset) => onUpdate({ preset: preset as any } as Partial<ReverbEffect>)}
      >
        <SelectTrigger className="h-8 mt-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="small_room">Small Room</SelectItem>
          <SelectItem value="medium_room">Medium Room</SelectItem>
          <SelectItem value="large_room">Large Room</SelectItem>
          <SelectItem value="hall">Hall</SelectItem>
          <SelectItem value="cathedral">Cathedral</SelectItem>
          <SelectItem value="plate">Plate</SelectItem>
          <SelectItem value="spring">Spring</SelectItem>
          <SelectItem value="chamber">Chamber</SelectItem>
          <SelectItem value="ambient">Ambient</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <SliderControl
      label="Decay"
      value={effect.decay}
      min={0.1}
      max={10}
      step={0.1}
      unit=" s"
      onChange={(decay) => onUpdate({ decay } as Partial<ReverbEffect>)}
    />
    <SliderControl
      label="Pre-Delay"
      value={effect.preDelay}
      min={0}
      max={200}
      step={1}
      unit=" ms"
      onChange={(preDelay) => onUpdate({ preDelay } as Partial<ReverbEffect>)}
    />
    <SliderControl
      label="Damping"
      value={effect.damping}
      min={0}
      max={100}
      step={1}
      unit="%"
      onChange={(damping) => onUpdate({ damping } as Partial<ReverbEffect>)}
    />
    <SliderControl
      label="Room Size"
      value={effect.roomSize}
      min={0}
      max={100}
      step={1}
      unit="%"
      onChange={(roomSize) => onUpdate({ roomSize } as Partial<ReverbEffect>)}
    />
    <SliderControl
      label="Mix"
      value={effect.mix}
      min={0}
      max={100}
      step={1}
      unit="%"
      onChange={(mix) => onUpdate({ mix } as Partial<ReverbEffect>)}
    />
  </div>
);

const DelayConfig: React.FC<EffectConfigProps<DelayEffect>> = ({
  effect,
  onUpdate,
}) => (
  <div className="space-y-3">
    <SliderControl
      label="Delay Time"
      value={effect.delayTime}
      min={1}
      max={2000}
      step={1}
      unit=" ms"
      onChange={(delayTime) => onUpdate({ delayTime } as Partial<DelayEffect>)}
    />
    <SliderControl
      label="Feedback"
      value={effect.feedback}
      min={0}
      max={95}
      step={1}
      unit="%"
      onChange={(feedback) => onUpdate({ feedback } as Partial<DelayEffect>)}
    />
    <SliderControl
      label="High Cut"
      value={effect.highCut}
      min={200}
      max={20000}
      step={100}
      unit=" Hz"
      onChange={(highCut) => onUpdate({ highCut } as Partial<DelayEffect>)}
    />
    <SliderControl
      label="Low Cut"
      value={effect.lowCut}
      min={20}
      max={2000}
      step={10}
      unit=" Hz"
      onChange={(lowCut) => onUpdate({ lowCut } as Partial<DelayEffect>)}
    />
    <SliderControl
      label="Mix"
      value={effect.mix}
      min={0}
      max={100}
      step={1}
      unit="%"
      onChange={(mix) => onUpdate({ mix } as Partial<DelayEffect>)}
    />
    <div className="flex items-center justify-between">
      <Label className="text-xs">Ping Pong</Label>
      <Switch
        checked={effect.pingPong}
        onCheckedChange={(pingPong) => onUpdate({ pingPong } as Partial<DelayEffect>)}
      />
    </div>
  </div>
);

const ChorusConfig: React.FC<EffectConfigProps<ChorusEffect>> = ({
  effect,
  onUpdate,
}) => (
  <div className="space-y-3">
    <SliderControl
      label="Rate"
      value={effect.rate}
      min={0.1}
      max={10}
      step={0.1}
      unit=" Hz"
      onChange={(rate) => onUpdate({ rate } as Partial<ChorusEffect>)}
    />
    <SliderControl
      label="Depth"
      value={effect.depth}
      min={0}
      max={100}
      step={1}
      unit="%"
      onChange={(depth) => onUpdate({ depth } as Partial<ChorusEffect>)}
    />
    <SliderControl
      label="Delay"
      value={effect.delay}
      min={1}
      max={50}
      step={1}
      unit=" ms"
      onChange={(delay) => onUpdate({ delay } as Partial<ChorusEffect>)}
    />
    <SliderControl
      label="Feedback"
      value={effect.feedback}
      min={0}
      max={95}
      step={1}
      unit="%"
      onChange={(feedback) => onUpdate({ feedback } as Partial<ChorusEffect>)}
    />
    <SliderControl
      label="Mix"
      value={effect.mix}
      min={0}
      max={100}
      step={1}
      unit="%"
      onChange={(mix) => onUpdate({ mix } as Partial<ChorusEffect>)}
    />
  </div>
);

const DistortionConfig: React.FC<EffectConfigProps<DistortionEffect>> = ({
  effect,
  onUpdate,
}) => (
  <div className="space-y-3">
    <div>
      <Label className="text-xs text-muted-foreground">Type</Label>
      <Select
        value={effect.distortionType}
        onValueChange={(distortionType) => onUpdate({ distortionType: distortionType as any } as Partial<DistortionEffect>)}
      >
        <SelectTrigger className="h-8 mt-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="soft">Soft Clip</SelectItem>
          <SelectItem value="hard">Hard Clip</SelectItem>
          <SelectItem value="tube">Tube</SelectItem>
          <SelectItem value="fuzz">Fuzz</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <SliderControl
      label="Drive"
      value={effect.drive}
      min={0}
      max={100}
      step={1}
      unit="%"
      onChange={(drive) => onUpdate({ drive } as Partial<DistortionEffect>)}
    />
    <SliderControl
      label="Tone"
      value={effect.tone}
      min={-100}
      max={100}
      step={1}
      onChange={(tone) => onUpdate({ tone } as Partial<DistortionEffect>)}
    />
    <SliderControl
      label="Output"
      value={effect.output}
      min={-24}
      max={0}
      step={0.5}
      unit=" dB"
      onChange={(output) => onUpdate({ output } as Partial<DistortionEffect>)}
    />
  </div>
);

const GainConfig: React.FC<EffectConfigProps<GainEffect>> = ({
  effect,
  onUpdate,
}) => (
  <div className="space-y-3">
    <SliderControl
      label="Gain"
      value={effect.gain}
      min={-60}
      max={24}
      step={0.5}
      unit=" dB"
      onChange={(gain) => onUpdate({ gain } as Partial<GainEffect>)}
    />
  </div>
);

const StereoEnhancerConfig: React.FC<EffectConfigProps<StereoEnhancerEffect>> = ({
  effect,
  onUpdate,
}) => (
  <div className="space-y-3">
    <SliderControl
      label="Width"
      value={effect.width}
      min={0}
      max={200}
      step={1}
      unit="%"
      onChange={(width) => onUpdate({ width } as Partial<StereoEnhancerEffect>)}
    />
    <SliderControl
      label="Mid Level"
      value={effect.midLevel}
      min={-24}
      max={24}
      step={0.5}
      unit=" dB"
      onChange={(midLevel) => onUpdate({ midLevel } as Partial<StereoEnhancerEffect>)}
    />
    <SliderControl
      label="Side Level"
      value={effect.sideLevel}
      min={-24}
      max={24}
      step={0.5}
      unit=" dB"
      onChange={(sideLevel) => onUpdate({ sideLevel } as Partial<StereoEnhancerEffect>)}
    />
  </div>
);

// ==========================================
// EFFECT ROW COMPONENT
// ==========================================

interface EffectRowProps {
  effect: AudioEffect;
  onUpdate: (updates: Partial<AudioEffect>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onReset: () => void;
}

const EffectRow: React.FC<EffectRowProps> = ({
  effect,
  onUpdate,
  onRemove,
  onDuplicate,
  onReset,
}) => {
  const [isExpanded, setIsExpanded] = useState(effect.expanded ?? true);
  const metadata = AUDIO_EFFECT_METADATA[effect.type];
  const Icon = EFFECT_ICONS[effect.type] || Volume2;
  
  const renderConfig = () => {
    const configProps = {
      effect: effect as any,
      onUpdate: onUpdate as any,
    };
    
    switch (effect.type) {
      case AudioEffectType.PARAMETRIC_EQ:
        return <ParametricEQConfig {...configProps} />;
      case AudioEffectType.COMPRESSOR:
        return <CompressorConfig {...configProps} />;
      case AudioEffectType.NOISE_GATE:
        return <NoiseGateConfig {...configProps} />;
      case AudioEffectType.LIMITER:
        return <LimiterConfig {...configProps} />;
      case AudioEffectType.REVERB:
        return <ReverbConfig {...configProps} />;
      case AudioEffectType.DELAY:
        return <DelayConfig {...configProps} />;
      case AudioEffectType.CHORUS:
        return <ChorusConfig {...configProps} />;
      case AudioEffectType.DISTORTION:
        return <DistortionConfig {...configProps} />;
      case AudioEffectType.GAIN:
        return <GainConfig {...configProps} />;
      case AudioEffectType.STEREO_ENHANCER:
        return <StereoEnhancerConfig {...configProps} />;
      default:
        return <div className="text-xs text-muted-foreground">No configuration available</div>;
    }
  };
  
  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div className={cn(
          "border rounded-lg overflow-hidden transition-colors",
          effect.enabled ? "border-border" : "border-border/50 bg-muted/30"
        )}>
          {/* Header */}
          <div 
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 cursor-pointer",
              "hover:bg-muted/50 transition-colors"
            )}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground cursor-grab" />
            
            <button className="p-0.5">
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
            
            <Icon className={cn(
              "h-4 w-4",
              effect.enabled ? "text-primary" : "text-muted-foreground"
            )} />
            
            <span className={cn(
              "text-sm font-medium flex-1",
              !effect.enabled && "text-muted-foreground"
            )}>
              {effect.name || metadata.name}
            </span>
            
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                onUpdate({ enabled: !effect.enabled });
              }}
            >
              <Power className={cn(
                "h-3.5 w-3.5",
                effect.enabled ? "text-green-500" : "text-muted-foreground"
              )} />
            </Button>
          </div>
          
          {/* Content */}
          {isExpanded && (
            <div className="px-3 pb-3 pt-1 border-t border-border/50">
              {renderConfig()}
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      
      <ContextMenuContent>
        <ContextMenuItem onClick={onDuplicate}>
          <Copy className="h-4 w-4 mr-2" />
          Duplicate
        </ContextMenuItem>
        <ContextMenuItem onClick={onReset}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset to Default
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onRemove} className="text-destructive">
          <Trash2 className="h-4 w-4 mr-2" />
          Remove
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

// ==========================================
// MAIN COMPONENT
// ==========================================

export const AudioEffectsSection: React.FC<AudioEffectsSectionProps> = ({
  audioEffects,
  onUpdate,
}) => {
  const effectsByCategory = useMemo(() => getAudioEffectsByCategory(), []);
  
  // Add effect
  const handleAddEffect = useCallback((type: AudioEffectType) => {
    const maxOrder = audioEffects.length > 0 
      ? Math.max(...audioEffects.map(e => e.order)) + 1 
      : 0;
    const newEffect = createAudioEffect(type, maxOrder);
    onUpdate([...audioEffects, newEffect]);
  }, [audioEffects, onUpdate]);
  
  // Update effect
  const handleUpdateEffect = useCallback((effectId: string, updates: Partial<AudioEffect>) => {
    onUpdate(audioEffects.map(e => 
      e.id === effectId ? { ...e, ...updates } : e
    ));
  }, [audioEffects, onUpdate]);
  
  // Remove effect
  const handleRemoveEffect = useCallback((effectId: string) => {
    onUpdate(audioEffects.filter(e => e.id !== effectId));
  }, [audioEffects, onUpdate]);
  
  // Duplicate effect
  const handleDuplicateEffect = useCallback((effectId: string) => {
    const effect = audioEffects.find(e => e.id === effectId);
    if (!effect) return;
    
    const maxOrder = Math.max(...audioEffects.map(e => e.order)) + 1;
    const newEffect: AudioEffect = {
      ...effect,
      id: `audio-effect-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      order: maxOrder,
      name: effect.name ? `${effect.name} (Copy)` : undefined,
    };
    onUpdate([...audioEffects, newEffect]);
  }, [audioEffects, onUpdate]);
  
  // Reset effect
  const handleResetEffect = useCallback((effectId: string) => {
    const effect = audioEffects.find(e => e.id === effectId);
    if (!effect) return;
    
    const defaults = DEFAULT_AUDIO_EFFECT_VALUES[effect.type];
    onUpdate(audioEffects.map(e => 
      e.id === effectId ? { ...defaults, id: e.id, order: e.order } as AudioEffect : e
    ));
  }, [audioEffects, onUpdate]);
  
  // Sort effects by order
  const sortedEffects = useMemo(() => 
    [...audioEffects].sort((a, b) => a.order - b.order),
    [audioEffects]
  );
  
  return (
    <div className="space-y-3">
      {/* Header with add button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Audio Effects</h3>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Effect
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {Object.entries(effectsByCategory).map(([category, types]) => (
              <DropdownMenuSub key={category}>
                <DropdownMenuSubTrigger>
                  {AUDIO_EFFECT_CATEGORY_NAMES[category] || category}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {types.map((type) => {
                    const metadata = AUDIO_EFFECT_METADATA[type];
                    const Icon = EFFECT_ICONS[type];
                    return (
                      <DropdownMenuItem
                        key={type}
                        onClick={() => handleAddEffect(type)}
                      >
                        <Icon className="h-4 w-4 mr-2" />
                        {metadata.name}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      
      {/* Effects list */}
      {sortedEffects.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground border border-dashed rounded-lg">
          <Volume2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No audio effects</p>
          <p className="text-xs mt-1">Click "Add Effect" to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedEffects.map((effect) => (
            <EffectRow
              key={effect.id}
              effect={effect}
              onUpdate={(updates) => handleUpdateEffect(effect.id, updates)}
              onRemove={() => handleRemoveEffect(effect.id)}
              onDuplicate={() => handleDuplicateEffect(effect.id)}
              onReset={() => handleResetEffect(effect.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default AudioEffectsSection;
