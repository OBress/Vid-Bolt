/**
 * Audio Effect Controls
 * 
 * Specialized UI controls for audio effects:
 * - EQ frequency visualizer with draggable nodes
 * - Compressor gain reduction meter
 * - Level meters
 */

import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import { cn } from '../../../utils/general/utils';
import type { EQBand, ParametricEQEffect } from '../../../types/audio-effects';

// ============================================================
// EQ FREQUENCY VISUALIZER
// ============================================================

interface EQVisualizerProps {
  bands: EQBand[];
  outputGain: number;
  onBandUpdate: (index: number, updates: Partial<EQBand>) => void;
  width?: number;
  height?: number;
}

const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const MIN_GAIN = -24;
const MAX_GAIN = 24;

/**
 * Convert frequency to X position (logarithmic scale)
 */
function freqToX(freq: number, width: number): number {
  const minLog = Math.log10(MIN_FREQ);
  const maxLog = Math.log10(MAX_FREQ);
  const freqLog = Math.log10(freq);
  return ((freqLog - minLog) / (maxLog - minLog)) * width;
}

/**
 * Convert X position to frequency (logarithmic scale)
 */
function xToFreq(x: number, width: number): number {
  const minLog = Math.log10(MIN_FREQ);
  const maxLog = Math.log10(MAX_FREQ);
  const ratio = x / width;
  const freqLog = minLog + ratio * (maxLog - minLog);
  return Math.pow(10, freqLog);
}

/**
 * Convert gain to Y position
 */
function gainToY(gain: number, height: number): number {
  return ((MAX_GAIN - gain) / (MAX_GAIN - MIN_GAIN)) * height;
}

/**
 * Convert Y position to gain
 */
function yToGain(y: number, height: number): number {
  return MAX_GAIN - (y / height) * (MAX_GAIN - MIN_GAIN);
}

/**
 * Calculate frequency response curve
 */
function calculateFrequencyResponse(
  bands: EQBand[],
  width: number,
  sampleRate: number = 44100
): number[] {
  const response: number[] = [];
  const numPoints = width;
  
  for (let i = 0; i < numPoints; i++) {
    const freq = xToFreq(i, width);
    let totalGain = 0;
    
    bands.forEach(band => {
      if (!band.enabled) return;
      
      const omega = (2 * Math.PI * freq) / sampleRate;
      const omega0 = (2 * Math.PI * band.frequency) / sampleRate;
      
      // Simplified frequency response calculation
      switch (band.type) {
        case 'lowShelf': {
          const ratio = freq / band.frequency;
          if (ratio < 1) {
            totalGain += band.gain * (1 - Math.pow(ratio, 2));
          } else {
            totalGain += band.gain * (1 / Math.pow(ratio, 2));
          }
          break;
        }
        case 'highShelf': {
          const ratio = freq / band.frequency;
          if (ratio > 1) {
            totalGain += band.gain * (1 - 1 / Math.pow(ratio, 2));
          } else {
            totalGain += band.gain * (Math.pow(ratio, 2));
          }
          break;
        }
        case 'peaking': {
          const ratio = freq / band.frequency;
          const bandwidth = 1 / band.q;
          const deviation = Math.abs(Math.log2(ratio));
          const response = Math.exp(-Math.pow(deviation / bandwidth, 2) * 2);
          totalGain += band.gain * response;
          break;
        }
        case 'lowpass': {
          const ratio = freq / band.frequency;
          if (ratio > 1) {
            totalGain -= Math.min(24, 12 * Math.log2(ratio) * band.q);
          }
          break;
        }
        case 'highpass': {
          const ratio = freq / band.frequency;
          if (ratio < 1) {
            totalGain -= Math.min(24, -12 * Math.log2(ratio) * band.q);
          }
          break;
        }
        case 'notch': {
          const ratio = freq / band.frequency;
          const bandwidth = 1 / band.q;
          const deviation = Math.abs(Math.log2(ratio));
          if (deviation < bandwidth) {
            const response = Math.cos((deviation / bandwidth) * Math.PI / 2);
            totalGain -= 24 * response;
          }
          break;
        }
      }
    });
    
    response.push(totalGain);
  }
  
  return response;
}

export const EQVisualizer: React.FC<EQVisualizerProps> = ({
  bands,
  outputGain,
  onBandUpdate,
  width = 300,
  height = 150,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [draggingBand, setDraggingBand] = useState<number | null>(null);
  const [hoveringBand, setHoveringBand] = useState<number | null>(null);
  
  const bandColors = useMemo(() => [
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4'
  ], []);
  
  // Calculate frequency response
  const response = useMemo(() => 
    calculateFrequencyResponse(bands, width),
    [bands, width]
  );
  
  // Draw the visualizer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    
    // Clear
    ctx.clearRect(0, 0, width, height);
    
    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, width, height);
    
    // Grid lines - horizontal (gain)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let gain = -24; gain <= 24; gain += 6) {
      const y = gainToY(gain, height);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    // Zero line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    const zeroY = gainToY(0, height);
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(width, zeroY);
    ctx.stroke();
    
    // Grid lines - vertical (frequency)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    [100, 1000, 10000].forEach(freq => {
      const x = freqToX(freq, width);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    });
    
    // Draw frequency response curve
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    
    response.forEach((gain, i) => {
      const x = i;
      const y = gainToY(gain, height);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    
    // Fill under curve
    ctx.lineTo(width, zeroY);
    ctx.lineTo(0, zeroY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
    ctx.fill();
    
    // Draw band nodes
    bands.forEach((band, index) => {
      if (!band.enabled) return;
      
      const x = freqToX(band.frequency, width);
      const y = ['lowShelf', 'highShelf', 'peaking'].includes(band.type) 
        ? gainToY(band.gain, height) 
        : zeroY;
      const color = bandColors[index % bandColors.length];
      const isActive = draggingBand === index || hoveringBand === index;
      
      // Outer ring
      ctx.beginPath();
      ctx.arc(x, y, isActive ? 10 : 8, 0, Math.PI * 2);
      ctx.fillStyle = color + '40';
      ctx.fill();
      
      // Inner circle
      ctx.beginPath();
      ctx.arc(x, y, isActive ? 6 : 5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
    
    // Frequency labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('100', freqToX(100, width), height - 4);
    ctx.fillText('1k', freqToX(1000, width), height - 4);
    ctx.fillText('10k', freqToX(10000, width), height - 4);
    
    // Gain labels
    ctx.textAlign = 'left';
    ctx.fillText('+12', 4, gainToY(12, height) + 4);
    ctx.fillText('0', 4, zeroY + 4);
    ctx.fillText('-12', 4, gainToY(-12, height) + 4);
    
  }, [bands, response, width, height, bandColors, draggingBand, hoveringBand]);
  
  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Find closest band
    let closestIndex = -1;
    let closestDistance = 20; // Max distance to select
    
    bands.forEach((band, index) => {
      if (!band.enabled) return;
      
      const bandX = freqToX(band.frequency, width);
      const bandY = ['lowShelf', 'highShelf', 'peaking'].includes(band.type)
        ? gainToY(band.gain, height)
        : gainToY(0, height);
      
      const distance = Math.sqrt(Math.pow(x - bandX, 2) + Math.pow(y - bandY, 2));
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    
    if (closestIndex >= 0) {
      setDraggingBand(closestIndex);
    }
  }, [bands, width, height]);
  
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (draggingBand !== null) {
      const band = bands[draggingBand];
      const newFreq = Math.max(MIN_FREQ, Math.min(MAX_FREQ, xToFreq(x, width)));
      const updates: Partial<EQBand> = { frequency: Math.round(newFreq) };
      
      if (['lowShelf', 'highShelf', 'peaking'].includes(band.type)) {
        const newGain = Math.max(MIN_GAIN, Math.min(MAX_GAIN, yToGain(y, height)));
        updates.gain = Math.round(newGain * 2) / 2; // Round to 0.5
      }
      
      onBandUpdate(draggingBand, updates);
    } else {
      // Find hovered band
      let closestIndex = -1;
      let closestDistance = 15;
      
      bands.forEach((band, index) => {
        if (!band.enabled) return;
        
        const bandX = freqToX(band.frequency, width);
        const bandY = ['lowShelf', 'highShelf', 'peaking'].includes(band.type)
          ? gainToY(band.gain, height)
          : gainToY(0, height);
        
        const distance = Math.sqrt(Math.pow(x - bandX, 2) + Math.pow(y - bandY, 2));
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });
      
      setHoveringBand(closestIndex);
    }
  }, [bands, draggingBand, width, height, onBandUpdate]);
  
  const handleMouseUp = useCallback(() => {
    setDraggingBand(null);
  }, []);
  
  const handleMouseLeave = useCallback(() => {
    setDraggingBand(null);
    setHoveringBand(null);
  }, []);
  
  return (
    <canvas
      ref={canvasRef}
      className="rounded border border-border cursor-crosshair"
      style={{ width, height }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    />
  );
};

// ============================================================
// GAIN REDUCTION METER
// ============================================================

interface GainReductionMeterProps {
  reduction: number; // Current gain reduction in dB (negative value)
  threshold?: number;
  width?: number;
  height?: number;
}

export const GainReductionMeter: React.FC<GainReductionMeterProps> = ({
  reduction,
  threshold = -18,
  width = 200,
  height = 20,
}) => {
  const clampedReduction = Math.max(-30, Math.min(0, reduction));
  const percentage = (clampedReduction / -30) * 100;
  
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>GR</span>
        <span>{clampedReduction.toFixed(1)} dB</span>
      </div>
      <div 
        className="relative bg-black/30 rounded overflow-hidden"
        style={{ width, height }}
      >
        {/* Grid lines */}
        {[-6, -12, -18, -24].map(db => (
          <div
            key={db}
            className="absolute top-0 bottom-0 w-px bg-white/10"
            style={{ left: `${(db / -30) * 100}%` }}
          />
        ))}
        
        {/* Meter fill */}
        <div
          className={cn(
            "absolute left-0 top-0 bottom-0 transition-all duration-75",
            percentage > 50 ? "bg-orange-500" : "bg-green-500"
          )}
          style={{ width: `${percentage}%` }}
        />
        
        {/* Labels */}
        <div className="absolute inset-0 flex justify-between items-center px-1 text-[8px] text-white/60 pointer-events-none">
          <span>0</span>
          <span>-30</span>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// VU METER
// ============================================================

interface VUMeterProps {
  level: number; // Level in dB (-60 to +6)
  peak?: number;
  label?: string;
  vertical?: boolean;
  width?: number;
  height?: number;
}

export const VUMeter: React.FC<VUMeterProps> = ({
  level,
  peak,
  label,
  vertical = false,
  width = vertical ? 12 : 200,
  height = vertical ? 100 : 12,
}) => {
  const minDb = -60;
  const maxDb = 6;
  const clampedLevel = Math.max(minDb, Math.min(maxDb, level));
  const percentage = ((clampedLevel - minDb) / (maxDb - minDb)) * 100;
  
  const clampedPeak = peak !== undefined 
    ? Math.max(minDb, Math.min(maxDb, peak)) 
    : undefined;
  const peakPercentage = clampedPeak !== undefined 
    ? ((clampedPeak - minDb) / (maxDb - minDb)) * 100 
    : undefined;
  
  const getColor = (pct: number) => {
    if (pct > 90) return 'bg-red-500';
    if (pct > 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };
  
  if (vertical) {
    return (
      <div className="flex flex-col items-center gap-1">
        {label && <span className="text-[10px] text-muted-foreground">{label}</span>}
        <div 
          className="relative bg-black/30 rounded overflow-hidden"
          style={{ width, height }}
        >
          {/* Meter fill */}
          <div
            className={cn(
              "absolute left-0 right-0 bottom-0 transition-all duration-75",
              getColor(percentage)
            )}
            style={{ height: `${percentage}%` }}
          />
          
          {/* Peak indicator */}
          {peakPercentage !== undefined && (
            <div
              className="absolute left-0 right-0 h-0.5 bg-white"
              style={{ bottom: `${peakPercentage}%` }}
            />
          )}
          
          {/* Danger zone */}
          <div 
            className="absolute left-0 right-0 top-0 bg-red-500/20"
            style={{ height: '10%' }}
          />
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-1">
      {label && (
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{label}</span>
          <span>{clampedLevel.toFixed(1)} dB</span>
        </div>
      )}
      <div 
        className="relative bg-black/30 rounded overflow-hidden"
        style={{ width, height }}
      >
        {/* Meter fill */}
        <div
          className={cn(
            "absolute left-0 top-0 bottom-0 transition-all duration-75",
            getColor(percentage)
          )}
          style={{ width: `${percentage}%` }}
        />
        
        {/* Peak indicator */}
        {peakPercentage !== undefined && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white"
            style={{ left: `${peakPercentage}%` }}
          />
        )}
        
        {/* Danger zone indicator */}
        <div 
          className="absolute right-0 top-0 bottom-0 bg-red-500/20"
          style={{ width: '10%' }}
        />
      </div>
    </div>
  );
};

// ============================================================
// STEREO METER
// ============================================================

interface StereoMeterProps {
  leftLevel: number;
  rightLevel: number;
  leftPeak?: number;
  rightPeak?: number;
  width?: number;
  height?: number;
}

export const StereoMeter: React.FC<StereoMeterProps> = ({
  leftLevel,
  rightLevel,
  leftPeak,
  rightPeak,
  width = 200,
  height = 30,
}) => {
  return (
    <div className="space-y-1" style={{ width }}>
      <VUMeter 
        level={leftLevel} 
        peak={leftPeak} 
        label="L" 
        width={width} 
        height={(height - 4) / 2} 
      />
      <VUMeter 
        level={rightLevel} 
        peak={rightPeak} 
        label="R" 
        width={width} 
        height={(height - 4) / 2} 
      />
    </div>
  );
};

// ============================================================
// SPECTRUM ANALYZER (SIMPLIFIED)
// ============================================================

interface SpectrumAnalyzerProps {
  frequencyData: Uint8Array;
  width?: number;
  height?: number;
}

export const SpectrumAnalyzer: React.FC<SpectrumAnalyzerProps> = ({
  frequencyData,
  width = 200,
  height = 60,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    
    // Clear
    ctx.clearRect(0, 0, width, height);
    
    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, width, height);
    
    // Draw bars
    const barCount = Math.min(frequencyData.length, 32);
    const barWidth = width / barCount - 1;
    
    for (let i = 0; i < barCount; i++) {
      // Use logarithmic distribution for frequency bins
      const freqIndex = Math.floor(Math.pow(i / barCount, 2) * frequencyData.length);
      const value = frequencyData[freqIndex] / 255;
      const barHeight = value * height;
      
      // Gradient color based on height
      const hue = 120 - value * 120; // Green to red
      ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
      
      ctx.fillRect(
        i * (barWidth + 1),
        height - barHeight,
        barWidth,
        barHeight
      );
    }
    
  }, [frequencyData, width, height]);
  
  return (
    <canvas
      ref={canvasRef}
      className="rounded border border-border"
      style={{ width, height }}
    />
  );
};

export default {
  EQVisualizer,
  GainReductionMeter,
  VUMeter,
  StereoMeter,
  SpectrumAnalyzer,
};
