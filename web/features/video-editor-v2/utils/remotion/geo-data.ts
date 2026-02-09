/**
 * Geo Data Module — Pre-loaded world map data for Remotion motion graphics
 * 
 * Provides geographically accurate GeoJSON features from Natural Earth data
 * (via world-atlas TopoJSON) and a curated city database.
 * 
 * All data is loaded at module initialization — no async needed at render time.
 * This is critical for Remotion's deterministic rendering model.
 */

import * as topojson from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';

// Import the TopoJSON data (bundled as JSON)
import worldTopoJSON from 'world-atlas/countries-110m.json';

// ============================================================
// GEOJSON WORLD DATA
// ============================================================

const topology = worldTopoJSON as unknown as Topology<{
  countries: GeometryCollection;
  land: GeometryCollection;
}>;

/**
 * All countries as a GeoJSON FeatureCollection.
 * Each feature has an `id` (ISO 3166-1 numeric country code) and geometry.
 */
export const WorldCountries = topojson.feature(topology, topology.objects.countries);

/**
 * All land masses as a single GeoJSON FeatureCollection (no country borders).
 * Useful for simplified world map outlines.
 */
export const WorldLand = topojson.feature(topology, topology.objects.land);

// ============================================================
// MAJOR CITIES DATABASE
// ============================================================

export interface CityInfo {
  lat: number;
  lng: number;
  country: string;
  /** Population tier: 'mega' (10M+), 'major' (3M+), 'large' (1M+), 'notable' */
  tier: 'mega' | 'major' | 'large' | 'notable';
}

/**
 * Curated database of ~100 major world cities with accurate lat/lng.
 * The AI can reference any city by name to get coordinates.
 */
export const MajorCities: Record<string, CityInfo> = {
  // === NORTH AMERICA ===
  'New York': { lat: 40.7128, lng: -74.0060, country: 'US', tier: 'mega' },
  'Los Angeles': { lat: 34.0522, lng: -118.2437, country: 'US', tier: 'mega' },
  'Chicago': { lat: 41.8781, lng: -87.6298, country: 'US', tier: 'major' },
  'Houston': { lat: 29.7604, lng: -95.3698, country: 'US', tier: 'major' },
  'Phoenix': { lat: 33.4484, lng: -112.0740, country: 'US', tier: 'major' },
  'San Francisco': { lat: 37.7749, lng: -122.4194, country: 'US', tier: 'large' },
  'Miami': { lat: 25.7617, lng: -80.1918, country: 'US', tier: 'large' },
  'Seattle': { lat: 47.6062, lng: -122.3321, country: 'US', tier: 'large' },
  'Boston': { lat: 42.3601, lng: -71.0589, country: 'US', tier: 'large' },
  'Washington DC': { lat: 38.9072, lng: -77.0369, country: 'US', tier: 'large' },
  'Atlanta': { lat: 33.7490, lng: -84.3880, country: 'US', tier: 'large' },
  'Denver': { lat: 39.7392, lng: -104.9903, country: 'US', tier: 'large' },
  'Las Vegas': { lat: 36.1699, lng: -115.1398, country: 'US', tier: 'large' },
  'Dallas': { lat: 32.7767, lng: -96.7970, country: 'US', tier: 'large' },
  'Toronto': { lat: 43.6532, lng: -79.3832, country: 'CA', tier: 'major' },
  'Vancouver': { lat: 49.2827, lng: -123.1207, country: 'CA', tier: 'large' },
  'Montreal': { lat: 45.5017, lng: -73.5673, country: 'CA', tier: 'large' },
  'Mexico City': { lat: 19.4326, lng: -99.1332, country: 'MX', tier: 'mega' },

  // === SOUTH AMERICA ===
  'São Paulo': { lat: -23.5505, lng: -46.6333, country: 'BR', tier: 'mega' },
  'Rio de Janeiro': { lat: -22.9068, lng: -43.1729, country: 'BR', tier: 'major' },
  'Buenos Aires': { lat: -34.6037, lng: -58.3816, country: 'AR', tier: 'mega' },
  'Lima': { lat: -12.0464, lng: -77.0428, country: 'PE', tier: 'mega' },
  'Bogotá': { lat: 4.7110, lng: -74.0721, country: 'CO', tier: 'mega' },
  'Santiago': { lat: -33.4489, lng: -70.6693, country: 'CL', tier: 'major' },

  // === EUROPE ===
  'London': { lat: 51.5074, lng: -0.1278, country: 'GB', tier: 'mega' },
  'Paris': { lat: 48.8566, lng: 2.3522, country: 'FR', tier: 'mega' },
  'Berlin': { lat: 52.5200, lng: 13.4050, country: 'DE', tier: 'major' },
  'Madrid': { lat: 40.4168, lng: -3.7038, country: 'ES', tier: 'major' },
  'Rome': { lat: 41.9028, lng: 12.4964, country: 'IT', tier: 'major' },
  'Amsterdam': { lat: 52.3676, lng: 4.9041, country: 'NL', tier: 'large' },
  'Barcelona': { lat: 41.3851, lng: 2.1734, country: 'ES', tier: 'large' },
  'Munich': { lat: 48.1351, lng: 11.5820, country: 'DE', tier: 'large' },
  'Vienna': { lat: 48.2082, lng: 16.3738, country: 'AT', tier: 'large' },
  'Prague': { lat: 50.0755, lng: 14.4378, country: 'CZ', tier: 'large' },
  'Stockholm': { lat: 59.3293, lng: 18.0686, country: 'SE', tier: 'large' },
  'Copenhagen': { lat: 55.6761, lng: 12.5683, country: 'DK', tier: 'large' },
  'Dublin': { lat: 53.3498, lng: -6.2603, country: 'IE', tier: 'large' },
  'Zurich': { lat: 47.3769, lng: 8.5417, country: 'CH', tier: 'large' },
  'Brussels': { lat: 50.8503, lng: 4.3517, country: 'BE', tier: 'large' },
  'Lisbon': { lat: 38.7223, lng: -9.1393, country: 'PT', tier: 'large' },
  'Athens': { lat: 37.9838, lng: 23.7275, country: 'GR', tier: 'major' },
  'Warsaw': { lat: 52.2297, lng: 21.0122, country: 'PL', tier: 'large' },
  'Oslo': { lat: 59.9139, lng: 10.7522, country: 'NO', tier: 'large' },
  'Helsinki': { lat: 60.1699, lng: 24.9384, country: 'FI', tier: 'large' },
  'Moscow': { lat: 55.7558, lng: 37.6173, country: 'RU', tier: 'mega' },
  'Istanbul': { lat: 41.0082, lng: 28.9784, country: 'TR', tier: 'mega' },

  // === MIDDLE EAST ===
  'Dubai': { lat: 25.2048, lng: 55.2708, country: 'AE', tier: 'major' },
  'Abu Dhabi': { lat: 24.4539, lng: 54.3773, country: 'AE', tier: 'large' },
  'Riyadh': { lat: 24.7136, lng: 46.6753, country: 'SA', tier: 'major' },
  'Tel Aviv': { lat: 32.0853, lng: 34.7818, country: 'IL', tier: 'large' },
  'Doha': { lat: 25.2854, lng: 51.5310, country: 'QA', tier: 'large' },

  // === AFRICA ===
  'Cairo': { lat: 30.0444, lng: 31.2357, country: 'EG', tier: 'mega' },
  'Lagos': { lat: 6.5244, lng: 3.3792, country: 'NG', tier: 'mega' },
  'Johannesburg': { lat: -26.2041, lng: 28.0473, country: 'ZA', tier: 'major' },
  'Cape Town': { lat: -33.9249, lng: 18.4241, country: 'ZA', tier: 'major' },
  'Nairobi': { lat: -1.2921, lng: 36.8219, country: 'KE', tier: 'major' },
  'Casablanca': { lat: 33.5731, lng: -7.5898, country: 'MA', tier: 'major' },
  'Accra': { lat: 5.6037, lng: -0.1870, country: 'GH', tier: 'large' },
  'Addis Ababa': { lat: 8.9806, lng: 38.7578, country: 'ET', tier: 'major' },

  // === SOUTH ASIA ===
  'Mumbai': { lat: 19.0760, lng: 72.8777, country: 'IN', tier: 'mega' },
  'Delhi': { lat: 28.7041, lng: 77.1025, country: 'IN', tier: 'mega' },
  'Bangalore': { lat: 12.9716, lng: 77.5946, country: 'IN', tier: 'mega' },
  'Kolkata': { lat: 22.5726, lng: 88.3639, country: 'IN', tier: 'mega' },
  'Chennai': { lat: 13.0827, lng: 80.2707, country: 'IN', tier: 'major' },

  // === EAST ASIA ===
  'Tokyo': { lat: 35.6762, lng: 139.6503, country: 'JP', tier: 'mega' },
  'Osaka': { lat: 34.6937, lng: 135.5023, country: 'JP', tier: 'major' },
  'Beijing': { lat: 39.9042, lng: 116.4074, country: 'CN', tier: 'mega' },
  'Shanghai': { lat: 31.2304, lng: 121.4737, country: 'CN', tier: 'mega' },
  'Hong Kong': { lat: 22.3193, lng: 114.1694, country: 'HK', tier: 'major' },
  'Shenzhen': { lat: 22.5431, lng: 114.0579, country: 'CN', tier: 'mega' },
  'Guangzhou': { lat: 23.1291, lng: 113.2644, country: 'CN', tier: 'mega' },
  'Seoul': { lat: 37.5665, lng: 126.9780, country: 'KR', tier: 'mega' },
  'Taipei': { lat: 25.0330, lng: 121.5654, country: 'TW', tier: 'major' },

  // === SOUTHEAST ASIA ===
  'Singapore': { lat: 1.3521, lng: 103.8198, country: 'SG', tier: 'major' },
  'Bangkok': { lat: 13.7563, lng: 100.5018, country: 'TH', tier: 'mega' },
  'Jakarta': { lat: -6.2088, lng: 106.8456, country: 'ID', tier: 'mega' },
  'Manila': { lat: 14.5995, lng: 120.9842, country: 'PH', tier: 'mega' },
  'Ho Chi Minh City': { lat: 10.8231, lng: 106.6297, country: 'VN', tier: 'mega' },
  'Kuala Lumpur': { lat: 3.1390, lng: 101.6869, country: 'MY', tier: 'major' },
  'Hanoi': { lat: 21.0278, lng: 105.8342, country: 'VN', tier: 'major' },

  // === OCEANIA ===
  'Sydney': { lat: -33.8688, lng: 151.2093, country: 'AU', tier: 'major' },
  'Melbourne': { lat: -37.8136, lng: 144.9631, country: 'AU', tier: 'major' },
  'Auckland': { lat: -36.8485, lng: 174.7633, country: 'NZ', tier: 'large' },
};

/**
 * Get a city's coordinates. Case-insensitive lookup.
 * Returns null if the city isn't in the database.
 */
export function getCityCoords(name: string): [number, number] | null {
  // Direct match first
  const city = MajorCities[name];
  if (city) return [city.lng, city.lat]; // d3-geo uses [lng, lat] order

  // Case-insensitive fallback
  const lower = name.toLowerCase();
  for (const [key, val] of Object.entries(MajorCities)) {
    if (key.toLowerCase() === lower) return [val.lng, val.lat];
  }
  return null;
}
