/**
 * MapboxAnimation Component
 * 
 * Professional map animations for documentaries, travel videos, and informational content.
 * Uses Mapbox Static Images API for Remotion compatibility (WebGL doesn't work in renderer).
 * 
 * Animation Types:
 * - flyTo: Cinematic flight from one location to another with zoom/pitch changes
 * - route: Animated path along a route with trailing line
 * - markers: Animated markers appearing sequentially on the map
 * - zoom: Dramatic zoom in/out on a location
 * - pan: Smooth pan across a region
 * - reveal: Reveal animation with expanding circle or fade
 * - comparison: Before/after or multi-location comparison
 * - globe: 3D globe rotation (using orthographic projection)
 * - static: Static map with optional overlays
 */

import React, { useMemo } from "react";
import { useCurrentFrame, interpolate, Img, spring, useVideoConfig, Easing } from "remotion";
import type { MapboxConfig, MapboxMarker } from "../../../types/motion-graphics";

// ==========================================
// TYPES
// ==========================================

interface MapboxAnimationProps {
  /** Mapbox configuration */
  config: MapboxConfig;
  /** Component width */
  width: number;
  /** Component height */
  height: number;
  /** Total duration in frames */
  durationInFrames: number;
  /** Mapbox access token (from environment or props) */
  accessToken?: string;
  /** Custom styling */
  style?: React.CSSProperties;
}

interface MarkerAnimationProps {
  marker: MapboxMarker;
  frame: number;
  fps: number;
  mapWidth: number;
  mapHeight: number;
  mapCenter: [number, number];
  mapZoom: number;
}

// Extended animation types
export type ExtendedMapAnimationType = 
  | 'flyTo' 
  | 'route' 
  | 'markers' 
  | 'zoom' 
  | 'pan' 
  | 'reveal'
  | 'comparison'
  | 'globe'
  | 'static';

// ==========================================
// CONSTANTS
// ==========================================

// Default Mapbox token - should be configured via environment variable
const DEFAULT_ACCESS_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_API_TOKEN || '';

// Map style URLs with better options for documentaries
const MAPBOX_STYLES: Record<string, string> = {
  'streets-v12': 'mapbox/streets-v12',
  'outdoors-v12': 'mapbox/outdoors-v12',
  'light-v11': 'mapbox/light-v11',
  'dark-v11': 'mapbox/dark-v11',
  'satellite-v9': 'mapbox/satellite-v9',
  'satellite-streets-v12': 'mapbox/satellite-streets-v12',
  // Documentary-friendly styles
  'navigation-day-v1': 'mapbox/navigation-day-v1',
  'navigation-night-v1': 'mapbox/navigation-night-v1',
};

// Easing functions for cinematic animations
const cinematicEasing = {
  smooth: (t: number) => t * t * (3 - 2 * t), // Smoothstep
  dramatic: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, // Cubic ease in-out
  gentle: (t: number) => 1 - Math.pow(1 - t, 3), // Cubic ease out
  anticipate: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  },
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Generate Mapbox Static API URL with enhanced options
 */
const generateMapboxUrl = (
  center: [number, number],
  zoom: number,
  width: number,
  height: number,
  style: string,
  accessToken: string,
  options?: {
    pitch?: number;
    bearing?: number;
    markers?: MapboxMarker[];
    path?: [number, number][];
    pathColor?: string;
    pathWidth?: number;
    padding?: number;
  }
): string => {
  const styleId = MAPBOX_STYLES[style] || style;
  const [lng, lat] = center;
  
  // Build overlays
  let overlays: string[] = [];
  
  // Add path overlay for routes
  if (options?.path && options.path.length > 1) {
    const pathColor = (options.pathColor || '#3B82F6').replace('#', '');
    const pathWidth = options.pathWidth || 4;
    const pathCoords = options.path.map(([lng, lat]) => `${lng},${lat}`).join(',');
    overlays.push(`path-${pathWidth}+${pathColor}-0.8(${encodeURIComponent(pathCoords)})`);
  }
  
  // Add marker overlays
  if (options?.markers && options.markers.length > 0) {
    const markerStrings = options.markers.map((m) => {
      const color = m.color?.replace('#', '') || '3B82F6';
      const label = m.label?.charAt(0).toLowerCase() || '';
      return `pin-l-${label}+${color}(${m.coordinates[0]},${m.coordinates[1]})`;
    });
    overlays.push(...markerStrings);
  }

  const overlayString = overlays.length > 0 ? overlays.join(',') + '/' : '';

  // Build position string with optional bearing and pitch
  let positionStr = `${lng.toFixed(6)},${lat.toFixed(6)},${zoom.toFixed(2)}`;
  if (options?.bearing !== undefined) {
    positionStr += `,${options.bearing.toFixed(1)}`;
    if (options?.pitch !== undefined) {
      positionStr += `,${options.pitch.toFixed(1)}`;
    }
  }

  // Ensure dimensions are within limits (1280x1280 max for static API)
  // Use @2x for retina quality
  const safeWidth = Math.min(1280, Math.max(1, Math.round(width / 2)));
  const safeHeight = Math.min(1280, Math.max(1, Math.round(height / 2)));

  return `https://api.mapbox.com/styles/v1/${styleId}/static/${overlayString}${positionStr}/${safeWidth}x${safeHeight}@2x?access_token=${accessToken}&logo=false&attribution=false`;
};

/**
 * Interpolate between two coordinates with optional easing
 */
const interpolateCoordinates = (
  from: [number, number],
  to: [number, number],
  progress: number,
  easing: (t: number) => number = cinematicEasing.smooth
): [number, number] => {
  const easedProgress = easing(progress);
  return [
    from[0] + (to[0] - from[0]) * easedProgress,
    from[1] + (to[1] - from[1]) * easedProgress,
  ];
};

/**
 * Calculate great circle distance for more accurate flight paths
 */
const greatCircleInterpolate = (
  from: [number, number],
  to: [number, number],
  progress: number
): [number, number] => {
  const toRad = (deg: number) => deg * Math.PI / 180;
  const toDeg = (rad: number) => rad * 180 / Math.PI;
  
  const lat1 = toRad(from[1]);
  const lon1 = toRad(from[0]);
  const lat2 = toRad(to[1]);
  const lon2 = toRad(to[0]);
  
  const d = 2 * Math.asin(Math.sqrt(
    Math.pow(Math.sin((lat2 - lat1) / 2), 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lon2 - lon1) / 2), 2)
  ));
  
  if (d === 0) return from;
  
  const A = Math.sin((1 - progress) * d) / Math.sin(d);
  const B = Math.sin(progress * d) / Math.sin(d);
  
  const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
  const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
  const z = A * Math.sin(lat1) + B * Math.sin(lat2);
  
  const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
  const lon = Math.atan2(y, x);
  
  return [toDeg(lon), toDeg(lat)];
};

/**
 * Convert geo coordinates to pixel position on map
 */
const geoToPixel = (
  coords: [number, number],
  center: [number, number],
  zoom: number,
  mapWidth: number,
  mapHeight: number
): { x: number; y: number } => {
  const scale = Math.pow(2, zoom) * 256;
  const worldCoords = (lng: number, lat: number) => {
    const x = (lng + 180) / 360;
    const sinLat = Math.sin((lat * Math.PI) / 180);
    const y = 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI);
    return { x, y };
  };

  const centerWorld = worldCoords(center[0], center[1]);
  const pointWorld = worldCoords(coords[0], coords[1]);

  const pixelX = mapWidth / 2 + (pointWorld.x - centerWorld.x) * scale;
  const pixelY = mapHeight / 2 + (pointWorld.y - centerWorld.y) * scale;

  return { x: pixelX, y: pixelY };
};

/**
 * Calculate bearing between two points
 */
const calculateBearing = (from: [number, number], to: [number, number]): number => {
  const toRad = (deg: number) => deg * Math.PI / 180;
  const toDeg = (rad: number) => rad * 180 / Math.PI;
  
  const dLon = toRad(to[0] - from[0]);
  const lat1 = toRad(from[1]);
  const lat2 = toRad(to[1]);
  
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
};

// ==========================================
// ANIMATED MARKER COMPONENT
// ==========================================

const AnimatedMarker: React.FC<MarkerAnimationProps> = ({
  marker,
  frame,
  fps,
  mapWidth,
  mapHeight,
  mapCenter,
  mapZoom,
}) => {
  const entryDelay = marker.entryDelay || 0;
  const delayedFrame = Math.max(0, frame - entryDelay);
  
  // Spring animation for entry with bounce
  const scale = spring({
    frame: delayedFrame,
    fps,
    config: { damping: 12, stiffness: 100, mass: 0.8 },
  });

  // Pulse animation after entry
  const pulsePhase = Math.max(0, frame - entryDelay - 15);
  const pulse = pulsePhase > 0 ? 1 + Math.sin(pulsePhase * 0.15) * 0.05 : 1;

  // Calculate pixel position
  const position = geoToPixel(
    marker.coordinates,
    mapCenter,
    mapZoom,
    mapWidth,
    mapHeight
  );

  if (frame < entryDelay) return null;

  // Check if marker is visible on screen
  if (position.x < -50 || position.x > mapWidth + 50 || 
      position.y < -50 || position.y > mapHeight + 50) {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        transform: `translate(-50%, -100%) scale(${scale * pulse})`,
        transformOrigin: 'bottom center',
        filter: `drop-shadow(0 4px 8px rgba(0,0,0,0.3))`,
      }}
    >
      {marker.iconUrl ? (
        <Img src={marker.iconUrl} style={{ width: 40, height: 40 }} />
      ) : (
        <svg width="32" height="44" viewBox="0 0 32 44" fill="none">
          <defs>
            <linearGradient id={`marker-gradient-${marker.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={marker.color || '#3B82F6'} />
              <stop offset="100%" stopColor={marker.color ? adjustColor(marker.color, -30) : '#2563EB'} />
            </linearGradient>
            <filter id={`marker-shadow-${marker.id}`} x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.3" />
            </filter>
          </defs>
          <path
            d="M16 0C7.164 0 0 7.164 0 16c0 12 16 28 16 28s16-16 16-28c0-8.836-7.164-16-16-16z"
            fill={`url(#marker-gradient-${marker.id})`}
            filter={`url(#marker-shadow-${marker.id})`}
          />
          <circle cx="16" cy="14" r="6" fill="white" opacity="0.9" />
        </svg>
      )}
      {marker.label && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginTop: 8,
            padding: '4px 10px',
            backgroundColor: 'rgba(0,0,0,0.85)',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            color: 'white',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          {marker.label}
        </div>
      )}
    </div>
  );
};

// Helper to adjust color brightness
const adjustColor = (hex: string, amount: number): string => {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
};

// ==========================================
// ROUTE LINE OVERLAY
// ==========================================

interface RouteLineProps {
  route: [number, number][];
  progress: number;
  mapCenter: [number, number];
  mapZoom: number;
  mapWidth: number;
  mapHeight: number;
  strokeColor?: string;
  strokeWidth?: number;
  showDot?: boolean;
  dotColor?: string;
}

const RouteLine: React.FC<RouteLineProps> = ({
  route,
  progress,
  mapCenter,
  mapZoom,
  mapWidth,
  mapHeight,
  strokeColor = '#3B82F6',
  strokeWidth = 4,
  showDot = true,
  dotColor = '#EF4444',
}) => {
  // Convert all route points to pixels
  const pixelPoints = route.map(point => 
    geoToPixel(point, mapCenter, mapZoom, mapWidth, mapHeight)
  );

  // Calculate total path length
  let totalLength = 0;
  const segmentLengths: number[] = [];
  for (let i = 1; i < pixelPoints.length; i++) {
    const dx = pixelPoints[i].x - pixelPoints[i-1].x;
    const dy = pixelPoints[i].y - pixelPoints[i-1].y;
    const length = Math.sqrt(dx * dx + dy * dy);
    segmentLengths.push(length);
    totalLength += length;
  }

  // Create path string
  const pathD = pixelPoints
    .map((point, i) => `${i === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');

  // Calculate current position along path
  const drawnLength = totalLength * progress;
  let currentPos = pixelPoints[0];
  let accumulatedLength = 0;
  
  for (let i = 0; i < segmentLengths.length; i++) {
    if (accumulatedLength + segmentLengths[i] >= drawnLength) {
      const segmentProgress = (drawnLength - accumulatedLength) / segmentLengths[i];
      currentPos = {
        x: pixelPoints[i].x + (pixelPoints[i+1].x - pixelPoints[i].x) * segmentProgress,
        y: pixelPoints[i].y + (pixelPoints[i+1].y - pixelPoints[i].y) * segmentProgress,
      };
      break;
    }
    accumulatedLength += segmentLengths[i];
    currentPos = pixelPoints[i + 1];
  }

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
      }}
      viewBox={`0 0 ${mapWidth} ${mapHeight}`}
    >
      <defs>
        <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.9" />
          <stop offset="100%" stopColor={adjustColor(strokeColor, 40)} stopOpacity="0.9" />
        </linearGradient>
        <filter id="routeGlow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* Background path (shadow) */}
      <path
        d={pathD}
        stroke="rgba(0,0,0,0.2)"
        strokeWidth={strokeWidth + 4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={`${drawnLength} ${totalLength}`}
      />
      
      {/* Main path */}
      <path
        d={pathD}
        stroke="url(#routeGradient)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={`${drawnLength} ${totalLength}`}
        filter="url(#routeGlow)"
      />
      
      {/* Current position dot */}
      {showDot && progress > 0 && (
        <>
          <circle
            cx={currentPos.x}
            cy={currentPos.y}
            r={strokeWidth * 2 + 4}
            fill="white"
            opacity="0.9"
          />
          <circle
            cx={currentPos.x}
            cy={currentPos.y}
            r={strokeWidth * 2}
            fill={dotColor}
          />
          {/* Pulse effect */}
          <circle
            cx={currentPos.x}
            cy={currentPos.y}
            r={strokeWidth * 2 + 8}
            fill="none"
            stroke={dotColor}
            strokeWidth="2"
            opacity={0.5 * (1 - (progress * 10 % 1))}
          />
        </>
      )}
    </svg>
  );
};

// ==========================================
// ANIMATED AIRPLANE COMPONENT
// ==========================================

interface AnimatedAirplaneProps {
  from: [number, number];
  to: [number, number];
  progress: number;
  frame: number;
  fps: number;
  mapCenter: [number, number];
  mapZoom: number;
  mapWidth: number;
  mapHeight: number;
  color?: string;
  size?: number;
  showTrail?: boolean;
  trailColor?: string;
}

const AnimatedAirplane: React.FC<AnimatedAirplaneProps> = ({
  from,
  to,
  progress,
  frame,
  fps,
  mapCenter,
  mapZoom,
  mapWidth,
  mapHeight,
  color = '#FFFFFF',
  size = 48,
  showTrail = true,
  trailColor = '#3B82F6',
}) => {
  // Calculate current position along great circle path
  const distance = Math.sqrt(
    Math.pow(to[0] - from[0], 2) + Math.pow(to[1] - from[1], 2)
  );
  
  const currentGeoPos = distance > 10 
    ? greatCircleInterpolate(from, to, progress)
    : interpolateCoordinates(from, to, progress, cinematicEasing.smooth);
  
  // Convert to pixel position
  const currentPos = geoToPixel(currentGeoPos, mapCenter, mapZoom, mapWidth, mapHeight);
  
  // Calculate bearing for rotation
  const nextProgress = Math.min(1, progress + 0.01);
  const nextGeoPos = distance > 10
    ? greatCircleInterpolate(from, to, nextProgress)
    : interpolateCoordinates(from, to, nextProgress, cinematicEasing.smooth);
  
  const bearing = calculateBearing(currentGeoPos, nextGeoPos);
  
  // Entry/exit animations
  const entryScale = spring({
    frame: Math.min(frame, 20),
    fps,
    config: { damping: 15, stiffness: 100 },
  });
  
  const exitProgress = progress > 0.9 ? (progress - 0.9) / 0.1 : 0;
  const exitScale = 1 - exitProgress * 0.5;
  
  const scale = entryScale * exitScale;
  
  // Slight bobbing motion for realism
  const bob = Math.sin(frame * 0.3) * 2;
  
  // Generate trail points
  const trailPoints: { x: number; y: number; opacity: number }[] = [];
  if (showTrail && progress > 0.02) {
    const trailLength = 15;
    for (let i = 0; i < trailLength; i++) {
      const trailProgress = Math.max(0, progress - (i * 0.015));
      const trailGeoPos = distance > 10
        ? greatCircleInterpolate(from, to, trailProgress)
        : interpolateCoordinates(from, to, trailProgress, cinematicEasing.smooth);
      const trailPixelPos = geoToPixel(trailGeoPos, mapCenter, mapZoom, mapWidth, mapHeight);
      trailPoints.push({
        x: trailPixelPos.x,
        y: trailPixelPos.y,
        opacity: 1 - (i / trailLength),
      });
    }
  }

  // Don't render if plane is off-screen
  if (currentPos.x < -100 || currentPos.x > mapWidth + 100 ||
      currentPos.y < -100 || currentPos.y > mapHeight + 100) {
    return null;
  }

  return (
    <>
      {/* Contrail / Flight path trail */}
      {showTrail && trailPoints.length > 1 && (
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 5,
          }}
          viewBox={`0 0 ${mapWidth} ${mapHeight}`}
        >
          <defs>
            <linearGradient id="trailGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={trailColor} stopOpacity="0" />
              <stop offset="100%" stopColor={trailColor} stopOpacity="0.8" />
            </linearGradient>
            <filter id="trailGlow">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          
          {/* Dashed flight path line */}
          <path
            d={`M ${trailPoints.map(p => `${p.x},${p.y}`).join(' L ')}`}
            stroke={trailColor}
            strokeWidth="3"
            strokeDasharray="8,6"
            fill="none"
            opacity="0.6"
            filter="url(#trailGlow)"
          />
          
          {/* Contrail dots */}
          {trailPoints.slice(0, 8).map((point, i) => (
            <circle
              key={i}
              cx={point.x}
              cy={point.y}
              r={Math.max(1, 4 - i * 0.4)}
              fill="white"
              opacity={point.opacity * 0.5}
            />
          ))}
        </svg>
      )}

      {/* Airplane */}
      <div
        style={{
          position: 'absolute',
          left: currentPos.x,
          top: currentPos.y + bob,
          transform: `translate(-50%, -50%) rotate(${bearing - 90}deg) scale(${scale})`,
          transformOrigin: 'center',
          zIndex: 10,
          filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))',
        }}
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Airplane body */}
          <defs>
            <linearGradient id="planeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={color} />
              <stop offset="100%" stopColor={adjustColor(color, -40)} />
            </linearGradient>
            <filter id="planeShadow">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.3" />
            </filter>
          </defs>
          
          {/* Main body */}
          <ellipse
            cx="32"
            cy="32"
            rx="24"
            ry="8"
            fill="url(#planeGradient)"
            filter="url(#planeShadow)"
          />
          
          {/* Nose */}
          <path
            d="M56 32 L64 32 L56 32 C58 30 58 34 56 32Z"
            fill={color}
          />
          <ellipse cx="58" cy="32" rx="6" ry="4" fill={color} />
          
          {/* Cockpit window */}
          <ellipse cx="52" cy="32" rx="4" ry="3" fill="#1E3A5F" opacity="0.8" />
          
          {/* Wings */}
          <path
            d="M20 32 L32 8 L36 8 L32 32 L36 56 L32 56 Z"
            fill={color}
            filter="url(#planeShadow)"
          />
          
          {/* Wing detail */}
          <path
            d="M24 32 L32 14 L34 14 L30 32 L34 50 L32 50 Z"
            fill={adjustColor(color, -20)}
          />
          
          {/* Tail */}
          <path
            d="M8 32 L16 22 L18 22 L16 32 L18 42 L16 42 Z"
            fill={color}
            filter="url(#planeShadow)"
          />
          
          {/* Tail fin */}
          <path
            d="M10 32 L10 20 L14 20 L14 32 Z"
            fill={color}
          />
          
          {/* Engine glow */}
          <circle cx="10" cy="32" r="3" fill="#FF6B35" opacity="0.7" />
          <circle cx="10" cy="32" r="2" fill="#FFD93D" opacity="0.9" />
        </svg>
      </div>

      {/* Origin and destination markers */}
      {progress < 0.1 && (
        <div
          style={{
            position: 'absolute',
            ...geoToPixel(from, mapCenter, mapZoom, mapWidth, mapHeight),
            transform: 'translate(-50%, -50%)',
            zIndex: 4,
          }}
        >
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              backgroundColor: '#22C55E',
              border: '3px solid white',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
          />
        </div>
      )}
      
      {progress > 0.9 && (
        <div
          style={{
            position: 'absolute',
            ...geoToPixel(to, mapCenter, mapZoom, mapWidth, mapHeight),
            transform: 'translate(-50%, -50%)',
            zIndex: 4,
          }}
        >
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              backgroundColor: '#EF4444',
              border: '3px solid white',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              animation: 'pulse 1s infinite',
            }}
          />
        </div>
      )}
    </>
  );
};

// ==========================================
// TEXT OVERLAY COMPONENT
// ==========================================

interface LocationLabelProps {
  text: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  frame: number;
  fps: number;
  style?: 'modern' | 'classic' | 'minimal';
}

const LocationLabel: React.FC<LocationLabelProps> = ({
  text,
  position,
  frame,
  fps,
  style = 'modern',
}) => {
  const entryProgress = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 80 },
  });

  const positionStyles: Record<string, React.CSSProperties> = {
    'top-left': { top: 24, left: 24 },
    'top-right': { top: 24, right: 24 },
    'bottom-left': { bottom: 24, left: 24 },
    'bottom-right': { bottom: 24, right: 24 },
    'center': { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
  };

  const styleVariants = {
    modern: {
      backgroundColor: 'rgba(0,0,0,0.8)',
      color: 'white',
      padding: '12px 20px',
      borderRadius: 8,
      fontSize: 18,
      fontWeight: 600,
      fontFamily: 'Inter, system-ui, sans-serif',
      backdropFilter: 'blur(8px)',
    },
    classic: {
      backgroundColor: 'white',
      color: '#1a1a1a',
      padding: '10px 18px',
      borderRadius: 4,
      fontSize: 16,
      fontWeight: 500,
      fontFamily: 'Georgia, serif',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    },
    minimal: {
      backgroundColor: 'transparent',
      color: 'white',
      padding: '8px 0',
      fontSize: 14,
      fontWeight: 500,
      fontFamily: 'Inter, system-ui, sans-serif',
      textShadow: '0 2px 4px rgba(0,0,0,0.5)',
    },
  };

  return (
    <div
      style={{
        position: 'absolute',
        ...positionStyles[position],
        ...styleVariants[style],
        opacity: entryProgress,
        transform: position === 'center' 
          ? `translate(-50%, -50%) scale(${interpolate(entryProgress, [0, 1], [0.9, 1])})`
          : `translateY(${interpolate(entryProgress, [0, 1], [10, 0])}px)`,
      }}
    >
      {text}
    </div>
  );
};

// ==========================================
// MAIN COMPONENT
// ==========================================

export const MapboxAnimation: React.FC<MapboxAnimationProps> = ({
  config,
  width,
  height,
  durationInFrames,
  accessToken = DEFAULT_ACCESS_TOKEN,
  style: containerStyle,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Calculate animation progress with easing
  const animationDuration = config.animationDuration || durationInFrames;
  const rawProgress = Math.min(1, frame / animationDuration);
  
  // Apply cinematic easing based on animation type
  const getEasedProgress = (type: string) => {
    switch (type) {
      case 'flyTo':
        return cinematicEasing.dramatic(rawProgress);
      case 'zoom':
        return cinematicEasing.gentle(rawProgress);
      case 'route':
        return cinematicEasing.smooth(rawProgress);
      default:
        return rawProgress;
    }
  };

  const progress = getEasedProgress(config.animationType);

  // Calculate current map state based on animation type
  const currentState = useMemo(() => {
    switch (config.animationType) {
      case 'flyTo': {
        const destination = config.flyToDestination || config.center;
        const destZoom = config.flyToZoom ?? config.zoom;
        const startZoom = config.zoom;
        
        // Use great circle interpolation for long-distance flights
        const distance = Math.sqrt(
          Math.pow(destination[0] - config.center[0], 2) +
          Math.pow(destination[1] - config.center[1], 2)
        );
        
        let currentCenter: [number, number];
        if (distance > 10) {
          // Long distance - use great circle
          currentCenter = greatCircleInterpolate(config.center, destination, progress);
        } else {
          // Short distance - linear interpolation
          currentCenter = interpolateCoordinates(config.center, destination, progress);
        }

        // Zoom out then in during flight (parabolic curve)
        const midZoom = Math.min(startZoom, destZoom) - Math.min(4, distance * 0.3);
        const zoomProgress = progress < 0.5
          ? interpolate(progress, [0, 0.5], [startZoom, midZoom])
          : interpolate(progress, [0.5, 1], [midZoom, destZoom]);

        // Calculate bearing towards destination
        const bearing = progress < 0.8 
          ? calculateBearing(currentCenter, destination) 
          : config.bearing || 0;

        // Pitch changes during flight
        const pitch = interpolate(progress, [0, 0.3, 0.7, 1], [
          config.pitch || 0,
          60,
          60,
          config.pitch || 0
        ]);

        return {
          center: currentCenter,
          zoom: zoomProgress,
          bearing: interpolate(progress, [0, 1], [config.bearing || 0, bearing]),
          pitch,
        };
      }

      case 'route': {
        if (!config.route || config.route.length < 2) {
          return { center: config.center, zoom: config.zoom };
        }

        // Calculate position along route
        const totalPoints = config.route.length;
        const currentIndex = Math.floor(progress * (totalPoints - 1));
        const nextIndex = Math.min(currentIndex + 1, totalPoints - 1);
        const segmentProgress = (progress * (totalPoints - 1)) % 1;

        const currentPoint = config.route[currentIndex];
        const nextPoint = config.route[nextIndex];
        
        // Smooth interpolation between points
        const easedSegmentProgress = cinematicEasing.smooth(segmentProgress);
        const center = interpolateCoordinates(currentPoint, nextPoint, easedSegmentProgress);

        // Calculate bearing for route direction
        const bearing = calculateBearing(currentPoint, nextPoint);

        return {
          center,
          zoom: config.zoom,
          bearing: config.bearing ?? bearing,
          pitch: config.pitch || 45,
        };
      }

      case 'zoom': {
        const destZoom = config.flyToZoom ?? (config.zoom + 4);
        const zoomProgress = interpolate(
          cinematicEasing.gentle(progress),
          [0, 1],
          [config.zoom, destZoom]
        );
        
        // Slight drift during zoom for more dynamic feel
        const drift: [number, number] = [
          config.center[0] + Math.sin(progress * Math.PI) * 0.001,
          config.center[1] + Math.cos(progress * Math.PI) * 0.001,
        ];

        return {
          center: drift,
          zoom: zoomProgress,
          bearing: config.bearing,
          pitch: interpolate(progress, [0, 0.5, 1], [0, 30, config.pitch || 0]),
        };
      }

      case 'pan': {
        const destination = config.flyToDestination || config.center;
        return {
          center: interpolateCoordinates(config.center, destination, progress, cinematicEasing.smooth),
          zoom: config.zoom,
          bearing: config.bearing,
          pitch: config.pitch,
        };
      }

      case 'markers':
      case 'static':
      default:
        return {
          center: config.center,
          zoom: config.zoom,
          bearing: config.bearing,
          pitch: config.pitch,
        };
    }
  }, [config, progress]);

  // Generate map URL
  const mapUrl = useMemo(() => {
    if (!accessToken) {
      console.warn('Mapbox access token not configured');
      return '';
    }

    // For route animations, include the full path on the map
    const pathForUrl = config.animationType === 'route' && config.route 
      ? config.route.slice(0, Math.ceil(config.route.length * progress) + 1)
      : undefined;

    // For markers animation, don't include markers in URL (we animate them separately)
    const markersForUrl = config.animationType === 'markers' ? undefined : config.markers;
    
    return generateMapboxUrl(
      currentState.center,
      currentState.zoom,
      width,
      height,
      config.style,
      accessToken,
      {
        pitch: currentState.pitch,
        bearing: currentState.bearing,
        markers: markersForUrl,
        path: pathForUrl,
        pathColor: '#3B82F6',
        pathWidth: 4,
      }
    );
  }, [currentState, width, height, config, accessToken, progress]);

  // If no access token, show placeholder
  if (!accessToken) {
    return (
      <div
        style={{
          width,
          height,
          backgroundColor: '#1a1a2e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 12,
          ...containerStyle,
        }}
      >
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#4a5568" strokeWidth="1.5">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        <span style={{ color: '#718096', fontSize: 16, fontWeight: 500 }}>
          Mapbox Access Token Required
        </span>
        <span style={{ color: '#4a5568', fontSize: 13, maxWidth: 280, textAlign: 'center' }}>
          Set VITE_MAPBOX_ACCESS_TOKEN in your environment variables
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        overflow: 'hidden',
        backgroundColor: '#1a1a2e',
        ...containerStyle,
      }}
    >
      {/* Map image */}
      <Img
        src={mapUrl}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />

      {/* Route line overlay */}
      {config.animationType === 'route' && config.route && config.route.length > 1 && (
        <RouteLine
          route={config.route}
          progress={progress}
          mapCenter={currentState.center}
          mapZoom={currentState.zoom}
          mapWidth={width}
          mapHeight={height}
          strokeColor="#3B82F6"
          strokeWidth={4}
          showDot={true}
          dotColor="#EF4444"
        />
      )}

      {/* Animated airplane for flyTo */}
      {config.animationType === 'flyTo' && config.flyToDestination && config.showAirplane !== false && (
        <AnimatedAirplane
          from={config.center}
          to={config.flyToDestination}
          progress={progress}
          frame={frame}
          fps={fps}
          mapCenter={currentState.center}
          mapZoom={currentState.zoom}
          mapWidth={width}
          mapHeight={height}
          color={config.airplaneColor || '#FFFFFF'}
          size={config.airplaneSize || 48}
          showTrail={config.showFlightPath !== false}
          trailColor={config.flightPathColor || '#3B82F6'}
        />
      )}

      {/* Animated markers overlay */}
      {config.animationType === 'markers' && config.markers && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
          }}
        >
          {config.markers.map((marker) => (
            <AnimatedMarker
              key={marker.id}
              marker={marker}
              frame={frame}
              fps={fps}
              mapWidth={width}
              mapHeight={height}
              mapCenter={currentState.center}
              mapZoom={currentState.zoom}
            />
          ))}
        </div>
      )}

      {/* Reveal overlay for reveal animation */}
      {config.animationType === 'reveal' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(circle at center, transparent ${progress * 150}%, black ${progress * 150 + 5}%)`,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Vignette effect for cinematic look */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.3) 100%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};

export default MapboxAnimation;
