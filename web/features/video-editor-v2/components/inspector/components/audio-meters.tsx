/**
 * Audio Meters Component
 * 
 * Real-time audio level meters for monitoring audio signals.
 * Shows peak and RMS levels with clipping indicators.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '../../../utils/general/utils';
import { getAudioContextManager } from '../../../utils/audio-context-manager';

// ============================================================
// TYPES
// ============================================================

export interface AudioLevels {
  rms: number;
  peak: number;
  clipping: boolean;
}

interface AudioMetersProps {
  /** Clip ID to get levels for */
  clipId?: string;
  /** Use master levels instead of clip levels */
  useMaster?: boolean;
  /** Show peak hold indicator */
  showPeakHold?: boolean;
  /** Peak hold time in ms */
  peakHoldTime?: number;
  /** Vertical orientation */
  vertical?: boolean;
  /** Show stereo meters */
  stereo?: boolean;
  /** Custom width */
  width?: number;
  /** Custom height */
  height?: number;
  /** Compact mode */
  compact?: boolean;
  /** Update interval in ms */
  updateInterval?: number;
}

// ============================================================
// CONSTANTS
// ============================================================

const DB_MIN = -60;
const DB_MAX = 6;
const DB_RANGE = DB_MAX - DB_MIN;

// Meter segment colors (similar to pro audio meters)
const METER_SEGMENTS = [
  { threshold: 0, color: '#ef4444' },    // Red (clipping)
  { threshold: -6, color: '#f97316' },   // Orange (warning)
  { threshold: -12, color: '#eab308' },  // Yellow (loud)
  { threshold: -60, color: '#22c55e' },  // Green (normal)
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Convert dB to percentage (0-100)
 */
function dbToPercent(db: number): number {
  const clamped = Math.max(DB_MIN, Math.min(DB_MAX, db));
  return ((clamped - DB_MIN) / DB_RANGE) * 100;
}

/**
 * Get color for a given dB level
 */
function getColorForLevel(db: number): string {
  for (const segment of METER_SEGMENTS) {
    if (db >= segment.threshold) {
      return segment.color;
    }
  }
  return METER_SEGMENTS[METER_SEGMENTS.length - 1].color;
}

/**
 * Format dB value for display
 */
function formatDb(db: number): string {
  if (db <= DB_MIN) return '-∞';
  return db.toFixed(1);
}

// ============================================================
// METER BAR COMPONENT
// ============================================================

interface MeterBarProps {
  level: number;
  peak?: number;
  peakHold?: number;
  vertical?: boolean;
  width: number;
  height: number;
  showLabels?: boolean;
  label?: string;
}

const MeterBar: React.FC<MeterBarProps> = ({
  level,
  peak,
  peakHold,
  vertical = false,
  width,
  height,
  showLabels = true,
  label,
}) => {
  const levelPercent = dbToPercent(level);
  const peakPercent = peak !== undefined ? dbToPercent(peak) : undefined;
  const peakHoldPercent = peakHold !== undefined ? dbToPercent(peakHold) : undefined;
  
  const isClipping = level > 0;
  
  if (vertical) {
    return (
      <div className="flex flex-col items-center gap-1">
        {label && (
          <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
        )}
        <div 
          className="relative rounded overflow-hidden bg-black/40"
          style={{ width, height }}
        >
          {/* Gradient background for segments */}
          <div className="absolute inset-0 flex flex-col">
            <div className="h-[10%] bg-red-500/20" />
            <div className="h-[10%] bg-orange-500/20" />
            <div className="h-[10%] bg-yellow-500/20" />
            <div className="flex-1 bg-green-500/10" />
          </div>
          
          {/* Level fill */}
          <div
            className="absolute left-0 right-0 bottom-0 transition-all duration-[50ms]"
            style={{ 
              height: `${levelPercent}%`,
              background: `linear-gradient(to top, 
                #22c55e 0%, 
                #22c55e 60%, 
                #eab308 75%, 
                #f97316 85%, 
                #ef4444 95%
              )`,
            }}
          />
          
          {/* Peak indicator */}
          {peakPercent !== undefined && (
            <div
              className="absolute left-0 right-0 h-0.5 bg-white/80 transition-all duration-[50ms]"
              style={{ bottom: `${peakPercent}%` }}
            />
          )}
          
          {/* Peak hold */}
          {peakHoldPercent !== undefined && (
            <div
              className="absolute left-0 right-0 h-0.5 bg-white transition-all duration-150"
              style={{ bottom: `${peakHoldPercent}%` }}
            />
          )}
          
          {/* Reference lines */}
          {showLabels && (
            <>
              <div className="absolute left-0 right-0 h-px bg-white/20" style={{ bottom: `${dbToPercent(0)}%` }} />
              <div className="absolute left-0 right-0 h-px bg-white/10" style={{ bottom: `${dbToPercent(-6)}%` }} />
              <div className="absolute left-0 right-0 h-px bg-white/10" style={{ bottom: `${dbToPercent(-12)}%` }} />
              <div className="absolute left-0 right-0 h-px bg-white/10" style={{ bottom: `${dbToPercent(-18)}%` }} />
            </>
          )}
          
          {/* Clipping indicator */}
          {isClipping && (
            <div className="absolute inset-x-0 top-0 h-2 bg-red-500 animate-pulse" />
          )}
        </div>
        
        {showLabels && (
          <span className={cn(
            "text-[10px] tabular-nums",
            isClipping ? "text-red-500 font-bold" : "text-muted-foreground"
          )}>
            {formatDb(level)}
          </span>
        )}
      </div>
    );
  }
  
  // Horizontal layout
  return (
    <div className="space-y-1">
      {label && (
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
          <span className={cn(
            "text-[10px] tabular-nums",
            isClipping ? "text-red-500 font-bold" : "text-muted-foreground"
          )}>
            {formatDb(level)} dB
          </span>
        </div>
      )}
      <div 
        className="relative rounded overflow-hidden bg-black/40"
        style={{ width, height }}
      >
        {/* Level fill */}
        <div
          className="absolute left-0 top-0 bottom-0 transition-all duration-[50ms]"
          style={{ 
            width: `${levelPercent}%`,
            background: `linear-gradient(to right, 
              #22c55e 0%, 
              #22c55e 60%, 
              #eab308 75%, 
              #f97316 85%, 
              #ef4444 95%
            )`,
          }}
        />
        
        {/* Peak indicator */}
        {peakPercent !== undefined && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white/80 transition-all duration-[50ms]"
            style={{ left: `${peakPercent}%` }}
          />
        )}
        
        {/* Peak hold */}
        {peakHoldPercent !== undefined && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white transition-all duration-150"
            style={{ left: `${peakHoldPercent}%` }}
          />
        )}
        
        {/* Danger zone */}
        <div 
          className="absolute right-0 top-0 bottom-0 bg-red-500/20"
          style={{ width: `${(DB_MAX / DB_RANGE) * 100}%` }}
        />
        
        {/* Clipping indicator */}
        {isClipping && (
          <div className="absolute inset-y-0 right-0 w-2 bg-red-500 animate-pulse" />
        )}
      </div>
    </div>
  );
};

// ============================================================
// MAIN AUDIO METERS COMPONENT
// ============================================================

export const AudioMeters: React.FC<AudioMetersProps> = ({
  clipId,
  useMaster = false,
  showPeakHold = true,
  peakHoldTime = 2000,
  vertical = true,
  stereo = false,
  width,
  height,
  compact = false,
  updateInterval = 50,
}) => {
  const [levels, setLevels] = useState<AudioLevels>({ rms: -60, peak: -60, clipping: false });
  const [peakHold, setPeakHold] = useState<number>(-60);
  const peakHoldTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const rafRef = useRef<number | null>(null);
  
  // Default dimensions based on orientation
  const defaultWidth = vertical ? (stereo ? 30 : 14) : (compact ? 100 : 200);
  const defaultHeight = vertical ? (compact ? 60 : 100) : (stereo ? 24 : 12);
  const actualWidth = width ?? defaultWidth;
  const actualHeight = height ?? defaultHeight;
  
  // Update levels
  useEffect(() => {
    const manager = getAudioContextManager();
    
    const updateLevels = () => {
      let newLevels: AudioLevels;
      
      if (useMaster) {
        newLevels = manager.getMasterLevels() ?? { rms: -60, peak: -60, clipping: false };
      } else if (clipId) {
        const chain = manager.getEffectChain(clipId);
        if (chain) {
          newLevels = manager.getAudioLevels(chain.analyzerPost);
        } else {
          newLevels = { rms: -60, peak: -60, clipping: false };
        }
      } else {
        newLevels = { rms: -60, peak: -60, clipping: false };
      }
      
      setLevels(newLevels);
      
      // Update peak hold
      if (showPeakHold && newLevels.peak > peakHold) {
        setPeakHold(newLevels.peak);
        
        // Clear previous timeout
        if (peakHoldTimeoutRef.current) {
          clearTimeout(peakHoldTimeoutRef.current);
        }
        
        // Set new timeout to decay peak hold
        peakHoldTimeoutRef.current = setTimeout(() => {
          setPeakHold(-60);
        }, peakHoldTime);
      }
      
      rafRef.current = requestAnimationFrame(updateLevels);
    };
    
    // Start update loop
    rafRef.current = requestAnimationFrame(updateLevels);
    
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      if (peakHoldTimeoutRef.current) {
        clearTimeout(peakHoldTimeoutRef.current);
      }
    };
  }, [clipId, useMaster, showPeakHold, peakHoldTime, peakHold]);
  
  // Reset peak hold on click
  const handleResetPeak = useCallback(() => {
    setPeakHold(-60);
    if (peakHoldTimeoutRef.current) {
      clearTimeout(peakHoldTimeoutRef.current);
    }
  }, []);
  
  if (stereo && vertical) {
    // Vertical stereo meters
    return (
      <div 
        className="flex gap-1 cursor-pointer" 
        onClick={handleResetPeak}
        title="Click to reset peak"
      >
        <MeterBar
          level={levels.rms}
          peak={levels.peak}
          peakHold={showPeakHold ? peakHold : undefined}
          vertical
          width={actualWidth / 2 - 2}
          height={actualHeight}
          label="L"
          showLabels={!compact}
        />
        <MeterBar
          level={levels.rms}
          peak={levels.peak}
          peakHold={showPeakHold ? peakHold : undefined}
          vertical
          width={actualWidth / 2 - 2}
          height={actualHeight}
          label="R"
          showLabels={!compact}
        />
      </div>
    );
  }
  
  if (stereo) {
    // Horizontal stereo meters
    return (
      <div 
        className="space-y-1 cursor-pointer" 
        onClick={handleResetPeak}
        title="Click to reset peak"
      >
        <MeterBar
          level={levels.rms}
          peak={levels.peak}
          peakHold={showPeakHold ? peakHold : undefined}
          width={actualWidth}
          height={(actualHeight - 4) / 2}
          label="L"
          showLabels={!compact}
        />
        <MeterBar
          level={levels.rms}
          peak={levels.peak}
          peakHold={showPeakHold ? peakHold : undefined}
          width={actualWidth}
          height={(actualHeight - 4) / 2}
          label="R"
          showLabels={!compact}
        />
      </div>
    );
  }
  
  // Single meter
  return (
    <div 
      className="cursor-pointer" 
      onClick={handleResetPeak}
      title="Click to reset peak"
    >
      <MeterBar
        level={levels.rms}
        peak={levels.peak}
        peakHold={showPeakHold ? peakHold : undefined}
        vertical={vertical}
        width={actualWidth}
        height={actualHeight}
        showLabels={!compact}
      />
    </div>
  );
};

// ============================================================
// CLIP LEVEL METER (FOR INSPECTOR)
// ============================================================

interface ClipLevelMeterProps {
  clipId: string;
}

export const ClipLevelMeter: React.FC<ClipLevelMeterProps> = ({ clipId }) => {
  return (
    <div className="p-3 border rounded-lg bg-black/20">
      <h4 className="text-xs font-medium mb-2 text-muted-foreground">Output Levels</h4>
      <div className="flex justify-center">
        <AudioMeters
          clipId={clipId}
          stereo
          vertical
          height={80}
          width={40}
        />
      </div>
    </div>
  );
};

// ============================================================
// MASTER METER (FOR TOOLBAR/HEADER)
// ============================================================

export const MasterMeter: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  return (
    <AudioMeters
      useMaster
      stereo={!compact}
      vertical={!compact}
      compact={compact}
      width={compact ? 60 : 30}
      height={compact ? 8 : 40}
    />
  );
};

export default AudioMeters;
