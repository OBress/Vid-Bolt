/**
 * AudioInspector - Professional Audio Editing Panel
 * 
 * Polished, card-based UI with:
 * - Volume: Level control, speed
 * - EQ: Parametric equalizer with frequency graph
 * - Dynamics: Compressor, Noise Gate, Limiter
 * - Effects: Reverb, Delay, Chorus, Distortion
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { cn } from "../../utils/general/utils";
import { SoundOverlay } from "../../types";
import type { TimelineClip } from "../../types/timeline-v2";
import type { 
  AudioEffect, 
  ParametricEQEffect, 
  CompressorEffect, 
  NoiseGateEffect,
  LimiterEffect,
  ReverbEffect,
  DelayEffect,
  ChorusEffect,
  DistortionEffect,
  EQBand,
  EQBandType,
} from "../../types/audio-effects";
import { 
  AudioEffectType, 
  createAudioEffect, 
  createEQBand,
} from "../../types/audio-effects";
import { useVideoEditorStore } from "../../stores/video-editor-store";
import { getAudioEffectsCache } from "../../utils/audio-effects-cache";
import { ScrollArea } from "../ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { Slider } from "../ui/slider";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import {
  Volume2,
  VolumeX,
  Activity,
  Gauge,
  Waves,
  Music,
  Power,
  RotateCcw,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Timer,
  Zap,
  Users,
  Sparkles,
  Link2,
  Info,
} from "lucide-react";

// ==========================================
// EQ PRESETS
// ==========================================

interface EQPreset {
  name: string;
  category: string;
  bands: Partial<EQBand>[];
  outputGain?: number;
}

const EQ_PRESETS: EQPreset[] = [
  { name: "Vocal Presence", category: "Voice", bands: [
    { type: 'highpass', frequency: 80, q: 0.7, gain: 0, enabled: true },
    { type: 'peaking', frequency: 240, q: 2, gain: -3, enabled: true },
    { type: 'peaking', frequency: 3000, q: 1.5, gain: 4, enabled: true },
    { type: 'highShelf', frequency: 10000, q: 0.7, gain: 2, enabled: true },
  ]},
  { name: "Podcast Voice", category: "Voice", bands: [
    { type: 'highpass', frequency: 100, q: 0.7, gain: 0, enabled: true },
    { type: 'peaking', frequency: 200, q: 1.5, gain: -4, enabled: true },
    { type: 'peaking', frequency: 2500, q: 2, gain: 3, enabled: true },
    { type: 'peaking', frequency: 5000, q: 1, gain: 2, enabled: true },
  ]},
  { name: "Broadcast", category: "Voice", bands: [
    { type: 'highpass', frequency: 120, q: 0.7, gain: 0, enabled: true },
    { type: 'lowShelf', frequency: 200, q: 0.7, gain: -2, enabled: true },
    { type: 'peaking', frequency: 3500, q: 1.2, gain: 4, enabled: true },
  ]},
  { name: "Bass Boost", category: "Music", bands: [
    { type: 'lowShelf', frequency: 100, q: 0.7, gain: 6, enabled: true },
    { type: 'peaking', frequency: 60, q: 1, gain: 4, enabled: true },
  ], outputGain: -3 },
  { name: "Treble Boost", category: "Music", bands: [
    { type: 'highShelf', frequency: 8000, q: 0.7, gain: 5, enabled: true },
    { type: 'peaking', frequency: 12000, q: 1, gain: 3, enabled: true },
  ]},
  { name: "Warm", category: "Music", bands: [
    { type: 'lowShelf', frequency: 200, q: 0.7, gain: 3, enabled: true },
    { type: 'peaking', frequency: 400, q: 1, gain: 2, enabled: true },
    { type: 'highShelf', frequency: 8000, q: 0.7, gain: -2, enabled: true },
  ]},
  { name: "Bright", category: "Music", bands: [
    { type: 'peaking', frequency: 2500, q: 1.5, gain: 2, enabled: true },
    { type: 'peaking', frequency: 5000, q: 1, gain: 3, enabled: true },
    { type: 'highShelf', frequency: 10000, q: 0.7, gain: 4, enabled: true },
  ]},
  { name: "Telephone", category: "Effects", bands: [
    { type: 'highpass', frequency: 400, q: 1, gain: 0, enabled: true },
    { type: 'lowpass', frequency: 3500, q: 1, gain: 0, enabled: true },
    { type: 'peaking', frequency: 1500, q: 0.8, gain: 3, enabled: true },
  ]},
  { name: "AM Radio", category: "Effects", bands: [
    { type: 'highpass', frequency: 300, q: 0.7, gain: 0, enabled: true },
    { type: 'lowpass', frequency: 5000, q: 0.7, gain: 0, enabled: true },
    { type: 'peaking', frequency: 2000, q: 1, gain: 4, enabled: true },
  ]},
  { name: "Underwater", category: "Effects", bands: [
    { type: 'lowpass', frequency: 500, q: 1.5, gain: 0, enabled: true },
    { type: 'peaking', frequency: 200, q: 1, gain: 3, enabled: true },
  ]},
  { name: "De-Mud", category: "Fix", bands: [
    { type: 'peaking', frequency: 250, q: 2, gain: -4, enabled: true },
    { type: 'peaking', frequency: 400, q: 1.5, gain: -2, enabled: true },
  ]},
  { name: "De-Harsh", category: "Fix", bands: [
    { type: 'peaking', frequency: 3000, q: 2, gain: -4, enabled: true },
    { type: 'peaking', frequency: 5000, q: 1.5, gain: -2, enabled: true },
  ]},
  { name: "Flat", category: "Fix", bands: [
    { type: 'peaking', frequency: 1000, q: 1, gain: 0, enabled: true },
  ]},
];

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

const dbToLinear = (db: number): number => db <= -60 ? 0 : Math.pow(10, db / 20);
const formatDb = (db: number): string => db <= -60 ? "-∞" : `${db > 0 ? "+" : ""}${db.toFixed(1)}`;
const formatFrequency = (freq: number): string => freq >= 1000 ? `${(freq / 1000).toFixed(freq >= 10000 ? 0 : 1)}k` : `${freq.toFixed(0)}`;
const freqToX = (freq: number, width: number): number => {
  const logMin = Math.log10(20), logMax = Math.log10(20000);
  return ((Math.log10(freq) - logMin) / (logMax - logMin)) * width;
};
const xToFreq = (x: number, width: number): number => {
  const logMin = Math.log10(20), logMax = Math.log10(20000);
  return Math.pow(10, logMin + (x / width) * (logMax - logMin));
};
const gainToY = (gain: number, height: number): number => (height / 2) - (gain / 24) * (height / 2);
const yToGain = (y: number, height: number): number => ((height / 2) - y) / (height / 2) * 24;

// ==========================================
// UI COMPONENTS
// ==========================================

// Card wrapper for sections
const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn("bg-black/20 rounded-xl border border-white/5 overflow-hidden", className)}>
    {children}
  </div>
);

// Card header
const CardHeader: React.FC<{ 
  title: string; 
  icon?: React.ReactNode; 
  subtitle?: string;
  action?: React.ReactNode;
}> = ({ title, icon, subtitle, action }) => (
  <div className="flex items-center gap-3 px-4 py-3 bg-white/[0.02] border-b border-white/5">
    {icon && <div className="text-primary">{icon}</div>}
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium text-white/90">{title}</div>
      {subtitle && <div className="text-[10px] text-white/40 truncate">{subtitle}</div>}
    </div>
    {action}
  </div>
);

// Card body
const CardBody: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn("p-4", className)}>{children}</div>
);

// Labeled slider with value display
const LabeledSlider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
  disabled?: boolean;
}> = ({ label, value, min, max, step = 1, onChange, formatValue, disabled }) => (
  <div className={cn("space-y-2", disabled && "opacity-40 pointer-events-none")}>
    <div className="flex items-center justify-between">
      <span className="text-xs text-white/50">{label}</span>
      <span className="text-xs font-mono text-white/70 bg-white/5 px-2 py-0.5 rounded">
        {formatValue ? formatValue(value) : value.toFixed(step < 1 ? 1 : 0)}
      </span>
    </div>
    <Slider
      value={[value]}
      onValueChange={([v]) => onChange(v)}
      min={min}
      max={max}
      step={step}
      className="w-full"
      disabled={disabled}
    />
  </div>
);

// Preset button row
const PresetButtons: React.FC<{
  presets: { value: number; label: string }[];
  currentValue: number;
  onSelect: (value: number) => void;
  tolerance?: number;
}> = ({ presets, currentValue, onSelect, tolerance = 0.05 }) => (
  <div className="flex gap-1">
    {presets.map(({ value, label }) => (
      <button
        key={value}
        onClick={() => onSelect(value)}
        className={cn(
          "flex-1 h-7 text-xs font-medium rounded-md transition-all",
          Math.abs(currentValue - value) < tolerance
            ? "bg-primary text-primary-foreground"
            : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80"
        )}
      >
        {label}
      </button>
    ))}
  </div>
);

// ==========================================
// VOLUME TAB
// ==========================================

const VolumeTab: React.FC<{ clipId: string }> = ({ clipId }) => {
  const clip = useVideoEditorStore(state => state.clips.find(c => c.id === clipId));
  const updateClip = useVideoEditorStore(state => state.updateClip);
  const getLinkedClipIds = useVideoEditorStore(state => state.getLinkedClipIds);
  const clips = useVideoEditorStore(state => state.clips);

  if (!clip) return null;
  
  // Check if this clip has linked clips
  const linkedClipIds = getLinkedClipIds(clipId);
  const hasLinkedClips = linkedClipIds.length > 1;

  const volumeDb = clip.styles?.volumeDb ?? 0;
  const currentSpeed = clip.media?.speed ?? 1.0;
  const currentPitch = (clip.media as any)?.pitch ?? 1.0;
  const isMuted = volumeDb <= -60;
  const mediaDuration = clip.media?.mediaDuration;

  const handleVolumeChange = (value: number) => {
    updateClip(clipId, {
      styles: { ...clip.styles, volumeDb: value, volume: dbToLinear(value) },
      volume: dbToLinear(value),
    });
  };

  const handleSpeedChange = (value: number) => {
    // Get all linked clips (including this one)
    const linkedClipIds = getLinkedClipIds(clipId);
    
    console.log('[AudioInspector] Changing speed for linked clips:', linkedClipIds);
    
    // Update speed and duration for all linked clips
    linkedClipIds.forEach(id => {
      const targetClip = clips.find(c => c.id === id);
      if (targetClip) {
        const originalDuration = targetClip.media?.mediaDuration || targetClip.duration;
        const newDuration = originalDuration / value;
        
        updateClip(id, {
          media: { ...targetClip.media, speed: value },
          duration: newDuration,
        });
      }
    });
  };

  const handlePitchChange = (value: number) => {
    // Get all linked clips (including this one)
    const linkedClipIds = getLinkedClipIds(clipId);
    
    console.log('[AudioInspector] Changing pitch for linked clips:', linkedClipIds);
    
    // Update pitch for all linked clips
    linkedClipIds.forEach(id => {
      const targetClip = clips.find(c => c.id === id);
      if (targetClip) {
        updateClip(id, {
          media: { ...targetClip.media, pitch: value } as any,
        });
      }
    });
  };

  // Volume meter visualization
  const meterLevel = Math.max(0, Math.min(100, ((volumeDb + 60) / 72) * 100));

  return (
    <div className="p-3 space-y-3">
      {/* Volume Card */}
      <Card>
        <CardHeader 
          title="Volume" 
          icon={isMuted ? <VolumeX className="h-4 w-4 text-red-400" /> : <Volume2 className="h-4 w-4" />}
          subtitle={isMuted ? "Muted" : `${formatDb(volumeDb)} dB`}
          action={
            <Button
              variant={isMuted ? "destructive" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => handleVolumeChange(isMuted ? 0 : -60)}
            >
              {isMuted ? 'Unmute' : 'Mute'}
            </Button>
          }
        />
        <CardBody className="space-y-4">
          {/* Volume Meter */}
          <div className="relative h-3 bg-black/40 rounded-full overflow-hidden">
            <div 
              className={cn(
                "absolute inset-y-0 left-0 rounded-full transition-all duration-150",
                volumeDb > 0 ? "bg-gradient-to-r from-green-500 via-yellow-500 to-red-500" : "bg-gradient-to-r from-green-500 to-green-400"
              )}
              style={{ width: `${meterLevel}%` }}
            />
            {/* 0dB marker */}
            <div className="absolute top-0 bottom-0 w-px bg-white/30" style={{ left: '83.3%' }} />
          </div>
          
          <LabeledSlider
            label="Level"
            value={volumeDb}
            min={-60}
            max={12}
            step={0.5}
            onChange={handleVolumeChange}
            formatValue={(v) => `${formatDb(v)} dB`}
          />
          
          <PresetButtons
            presets={[
              { value: 0, label: '0 dB' },
              { value: -6, label: '-6 dB' },
              { value: -12, label: '-12 dB' },
              { value: -24, label: '-24 dB' },
            ]}
            currentValue={volumeDb}
            onSelect={handleVolumeChange}
            tolerance={0.5}
          />
        </CardBody>
      </Card>

      {/* Speed & Pitch Card */}
      <Card>
        <CardHeader 
          title="Speed & Pitch" 
          icon={<Music className="h-4 w-4" />}
          subtitle={
            hasLinkedClips 
              ? `${currentSpeed.toFixed(2)}x speed • ${currentPitch.toFixed(2)}x pitch • Linked group`
              : `${currentSpeed.toFixed(2)}x speed • ${currentPitch.toFixed(2)}x pitch`
          }
          action={
            <Button 
              variant="outline" 
              size="sm" 
              className="h-7 text-xs" 
              onClick={() => {
                handleSpeedChange(1.0);
                handlePitchChange(1.0);
              }}
            >
              <RotateCcw className="h-3 w-3 mr-1" /> Reset
            </Button>
          }
        />
        <CardBody className="space-y-4">
          {/* Speed Control */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="text-xs font-medium text-white/70">Playback Speed</span>
              {hasLinkedClips && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 bg-primary/20 rounded text-[10px] text-primary">
                  <Link2 className="h-2.5 w-2.5" />
                  <span>Linked</span>
                </div>
              )}
            </div>
            <LabeledSlider
              label="Speed"
              value={currentSpeed}
              min={0.25}
              max={4.0}
              step={0.05}
              onChange={handleSpeedChange}
              formatValue={(v) => `${v.toFixed(2)}x`}
            />
            <PresetButtons
              presets={[
                { value: 0.5, label: '0.5x' },
                { value: 0.75, label: '0.75x' },
                { value: 1.0, label: '1x' },
                { value: 1.5, label: '1.5x' },
                { value: 2.0, label: '2x' },
              ]}
              currentValue={currentSpeed}
              onSelect={handleSpeedChange}
            />
          </div>

          {/* Pitch Control */}
          <div className="space-y-3 pt-3 border-t border-white/5">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              <span className="text-xs font-medium text-white/70">Pitch Shift</span>
              {hasLinkedClips && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 bg-primary/20 rounded text-[10px] text-primary">
                  <Link2 className="h-2.5 w-2.5" />
                  <span>Linked</span>
                </div>
              )}
            </div>
            <LabeledSlider
              label="Pitch"
              value={currentPitch}
              min={0.5}
              max={2.0}
              step={0.05}
              onChange={handlePitchChange}
              formatValue={(v) => {
                const semitones = Math.round(12 * Math.log2(v));
                return semitones === 0 ? '0 st' : `${semitones > 0 ? '+' : ''}${semitones} st`;
              }}
            />
            <PresetButtons
              presets={[
                { value: 0.5, label: '-12st' },
                { value: 0.841, label: '-3st' },
                { value: 1.0, label: '0st' },
                { value: 1.189, label: '+3st' },
                { value: 2.0, label: '+12st' },
              ]}
              currentValue={currentPitch}
              onSelect={handlePitchChange}
              tolerance={0.02}
            />
          </div>
          
          {/* Info */}
          {mediaDuration && (
            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/5">
              <div className="text-center p-2 bg-white/[0.02] rounded-lg">
                <div className="text-[10px] text-white/40 uppercase tracking-wider">Source</div>
                <div className="text-sm font-mono text-white/70">{mediaDuration.toFixed(2)}s</div>
              </div>
              <div className="text-center p-2 bg-white/[0.02] rounded-lg">
                <div className="text-[10px] text-white/40 uppercase tracking-wider">Timeline</div>
                <div className="text-sm font-mono text-white/70">{(mediaDuration / currentSpeed).toFixed(2)}s</div>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
};

// ==========================================
// EQ GRAPH COMPONENT
// ==========================================

const EQGraph: React.FC<{
  bands: EQBand[];
  onBandDrag: (index: number, freq: number, gain: number) => void;
  selectedBand: number | null;
  onSelectBand: (index: number | null) => void;
  disabled?: boolean;
}> = ({ bands, onBandDrag, selectedBand, onSelectBand, disabled }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 300, height: 140 });
  const [dragging, setDragging] = useState<number | null>(null);

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: 140 });
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const { width, height } = dimensions;
  const bandColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4'];

  const generateCurve = useCallback(() => {
    const points: string[] = [];
    for (let i = 0; i <= 200; i++) {
      const x = (i / 200) * width;
      const freq = xToFreq(x, width);
      let totalGain = 0;
      
      bands.forEach(band => {
        if (!band.enabled) return;
        const freqRatio = freq / band.frequency;
        const logRatio = Math.log2(freqRatio);
        
        switch (band.type) {
          case 'peaking':
            totalGain += band.gain * Math.exp(-0.5 * Math.pow(logRatio * band.q, 2));
            break;
          case 'lowShelf':
            totalGain += freq < band.frequency 
              ? band.gain * (1 - Math.pow(freqRatio, 2))
              : band.gain * Math.exp(-Math.pow(logRatio * 2, 2));
            break;
          case 'highShelf':
            totalGain += freq > band.frequency
              ? band.gain * (1 - Math.pow(1/freqRatio, 2))
              : band.gain * Math.exp(-Math.pow(logRatio * 2, 2));
            break;
          case 'highpass':
            if (freq < band.frequency) totalGain -= 12 * Math.pow(band.frequency / freq, 0.5);
            break;
          case 'lowpass':
            if (freq > band.frequency) totalGain -= 12 * Math.pow(freq / band.frequency, 0.5);
            break;
          case 'notch':
            totalGain -= band.gain * Math.exp(-0.5 * Math.pow(logRatio * band.q * 2, 2));
            break;
        }
      });
      
      points.push(`${x},${gainToY(Math.max(-24, Math.min(24, totalGain)), height)}`);
    }
    return points.join(' ');
  }, [bands, width, height]);

  const handleMouseDown = (e: React.MouseEvent, index: number) => {
    if (disabled) return;
    e.stopPropagation();
    setDragging(index);
    onSelectBand(index);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging === null || !containerRef.current || disabled) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    onBandDrag(dragging, Math.max(20, Math.min(20000, xToFreq(x, width))), Math.max(-24, Math.min(24, yToGain(y, height))));
  };

  const freqLines = [100, 1000, 10000];
  const gainLines = [-12, 0, 12];

  return (
    <div 
      ref={containerRef}
      className={cn("relative w-full rounded-lg overflow-hidden", disabled && "opacity-50")}
      style={{ height }}
      onMouseMove={handleMouseMove}
      onMouseUp={() => setDragging(null)}
      onMouseLeave={() => setDragging(null)}
    >
      <svg width={width} height={height} className="bg-gradient-to-b from-black/60 to-black/40">
        {/* Grid */}
        {freqLines.map(freq => {
          const x = freqToX(freq, width);
          return (
            <g key={freq}>
              <line x1={x} y1={0} x2={x} y2={height} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              <text x={x} y={height - 6} fill="rgba(255,255,255,0.3)" fontSize="9" textAnchor="middle">
                {formatFrequency(freq)}
              </text>
            </g>
          );
        })}
        {gainLines.map(gain => {
          const y = gainToY(gain, height);
          return (
            <g key={gain}>
              <line x1={0} y1={y} x2={width} y2={y} stroke={gain === 0 ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)"} strokeWidth="1" />
              <text x={6} y={y - 3} fill="rgba(255,255,255,0.3)" fontSize="9">
                {gain > 0 ? `+${gain}` : gain}
              </text>
            </g>
          );
        })}
        
        {/* Curve fill */}
        <defs>
          <linearGradient id="eq-fill" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
            <stop offset="50%" stopColor="#22c55e" stopOpacity="0" />
            <stop offset="50%" stopColor="#ef4444" stopOpacity="0" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.3" />
          </linearGradient>
          <linearGradient id="eq-stroke" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="50%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
        </defs>
        
        <polyline points={`0,${height/2} ${generateCurve()} ${width},${height/2}`} fill="url(#eq-fill)" />
        <polyline points={generateCurve()} fill="none" stroke="url(#eq-stroke)" strokeWidth="2" strokeLinecap="round" />
        
        {/* Band points */}
        {bands.map((band, index) => {
          if (!band.enabled) return null;
          const x = freqToX(band.frequency, width);
          const y = gainToY(band.gain, height);
          const color = bandColors[index % bandColors.length];
          const isSelected = selectedBand === index;
          
          return (
            <g key={band.id}>
              <line x1={x} y1={height/2} x2={x} y2={y} stroke={color} strokeWidth="1" strokeDasharray="2,2" opacity="0.5" />
              {isSelected && <circle cx={x} cy={y} r={14} fill={color} opacity="0.2" />}
              <circle
                cx={x}
                cy={y}
                r={isSelected ? 8 : 6}
                fill={color}
                stroke="rgba(0,0,0,0.5)"
                strokeWidth="2"
                style={{ cursor: disabled ? 'default' : 'move' }}
                onMouseDown={(e) => handleMouseDown(e, index)}
              />
              <text x={x} y={y + 1} fill="white" fontSize="8" fontWeight="bold" textAnchor="middle" dominantBaseline="middle" style={{ pointerEvents: 'none' }}>
                {index + 1}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ==========================================
// EQ TAB
// ==========================================

// Hook for tracking processing status
const useProcessingStatus = (clipId: string) => {
  const [status, setStatus] = useState<'idle' | 'processing' | 'ready'>('idle');
  const clip = useVideoEditorStore(state => state.clips.find(c => c.id === clipId));
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastEffectsHashRef = useRef<string>('');
  
  // Track effects hash to detect changes
  const effectsHash = useMemo(() => {
    if (!clip?.audioEffects?.length) return '';
    return JSON.stringify(clip.audioEffects.filter(e => e.enabled).map(e => ({ ...e, id: undefined })));
  }, [clip?.audioEffects]);
  
  useEffect(() => {
    // Clear any pending timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    if (!clip?.sourceId || !clip.audioEffects?.some(e => e.enabled)) {
      setStatus('idle');
      return;
    }
    
    // Check if effects changed - trigger processing state
    if (effectsHash !== lastEffectsHashRef.current && lastEffectsHashRef.current !== '') {
      setStatus('processing');
    }
    lastEffectsHashRef.current = effectsHash;
    
    const cache = getAudioEffectsCache();
    if (cache.isProcessing(`sound-${clipId}`, clip.sourceId, clip.audioEffects)) {
      setStatus('processing');
    }
    
    // Handle progress updates (stay in processing state)
    const handleProgress = (e: CustomEvent) => {
      if (e.detail.clipId === `sound-${clipId}`) {
        setStatus('processing');
        // Clear any existing ready timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      }
    };
    
    // Handle processing complete
    const handleProcessed = (e: CustomEvent) => {
      if (e.detail.clipId === `sound-${clipId}`) {
        setStatus('ready');
        // Clear any existing timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        // Set timeout to return to idle
        timeoutRef.current = setTimeout(() => {
          setStatus('idle');
          timeoutRef.current = null;
        }, 2000);
      }
    };
    
    window.addEventListener('audio-effects-progress' as any, handleProgress);
    window.addEventListener('audio-effects-processed' as any, handleProcessed);
    
    return () => {
      window.removeEventListener('audio-effects-progress' as any, handleProgress);
      window.removeEventListener('audio-effects-processed' as any, handleProcessed);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [clipId, clip?.sourceId, effectsHash]);
  
  return { status, triggerProcessing: () => setStatus('processing') };
};

const EQTab: React.FC<{ clipId: string }> = ({ clipId }) => {
  const clip = useVideoEditorStore(state => state.clips.find(c => c.id === clipId));
  const updateClip = useVideoEditorStore(state => state.updateClip);
  const [selectedBand, setSelectedBand] = useState<number | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const { status: processingStatus, triggerProcessing } = useProcessingStatus(clipId);

  if (!clip) return null;

  const eqEffect = clip.audioEffects?.find(e => e.type === AudioEffectType.PARAMETRIC_EQ) as ParametricEQEffect | undefined;
  
  // Load saved preset name
  useEffect(() => {
    if (eqEffect?.presetName) {
      setSelectedPreset(eqEffect.presetName);
    }
  }, [eqEffect?.presetName]);

  const handleAddEQ = () => {
    const newEffect = createAudioEffect(AudioEffectType.PARAMETRIC_EQ, 0);
    console.log('[EQTab] Adding EQ effect:', newEffect);
    console.log('[EQTab] Current clip audioEffects:', clip.audioEffects);
    console.log('[EQTab] New audioEffects array:', [...(clip.audioEffects || []), newEffect]);
    
    updateClip(clipId, { audioEffects: [...(clip.audioEffects || []), newEffect] });
    
    // Verify it was added
    setTimeout(() => {
      const updatedClip = useVideoEditorStore.getState().clips.find(c => c.id === clipId);
      console.log('[EQTab] Clip after update:', updatedClip?.audioEffects);
    }, 100);
  };

  const handleRemoveEQ = () => {
    if (eqEffect) {
      updateClip(clipId, { audioEffects: (clip.audioEffects || []).filter(e => e.id !== eqEffect.id) });
    }
  };

  const handleToggleEQ = (enabled: boolean) => {
    if (eqEffect) {
      updateClip(clipId, { audioEffects: (clip.audioEffects || []).map(e => e.id === eqEffect.id ? { ...e, enabled } : e) });
      triggerProcessing();
    }
  };

  const handleApplyPreset = (presetName: string) => {
    const preset = EQ_PRESETS.find(p => p.name === presetName);
    if (!preset || !eqEffect) return;
    setSelectedPreset(presetName);
    const newBands = preset.bands.map((cfg) => ({ ...createEQBand(cfg.type as EQBandType || 'peaking', cfg.frequency || 1000), ...cfg }));
    updateClip(clipId, { 
      audioEffects: (clip.audioEffects || []).map(e => 
        e.id === eqEffect.id 
          ? { ...e, bands: newBands, outputGain: preset.outputGain ?? 0, presetName } as ParametricEQEffect
          : e
      ) 
    });
    triggerProcessing();
  };

  const handleBandDrag = (index: number, freq: number, gain: number) => {
    if (!eqEffect) return;
    const newBands = [...eqEffect.bands];
    newBands[index] = { ...newBands[index], frequency: Math.round(freq), gain: Math.round(gain * 2) / 2 };
    updateClip(clipId, { audioEffects: (clip.audioEffects || []).map(e => e.id === eqEffect.id ? { ...e, bands: newBands, presetName: undefined } as ParametricEQEffect : e) });
    setSelectedPreset('');
    triggerProcessing();
  };

  const handleBandUpdate = (index: number, updates: Partial<EQBand>) => {
    if (!eqEffect) return;
    const newBands = [...eqEffect.bands];
    newBands[index] = { ...newBands[index], ...updates };
    updateClip(clipId, { audioEffects: (clip.audioEffects || []).map(e => e.id === eqEffect.id ? { ...e, bands: newBands, presetName: undefined } as ParametricEQEffect : e) });
    setSelectedPreset('');
    triggerProcessing();
  };

  const handleAddBand = () => {
    if (!eqEffect || eqEffect.bands.length >= 8) return;
    updateClip(clipId, { audioEffects: (clip.audioEffects || []).map(e => e.id === eqEffect.id ? { ...e, bands: [...(e as ParametricEQEffect).bands, createEQBand('peaking', 1000)], presetName: undefined } as ParametricEQEffect : e) });
    setSelectedPreset('');
    triggerProcessing();
  };

  const handleRemoveBand = (index: number) => {
    if (!eqEffect || eqEffect.bands.length <= 1) return;
    updateClip(clipId, { audioEffects: (clip.audioEffects || []).map(e => e.id === eqEffect.id ? { ...e, bands: eqEffect.bands.filter((_, i) => i !== index), presetName: undefined } as ParametricEQEffect : e) });
    setSelectedBand(null);
    setSelectedPreset('');
    triggerProcessing();
  };

  const presetsByCategory = useMemo(() => {
    const grouped: Record<string, EQPreset[]> = {};
    EQ_PRESETS.forEach(p => { (grouped[p.category] ??= []).push(p); });
    return grouped;
  }, []);

  if (!eqEffect) {
    return (
      <div className="p-3">
        <Card>
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Activity className="h-8 w-8 text-primary/60" />
            </div>
            <h3 className="text-sm font-medium text-white/80 mb-1">Parametric Equalizer</h3>
            <p className="text-xs text-white/40 text-center mb-4">Shape your audio's frequency response</p>
            <Button onClick={handleAddEQ} className="gap-2">
              <Plus className="h-4 w-4" /> Add EQ
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const bandColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4'];
  const selectedBandData = selectedBand !== null ? eqEffect.bands[selectedBand] : null;

  return (
    <div className="p-3 space-y-3">
      {/* Processing Status */}
      {processingStatus === 'processing' && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center justify-center gap-2">
          <div className="h-4 w-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-amber-400 font-medium">Processing audio effects...</span>
        </div>
      )}
      {processingStatus === 'ready' && (
        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-xs text-green-400 text-center font-medium">
          ✅ Effects applied - hear them now in preview!
        </div>
      )}
      
      {/* Main EQ Card */}
      <Card>
        <CardHeader 
          title="Parametric EQ" 
          icon={<Activity className="h-4 w-4" />}
          subtitle={eqEffect.enabled ? `${eqEffect.bands.length} bands` : "Bypassed"}
          action={
            <div className="flex items-center gap-1">
              <Button
                variant={eqEffect.enabled ? "default" : "outline"}
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => handleToggleEQ(!eqEffect.enabled)}
              >
                <Power className={cn("h-3.5 w-3.5", eqEffect.enabled && "text-green-400")} />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 bg-red-500/80 hover:bg-red-600" onClick={handleRemoveEQ}>
                <Trash2 className="h-3.5 w-3.5 text-white" />
              </Button>
            </div>
          }
        />
        <CardBody className="space-y-4 p-3">
          {/* Preset Selector & Reset */}
          <div className="flex gap-2">
            <Select 
              value={selectedPreset || eqEffect.presetName || undefined} 
              onValueChange={handleApplyPreset}
            >
              <SelectTrigger className="h-9 bg-black/20 border-white/10 hover:bg-black/30 transition-colors flex-1">
                <Sparkles className="h-3.5 w-3.5 mr-2 text-white/40" />
                <SelectValue placeholder={selectedPreset || eqEffect.presetName || "Choose a preset..."} />
              </SelectTrigger>
              <SelectContent className="bg-black/95 border-white/10 backdrop-blur-xl">
                {Object.entries(presetsByCategory).map(([category, presets]) => (
                  <div key={category}>
                    <div className="px-2 py-1.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider bg-white/5">{category}</div>
                    {presets.map(preset => (
                      <SelectItem 
                        key={preset.name} 
                        value={preset.name}
                        className="hover:bg-white/10 focus:bg-white/10"
                      >
                        {preset.name}
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-3 bg-black/20 border-white/10 hover:bg-black/30"
                    onClick={() => {
                      // Reset to default 3-band EQ
                      const defaultBands = [
                        createEQBand('peaking', 100),
                        createEQBand('peaking', 1000),
                        createEQBand('peaking', 10000),
                      ];
                      updateClip(clipId, {
                        audioEffects: (clip.audioEffects || []).map(e =>
                          e.id === eqEffect.id ? { ...e, bands: defaultBands, outputGain: 0 } : e
                        ),
                      });
                      setSelectedPreset('');
                      setSelectedBand(null);
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <p>Reset to default</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Frequency Graph */}
          <EQGraph
            bands={eqEffect.bands}
            onBandDrag={handleBandDrag}
            selectedBand={selectedBand}
            onSelectBand={setSelectedBand}
            disabled={!eqEffect.enabled}
          />

          {/* Band Selector */}
          <div className="flex flex-wrap gap-1.5">
            {eqEffect.bands.map((band, index) => (
              <button
                key={band.id}
                onClick={() => setSelectedBand(selectedBand === index ? null : index)}
                className={cn(
                  "h-7 px-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all border",
                  selectedBand === index ? "border-white/30 shadow-lg" : "border-transparent",
                  !band.enabled && "opacity-40"
                )}
                style={{ backgroundColor: `${bandColors[index % bandColors.length]}20`, color: bandColors[index % bandColors.length] }}
              >
                <span className="font-bold">{index + 1}</span>
                <span className="text-white/60">{formatFrequency(band.frequency)}</span>
              </button>
            ))}
            {eqEffect.bands.length < 8 && (
              <button
                onClick={handleAddBand}
                className="h-7 w-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white/60 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Selected Band Controls */}
      {selectedBandData && selectedBand !== null && (
        <Card>
          <CardHeader 
            title={`Band ${selectedBand + 1}`}
            icon={<div className="w-4 h-4 rounded" style={{ backgroundColor: bandColors[selectedBand % bandColors.length] }} />}
            subtitle={`${selectedBandData.type} • ${formatFrequency(selectedBandData.frequency)} Hz`}
            action={
              <div className="flex items-center gap-1">
                <Switch checked={selectedBandData.enabled} onCheckedChange={(enabled) => handleBandUpdate(selectedBand, { enabled })} />
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 bg-red-500/80 hover:bg-red-600 disabled:bg-red-500/30" onClick={() => handleRemoveBand(selectedBand)} disabled={eqEffect.bands.length <= 1}>
                  <Trash2 className="h-3.5 w-3.5 text-white" />
                </Button>
              </div>
            }
          />
          <CardBody className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-white/50">Filter Type</Label>
              <Select value={selectedBandData.type} onValueChange={(type) => handleBandUpdate(selectedBand, { type: type as EQBandType })}>
                <SelectTrigger className="h-9 bg-black/20 border-white/10">
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

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label className="text-xs text-white/50">Frequency</Label>
                <Input
                  type="number"
                  value={selectedBandData.frequency}
                  onChange={(e) => handleBandUpdate(selectedBand, { frequency: Number(e.target.value) })}
                  className="h-9 bg-black/20 border-white/10 font-mono text-sm"
                  min={20} max={20000}
                />
              </div>
              {['lowShelf', 'highShelf', 'peaking'].includes(selectedBandData.type) && (
                <div className="space-y-2">
                  <Label className="text-xs text-white/50">Gain</Label>
                  <Input
                    type="number"
                    value={selectedBandData.gain}
                    onChange={(e) => handleBandUpdate(selectedBand, { gain: Number(e.target.value) })}
                    className="h-9 bg-black/20 border-white/10 font-mono text-sm"
                    min={-24} max={24} step={0.5}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-xs text-white/50">Q Factor</Label>
                <Input
                  type="number"
                  value={selectedBandData.q}
                  onChange={(e) => handleBandUpdate(selectedBand, { q: Number(e.target.value) })}
                  className="h-9 bg-black/20 border-white/10 font-mono text-sm"
                  min={0.1} max={18} step={0.1}
                />
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Output Gain */}
      <Card>
        <CardBody>
          <LabeledSlider
            label="Output Gain"
            value={eqEffect.outputGain}
            min={-24}
            max={24}
            step={0.5}
            onChange={(v) => updateClip(clipId, { audioEffects: (clip.audioEffects || []).map(e => e.id === eqEffect.id ? { ...e, outputGain: v } : e) })}
            formatValue={(v) => `${formatDb(v)} dB`}
            disabled={!eqEffect.enabled}
          />
        </CardBody>
      </Card>
    </div>
  );
};

// ==========================================
// EFFECT CARD COMPONENT
// ==========================================

interface EffectCardProps {
  clipId: string;
  title: string;
  icon: React.ReactNode;
  iconColor: string;
  effectType: AudioEffectType;
  description: string;
  children: (effect: AudioEffect, onUpdate: (updates: Partial<AudioEffect>) => void) => React.ReactNode;
}

const EffectCard: React.FC<EffectCardProps> = ({ clipId, title, icon, iconColor, effectType, description, children }) => {
  const clip = useVideoEditorStore(state => state.clips.find(c => c.id === clipId));
  const updateClip = useVideoEditorStore(state => state.updateClip);
  const [isExpanded, setIsExpanded] = useState(false);

  if (!clip) return null;

  const effect = clip.audioEffects?.find(e => e.type === effectType);

  const handleAdd = () => {
    updateClip(clipId, { audioEffects: [...(clip.audioEffects || []), createAudioEffect(effectType, (clip.audioEffects || []).length)] });
    setIsExpanded(true);
  };

  const handleRemove = () => {
    if (effect) {
      updateClip(clipId, { audioEffects: (clip.audioEffects || []).filter(e => e.id !== effect.id) });
      setIsExpanded(false);
    }
  };

  const handleToggle = (enabled: boolean) => {
    if (effect) {
      updateClip(clipId, { audioEffects: (clip.audioEffects || []).map(e => e.id === effect.id ? { ...e, enabled } : e) });
    }
  };

  const handleUpdate = (updates: Partial<AudioEffect>) => {
    if (effect) {
      updateClip(clipId, { audioEffects: (clip.audioEffects || []).map(e => e.id === effect.id ? { ...e, ...updates } : e) });
    }
  };

  if (!effect) {
    return (
      <Card className="group hover:border-white/10 transition-colors">
        <button 
          onClick={handleAdd}
          className="w-full flex items-center gap-3 p-3 text-left"
        >
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", `bg-${iconColor}-500/10`)} style={{ color: iconColor }}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white/70 group-hover:text-white/90">{title}</div>
            <div className="text-[10px] text-white/40">{description}</div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-white/5 group-hover:bg-white/10 flex items-center justify-center">
            <Plus className="h-4 w-4 text-white/40 group-hover:text-white/60" />
          </div>
        </button>
      </Card>
    );
  }

  return (
    <Card className={cn(!effect.enabled && "opacity-60")}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 p-3 text-left"
      >
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center")} style={{ backgroundColor: `${iconColor}20`, color: iconColor }}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white/90">{title}</div>
          <div className="text-[10px] text-white/40">{effect.enabled ? 'Active' : 'Bypassed'}</div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={effect.enabled ? "default" : "outline"}
            size="sm"
            className="h-7 w-7 p-0"
            onClick={(e) => { e.stopPropagation(); handleToggle(!effect.enabled); }}
          >
            <Power className={cn("h-3.5 w-3.5", effect.enabled && "text-green-400")} />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 bg-red-500/80 hover:bg-red-600" onClick={(e) => { e.stopPropagation(); handleRemove(); }}>
            <Trash2 className="h-3.5 w-3.5 text-white" />
          </Button>
          <div className="w-6 flex justify-center">
            {isExpanded ? <ChevronDown className="h-4 w-4 text-white/40" /> : <ChevronRight className="h-4 w-4 text-white/40" />}
          </div>
        </div>
      </button>
      {isExpanded && (
        <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-3">
          {children(effect, handleUpdate)}
        </div>
      )}
    </Card>
  );
};

// ==========================================
// DYNAMICS TAB
// ==========================================

const DynamicsTab: React.FC<{ clipId: string }> = ({ clipId }) => {
  const { status } = useProcessingStatus(clipId);
  
  return (
    <div className="p-3 space-y-2">
      {/* Processing Status */}
      {status === 'processing' && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center justify-center gap-2 mb-3">
          <div className="h-4 w-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-amber-400 font-medium">Processing audio effects...</span>
        </div>
      )}
      {status === 'ready' && (
        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-xs text-green-400 text-center font-medium mb-3">
          ✅ Effects applied!
        </div>
      )}
      
      <EffectCard clipId={clipId} title="Compressor" icon={<Gauge className="h-5 w-5" />} iconColor="#ef4444" effectType={AudioEffectType.COMPRESSOR} description="Reduce dynamic range">
      {(effect, onUpdate) => {
        const comp = effect as CompressorEffect;
        return (
          <div className="space-y-3">
            <LabeledSlider label="Threshold" value={comp.threshold} min={-60} max={0} step={0.5} onChange={(v) => onUpdate({ threshold: v })} formatValue={(v) => `${formatDb(v)} dB`} />
            <LabeledSlider label="Ratio" value={comp.ratio} min={1} max={20} step={0.5} onChange={(v) => onUpdate({ ratio: v })} formatValue={(v) => `${v.toFixed(1)}:1`} />
            <div className="grid grid-cols-2 gap-3">
              <LabeledSlider label="Attack" value={comp.attack} min={0.1} max={500} step={1} onChange={(v) => onUpdate({ attack: v })} formatValue={(v) => `${v.toFixed(0)}ms`} />
              <LabeledSlider label="Release" value={comp.release} min={10} max={2000} step={10} onChange={(v) => onUpdate({ release: v })} formatValue={(v) => `${v.toFixed(0)}ms`} />
            </div>
            <LabeledSlider label="Makeup Gain" value={comp.makeupGain} min={0} max={24} step={0.5} onChange={(v) => onUpdate({ makeupGain: v })} formatValue={(v) => `+${v.toFixed(1)} dB`} />
            <div className="flex items-center justify-between pt-2 border-t border-white/5">
              <span className="text-xs text-white/50">Auto Makeup</span>
              <Switch checked={comp.autoMakeup} onCheckedChange={(autoMakeup) => onUpdate({ autoMakeup })} />
            </div>
          </div>
        );
      }}
    </EffectCard>

    <EffectCard clipId={clipId} title="Noise Gate" icon={<VolumeX className="h-5 w-5" />} iconColor="#3b82f6" effectType={AudioEffectType.NOISE_GATE} description="Remove background noise">
      {(effect, onUpdate) => {
        const gate = effect as NoiseGateEffect;
        return (
          <div className="space-y-3">
            <LabeledSlider label="Threshold" value={gate.threshold} min={-80} max={0} step={1} onChange={(v) => onUpdate({ threshold: v })} formatValue={(v) => `${formatDb(v)} dB`} />
            <div className="grid grid-cols-2 gap-3">
              <LabeledSlider label="Attack" value={gate.attack} min={0.1} max={50} step={0.1} onChange={(v) => onUpdate({ attack: v })} formatValue={(v) => `${v.toFixed(1)}ms`} />
              <LabeledSlider label="Hold" value={gate.hold} min={0} max={500} step={5} onChange={(v) => onUpdate({ hold: v })} formatValue={(v) => `${v.toFixed(0)}ms`} />
            </div>
            <LabeledSlider label="Release" value={gate.release} min={10} max={500} step={10} onChange={(v) => onUpdate({ release: v })} formatValue={(v) => `${v.toFixed(0)}ms`} />
          </div>
        );
      }}
    </EffectCard>

    <EffectCard clipId={clipId} title="Limiter" icon={<Activity className="h-5 w-5" />} iconColor="#f97316" effectType={AudioEffectType.LIMITER} description="Prevent clipping">
      {(effect, onUpdate) => {
        const lim = effect as LimiterEffect;
        return (
          <div className="space-y-3">
            <LabeledSlider label="Ceiling" value={lim.ceiling} min={-12} max={0} step={0.1} onChange={(v) => onUpdate({ ceiling: v })} formatValue={(v) => `${formatDb(v)} dB`} />
            <LabeledSlider label="Release" value={lim.release} min={10} max={500} step={10} onChange={(v) => onUpdate({ release: v })} formatValue={(v) => `${v.toFixed(0)}ms`} />
          </div>
        );
      }}
    </EffectCard>
  </div>
  );
};

// ==========================================
// EFFECTS TAB
// ==========================================

const AudioEffectsTab: React.FC<{ clipId: string }> = ({ clipId }) => {
  const { status } = useProcessingStatus(clipId);
  
  return (
    <div className="p-3 space-y-2">
      {status === 'processing' && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center justify-center gap-2 mb-3">
          <div className="h-4 w-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-amber-400 font-medium">Processing audio effects...</span>
        </div>
      )}
      {status === 'ready' && (
        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-xs text-green-400 text-center font-medium mb-3">
          ✅ Effects applied!
        </div>
      )}
      
      <EffectCard clipId={clipId} title="Reverb" icon={<Waves className="h-5 w-5" />} iconColor="#8b5cf6" effectType={AudioEffectType.REVERB} description="Add space and depth">
      {(effect, onUpdate) => {
        const rev = effect as ReverbEffect;
        return (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs text-white/50">Room Type</Label>
              <Select value={rev.preset} onValueChange={(preset) => onUpdate({ preset: preset as any })}>
                <SelectTrigger className="h-9 bg-black/20 border-white/10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="small_room">Small Room</SelectItem>
                  <SelectItem value="medium_room">Medium Room</SelectItem>
                  <SelectItem value="large_room">Large Room</SelectItem>
                  <SelectItem value="hall">Concert Hall</SelectItem>
                  <SelectItem value="cathedral">Cathedral</SelectItem>
                  <SelectItem value="plate">Plate</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <LabeledSlider label="Decay" value={rev.decay} min={0.1} max={10} step={0.1} onChange={(v) => onUpdate({ decay: v })} formatValue={(v) => `${v.toFixed(1)}s`} />
              <LabeledSlider label="Pre-Delay" value={rev.preDelay} min={0} max={200} step={1} onChange={(v) => onUpdate({ preDelay: v })} formatValue={(v) => `${v.toFixed(0)}ms`} />
            </div>
            <LabeledSlider label="Mix" value={rev.mix} min={0} max={100} step={1} onChange={(v) => onUpdate({ mix: v })} formatValue={(v) => `${v.toFixed(0)}%`} />
          </div>
        );
      }}
    </EffectCard>

    <EffectCard clipId={clipId} title="Delay" icon={<Timer className="h-5 w-5" />} iconColor="#eab308" effectType={AudioEffectType.DELAY} description="Echo and repeat">
      {(effect, onUpdate) => {
        const del = effect as DelayEffect;
        return (
          <div className="space-y-3">
            <LabeledSlider label="Delay Time" value={del.delayTime} min={1} max={2000} step={1} onChange={(v) => onUpdate({ delayTime: v })} formatValue={(v) => `${v.toFixed(0)}ms`} />
            <div className="grid grid-cols-2 gap-3">
              <LabeledSlider label="Feedback" value={del.feedback} min={0} max={95} step={1} onChange={(v) => onUpdate({ feedback: v })} formatValue={(v) => `${v.toFixed(0)}%`} />
              <LabeledSlider label="Mix" value={del.mix} min={0} max={100} step={1} onChange={(v) => onUpdate({ mix: v })} formatValue={(v) => `${v.toFixed(0)}%`} />
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-white/5">
              <span className="text-xs text-white/50">Ping Pong</span>
              <Switch checked={del.pingPong} onCheckedChange={(pingPong) => onUpdate({ pingPong })} />
            </div>
          </div>
        );
      }}
    </EffectCard>

    <EffectCard clipId={clipId} title="Chorus" icon={<Users className="h-5 w-5" />} iconColor="#ec4899" effectType={AudioEffectType.CHORUS} description="Thicken and widen">
      {(effect, onUpdate) => {
        const cho = effect as ChorusEffect;
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <LabeledSlider label="Rate" value={cho.rate} min={0.1} max={10} step={0.1} onChange={(v) => onUpdate({ rate: v })} formatValue={(v) => `${v.toFixed(1)}Hz`} />
              <LabeledSlider label="Depth" value={cho.depth} min={0} max={100} step={1} onChange={(v) => onUpdate({ depth: v })} formatValue={(v) => `${v.toFixed(0)}%`} />
            </div>
            <LabeledSlider label="Mix" value={cho.mix} min={0} max={100} step={1} onChange={(v) => onUpdate({ mix: v })} formatValue={(v) => `${v.toFixed(0)}%`} />
          </div>
        );
      }}
    </EffectCard>

    <EffectCard clipId={clipId} title="Distortion" icon={<Zap className="h-5 w-5" />} iconColor="#22c55e" effectType={AudioEffectType.DISTORTION} description="Add grit and saturation">
      {(effect, onUpdate) => {
        const dist = effect as DistortionEffect;
        return (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs text-white/50">Type</Label>
              <Select value={dist.distortionType} onValueChange={(type) => onUpdate({ distortionType: type as any })}>
                <SelectTrigger className="h-9 bg-black/20 border-white/10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="soft">Soft Clip</SelectItem>
                  <SelectItem value="hard">Hard Clip</SelectItem>
                  <SelectItem value="tube">Tube</SelectItem>
                  <SelectItem value="fuzz">Fuzz</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <LabeledSlider label="Drive" value={dist.drive} min={0} max={100} step={1} onChange={(v) => onUpdate({ drive: v })} formatValue={(v) => `${v.toFixed(0)}%`} />
            <LabeledSlider label="Tone" value={dist.tone} min={-100} max={100} step={1} onChange={(v) => onUpdate({ tone: v })} formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}`} />
            <LabeledSlider label="Output" value={dist.output} min={-24} max={0} step={0.5} onChange={(v) => onUpdate({ output: v })} formatValue={(v) => `${formatDb(v)} dB`} />
          </div>
        );
      }}
    </EffectCard>
  </div>
  );
};

// ==========================================
// MAIN COMPONENT
// ==========================================

interface AudioInspectorProps {
  clip: TimelineClip;
  overlay: SoundOverlay;
  onUpdateOverlay: (updates: Partial<SoundOverlay>) => void;
}

export const AudioInspector: React.FC<AudioInspectorProps> = ({ clip }) => {
  const [activeTab, setActiveTab] = useState<'volume' | 'eq' | 'dynamics' | 'effects'>('volume');

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="h-full flex flex-col bg-gradient-to-b from-black/20 to-transparent">
      <TabsList className="w-full h-10 bg-black/30 p-1 rounded-none border-b border-white/5 shrink-0 gap-1">
        {[
          { value: 'volume', icon: Volume2, label: 'Volume' },
          { value: 'eq', icon: Activity, label: 'EQ' },
          { value: 'dynamics', icon: Gauge, label: 'Dynamics' },
          { value: 'effects', icon: Waves, label: 'FX' },
        ].map(({ value, icon: Icon, label }) => (
          <TabsTrigger
            key={value}
            value={value}
            className={cn(
              "flex-1 h-full rounded-md text-xs gap-1.5 transition-all",
              "data-[state=active]:bg-white/10 data-[state=active]:text-white",
              "data-[state=inactive]:text-white/50 data-[state=inactive]:hover:text-white/70"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </TabsTrigger>
        ))}
      </TabsList>

      <div className="flex-1 overflow-hidden">
        <TabsContent value="volume" className="h-full m-0 p-0 data-[state=inactive]:hidden">
          <ScrollArea className="h-full"><VolumeTab clipId={clip.id} /></ScrollArea>
        </TabsContent>
        <TabsContent value="eq" className="h-full m-0 p-0 data-[state=inactive]:hidden">
          <ScrollArea className="h-full"><EQTab clipId={clip.id} /></ScrollArea>
        </TabsContent>
        <TabsContent value="dynamics" className="h-full m-0 p-0 data-[state=inactive]:hidden">
          <ScrollArea className="h-full"><DynamicsTab clipId={clip.id} /></ScrollArea>
        </TabsContent>
        <TabsContent value="effects" className="h-full m-0 p-0 data-[state=inactive]:hidden">
          <ScrollArea className="h-full"><AudioEffectsTab clipId={clip.id} /></ScrollArea>
        </TabsContent>
      </div>
    </Tabs>
  );
};

export default AudioInspector;
