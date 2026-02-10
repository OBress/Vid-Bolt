# Map Motion Graphics — How It Works

## Overview

All AI-generated maps use **d3-geo projections with real Natural Earth data**. The AI writes rendering logic against pre-loaded, verified geographic data — it cannot invent wrong borders or misplace countries.

> A Mapbox Static API template system exists in the codebase but is **not used by the AI generation flow**. It requires a `NEXT_PUBLIC_MAPBOX_API_TOKEN` env var and is only wired to the pre-built template picker.

## Pipeline

1. **Skill Detection** — `motion-graphics-service.ts` matches keywords (_"map", "globe", "country", "world", "city", "flight", "state", "province"_, etc.) and injects the `maps.md` skill guide into the LLM system prompt.
2. **Data Source** — `geo-data.ts` loads `world-atlas/countries-110m.json` (Natural Earth 110m TopoJSON) at build time via `topojson-client`, producing:
   - `WorldCountries` — GeoJSON FeatureCollection with all country borders + ISO codes
   - `WorldLand` — Simplified land mass outlines (no borders)
3. **Sub-National Data** — `geo-data.ts` provides `getSubNationalData(countryCode)` which lazy-loads per-country TopoJSON from `/geo/{ISO2}.json` (240 countries supported).
4. **City Database** — 7,270 cities from Natural Earth lazy-loaded from `/geo/cities.json`, accessible via `loadCities()` then `getCityCoords('Tokyo')` → `[lng, lat]`.
5. **Geographic Layers** — 11 additional Natural Earth datasets lazy-loaded from `/geo/*.json`: rivers, lakes, oceans, airports, ports, urban areas, time zones, coastlines, geographic lines, glaciated areas, and reefs.
6. **Runtime Injection** — `remotion-compiler.tsx` injects d3-geo functions and geo data into the AI-generated code's scope:
   - Projections: `geoPath`, `geoMercator`, `geoOrthographic`, `geoNaturalEarth1`, `geoEquirectangular`, `geoGraticule`
   - Data: `WorldCountries`, `WorldLand`, `loadCities`, `getCityCoords`, `getCityInfo`
   - Sub-national: `getSubNationalData`, `SUPPORTED_SUBNATIONAL_COUNTRIES`
   - Layers: `loadRivers`, `loadLakes`, `loadOceans`, `loadAirports`, `loadPorts`, `loadUrbanAreas`, `loadTimezones`, `loadCoastlines`, `loadGeographicLines`, `loadGlaciated`, `loadReefs`

## Why Maps Are Accurate

| Layer                 | Source                                                     | Provides                                             |
| --------------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| Country/land geometry | `world-atlas/countries-110m.json` (Natural Earth)          | Real country borders and land outlines               |
| Sub-national geometry | `public/geo/countries/{ISO2}.json` (Natural Earth 10m)     | State/province boundaries for 240 countries          |
| City positions        | `public/geo/cultural/cities.json` (Natural Earth 10m)      | 7,270 cities across 226 countries                    |
| Rivers                | `public/geo/physical/rivers.json` (Natural Earth 10m)      | 1,473 major rivers/waterways                         |
| Lakes                 | `public/geo/physical/lakes.json` (Natural Earth 10m)       | 1,355 major lakes                                    |
| Oceans                | `public/geo/physical/oceans.json` (Natural Earth 110m)     | Ocean region polygons                                |
| Airports              | `public/geo/cultural/airports.json` (Natural Earth 10m)    | 893 airports with IATA codes                         |
| Ports                 | `public/geo/cultural/ports.json` (Natural Earth 10m)       | 1,081 major ports                                    |
| Urban areas           | `public/geo/cultural/urban-areas.json` (Natural Earth 10m) | 11,878 built-up area polygons                        |
| Time zones            | `public/geo/cultural/timezones.json` (Natural Earth 10m)   | 120 time zone boundaries                             |
| Coastlines            | `public/geo/physical/coastlines.json` (Natural Earth 10m)  | 4,133 detailed coastline features                    |
| Geographic lines      | `public/geo/physical/geographic-lines.json` (NE 110m)      | Equator, tropics, arctic/antarctic circles, dateline |
| Glaciated areas       | `public/geo/physical/glaciated.json` (Natural Earth 10m)   | 1,886 ice sheet/glacier features                     |
| Reefs                 | `public/geo/physical/reefs.json` (Natural Earth 10m)       | 1,043 coral reef features                            |
| Projections           | d3-geo (injected at runtime)                               | Mathematically correct coordinate transforms         |

The skill prompt explicitly forbids hardcoded SVG shapes for map outlines.

## Supported Map Types

| Map Type             | Projection           | Best For                         |
| -------------------- | -------------------- | -------------------------------- |
| Full world map       | `geoNaturalEarth1`   | Global overviews, infographics   |
| Regional/zoomed      | `geoMercator`        | Country/city-level detail        |
| 3D globe             | `geoOrthographic`    | Rotating Earth, dramatic reveals |
| Flat equirectangular | `geoEquirectangular` | Simple lat/lng grids             |
| Sub-national         | `geoMercator`        | US states, Indian states, etc.   |

## Composable Features

- Country highlighting (filter by `feature.properties.name`)
- **Sub-national rendering** (states/provinces via `getSubNationalData('US')`)
- Animated city markers with staggered spring entrances
- Animated route lines between cities (Bézier curves, stroke-dashoffset)
- Rotating globe with graticule grid lines
- Moving vehicle/dot along multi-stop routes
- Color-coded choropleth-style maps
- Any combination with Remotion `interpolate` / `spring` animations

## Sub-National Data

**240 countries** have state/province boundary data available, lazy-loaded from `public/geo/`. Any valid ISO 3166-1 alpha-2 country code (US, GB, FR, IN, BR, CN, JP, RU, AU, etc.) is supported.

Total: 4,584 regions, ~9MB across all countries (each loaded individually on demand).

### Usage Pattern

```tsx
const [data, setData] = useState(null);
useEffect(() => {
  getSubNationalData("US").then(setData);
}, []);
// data.features[i].properties.name → "California", "Texas", etc.
```

### Adding More Countries

Run `node scripts/convert-admin1.mjs` to regenerate all country files. By default it processes all countries in the Natural Earth Admin 1 dataset. Set `TARGET_COUNTRIES` in the script to limit to specific countries if needed.

## Key Files

| File                                                      | Role                                            |
| --------------------------------------------------------- | ----------------------------------------------- |
| `lib/services/motion-graphics/skills/maps.md`             | AI skill guide (injected into LLM prompt)       |
| `features/video-editor-v2/utils/remotion/geo-data.ts`     | Pre-loaded world data + city DB + sub-national  |
| `features/video-editor-v2/utils/remotion-compiler.tsx`    | Injects d3-geo + data into AI code scope        |
| `lib/services/motion-graphics/motion-graphics-service.ts` | Skill detection + AI generation pipeline        |
| `public/geo/*.json`                                       | Per-country sub-national TopoJSON (lazy-loaded) |
| `scripts/convert-admin1.mjs`                              | Build script to generate per-country files      |
