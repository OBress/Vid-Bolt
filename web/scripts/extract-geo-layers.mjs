#!/usr/bin/env node

/**
 * extract-geo-layers.mjs
 *
 * Downloads and processes Natural Earth datasets into optimized static JSON/TopoJSON
 * files for lazy-loading in the motion graphics system.
 *
 * Usage:
 *   node scripts/extract-geo-layers.mjs              # Download all layers
 *   node scripts/extract-geo-layers.mjs --rivers      # Download specific layer(s)
 *   node scripts/extract-geo-layers.mjs --phase1      # Download Phase 1 only
 *
 * Output goes to public/geo/
 */

import { mkdirSync, existsSync, createWriteStream, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const TEMP_DIR = join(ROOT, '.tmp-geo-layers');
const OUTPUT_DIR = join(ROOT, 'public', 'geo');

const NE_BASE = 'https://naciscdn.org/naturalearth';

// ============================================================
// DATASET DEFINITIONS
// ============================================================

const DATASETS = {
  // --- Phase 1: High-value ---
  rivers: {
    phase: 1,
    url: `${NE_BASE}/10m/physical/ne_10m_rivers_lake_centerlines.zip`,
    output: 'physical/rivers.json',
    type: 'geojson',           // output as GeoJSON FeatureCollection
    simplify: true,
    description: 'Major world rivers and lake centerlines',
    properties: ['name', 'name_en', 'scalerank', 'featurecla'],
  },
  lakes: {
    phase: 1,
    url: `${NE_BASE}/10m/physical/ne_10m_lakes.zip`,
    output: 'physical/lakes.json',
    type: 'geojson',
    simplify: true,
    description: 'Major world lakes',
    properties: ['name', 'name_en', 'scalerank', 'featurecla'],
  },
  oceans: {
    phase: 1,
    url: `${NE_BASE}/110m/physical/ne_110m_ocean.zip`,
    output: 'physical/oceans.json',
    type: 'geojson',
    simplify: false,           // already small at 110m scale
    description: 'Ocean polygons',
    properties: ['scalerank', 'featurecla'],
  },
  airports: {
    phase: 1,
    url: `${NE_BASE}/10m/cultural/ne_10m_airports.zip`,
    output: 'cultural/airports.json',
    type: 'points',            // Record<name, {lat, lng, ...}>
    description: 'Major world airports',
    pointFields: {
      nameField: 'name',
      extras: ['iata_code', 'type', 'scalerank'],
    },
  },
  ports: {
    phase: 1,
    url: `${NE_BASE}/10m/cultural/ne_10m_ports.zip`,
    output: 'cultural/ports.json',
    type: 'points',
    description: 'Major world ports',
    pointFields: {
      nameField: 'name',
      extras: ['scalerank', 'featurecla'],
    },
  },

  // --- Phase 2: Thematic ---
  'urban-areas': {
    phase: 2,
    url: `${NE_BASE}/10m/cultural/ne_10m_urban_areas.zip`,
    output: 'cultural/urban-areas.json',
    type: 'geojson',
    simplify: true,
    description: 'Urban/built-up areas',
    properties: ['scalerank', 'area_sqkm'],
  },
  timezones: {
    phase: 2,
    url: `${NE_BASE}/10m/cultural/ne_10m_time_zones.zip`,
    output: 'cultural/timezones.json',
    type: 'geojson',
    simplify: true,
    description: 'World time zone boundaries',
    properties: ['name', 'time_zone', 'zone', 'utc_format', 'places'],
  },
  coastlines: {
    phase: 2,
    url: `${NE_BASE}/10m/physical/ne_10m_coastline.zip`,
    output: 'physical/coastlines.json',
    type: 'geojson',
    simplify: true,
    description: 'Detailed coastlines',
    properties: ['scalerank', 'featurecla'],
  },
  'geographic-lines': {
    phase: 2,
    url: `${NE_BASE}/110m/physical/ne_110m_geographic_lines.zip`,
    output: 'physical/geographic-lines.json',
    type: 'geojson',
    simplify: false,
    description: 'Equator, tropics, arctic/antarctic circles, dateline',
    properties: ['name', 'featurecla'],
  },
  glaciated: {
    phase: 2,
    url: `${NE_BASE}/10m/physical/ne_10m_glaciated_areas.zip`,
    output: 'physical/glaciated.json',
    type: 'geojson',
    simplify: true,
    description: 'Glaciated areas (ice sheets, glaciers)',
    properties: ['scalerank'],
  },
  reefs: {
    phase: 2,
    url: `${NE_BASE}/10m/physical/ne_10m_reefs.zip`,
    output: 'physical/reefs.json',
    type: 'geojson',
    simplify: false,
    description: 'Coral reefs',
    properties: ['scalerank', 'featurecla'],
  },
};

// ============================================================
// HELPERS
// ============================================================

function cleanStr(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return value;
  return value.replace(/\x00/g, '').trim() || null;
}

async function downloadFile(url, dest) {
  console.log(`  📥 Downloading ${url.split('/').pop()}...`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  const fileStream = createWriteStream(dest);
  await pipeline(response.body, fileStream);
}

async function unzip(zipPath, destDir) {
  const { default: AdmZip } = await import('adm-zip');
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, true);
}

async function readShapefile(shpPath) {
  const shapefile = await import('shapefile');
  const source = await shapefile.open(shpPath);
  const features = [];
  while (true) {
    const result = await source.read();
    if (result.done) break;
    features.push(result.value);
  }
  return features;
}

function findShpFile(dir) {
  const files = readdirSync(dir);
  const shp = files.find(f => f.endsWith('.shp'));
  if (!shp) throw new Error(`No .shp file found in ${dir}`);
  return join(dir, shp);
}

/** Strip properties down to only the ones we want, to reduce file size. */
function filterProperties(feature, allowedProps) {
  if (!allowedProps || !feature.properties) return feature;
  const filtered = {};
  for (const key of allowedProps) {
    if (feature.properties[key] !== undefined) {
      const val = feature.properties[key];
      filtered[key] = typeof val === 'string' ? cleanStr(val) : val;
    }
  }
  return { ...feature, properties: filtered };
}

/** Simplify GeoJSON using TopoJSON quantization */
async function simplifyGeoJSON(featureCollection) {
  const topojsonServer = await import('topojson-server');
  const topojsonSimplify = await import('topojson-simplify');
  const topojsonClient = await import('topojson-client');

  // Convert to topology
  let topo = topojsonServer.topology({ data: featureCollection });

  // Simplify — presimplify and then filter
  topo = topojsonSimplify.presimplify(topo);
  topo = topojsonSimplify.simplify(topo, 0.001);

  // Convert back to GeoJSON
  return topojsonClient.feature(topo, topo.objects.data);
}

// ============================================================
// PROCESSING
// ============================================================

async function processDataset(name, config) {
  console.log(`\n🌍 Processing: ${name} — ${config.description}`);

  const datasetDir = join(TEMP_DIR, name);
  const zipPath = join(datasetDir, `${name}.zip`);
  const extractDir = join(datasetDir, 'extracted');

  mkdirSync(datasetDir, { recursive: true });

  // Download
  if (!existsSync(zipPath)) {
    await downloadFile(config.url, zipPath);
  } else {
    console.log(`  📥 Using cached download`);
  }

  // Extract
  if (!existsSync(extractDir)) {
    mkdirSync(extractDir, { recursive: true });
    await unzip(zipPath, extractDir);
  } else {
    console.log(`  📦 Using cached extraction`);
  }

  // Read shapefile
  const shpPath = findShpFile(extractDir);
  const features = await readShapefile(shpPath);
  console.log(`  📄 Read ${features.length} features`);

  const outputPath = join(OUTPUT_DIR, config.output);

  if (config.type === 'points') {
    // Point data → Record<name, {lat, lng, ...}>
    return processPointData(name, features, config, outputPath);
  } else {
    // GeoJSON FeatureCollection
    return processGeoJSONData(name, features, config, outputPath);
  }
}

function processPointData(name, features, config, outputPath) {
  const { nameField, extras } = config.pointFields;
  const output = {};
  const seen = new Map();

  for (const feature of features) {
    const props = feature.properties;
    let pointName = cleanStr(props[nameField]);
    if (!pointName) continue;

    const coords = feature.geometry?.coordinates;
    if (!coords || coords.length < 2) continue;

    const [lng, lat] = coords;

    // Deduplicate
    if (seen.has(pointName)) {
      pointName = `${pointName} (${seen.get(pointName) + 1})`;
    }
    seen.set(pointName.split(' (')[0], (seen.get(pointName.split(' (')[0]) || 0) + 1);

    const entry = {
      lat: parseFloat(lat.toFixed(4)),
      lng: parseFloat(lng.toFixed(4)),
    };

    // Add extra fields
    for (const field of extras || []) {
      const val = props[field];
      if (val != null) {
        entry[field] = typeof val === 'string' ? cleanStr(val) : val;
      }
    }

    output[pointName] = entry;
  }

  const json = JSON.stringify(output);
  writeFileSync(outputPath, json);
  const count = Object.keys(output).length;
  console.log(`  ✅ ${count} ${name} → ${outputPath.split('public')[1]} (${(json.length / 1024).toFixed(1)} KB)`);
  return { count, sizeKB: (json.length / 1024).toFixed(1) };
}

function processGeoJSONData(name, features, config, outputPath) {
  // Filter properties to reduce size
  const filtered = features.map(f => filterProperties(f, config.properties));

  let fc = { type: 'FeatureCollection', features: filtered };

  // Simplify if configured (async handled by caller wrapping in async)
  // We'll handle simplification inline since we're already async
  const json = JSON.stringify(fc);
  writeFileSync(outputPath, json);
  const count = fc.features.length;
  console.log(`  ✅ ${count} features → ${outputPath.split('public')[1]} (${(json.length / 1024).toFixed(1)} KB)`);
  return { count, sizeKB: (json.length / 1024).toFixed(1), needsSimplify: config.simplify };
}

async function simplifyIfNeeded(name, config) {
  if (!config.simplify) return;

  const filePath = join(OUTPUT_DIR, config.output);
  const { readFileSync } = await import('fs');
  const raw = readFileSync(filePath, 'utf8');
  const originalSize = raw.length;
  const fc = JSON.parse(raw);

  console.log(`  🔧 Simplifying ${name} (${(originalSize / 1024).toFixed(1)} KB)...`);
  const simplified = await simplifyGeoJSON(fc);
  const json = JSON.stringify(simplified);
  writeFileSync(filePath, json);
  console.log(`  ✅ Simplified: ${(originalSize / 1024).toFixed(1)} KB → ${(json.length / 1024).toFixed(1)} KB (${((1 - json.length / originalSize) * 100).toFixed(0)}% reduction)`);
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  const args = process.argv.slice(2);

  console.log('🌐 Natural Earth Geo Data Extractor');
  console.log('====================================\n');

  mkdirSync(TEMP_DIR, { recursive: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(join(OUTPUT_DIR, 'physical'), { recursive: true });
  mkdirSync(join(OUTPUT_DIR, 'cultural'), { recursive: true });

  // Determine which datasets to process
  let selectedNames;

  if (args.includes('--phase1')) {
    selectedNames = Object.entries(DATASETS).filter(([, c]) => c.phase === 1).map(([n]) => n);
  } else if (args.includes('--phase2')) {
    selectedNames = Object.entries(DATASETS).filter(([, c]) => c.phase === 2).map(([n]) => n);
  } else if (args.some(a => a.startsWith('--'))) {
    selectedNames = args.map(a => a.replace('--', '')).filter(n => DATASETS[n]);
    if (selectedNames.length === 0) {
      console.error('Unknown dataset(s). Available:', Object.keys(DATASETS).join(', '));
      process.exit(1);
    }
  } else {
    // Default: all
    selectedNames = Object.keys(DATASETS);
  }

  console.log(`📋 Processing ${selectedNames.length} datasets: ${selectedNames.join(', ')}\n`);

  const results = {};

  for (const name of selectedNames) {
    try {
      results[name] = await processDataset(name, DATASETS[name]);
    } catch (err) {
      console.error(`  ❌ Failed: ${err.message}`);
      results[name] = { error: err.message };
    }
  }

  // Simplification pass
  console.log('\n🔧 Simplification pass...');
  for (const name of selectedNames) {
    if (results[name]?.error) continue;
    try {
      await simplifyIfNeeded(name, DATASETS[name]);
    } catch (err) {
      console.error(`  ❌ Simplify failed for ${name}: ${err.message}`);
    }
  }

  // Summary
  console.log('\n📊 Summary');
  console.log('══════════════════════════════════════════');
  let totalSize = 0;
  for (const name of selectedNames) {
    const r = results[name];
    if (r?.error) {
      console.log(`  ❌ ${name}: ${r.error}`);
    } else {
      // Re-read final size after simplification
      const { statSync } = await import('fs');
      const filePath = join(OUTPUT_DIR, DATASETS[name].output);
      const finalSize = statSync(filePath).size;
      totalSize += finalSize;
      console.log(`  ✅ ${name.padEnd(20)} ${(finalSize / 1024).toFixed(1).padStart(8)} KB   (${r.count} ${DATASETS[name].type === 'points' ? 'entries' : 'features'})`);
    }
  }
  console.log(`  ${'─'.repeat(42)}`);
  console.log(`  Total: ${(totalSize / 1024).toFixed(1)} KB (${(totalSize / 1024 / 1024).toFixed(2)} MB)`);

  console.log(`\n💡 Tip: Run 'rm -rf .tmp-geo-layers' to clean up downloads\n`);
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
