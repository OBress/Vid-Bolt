/**
 * Map Animation Templates
 * 
 * Professional location-based motion graphics for documentaries,
 * travel videos, news reports, and informational content.
 * 
 * Uses Mapbox Static Images API with enhanced animation support.
 */

import { MotionGraphicsTemplate, MotionGraphicsCategory, MapboxConfig } from '../../types/motion-graphics';

export const mapAnimationTemplates: MotionGraphicsTemplate[] = [
  // ==========================================
  // DOCUMENTARY & NEWS STYLE
  // ==========================================
  {
    id: 'map-documentary-reveal',
    name: 'Documentary Location Reveal',
    description: 'Cinematic zoom into a location with dramatic pacing - perfect for documentaries',
    category: MotionGraphicsCategory.MAP_ANIMATION,
    tags: ['map', 'documentary', 'reveal', 'zoom', 'cinematic', 'professional'],
    duration: 150, // 5 seconds at 30fps
    isBuiltIn: true,
    editableProperties: [
      {
        id: 'locationName',
        label: 'Location Name',
        type: 'text',
        value: 'Amazon Rainforest',
        defaultValue: 'Amazon Rainforest',
        group: 'Content',
      },
      {
        id: 'coordinates',
        label: 'Coordinates',
        type: 'location',
        value: [-62.2159, -3.4653],
        defaultValue: [-62.2159, -3.4653],
        description: 'Longitude, Latitude',
        group: 'Location',
      },
      {
        id: 'startZoom',
        label: 'Start Zoom',
        type: 'number',
        value: 3,
        defaultValue: 3,
        min: 1,
        max: 18,
        group: 'Animation',
      },
      {
        id: 'endZoom',
        label: 'End Zoom',
        type: 'number',
        value: 12,
        defaultValue: 12,
        min: 1,
        max: 18,
        group: 'Animation',
      },
      {
        id: 'mapStyle',
        label: 'Map Style',
        type: 'select',
        value: 'satellite-streets-v12',
        defaultValue: 'satellite-streets-v12',
        options: [
          { label: 'Satellite with Streets', value: 'satellite-streets-v12' },
          { label: 'Satellite Only', value: 'satellite-v9' },
          { label: 'Dark Mode', value: 'dark-v11' },
          { label: 'Light Mode', value: 'light-v11' },
          { label: 'Outdoors', value: 'outdoors-v12' },
        ],
        group: 'Style',
      },
    ],
    mapboxConfig: {
      center: [-62.2159, -3.4653],
      zoom: 3,
      style: 'satellite-streets-v12',
      animationType: 'zoom',
      flyToZoom: 12,
      pitch: 45,
      animationDuration: 120,
    },
    remotionCode: `MapboxAnimation`,
  },
  {
    id: 'map-news-location',
    name: 'News Report Location',
    description: 'Quick location establishing shot for news segments',
    category: MotionGraphicsCategory.MAP_ANIMATION,
    tags: ['map', 'news', 'broadcast', 'location', 'fast'],
    duration: 90, // 3 seconds
    isBuiltIn: true,
    editableProperties: [
      {
        id: 'locationName',
        label: 'Location',
        type: 'text',
        value: 'Washington D.C.',
        defaultValue: 'Washington D.C.',
        group: 'Content',
      },
      {
        id: 'coordinates',
        label: 'Coordinates',
        type: 'location',
        value: [-77.0369, 38.9072],
        defaultValue: [-77.0369, 38.9072],
        group: 'Location',
      },
      {
        id: 'mapStyle',
        label: 'Style',
        type: 'select',
        value: 'dark-v11',
        defaultValue: 'dark-v11',
        options: [
          { label: 'Dark', value: 'dark-v11' },
          { label: 'Light', value: 'light-v11' },
          { label: 'Streets', value: 'streets-v12' },
        ],
        group: 'Style',
      },
      {
        id: 'markerColor',
        label: 'Marker Color',
        type: 'color',
        value: '#EF4444',
        defaultValue: '#EF4444',
        group: 'Style',
      },
    ],
    mapboxConfig: {
      center: [-77.0369, 38.9072],
      zoom: 4,
      style: 'dark-v11',
      animationType: 'zoom',
      flyToZoom: 11,
      animationDuration: 60,
      markers: [
        {
          id: 'location-marker',
          coordinates: [-77.0369, 38.9072],
          label: 'Washington D.C.',
          color: '#EF4444',
          entryDelay: 30,
        },
      ],
    },
    remotionCode: `MapboxAnimation`,
  },

  // ==========================================
  // TRAVEL & JOURNEY STYLE
  // ==========================================
  {
    id: 'map-epic-journey',
    name: 'Epic Journey Flight',
    description: 'Cinematic flight between two locations with animated airplane following the great circle path',
    category: MotionGraphicsCategory.MAP_ANIMATION,
    tags: ['map', 'flight', 'journey', 'travel', 'epic', 'cinematic', 'airplane'],
    duration: 180, // 6 seconds
    isBuiltIn: true,
    editableProperties: [
      {
        id: 'startLocation',
        label: 'Start Location',
        type: 'location',
        value: [-73.9857, 40.7484], // NYC
        defaultValue: [-73.9857, 40.7484],
        description: 'New York City',
        group: 'Journey',
      },
      {
        id: 'endLocation',
        label: 'End Location',
        type: 'location',
        value: [139.6917, 35.6895], // Tokyo
        defaultValue: [139.6917, 35.6895],
        description: 'Tokyo',
        group: 'Journey',
      },
      {
        id: 'mapStyle',
        label: 'Map Style',
        type: 'select',
        value: 'satellite-v9',
        defaultValue: 'satellite-v9',
        options: [
          { label: 'Satellite', value: 'satellite-v9' },
          { label: 'Dark Globe', value: 'dark-v11' },
          { label: 'Light Globe', value: 'light-v11' },
        ],
        group: 'Style',
      },
      {
        id: 'showAirplane',
        label: 'Show Airplane',
        type: 'boolean',
        value: true,
        defaultValue: true,
        description: 'Display animated airplane icon',
        group: 'Airplane',
      },
      {
        id: 'airplaneColor',
        label: 'Airplane Color',
        type: 'color',
        value: '#FFFFFF',
        defaultValue: '#FFFFFF',
        group: 'Airplane',
      },
      {
        id: 'airplaneSize',
        label: 'Airplane Size',
        type: 'number',
        value: 48,
        defaultValue: 48,
        min: 24,
        max: 96,
        step: 4,
        group: 'Airplane',
      },
      {
        id: 'showFlightPath',
        label: 'Show Flight Path',
        type: 'boolean',
        value: true,
        defaultValue: true,
        description: 'Display dashed flight path trail',
        group: 'Airplane',
      },
      {
        id: 'flightPathColor',
        label: 'Flight Path Color',
        type: 'color',
        value: '#3B82F6',
        defaultValue: '#3B82F6',
        group: 'Airplane',
      },
    ],
    mapboxConfig: {
      center: [-73.9857, 40.7484],
      zoom: 4,
      style: 'satellite-v9',
      animationType: 'flyTo',
      flyToDestination: [139.6917, 35.6895],
      flyToZoom: 4,
      pitch: 60,
      animationDuration: 150,
      showAirplane: true,
      airplaneColor: '#FFFFFF',
      airplaneSize: 48,
      showFlightPath: true,
      flightPathColor: '#3B82F6',
    },
    remotionCode: `MapboxAnimation`,
  },
  {
    id: 'map-road-trip',
    name: 'Road Trip Route',
    description: 'Animated route following a road trip path with dynamic tracking',
    category: MotionGraphicsCategory.MAP_ANIMATION,
    tags: ['map', 'route', 'road-trip', 'journey', 'travel', 'adventure'],
    duration: 240, // 8 seconds
    isBuiltIn: true,
    editableProperties: [
      {
        id: 'tripName',
        label: 'Trip Name',
        type: 'text',
        value: 'Pacific Coast Highway',
        defaultValue: 'Pacific Coast Highway',
        group: 'Content',
      },
      {
        id: 'mapStyle',
        label: 'Map Style',
        type: 'select',
        value: 'outdoors-v12',
        defaultValue: 'outdoors-v12',
        options: [
          { label: 'Outdoors', value: 'outdoors-v12' },
          { label: 'Streets', value: 'streets-v12' },
          { label: 'Satellite Streets', value: 'satellite-streets-v12' },
        ],
        group: 'Style',
      },
      {
        id: 'routeColor',
        label: 'Route Color',
        type: 'color',
        value: '#F59E0B',
        defaultValue: '#F59E0B',
        group: 'Style',
      },
    ],
    mapboxConfig: {
      center: [-122.4194, 37.7749],
      zoom: 9,
      style: 'outdoors-v12',
      animationType: 'route',
      pitch: 50,
      route: [
        [-122.4194, 37.7749], // San Francisco
        [-122.4786, 37.8199], // Golden Gate
        [-122.5194, 37.8954], // Sausalito
        [-122.8489, 38.0297], // Point Reyes
        [-123.0094, 38.3119], // Bodega Bay
        [-123.4694, 38.7949], // Mendocino
      ],
      animationDuration: 200,
    },
    remotionCode: `MapboxAnimation`,
  },
  {
    id: 'map-expedition-route',
    name: 'Expedition Route',
    description: 'Multi-stop expedition route with waypoint markers',
    category: MotionGraphicsCategory.MAP_ANIMATION,
    tags: ['map', 'expedition', 'adventure', 'documentary', 'exploration'],
    duration: 300, // 10 seconds
    isBuiltIn: true,
    editableProperties: [
      {
        id: 'expeditionName',
        label: 'Expedition Name',
        type: 'text',
        value: 'Himalayan Trek',
        defaultValue: 'Himalayan Trek',
        group: 'Content',
      },
      {
        id: 'mapStyle',
        label: 'Map Style',
        type: 'select',
        value: 'outdoors-v12',
        defaultValue: 'outdoors-v12',
        options: [
          { label: 'Outdoors', value: 'outdoors-v12' },
          { label: 'Satellite', value: 'satellite-v9' },
          { label: 'Terrain', value: 'satellite-streets-v12' },
        ],
        group: 'Style',
      },
    ],
    mapboxConfig: {
      center: [86.925, 27.988],
      zoom: 8,
      style: 'outdoors-v12',
      animationType: 'route',
      pitch: 60,
      route: [
        [86.7139, 27.6872], // Lukla
        [86.7322, 27.7378], // Phakding
        [86.7108, 27.7875], // Namche Bazaar
        [86.7631, 27.8558], // Tengboche
        [86.7925, 27.9017], // Dingboche
        [86.8528, 27.9503], // Lobuche
        [86.8528, 27.9881], // Gorak Shep
        [86.925, 27.988],   // Everest Base Camp
      ],
      markers: [
        { id: 'start', coordinates: [86.7139, 27.6872], label: 'Lukla', color: '#22C55E', entryDelay: 0 },
        { id: 'namche', coordinates: [86.7108, 27.7875], label: 'Namche', color: '#3B82F6', entryDelay: 60 },
        { id: 'tengboche', coordinates: [86.7631, 27.8558], label: 'Tengboche', color: '#3B82F6', entryDelay: 120 },
        { id: 'ebc', coordinates: [86.925, 27.988], label: 'Base Camp', color: '#EF4444', entryDelay: 240 },
      ],
      animationDuration: 260,
    },
    remotionCode: `MapboxAnimation`,
  },

  // ==========================================
  // DATA & INFORMATION STYLE
  // ==========================================
  {
    id: 'map-global-locations',
    name: 'Global Locations',
    description: 'Animated markers showing multiple locations worldwide',
    category: MotionGraphicsCategory.MAP_ANIMATION,
    tags: ['map', 'global', 'markers', 'worldwide', 'corporate', 'offices'],
    duration: 180, // 6 seconds
    isBuiltIn: true,
    editableProperties: [
      {
        id: 'title',
        label: 'Title',
        type: 'text',
        value: 'Our Global Presence',
        defaultValue: 'Our Global Presence',
        group: 'Content',
      },
      {
        id: 'mapStyle',
        label: 'Map Style',
        type: 'select',
        value: 'dark-v11',
        defaultValue: 'dark-v11',
        options: [
          { label: 'Dark', value: 'dark-v11' },
          { label: 'Light', value: 'light-v11' },
          { label: 'Streets', value: 'streets-v12' },
        ],
        group: 'Style',
      },
      {
        id: 'markerColor',
        label: 'Marker Color',
        type: 'color',
        value: '#3B82F6',
        defaultValue: '#3B82F6',
        group: 'Style',
      },
    ],
    mapboxConfig: {
      center: [0, 20],
      zoom: 1.5,
      style: 'dark-v11',
      animationType: 'markers',
      markers: [
        { id: 'nyc', coordinates: [-74.006, 40.7128], label: 'New York', color: '#3B82F6', entryDelay: 0 },
        { id: 'london', coordinates: [-0.1276, 51.5074], label: 'London', color: '#3B82F6', entryDelay: 20 },
        { id: 'tokyo', coordinates: [139.6917, 35.6895], label: 'Tokyo', color: '#3B82F6', entryDelay: 40 },
        { id: 'sydney', coordinates: [151.2093, -33.8688], label: 'Sydney', color: '#3B82F6', entryDelay: 60 },
        { id: 'dubai', coordinates: [55.2708, 25.2048], label: 'Dubai', color: '#3B82F6', entryDelay: 80 },
        { id: 'singapore', coordinates: [103.8198, 1.3521], label: 'Singapore', color: '#3B82F6', entryDelay: 100 },
      ],
      animationDuration: 150,
    },
    remotionCode: `MapboxAnimation`,
  },
  {
    id: 'map-region-focus',
    name: 'Regional Focus',
    description: 'Zoom into a specific region with multiple points of interest',
    category: MotionGraphicsCategory.MAP_ANIMATION,
    tags: ['map', 'region', 'focus', 'zoom', 'informational'],
    duration: 150,
    isBuiltIn: true,
    editableProperties: [
      {
        id: 'regionName',
        label: 'Region Name',
        type: 'text',
        value: 'Silicon Valley',
        defaultValue: 'Silicon Valley',
        group: 'Content',
      },
      {
        id: 'coordinates',
        label: 'Center Point',
        type: 'location',
        value: [-122.0838, 37.3861],
        defaultValue: [-122.0838, 37.3861],
        group: 'Location',
      },
      {
        id: 'mapStyle',
        label: 'Map Style',
        type: 'select',
        value: 'light-v11',
        defaultValue: 'light-v11',
        options: [
          { label: 'Light', value: 'light-v11' },
          { label: 'Dark', value: 'dark-v11' },
          { label: 'Streets', value: 'streets-v12' },
          { label: 'Satellite', value: 'satellite-streets-v12' },
        ],
        group: 'Style',
      },
    ],
    mapboxConfig: {
      center: [-122.0838, 37.3861],
      zoom: 5,
      style: 'light-v11',
      animationType: 'zoom',
      flyToZoom: 10,
      pitch: 30,
      markers: [
        { id: 'sf', coordinates: [-122.4194, 37.7749], label: 'San Francisco', color: '#EF4444', entryDelay: 60 },
        { id: 'mv', coordinates: [-122.0838, 37.3861], label: 'Mountain View', color: '#3B82F6', entryDelay: 75 },
        { id: 'pa', coordinates: [-122.1430, 37.4419], label: 'Palo Alto', color: '#3B82F6', entryDelay: 90 },
        { id: 'sj', coordinates: [-121.8863, 37.3382], label: 'San Jose', color: '#3B82F6', entryDelay: 105 },
      ],
      animationDuration: 120,
    },
    remotionCode: `MapboxAnimation`,
  },

  // ==========================================
  // NATURE & ENVIRONMENT
  // ==========================================
  {
    id: 'map-nature-explore',
    name: 'Nature Exploration',
    description: 'Scenic satellite view for nature documentaries',
    category: MotionGraphicsCategory.MAP_ANIMATION,
    tags: ['map', 'nature', 'satellite', 'documentary', 'environment', 'scenic'],
    duration: 180,
    isBuiltIn: true,
    editableProperties: [
      {
        id: 'locationName',
        label: 'Location',
        type: 'text',
        value: 'Grand Canyon',
        defaultValue: 'Grand Canyon',
        group: 'Content',
      },
      {
        id: 'coordinates',
        label: 'Coordinates',
        type: 'location',
        value: [-112.1401, 36.0544],
        defaultValue: [-112.1401, 36.0544],
        group: 'Location',
      },
      {
        id: 'mapStyle',
        label: 'Map Style',
        type: 'select',
        value: 'satellite-v9',
        defaultValue: 'satellite-v9',
        options: [
          { label: 'Satellite', value: 'satellite-v9' },
          { label: 'Satellite + Labels', value: 'satellite-streets-v12' },
          { label: 'Outdoors', value: 'outdoors-v12' },
        ],
        group: 'Style',
      },
    ],
    mapboxConfig: {
      center: [-112.1401, 36.0544],
      zoom: 6,
      style: 'satellite-v9',
      animationType: 'flyTo',
      flyToDestination: [-112.1401, 36.0544],
      flyToZoom: 13,
      pitch: 60,
      bearing: 45,
      animationDuration: 150,
    },
    remotionCode: `MapboxAnimation`,
  },
  {
    id: 'map-ocean-exploration',
    name: 'Ocean Exploration',
    description: 'Dramatic ocean and coastline reveal',
    category: MotionGraphicsCategory.MAP_ANIMATION,
    tags: ['map', 'ocean', 'marine', 'documentary', 'coastal'],
    duration: 180,
    isBuiltIn: true,
    editableProperties: [
      {
        id: 'locationName',
        label: 'Location',
        type: 'text',
        value: 'Great Barrier Reef',
        defaultValue: 'Great Barrier Reef',
        group: 'Content',
      },
      {
        id: 'coordinates',
        label: 'Coordinates',
        type: 'location',
        value: [146.2583, -16.5000],
        defaultValue: [146.2583, -16.5000],
        group: 'Location',
      },
    ],
    mapboxConfig: {
      center: [146.2583, -16.5000],
      zoom: 4,
      style: 'satellite-v9',
      animationType: 'zoom',
      flyToZoom: 10,
      pitch: 45,
      animationDuration: 150,
    },
    remotionCode: `MapboxAnimation`,
  },

  // ==========================================
  // HISTORICAL & EDUCATIONAL
  // ==========================================
  {
    id: 'map-historical-site',
    name: 'Historical Site Reveal',
    description: 'Dramatic reveal of historical locations',
    category: MotionGraphicsCategory.MAP_ANIMATION,
    tags: ['map', 'history', 'educational', 'documentary', 'heritage'],
    duration: 150,
    isBuiltIn: true,
    editableProperties: [
      {
        id: 'siteName',
        label: 'Site Name',
        type: 'text',
        value: 'Machu Picchu',
        defaultValue: 'Machu Picchu',
        group: 'Content',
      },
      {
        id: 'coordinates',
        label: 'Coordinates',
        type: 'location',
        value: [-72.5450, -13.1631],
        defaultValue: [-72.5450, -13.1631],
        group: 'Location',
      },
      {
        id: 'mapStyle',
        label: 'Map Style',
        type: 'select',
        value: 'satellite-streets-v12',
        defaultValue: 'satellite-streets-v12',
        options: [
          { label: 'Satellite + Streets', value: 'satellite-streets-v12' },
          { label: 'Satellite', value: 'satellite-v9' },
          { label: 'Outdoors', value: 'outdoors-v12' },
        ],
        group: 'Style',
      },
    ],
    mapboxConfig: {
      center: [-72.5450, -13.1631],
      zoom: 5,
      style: 'satellite-streets-v12',
      animationType: 'zoom',
      flyToZoom: 15,
      pitch: 60,
      bearing: -45,
      animationDuration: 120,
      markers: [
        { id: 'site', coordinates: [-72.5450, -13.1631], label: 'Machu Picchu', color: '#F59E0B', entryDelay: 90 },
      ],
    },
    remotionCode: `MapboxAnimation`,
  },

  // ==========================================
  // SIMPLE / UTILITY
  // ==========================================
  {
    id: 'map-simple-location',
    name: 'Simple Location Pin',
    description: 'Clean, simple location marker with subtle animation',
    category: MotionGraphicsCategory.MAP_ANIMATION,
    tags: ['map', 'simple', 'location', 'pin', 'clean'],
    duration: 90,
    isBuiltIn: true,
    editableProperties: [
      {
        id: 'coordinates',
        label: 'Location',
        type: 'location',
        value: [-0.1276, 51.5074],
        defaultValue: [-0.1276, 51.5074],
        description: 'London',
        group: 'Location',
      },
      {
        id: 'zoomLevel',
        label: 'Zoom Level',
        type: 'number',
        value: 12,
        defaultValue: 12,
        min: 1,
        max: 18,
        group: 'View',
      },
      {
        id: 'mapStyle',
        label: 'Map Style',
        type: 'select',
        value: 'light-v11',
        defaultValue: 'light-v11',
        options: [
          { label: 'Light', value: 'light-v11' },
          { label: 'Dark', value: 'dark-v11' },
          { label: 'Streets', value: 'streets-v12' },
          { label: 'Satellite', value: 'satellite-streets-v12' },
        ],
        group: 'Style',
      },
      {
        id: 'markerColor',
        label: 'Pin Color',
        type: 'color',
        value: '#EF4444',
        defaultValue: '#EF4444',
        group: 'Style',
      },
    ],
    mapboxConfig: {
      center: [-0.1276, 51.5074],
      zoom: 12,
      style: 'light-v11',
      animationType: 'static',
      markers: [
        {
          id: 'main-pin',
          coordinates: [-0.1276, 51.5074],
          color: '#EF4444',
          entryDelay: 15,
        },
      ],
    },
    remotionCode: `MapboxAnimation`,
  },
  {
    id: 'map-pan-reveal',
    name: 'Pan & Reveal',
    description: 'Smooth pan across a region revealing the landscape',
    category: MotionGraphicsCategory.MAP_ANIMATION,
    tags: ['map', 'pan', 'reveal', 'landscape', 'scenic'],
    duration: 150,
    isBuiltIn: true,
    editableProperties: [
      {
        id: 'startCoordinates',
        label: 'Start Point',
        type: 'location',
        value: [12.3155, 45.4408], // Venice
        defaultValue: [12.3155, 45.4408],
        group: 'Journey',
      },
      {
        id: 'endCoordinates',
        label: 'End Point',
        type: 'location',
        value: [12.4964, 41.9028], // Rome
        defaultValue: [12.4964, 41.9028],
        group: 'Journey',
      },
      {
        id: 'mapStyle',
        label: 'Map Style',
        type: 'select',
        value: 'satellite-streets-v12',
        defaultValue: 'satellite-streets-v12',
        options: [
          { label: 'Satellite + Streets', value: 'satellite-streets-v12' },
          { label: 'Outdoors', value: 'outdoors-v12' },
          { label: 'Light', value: 'light-v11' },
        ],
        group: 'Style',
      },
    ],
    mapboxConfig: {
      center: [12.3155, 45.4408],
      zoom: 7,
      style: 'satellite-streets-v12',
      animationType: 'pan',
      flyToDestination: [12.4964, 41.9028],
      pitch: 30,
      animationDuration: 120,
    },
    remotionCode: `MapboxAnimation`,
  },
];
