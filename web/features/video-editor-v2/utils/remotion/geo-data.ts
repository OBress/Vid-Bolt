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

// Diagnostic: verify data loaded correctly at module init
console.log('[GeoData] ✅ World map data loaded:', {
  countries: WorldCountries?.features?.length ?? 'MISSING',
  land: WorldLand?.features?.length ?? 'MISSING',
});

// ============================================================
// MAJOR CITIES DATABASE (LAZY-LOADED)
// ============================================================

export interface CityInfo {
  lat: number;
  lng: number;
  country: string;
  /** Population tier: 'mega' (5M+), 'major' (1M+), 'large' (500K+), 'medium' (100K+), 'small' */
  tier: 'mega' | 'major' | 'large' | 'medium' | 'small';
}

/**
 * In-memory cache for the city database.
 * Loaded lazily from /geo/cities.json on first access.
 */
let citiesCache: Record<string, CityInfo> | null = null;
let citiesLoadPromise: Promise<Record<string, CityInfo>> | null = null;

/**
 * Load the full city database (7,270 cities from Natural Earth).
 * Data is fetched from /geo/cities.json on first call, then cached in memory.
 * 
 * @returns Record of city name to CityInfo
 */
export async function loadCities(): Promise<Record<string, CityInfo>> {
  if (citiesCache) return citiesCache;

  // Deduplicate concurrent calls
  if (citiesLoadPromise) return citiesLoadPromise;

  citiesLoadPromise = (async () => {
    try {
      const resp = await fetch('/geo/cities.json');
      if (!resp.ok) {
        console.warn('[GeoData] Failed to fetch cities:', resp.status);
        return {};
      }
      const data = await resp.json();
      citiesCache = data;
      console.log(`[GeoData] ✅ Loaded ${Object.keys(data).length} cities`);
      return data;
    } catch (err) {
      console.error('[GeoData] Error loading cities:', err);
      return {};
    } finally {
      citiesLoadPromise = null;
    }
  })();

  return citiesLoadPromise;
}

/**
 * Get a city's coordinates. Case-insensitive lookup.
 * Requires cities to be loaded first via loadCities().
 * Returns null if the city isn't in the database or cities haven't been loaded.
 *
 * @param name - City name (e.g., 'Tokyo', 'New York')
 * @returns [lng, lat] tuple for d3-geo, or null
 */
export function getCityCoords(name: string): [number, number] | null {
  if (!citiesCache) {
    console.warn('[GeoData] Cities not loaded yet. Call loadCities() first.');
    return null;
  }

  // Direct match first
  const city = citiesCache[name];
  if (city) return [city.lng, city.lat]; // d3-geo uses [lng, lat] order

  // Case-insensitive fallback
  const lower = name.toLowerCase();
  for (const [key, val] of Object.entries(citiesCache)) {
    if (key.toLowerCase() === lower) return [val.lng, val.lat];
  }
  return null;
}

/**
 * Convenience: get the full CityInfo object for a city (case-insensitive).
 * Requires cities to be loaded first via loadCities().
 */
export function getCityInfo(name: string): CityInfo | null {
  if (!citiesCache) return null;

  const city = citiesCache[name];
  if (city) return city;

  const lower = name.toLowerCase();
  for (const [key, val] of Object.entries(citiesCache)) {
    if (key.toLowerCase() === lower) return val;
  }
  return null;
}

// ============================================================
// SUB-NATIONAL BOUNDARY DATA (LAZY-LOADED)
// ============================================================

/**
 * All countries with sub-national (state/province) boundary data available.
 * Generated from Natural Earth Admin 1 dataset (240 countries).
 * Data is lazy-loaded from /geo/{ISO2}.json on first request.
 */
export const SUPPORTED_SUBNATIONAL_COUNTRIES = new Set([
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
  'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BR', 'BS', 'BT', 'BW', 'BY', 'BZ',
  'CA', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CY', 'CZ',
  'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ',
  'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET',
  'FI', 'FJ', 'FK', 'FM', 'FO', 'FR',
  'GA', 'GB', 'GD', 'GE', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY',
  'HK', 'HM', 'HN', 'HR', 'HT', 'HU',
  'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT',
  'JE', 'JM', 'JO', 'JP',
  'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ',
  'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY',
  'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ',
  'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ',
  'OM',
  'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY',
  'QA',
  'RO', 'RS', 'RU', 'RW',
  'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ',
  'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ',
  'UA', 'UG', 'UM', 'US', 'UY', 'UZ',
  'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU',
  'WF', 'WS',
  'XK',
  'YE',
  'ZA', 'ZM', 'ZW',
]);

/**
 * In-memory cache for loaded sub-national data.
 * Each entry is a GeoJSON FeatureCollection with state/province boundaries.
 */
const subNationalCache = new Map<string, GeoJSON.FeatureCollection>();

/**
 * Load sub-national (state/province) boundary data for a country.
 * 
 * Data is fetched from /geo/{countryCode}.json on first call, then cached.
 * Supports 240 countries from the Natural Earth Admin 1 dataset.
 * Each feature has properties: { name, name_en, code, type }.
 * 
 * @param countryCode - ISO 3166-1 alpha-2 code (e.g., 'US', 'BR', 'IN')
 * @returns GeoJSON FeatureCollection with state/province polygons, or null if unsupported
 */
export async function getSubNationalData(
  countryCode: string
): Promise<GeoJSON.FeatureCollection | null> {
  const code = countryCode.toUpperCase();

  // Return from cache if already loaded
  const cached = subNationalCache.get(code);
  if (cached) return cached;

  // Check if this country is supported
  if (!SUPPORTED_SUBNATIONAL_COUNTRIES.has(code)) {
    console.warn(`[GeoData] Sub-national data not available for: ${code}`);
    return null;
  }

  try {
    const resp = await fetch(`/geo/${code}.json`);
    if (!resp.ok) {
      console.warn(`[GeoData] Failed to fetch sub-national data for ${code}: ${resp.status}`);
      return null;
    }
    const topoData = await resp.json();
    const fc = topojson.feature(
      topoData as any,
      (topoData as any).objects.admin1
    ) as unknown as GeoJSON.FeatureCollection;
    subNationalCache.set(code, fc);
    console.log(`[GeoData] ✅ Loaded sub-national data for ${code}: ${fc.features.length} regions`);
    return fc;
  } catch (err) {
    console.error(`[GeoData] Error loading sub-national data for ${code}:`, err);
    return null;
  }
}

// ============================================================
// ADDITIONAL GEO LAYERS (LAZY-LOADED)
// ============================================================

/**
 * Airport information from Natural Earth.
 */
export interface AirportInfo {
  lat: number;
  lng: number;
  iata_code?: string | null;
  type?: string | null;
  scalerank?: number;
}

/**
 * Port information from Natural Earth.
 */
export interface PortInfo {
  lat: number;
  lng: number;
  scalerank?: number;
  featurecla?: string | null;
}

// Generic geo layer cache
const geoLayerCache = new Map<string, any>();
const geoLayerPromises = new Map<string, Promise<any>>();

/**
 * Generic loader for GeoJSON layers stored in /geo/.
 * Fetches, caches, and returns the data.
 */
async function loadGeoLayer<T>(
  name: string,
  filename: string,
): Promise<T | null> {
  // Return from cache
  const cached = geoLayerCache.get(name);
  if (cached) return cached as T;

  // Deduplicate concurrent calls
  const existing = geoLayerPromises.get(name);
  if (existing) return existing as Promise<T | null>;

  const promise = (async (): Promise<T | null> => {
    try {
      const resp = await fetch(`/geo/${filename}`);
      if (!resp.ok) {
        console.warn(`[GeoData] Failed to fetch ${name}: ${resp.status}`);
        return null;
      }
      const data = await resp.json();
      geoLayerCache.set(name, data);
      const count = data.features?.length ?? Object.keys(data).length;
      console.log(`[GeoData] ✅ Loaded ${name}: ${count} items`);
      return data as T;
    } catch (err) {
      console.error(`[GeoData] Error loading ${name}:`, err);
      return null;
    } finally {
      geoLayerPromises.delete(name);
    }
  })();

  geoLayerPromises.set(name, promise);
  return promise;
}

// --- Phase 1: High-value layers ---

/** Load major world rivers (1,473 features). */
export function loadRivers(): Promise<GeoJSON.FeatureCollection | null> {
  return loadGeoLayer('rivers', 'rivers.json');
}

/** Load major world lakes (1,355 features). */
export function loadLakes(): Promise<GeoJSON.FeatureCollection | null> {
  return loadGeoLayer('lakes', 'lakes.json');
}

/** Load ocean polygons (2 features — Atlantic/Pacific macro regions). */
export function loadOceans(): Promise<GeoJSON.FeatureCollection | null> {
  return loadGeoLayer('oceans', 'oceans.json');
}

/** Load major world airports (893 entries with IATA codes). */
export function loadAirports(): Promise<Record<string, AirportInfo> | null> {
  return loadGeoLayer('airports', 'airports.json');
}

/** Load major world ports (1,081 entries). */
export function loadPorts(): Promise<Record<string, PortInfo> | null> {
  return loadGeoLayer('ports', 'ports.json');
}

// --- Phase 2: Thematic layers ---

/** Load urban/built-up areas (11,878 features). */
export function loadUrbanAreas(): Promise<GeoJSON.FeatureCollection | null> {
  return loadGeoLayer('urban-areas', 'urban-areas.json');
}

/** Load world time zone boundaries (120 features). */
export function loadTimezones(): Promise<GeoJSON.FeatureCollection | null> {
  return loadGeoLayer('timezones', 'timezones.json');
}

/** Load detailed coastlines (4,133 features). */
export function loadCoastlines(): Promise<GeoJSON.FeatureCollection | null> {
  return loadGeoLayer('coastlines', 'coastlines.json');
}

/** Load geographic reference lines — equator, tropics, arctic/antarctic circles, dateline (6 features). */
export function loadGeographicLines(): Promise<GeoJSON.FeatureCollection | null> {
  return loadGeoLayer('geographic-lines', 'geographic-lines.json');
}

/** Load glaciated areas — ice sheets and glaciers (1,886 features). */
export function loadGlaciated(): Promise<GeoJSON.FeatureCollection | null> {
  return loadGeoLayer('glaciated', 'glaciated.json');
}

/** Load coral reefs (1,043 features). */
export function loadReefs(): Promise<GeoJSON.FeatureCollection | null> {
  return loadGeoLayer('reefs', 'reefs.json');
}
