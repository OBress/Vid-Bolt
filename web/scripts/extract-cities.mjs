#!/usr/bin/env node

/**
 * extract-cities.mjs
 * 
 * Downloads Natural Earth populated places shapefile, extracts ALL cities,
 * and outputs a JSON file to public/geo/cities.json for lazy-loading.
 * 
 * Usage:
 *   node scripts/extract-cities.mjs
 */

import { mkdirSync, existsSync, createWriteStream, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const NATURAL_EARTH_URL = 
  'https://naciscdn.org/naturalearth/10m/cultural/ne_10m_populated_places.zip';

const TEMP_DIR = join(ROOT, '.tmp-cities');
const OUTPUT_FILE = join(ROOT, 'public', 'geo', 'cultural', 'cities.json');

// ============================================================
// HELPERS
// ============================================================

function cleanStr(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/\x00/g, '').trim();
}

function getTier(pop) {
  if (pop >= 5_000_000) return 'mega';
  if (pop >= 1_000_000) return 'major';
  if (pop >= 500_000) return 'large';
  if (pop >= 100_000) return 'medium';
  return 'small';
}

async function downloadFile(url, dest) {
  console.log(`📥 Downloading ${url}...`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download: ${response.status}`);
  const fileStream = createWriteStream(dest);
  await pipeline(response.body, fileStream);
  console.log(`   ✅ Saved`);
}

async function unzip(zipPath, destDir) {
  console.log(`📦 Extracting...`);
  const { default: AdmZip } = await import('adm-zip');
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, true);
  console.log(`   ✅ Extracted`);
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('🏙️  City Database Generator (ALL cities)');
  console.log('==========================================\n');

  mkdirSync(TEMP_DIR, { recursive: true });
  mkdirSync(join(ROOT, 'public', 'geo'), { recursive: true });

  // Download
  const zipPath = join(TEMP_DIR, 'ne_10m_populated_places.zip');
  if (!existsSync(zipPath)) {
    await downloadFile(NATURAL_EARTH_URL, zipPath);
  } else {
    console.log('📥 Using cached download...');
  }

  // Extract
  const shpDir = join(TEMP_DIR, 'extracted');
  if (!existsSync(shpDir)) {
    mkdirSync(shpDir, { recursive: true });
    await unzip(zipPath, shpDir);
  } else {
    console.log('📦 Using cached extraction...');
  }

  // Find .shp file
  const { readdirSync } = await import('fs');
  const files = readdirSync(shpDir);
  const shpFile = files.find(f => f.endsWith('.shp'));
  if (!shpFile) throw new Error('No .shp file found');
  
  const shpPath = join(shpDir, shpFile);
  console.log(`\n📄 Found: ${shpFile}`);

  // Read all places
  console.log('🔄 Reading populated places...');
  const shapefile = await import('shapefile');
  const source = await shapefile.open(shpPath);

  const cities = [];
  const nameCountMap = new Map(); // Track name occurrences for deduplication

  while (true) {
    const result = await source.read();
    if (result.done) break;

    const props = result.value.properties;
    const name = cleanStr(props.NAME) || cleanStr(props.NAMEASCII);
    const nameAscii = cleanStr(props.NAMEASCII) || name;
    const country = cleanStr(props.ISO_A2) || cleanStr(props.ADM0_A3)?.substring(0, 2);
    const pop = props.POP_MAX || props.POP_MIN || 0;
    const lat = props.LATITUDE;
    const lng = props.LONGITUDE;

    if (!name || !country || country === '-1' || !lat || !lng) continue;

    cities.push({ 
      name: nameAscii, 
      lat: parseFloat(lat.toFixed(4)), 
      lng: parseFloat(lng.toFixed(4)), 
      country, 
      pop, 
      tier: getTier(pop) 
    });
  }

  console.log(`   ✅ Read ${cities.length} places total`);

  // Sort by population (largest first) for consistent ordering
  cities.sort((a, b) => b.pop - a.pop);

  // Deduplicate: if same name appears multiple times, append country code to duplicates
  const seen = new Map();
  const deduped = [];

  for (const city of cities) {
    const key = city.name;
    if (seen.has(key)) {
      // This name already exists — disambiguate both
      const first = seen.get(key);
      if (first && !first.disambiguated) {
        // Rename the first occurrence too
        first.name = `${first.name}, ${first.country}`;
        first.disambiguated = true;
      }
      deduped.push({ ...city, name: `${city.name}, ${city.country}` });
    } else {
      seen.set(key, city);
      deduped.push(city);
    }
  }

  // Build output: Record<name, {lat, lng, country, tier}>
  const output = {};
  for (const city of deduped) {
    // Skip if somehow still duplicate (same name + same country)
    if (output[city.name]) continue;
    output[city.name] = { 
      lat: city.lat, 
      lng: city.lng, 
      country: city.country, 
      tier: city.tier 
    };
  }

  const cityCount = Object.keys(output).length;
  const json = JSON.stringify(output);
  writeFileSync(OUTPUT_FILE, json);
  
  const sizeKB = (json.length / 1024).toFixed(1);
  const countries = new Set(deduped.map(c => c.country));

  // Stats
  const tiers = { mega: 0, major: 0, large: 0, medium: 0, small: 0 };
  for (const city of deduped) tiers[city.tier]++;

  console.log(`\n📊 Stats:`);
  console.log(`   Total cities: ${cityCount}`);
  console.log(`   Countries covered: ${countries.size}`);
  console.log(`   Mega (5M+): ${tiers.mega}`);
  console.log(`   Major (1M+): ${tiers.major}`);
  console.log(`   Large (500K+): ${tiers.large}`);
  console.log(`   Medium (100K+): ${tiers.medium}`);
  console.log(`   Small (<100K): ${tiers.small}`);
  console.log(`\n✅ Written to ${OUTPUT_FILE} (${sizeKB} KB)`);
  console.log(`   Largest: ${deduped[0].name} (${deduped[0].pop.toLocaleString()})`);
  console.log(`   Smallest: ${deduped[deduped.length - 1].name} (${deduped[deduped.length - 1].pop.toLocaleString()})\n`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
