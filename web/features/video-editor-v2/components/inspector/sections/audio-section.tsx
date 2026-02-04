import React, { useState, useCallback, useMemo } from "react";
import { SoundOverlay } from "../../../types";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "../../ui/button";
import { cn } from "../../../utils/general/utils";
import { Volume2, VolumeX, Music, Waves, SlidersHorizontal, RefreshCw } from "lucide-react";

// ==========================================
// TYPES
// ==========================================

interface AudioSectionProps {
  overlay: SoundOverlay;
  onUpdate: (updates: Partial<SoundOverlay>) => void;
}

// ==========================================
// AUDIO SECTION COMPONENT
// ==========================================

export const AudioSection: React.FC<AudioSectionProps> = ({
  overlay,
  onUpdate,
}) => {
  // Get current values with defaults
  const volumeDb = overlay.styles?.volumeDb ?? 0;
  const playbackRate = overlay.playbackRate ?? 1.0;
  const toneFrequency = overlay.toneFrequency ?? 1.0;

  // Handle volume change (in dB)
  const handleVolumeChange = (value: number[]) => {
    const newVolumeDb = value[0];
    onUpdate({
      styles: {
        ...overlay.styles,
        volumeDb: newVolumeDb,
        // Also update linear volume for backwards compatibility
        volume: Math.pow(10, newVolumeDb / 20), // Convert dB to linear
      },
    });
  };

  // Handle playback rate (speed) change
  const handlePlaybackRateChange = (value: number[]) => {
    onUpdate({ playbackRate: value[0] });
  };

  // Handle pitch (tone frequency) change
  const handlePitchChange = (value: number[]) => {
    onUpdate({ toneFrequency: value[0] });
  };

  // Format dB value for display
  const formatDb = (db: number) => {
    if (db === -60) return "Muted";
    return `${db > 0 ? "+" : ""}${db.toFixed(1)} dB`;
  };

  return (
    <div className="space-y-4">
      {/* Volume Control */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2 text-xs">
            {volumeDb <= -60 ? (
              <VolumeX className="h-3.5 w-3.5" />
            ) : (
              <Volume2 className="h-3.5 w-3.5" />
            )}
            Volume
          </Label>
          <span className="text-xs text-muted-foreground">
            {formatDb(volumeDb)}
          </span>
        </div>
        <Slider
          value={[volumeDb]}
          onValueChange={handleVolumeChange}
          min={-60}
          max={12}
          step={0.1}
          className="w-full"
        />
      </div>

      {/* Playback Rate (Speed) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Playback Speed</Label>
          <span className="text-xs text-muted-foreground">
            {playbackRate.toFixed(2)}x
          </span>
        </div>
        <Slider
          value={[playbackRate]}
          onValueChange={handlePlaybackRateChange}
          min={0.25}
          max={4.0}
          step={0.05}
          className="w-full"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground px-1">
          <span>0.25x</span>
          <span>1.0x</span>
          <span>4.0x</span>
        </div>
      </div>

      {/* Pitch Control */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2 text-xs">
            <Music className="h-3.5 w-3.5" />
            Pitch
          </Label>
          <span className="text-xs text-muted-foreground">
            {toneFrequency.toFixed(2)}x
          </span>
        </div>
        <Slider
          value={[toneFrequency]}
          onValueChange={handlePitchChange}
          min={0.5}
          max={2.0}
          step={0.05}
          className="w-full"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground px-1">
          <span>0.5x (Lower)</span>
          <span>1.0x (Normal)</span>
          <span>2.0x (Higher)</span>
        </div>
      </div>

      {/* Visual EQ */}
      <VisualEQ overlay={overlay} onUpdate={onUpdate} />

      {/* Waveform Display */}
      <WaveformDisplay overlay={overlay} />

      {/* Audio Source Info */}
      {overlay.mediaSrcDuration && (
        <div className="pt-2 border-t border-border">
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="flex justify-between">
              <span>Duration:</span>
              <span>{overlay.mediaSrcDuration.toFixed(2)}s</span>
            </div>
            {overlay.startFromSound !== undefined && (
              <div className="flex justify-between">
                <span>Start Offset:</span>
                <span>{(overlay.startFromSound / 30).toFixed(2)}s</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// VISUAL EQ COMPONENT
// ==========================================

interface VisualEQProps {
  overlay: SoundOverlay;
  onUpdate: (updates: Partial<SoundOverlay>) => void;
}

const EQ_BANDS = [
  { freq: "60", label: "60Hz", default: 0 },
  { freq: "250", label: "250Hz", default: 0 },
  { freq: "1k", label: "1kHz", default: 0 },
  { freq: "4k", label: "4kHz", default: 0 },
  { freq: "16k", label: "16kHz", default: 0 },
];

const VisualEQ: React.FC<VisualEQProps> = ({ overlay, onUpdate }) => {
  const [expanded, setExpanded] = useState(false);
  
  // Get EQ values from overlay (stored as eq object)
  const eq = (overlay as any).eq || {};
  
  const handleEQChange = useCallback((freq: string, value: number) => {
    onUpdate({
      eq: {
        ...eq,
        [freq]: value,
      },
    } as any);
  }, [eq, onUpdate]);

  const resetEQ = useCallback(() => {
    const resetValues: Record<string, number> = {};
    EQ_BANDS.forEach(band => {
      resetValues[band.freq] = 0;
    });
    onUpdate({ eq: resetValues } as any);
  }, [onUpdate]);

  const hasEQChanges = EQ_BANDS.some(band => (eq[band.freq] ?? 0) !== 0);

  return (
    <div className="space-y-2 pt-2 border-t border-border">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2 text-xs">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Equalizer
        </Label>
        <div className="flex items-center gap-1">
          {hasEQChanges && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={resetEQ}
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Hide" : "Show"}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Visual EQ bars */}
          <div className="flex items-end justify-between h-24 gap-1 p-2 bg-muted/30 rounded-md">
            {EQ_BANDS.map((band) => {
              const value = eq[band.freq] ?? 0;
              // Map -12 to +12 dB to visual height
              const height = 50 + (value / 12) * 50;
              
              return (
                <div key={band.freq} className="flex-1 flex flex-col items-center gap-1">
                  {/* Bar */}
                  <div className="w-full flex-1 flex items-end">
                    <div
                      className={cn(
                        "w-full rounded-t transition-all duration-150",
                        value > 0 ? "bg-green-500" : value < 0 ? "bg-red-500" : "bg-primary"
                      )}
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  {/* Label */}
                  <span className="text-[8px] text-muted-foreground">{band.label}</span>
                </div>
              );
            })}
          </div>

          {/* EQ Sliders */}
          <div className="grid grid-cols-5 gap-2 mt-2">
            {EQ_BANDS.map((band) => {
              const value = eq[band.freq] ?? 0;
              
              return (
                <div key={band.freq} className="flex flex-col items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">
                    {value > 0 ? "+" : ""}{value}dB
                  </span>
                  <Slider
                    orientation="vertical"
                    value={[value]}
                    onValueChange={([v]) => handleEQChange(band.freq, v)}
                    min={-12}
                    max={12}
                    step={1}
                    className="h-16"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// WAVEFORM DISPLAY COMPONENT
// ==========================================

interface WaveformDisplayProps {
  overlay: SoundOverlay;
}

const WaveformDisplay: React.FC<WaveformDisplayProps> = ({ overlay }) => {
  const [expanded, setExpanded] = useState(false);
  
  // Generate a simple waveform visualization
  // In a real implementation, this would be based on actual audio data
  const waveformBars = useMemo(() => {
    const bars = [];
    const numBars = 60;
    
    // Generate pseudo-random but consistent heights based on overlay id
    const seed = overlay.id;
    for (let i = 0; i < numBars; i++) {
      // Create a deterministic pseudo-random pattern
      const noise = Math.sin(seed * 0.1 + i * 0.5) * 0.3 +
                    Math.sin(seed * 0.05 + i * 0.8) * 0.2 +
                    Math.cos(seed * 0.03 + i * 0.3) * 0.2;
      const height = 30 + Math.abs(noise) * 70;
      bars.push(height);
    }
    
    return bars;
  }, [overlay.id]);

  return (
    <div className="space-y-2 pt-2 border-t border-border">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2 text-xs">
          <Waves className="h-3.5 w-3.5" />
          Waveform
        </Label>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Hide" : "Show"}
        </Button>
      </div>

      {expanded && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Waveform visualization */}
          <div className="flex items-center h-16 gap-px p-2 bg-muted/30 rounded-md overflow-hidden">
            {waveformBars.map((height, i) => (
              <div
                key={i}
                className="flex-1 bg-primary/60 rounded-sm transition-all"
                style={{
                  height: `${height}%`,
                  opacity: 0.5 + (height / 200),
                }}
              />
            ))}
          </div>
          
          {/* Time markers */}
          {overlay.mediaSrcDuration && (
            <div className="flex justify-between text-[10px] text-muted-foreground px-2">
              <span>0:00</span>
              <span>{formatAudioTime(overlay.mediaSrcDuration / 2)}</span>
              <span>{formatAudioTime(overlay.mediaSrcDuration)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Helper function
function formatAudioTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default AudioSection;
