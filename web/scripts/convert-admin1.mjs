#!/usr/bin/env node

/**
 * convert-admin1.mjs
 * 
 * One-time build script that downloads Natural Earth Admin 1 (states/provinces)
 * shapefile data, converts it to per-country TopoJSON files, and outputs them
 * to public/geo/ for lazy-loading by the motion graphics system.
 * 
 * Usage:
 *   node scripts/convert-admin1.mjs
 * 
 * Requirements (installed automatically as devDependencies):
 *   - shapefile (reads .shp/.dbf)
 *   - topojson-server (geo2topo conversion)
 *   - topojson-simplify (reduces file size)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, createWriteStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// ============================================================
// CONFIGURATION
// ============================================================

const NATURAL_EARTH_URL = 
  'https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_1_states_provinces.zip';

const OUTPUT_DIR = join(ROOT, 'public', 'geo', 'countries');
const TEMP_DIR = join(ROOT, '.tmp-geo');

// Process ALL countries found in the Natural Earth dataset (no filter).
// Set to null to process everything, or provide an object to limit.
const TARGET_COUNTRIES = null; // null = all countries

// ============================================================
// HELPERS
// ============================================================

async function downloadFile(url, dest) {
  console.log(`📥 Downloading ${url}...`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  const fileStream = createWriteStream(dest);
  await pipeline(response.body, fileStream);
  console.log(`   ✅ Saved to ${dest}`);
}

async function unzip(zipPath, destDir) {
  console.log(`📦 Extracting ${zipPath}...`);
  // Use Node.js built-in or AdmZip
  const { default: AdmZip } = await import('adm-zip');
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, true);
  console.log(`   ✅ Extracted to ${destDir}`);
}

/**
 * Strip null bytes from shapefile fixed-width text fields.
 * Shapefiles pad strings with \x00 to fill the field width.
 */
function cleanStr(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/\x00/g, '').trim();
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('🗺️  Sub-National Boundary Data Generator');
  console.log('=========================================\n');

  // Step 1: Create directories
  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(TEMP_DIR, { recursive: true });

  // Step 2: Download Natural Earth data
  const zipPath = join(TEMP_DIR, 'ne_10m_admin_1.zip');
  if (!existsSync(zipPath)) {
    await downloadFile(NATURAL_EARTH_URL, zipPath);
  } else {
    console.log('📥 Using cached download...');
  }

  // Step 3: Extract
  const shpDir = join(TEMP_DIR, 'extracted');
  if (!existsSync(shpDir)) {
    mkdirSync(shpDir, { recursive: true });
    await unzip(zipPath, shpDir);
  } else {
    console.log('📦 Using cached extraction...');
  }

  // Step 4: Find the .shp file
  const { readdirSync } = await import('fs');
  const files = readdirSync(shpDir);
  const shpFile = files.find(f => f.endsWith('.shp'));
  if (!shpFile) {
    throw new Error('No .shp file found in extracted data');
  }
  const shpPath = join(shpDir, shpFile);
  console.log(`\n📄 Found shapefile: ${shpFile}`);

  // Step 5: Read shapefile and group features by country
  console.log('\n🔄 Reading shapefile and grouping by country...');
  const shapefile = await import('shapefile');
  const source = await shapefile.open(shpPath);
  
  const countryFeatures = {};
  let totalFeatures = 0;

  while (true) {
    const result = await source.read();
    if (result.done) break;
    
    const feature = result.value;
    // Natural Earth uses iso_a2 for country codes
    let isoCode = cleanStr(feature.properties.iso_a2) || cleanStr(feature.properties.iso_3166_2)?.split('-')[0];
    
    if (!isoCode || isoCode === '-1' || isoCode === '-99') continue;
    
    // Skip if filtering and not in target list
    if (TARGET_COUNTRIES && !TARGET_COUNTRIES[isoCode]) continue;
    
    if (!countryFeatures[isoCode]) {
      countryFeatures[isoCode] = [];
    }
    
    // Keep only useful properties to minimize file size
    countryFeatures[isoCode].push({
      type: 'Feature',
      properties: {
        name: cleanStr(feature.properties.name) || cleanStr(feature.properties.name_en),
        name_en: cleanStr(feature.properties.name_en),
        name_local: cleanStr(feature.properties.name_local),
        code: cleanStr(feature.properties.iso_3166_2),
        type: cleanStr(feature.properties.type_en),
      },
      geometry: feature.geometry,
    });
    totalFeatures++;
  }

  console.log(`   ✅ Read ${totalFeatures} features across ${Object.keys(countryFeatures).length} countries`);

  // Step 6: Convert each country to TopoJSON and write to public/geo/
  console.log('\n🔨 Converting to TopoJSON...\n');
  
  const { topology } = await import('topojson-server');
  const topojsonSimplify = await import('topojson-simplify').catch(() => null);

  let generated = 0;
  const stats = [];

  for (const [isoCode, features] of Object.entries(countryFeatures)) {
    const geojson = {
      type: 'FeatureCollection',
      features,
    };

    // Convert to TopoJSON
    let topo = topology({ admin1: geojson });

    // Simplify if possible (reduces file size significantly) 
    if (topojsonSimplify) {
      try {
        topo = topojsonSimplify.presimplify(topo);
        topo = topojsonSimplify.simplify(topo, 0.001);
        // Filter out tiny detached polygons
        topo = topojsonSimplify.filter(topo, topojsonSimplify.filterWeight(topo, 0.0001));
      } catch {
        // Simplification is optional, continue without it
      }
    }

    const json = JSON.stringify(topo);
    const outPath = join(OUTPUT_DIR, `${isoCode}.json`);
    writeFileSync(outPath, json);
    
    const sizeKB = (json.length / 1024).toFixed(1);
    stats.push({ code: isoCode, features: features.length, sizeKB });
    console.log(`   ✅ ${isoCode}: ${features.length} regions, ${sizeKB} KB`);
    generated++;
  }

  console.log(`\n=========================================`);
  console.log(`✅ Generated ${generated} country files in ${OUTPUT_DIR}`);

  // Summary table
  console.log('\n📊 Summary:');
  console.log('─'.repeat(50));
  const totalSize = stats.reduce((sum, s) => sum + parseFloat(s.sizeKB), 0).toFixed(1);
  const totalRegions = stats.reduce((sum, s) => sum + s.features, 0);
  console.log(`   Total: ${totalRegions} regions, ${totalSize} KB`);
  console.log('─'.repeat(50));
  
  // Output the generated country codes for easy copy-paste into geo-data.ts
  console.log('\n📋 Country codes generated:');
  const codes = stats.map(s => s.code).sort();
  console.log(`   ${codes.join(', ')}`);
  console.log(`\n   (${codes.length} countries)\n`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
