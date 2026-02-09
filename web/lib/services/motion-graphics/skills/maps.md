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

// Pre-loaded data
WorldCountries; // GeoJSON FeatureCollection — all country borders
WorldLand; // GeoJSON FeatureCollection — land masses (no borders)
MajorCities; // Object: { 'New York': { lat, lng, country, tier }, ... }
getCityCoords; // Function: getCityCoords('Tokyo') → [139.65, 35.68] or null
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
6. **All data is pre-loaded** — no fetch/async needed. WorldCountries, WorldLand, MajorCities are constants
7. **Do NOT import d3-geo or topojson** — everything is already in scope
8. **Render maps as `<svg>`** elements, not `<canvas>` — SVG plays well with Remotion's DOM rendering
