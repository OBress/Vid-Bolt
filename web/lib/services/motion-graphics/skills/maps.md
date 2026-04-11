---
name: maps
description: Geographically accurate map animations using d3-geo projections — travel routes, city markers, globe views
tags: maps, geography, location, route, travel, coordinates, d3-geo, world map
---

# Geographic Map Animations with d3-geo

> **⚠️ CRITICAL: NEVER draw hardcoded SVG shapes for maps!**
> You have REAL GeoJSON world map data injected into scope. Drawing crude SVG rectangles or polygons
> to represent countries/continents looks absolutely terrible and is STRICTLY FORBIDDEN.
> ALWAYS use `WorldCountries` or `WorldLand` with `geoPath()` and a d3-geo projection.

You have access to accurate world map data and d3-geo projection functions. **Do NOT use Mapbox or hardcoded pixel coordinates.** Use the injected geo utilities for accurate lat/lng-based maps.

> **NOTE:** Async geo data loaders (e.g., `loadCities()`, `getSubNationalData()`, `loadRivers()`) require `useState` + `useEffect`. This is the **correct exception** to the general "no useState/useEffect" rule — geo data must be loaded asynchronously.

### Highlighting Individual Countries

To highlight specific countries (e.g., Brazil, Ethiopia), filter `WorldCountries.features` by name:

```tsx
const highlightedCountries = ["Brazil", "Colombia", "Ethiopia"];
const isHighlighted = (feature) =>
  highlightedCountries.includes(feature.properties.name);

{
  WorldCountries.features.map((feature, i) => (
    <path
      key={i}
      d={path(feature) || ""}
      fill={isHighlighted(feature) ? "#FFB020" : "#1a2744"}
      stroke="#2a3f66"
      strokeWidth={0.5}
    />
  ));
}
```

## Available Imports (already in scope)

```tsx
// Projections — transform lat/lng → pixel coordinates
geoMercator; // Flat world map (most common, good for regional views)
geoNaturalEarth1; // Natural Earth (best for full world maps)
geoOrthographic; // 3D globe effect
geoEquirectangular; // Simple equirectangular

// Path generator — converts GeoJSON features to SVG path data
geoPath;

// Grid lines
geoGraticule; // Creates lat/lng grid lines (every 10° by default)

// Pre-loaded data (synchronous)
WorldCountries; // GeoJSON FeatureCollection — all country borders
WorldLand; // GeoJSON FeatureCollection — land masses (no borders)

// City database (async, lazy-loaded from /geo/cities.json — 7,270 cities)
loadCities; // Async: loadCities() → Promise<Record<string, CityInfo>> — loads and caches all cities
getCityCoords; // Sync after loadCities: getCityCoords('Tokyo') → [139.65, 35.68] or null
getCityInfo; // Sync after loadCities: getCityInfo('Tokyo') → { lat, lng, country, tier } or null

// Sub-national data (states/provinces) — async, lazy-loaded
getSubNationalData; // Async: getSubNationalData('US') → Promise<FeatureCollection | null>
SUPPORTED_SUBNATIONAL_COUNTRIES; // Set<string> of ISO2 codes — 240 countries with sub-national data

// Geographic layers — all async, lazy-loaded from /geo/*.json
loadRivers; // Async: → Promise<FeatureCollection | null> — 1,473 river features with name, scalerank
loadLakes; // Async: → Promise<FeatureCollection | null> — 1,355 lake features with name, scalerank
loadOceans; // Async: → Promise<FeatureCollection | null> — ocean polygons
loadAirports; // Async: → Promise<Record<name, {lat, lng, iata_code, type}>> — 893 airports
loadPorts; // Async: → Promise<Record<name, {lat, lng, scalerank}>> — 1,081 ports
loadUrbanAreas; // Async: → Promise<FeatureCollection | null> — 11,878 urban area polygons
loadTimezones; // Async: → Promise<FeatureCollection | null> — 120 time zone boundaries
loadCoastlines; // Async: → Promise<FeatureCollection | null> — 4,133 detailed coastline features
loadGeographicLines; // Async: → Promise<FeatureCollection | null> — equator, tropics, arctic circles, dateline
loadGlaciated; // Async: → Promise<FeatureCollection | null> — 1,886 ice sheet/glacier features
loadReefs; // Async: → Promise<FeatureCollection | null> — 1,043 coral reef features
```

## Sub-National Maps (States & Provinces)

You can render **state/province boundaries** for **240 countries** worldwide. Data is loaded lazily — use `useState` + `useEffect` to load it.

Any valid ISO 3166-1 alpha-2 country code is supported (US, GB, FR, BR, IN, CN, JP, AU, DE, RU, etc.).

### US States Map with Highlights

```tsx
const { width, height } = useVideoConfig();
const frame = useCurrentFrame();
const [states, setStates] = useState(null);

useEffect(() => {
  getSubNationalData("US").then(setStates);
}, []);

if (!states) return <AbsoluteFill style={{ backgroundColor: "#0a1628" }} />;

const projection = geoMercator()
  .center([-98, 39])
  .scale(600)
  .translate([width / 2, height / 2]);
const path = geoPath(projection);

const highlighted = ["California", "Texas", "New York"];
const isHighlighted = (f) => highlighted.includes(f.properties.name);

return (
  <AbsoluteFill style={{ backgroundColor: "#0a1628" }}>
    <svg width={width} height={height}>
      {states.features.map((feature, i) => {
        const hl = isHighlighted(feature);
        const delay = hl ? i * 3 : 0;
        const opacity = hl
          ? spring({ frame: frame - delay, fps: 30, config: { damping: 15 } })
          : 1;
        return (
          <path
            key={i}
            d={path(feature) || ""}
            fill={hl ? "#FFB020" : "#1a2744"}
            stroke="#2a3f66"
            strokeWidth={0.5}
            opacity={Math.max(0, opacity)}
          />
        );
      })}
    </svg>
  </AbsoluteFill>
);
```

### India States Map (Zoomed)

```tsx
const { width, height } = useVideoConfig();
const [regions, setRegions] = useState(null);

useEffect(() => {
  getSubNationalData("IN").then(setRegions);
}, []);

if (!regions) return <AbsoluteFill style={{ backgroundColor: "#0a1628" }} />;

const projection = geoMercator()
  .center([82, 22])
  .scale(800)
  .translate([width / 2, height / 2]);
const path = geoPath(projection);

const highlighted = ["Maharashtra", "Karnataka"];

return (
  <AbsoluteFill style={{ backgroundColor: "#0a1628" }}>
    <svg width={width} height={height}>
      {regions.features.map((feature, i) => (
        <path
          key={i}
          d={path(feature) || ""}
          fill={
            highlighted.includes(feature.properties.name)
              ? "#22c55e"
              : "#1e293b"
          }
          stroke="#334155"
          strokeWidth={0.5}
        />
      ))}
    </svg>
  </AbsoluteFill>
);
```

### Loading Any Supported Country

```tsx
// Pattern for any supported country:
const [data, setData] = useState(null);
useEffect(() => {
  getSubNationalData("BR").then(setData); // Brazil, or any ISO2 code
}, []);

// Check if a country ISO code is supported:
if (SUPPORTED_SUBNATIONAL_COUNTRIES.has("BR")) {
  /* supported */
}

// Each feature has: feature.properties.name (state/province name)
```

## Basic World Map

```tsx
const { width, height } = useVideoConfig();

// Create a projection centered on the world
const projection = geoNaturalEarth1().fitSize([width, height], WorldLand);

// Create a path generator
const path = geoPath(projection);

return (
  <AbsoluteFill style={{ backgroundColor: "#0a1628" }}>
    <svg width={width} height={height}>
      {/* Land masses */}
      {WorldLand.features.map((feature, i) => (
        <path
          key={i}
          d={path(feature) || ""}
          fill="#1a2744"
          stroke="#2a3f66"
          strokeWidth={0.5}
        />
      ))}
    </svg>
  </AbsoluteFill>
);
```

## Map with Country Borders

```tsx
const projection = geoNaturalEarth1()
  .fitSize([width - 40, height - 40], WorldCountries)
  .translate([width / 2, height / 2]);

const path = geoPath(projection);

<svg width={width} height={height}>
  {WorldCountries.features.map((feature, i) => (
    <path
      key={i}
      d={path(feature) || ""}
      fill="#1e293b"
      stroke="#334155"
      strokeWidth={0.5}
    />
  ))}
</svg>;
```

## City Markers with Labels

```tsx
const CITIES = ["New York", "London", "Tokyo", "Sydney"];

const projection = geoNaturalEarth1().fitSize([width, height], WorldLand);

{
  CITIES.map((cityName, i) => {
    const coords = getCityCoords(cityName); // Returns [lng, lat]
    if (!coords) return null;

    const [x, y] = projection(coords) || [0, 0];
    const delay = i * 15;
    const scale = spring({
      frame: frame - delay,
      fps,
      config: { damping: 12, stiffness: 100 },
    });

    return (
      <g key={cityName} transform={`translate(${x}, ${y})`}>
        {/* Pulse ring */}
        <circle
          r={8 * Math.max(0, scale)}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={2}
          opacity={0.5}
        />
        {/* Dot */}
        <circle r={4 * Math.max(0, scale)} fill="#3b82f6" />
        {/* Label */}
        <text
          x={10}
          y={4}
          fill="white"
          fontSize={14}
          fontFamily="Inter, sans-serif"
          opacity={Math.max(0, scale)}
        >
          {cityName}
        </text>
      </g>
    );
  });
}
```

## Animated Route Line Between Cities

```tsx
const FROM = getCityCoords("New York");
const TO = getCityCoords("London");

const projFrom = projection(FROM);
const projTo = projection(TO);

// Create a curved path using a quadratic bezier
const midX = (projFrom[0] + projTo[0]) / 2;
const midY = Math.min(projFrom[1], projTo[1]) - 80; // Arc upward
const routePath = `M ${projFrom[0]} ${projFrom[1]} Q ${midX} ${midY} ${projTo[0]} ${projTo[1]}`;

const pathLength = 800; // Approximate arc length
const drawProgress = interpolate(frame, [30, 90], [0, 1], {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
});

<svg width={width} height={height}>
  {/* Ghost path */}
  <path
    d={routePath}
    fill="none"
    stroke="rgba(59,130,246,0.2)"
    strokeWidth={2}
  />
  {/* Animated path */}
  <path
    d={routePath}
    fill="none"
    stroke="#3b82f6"
    strokeWidth={3}
    strokeDasharray={pathLength}
    strokeDashoffset={pathLength * (1 - drawProgress)}
    strokeLinecap="round"
  />
</svg>;
```

## Regional Map (Zoomed In)

```tsx
// Center on a specific city and zoom in
const center = getCityCoords("Paris"); // [lng, lat]

const projection = geoMercator()
  .center(center)
  .scale(800) // Higher = more zoomed in
  .translate([width / 2, height / 2]);
```

## Rotating Globe (Orthographic)

```tsx
// Animate globe rotation
const rotation = interpolate(frame, [0, 300], [0, 360], {
  extrapolateRight: "clamp",
});

const projection = geoOrthographic()
  .scale(Math.min(width, height) / 2.2)
  .translate([width / 2, height / 2])
  .rotate([rotation, -20, 0]); // [longitude, latitude, roll]

const path = geoPath(projection);

// Add graticule (grid lines)
const graticule = geoGraticule();

<svg width={width} height={height}>
  {/* Globe background circle */}
  <circle
    cx={width / 2}
    cy={height / 2}
    r={Math.min(width, height) / 2.2}
    fill="#0f172a"
  />

  {/* Grid lines */}
  <path
    d={path(graticule()) || ""}
    fill="none"
    stroke="#1e293b"
    strokeWidth={0.5}
  />

  {/* Countries */}
  {WorldCountries.features.map((feature, i) => (
    <path
      key={i}
      d={path(feature) || ""}
      fill="#1e293b"
      stroke="#334155"
      strokeWidth={0.5}
    />
  ))}
</svg>;
```

## Moving Vehicle Along Route

```tsx
const STOPS = ["New York", "London", "Paris", "Dubai", "Tokyo"];
const stopCoords = STOPS.map((name) => projection(getCityCoords(name)));

const progress = interpolate(frame, [0, 150], [0, 1], {
  extrapolateRight: "clamp",
});
const totalSegments = stopCoords.length - 1;
const segIdx = Math.min(
  Math.floor(progress * totalSegments),
  totalSegments - 1,
);
const segT = progress * totalSegments - segIdx;

const vehicleX = interpolate(
  segT,
  [0, 1],
  [stopCoords[segIdx][0], stopCoords[segIdx + 1][0]],
);
const vehicleY = interpolate(
  segT,
  [0, 1],
  [stopCoords[segIdx][1], stopCoords[segIdx + 1][1]],
);

<circle cx={vehicleX} cy={vehicleY} r={6} fill="#ef4444" />;
```

## CRITICAL RULES

1. **Always use `getCityCoords('CityName')`** for city positions — never hardcode pixel coordinates
2. **Use `geoNaturalEarth1`** for world maps, **`geoMercator`** for regional, **`geoOrthographic`** for globe
3. **Call `.fitSize([width, height], WorldLand)`** on projection to auto-scale the map to the composition
4. **Use `geoPath(projection)`** to generate SVG path `d` attributes from GeoJSON features
5. **`projection([lng, lat])`** converts coordinates to `[x, y]` pixels — note **longitude first**
6. **City data requires `loadCities()` first** — call it in `useEffect`, then use `getCityCoords()` / `getCityInfo()` synchronously after loading
7. **Do NOT import d3-geo or topojson** — everything is already in scope
8. **Render maps as `<svg>`** elements, not `<canvas>` — SVG plays well with Remotion's DOM rendering
9. **Historical/Ancient Location Fallback (CRITICAL):** The city database only contains modern cities. Ancient, historical, or renamed locations (e.g., "Rome in 44 BC", "Carthage", "Constantinople", "Gaul", "Mesopotamia", "Han Dynasty China") will return `null` from `getCityCoords()`. **When a location is historical or ancient, you MUST hardcode the [lng, lat] coordinates directly.** Never allow `getCityCoords` to silently fail for historical content — the map will break.

## Historical/Ancient Location Reference Coordinates

When `getCityCoords()` returns null for a historical location, use these known coordinates as hardcoded fallbacks:

```tsx
// Use approximate modern geographic coordinates for the historical location.
// Example: "Julius Caesar's Rome" → modern Rome, Italy
const HISTORICAL_COORDS: Record<string, [number, number]> = {
  // Ancient Rome / Italian Peninsula
  "rome": [12.4964, 41.9028],
  "carthage": [10.3237, 36.8528],
  "athens": [23.7275, 37.9838],
  "sparta": [22.4293, 37.0756],
  "troy": [26.2385, 39.9577],
  "babylon": [44.4213, 32.5364],
  "nineveh": [43.3550, 36.3621],
  "persepolis": [52.8878, 29.9352],
  "alexandria": [29.9187, 31.2001],
  "memphis-egypt": [31.2167, 29.8500],
  "thebes-egypt": [32.6451, 25.6872],
  "constantinople": [28.9784, 41.0082],
  "byzantium": [28.9784, 41.0082],
  "jerusalem": [35.2137, 31.7683],
  "jericho": [35.4611, 31.8614],
  "ur-mesopotamia": [46.1031, 30.9625],
  "gaul-center": [2.3522, 46.2276],
  "hispania-center": [-3.7038, 40.4168],
  "londinium": [-0.1276, 51.5074], // Ancient London
  "lutetia": [2.3522, 48.8566],    // Ancient Paris
};

// Usage pattern for historical locations:
const cityName = "Rome"; // As mentioned in narration
const coords = getCityCoords(cityName) ||
  HISTORICAL_COORDS[cityName.toLowerCase()] ||
  HISTORICAL_COORDS["rome"]; // Final fallback to Rome if completely unknown
```

**Pattern to use when city may be historical:**
```tsx
// Robust city coordinate lookup — handles both modern and historical locations
function getCoords(cityName: string): [number, number] | null {
  // Try modern database first
  const modern = getCityCoords(cityName);
  if (modern) return modern;

  // Hardcode known historical locations (never allow silent null)
  const historical: Record<string, [number, number]> = {
    "rome": [12.4964, 41.9028],
    "carthage": [10.3237, 36.8528],
    "babylon": [44.4213, 32.5364],
    "constantinople": [28.9784, 41.0082],
    "alexandria": [29.9187, 31.2001],
    // Add more as needed for the specific narrative
  };
  return historical[cityName.toLowerCase()] || null;
}
```
