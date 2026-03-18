/**
 * Pipeline Timeout Calculator
 * ============================================================================
 * Centralized, dynamic timeout formulas for every phase of the video pipeline.
 *
 * Design principles:
 *   1. Lenient — 3× multiplier on all estimates; timeouts are safety nets,
 *      not performance targets. They should ONLY fire for genuinely stuck jobs.
 *   2. Content-aware — scale with word count, segment count, shot count,
 *      video duration, or whatever the appropriate driver is for each phase.
 *   3. Floor + no ceiling — every timeout has a generous minimum (5 min)
 *      but NO upper cap so hour-long content never hits a wall.
 *   4. Logged — every computed timeout is logged for easy debugging.
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/** Safety multiplier: timeouts = estimated_time × LENIENCY */
const LENIENCY = 3;

/** No timeout shorter than 5 minutes, ever. */
const GLOBAL_FLOOR_MS = 300_000;

const LOG_PREFIX = '[PipelineTimeouts]';

// ============================================================================
// PHASE I: TTS
// ============================================================================

/**
 * Calculate timeout for TTS generation.
 *
 * Inworld TTS chunks ~500 words at a time, each chunk takes ~4-8s.
 * We use 8s worst-case per chunk × LENIENCY.
 *
 * @param wordCount - Total words in the script
 * @returns Timeout in milliseconds
 */
export function calculateTtsTimeout(wordCount: number): number {
  const WORDS_PER_CHUNK = 500;
  const SECONDS_PER_CHUNK = 8; // worst-case per chunk
  const FIXED_OVERHEAD_S = 30; // queue + startup time

  const chunkCount = Math.max(1, Math.ceil(wordCount / WORDS_PER_CHUNK));
  const estimatedSeconds = chunkCount * SECONDS_PER_CHUNK + FIXED_OVERHEAD_S;
  const timeout = Math.max(GLOBAL_FLOOR_MS, estimatedSeconds * 1_000 * LENIENCY);

  console.log(
    `${LOG_PREFIX} TTS: ${Math.round(timeout / 1000)}s ` +
    `(${wordCount} words → ${chunkCount} chunks × ${SECONDS_PER_CHUNK}s × ${LENIENCY}x leniency)`
  );
  return timeout;
}

// ============================================================================
// PHASE II: SHOT PLANNING
// ============================================================================

/**
 * Calculate timeout for shot planning.
 *
 * The shot planner generates ~1 segment per 5s of content, then processes them
 * in LLM batches of ~10 segments each. Each batch takes ~4-8s.
 *
 * @param totalDurationSeconds - Total audio/video duration in seconds
 * @returns Timeout in milliseconds
 */
export function calculateShotPlannerTimeout(totalDurationSeconds: number): number {
  const SECONDS_PER_SEGMENT = 5; // ~1 segment per 5s of content
  const SEGMENTS_PER_BATCH = 10; // LLM processes in batches
  const SECONDS_PER_BATCH = 8;   // worst-case per LLM batch
  const FIXED_OVERHEAD_S = 30;   // queue + startup + DB reads

  const estimatedSegments = Math.max(1, Math.ceil(totalDurationSeconds / SECONDS_PER_SEGMENT));
  const estimatedBatches = Math.max(1, Math.ceil(estimatedSegments / SEGMENTS_PER_BATCH));
  const estimatedSeconds = estimatedBatches * SECONDS_PER_BATCH + FIXED_OVERHEAD_S;
  const timeout = Math.max(GLOBAL_FLOOR_MS, estimatedSeconds * 1_000 * LENIENCY);

  console.log(
    `${LOG_PREFIX} ShotPlanner: ${Math.round(timeout / 1000)}s ` +
    `(${totalDurationSeconds.toFixed(0)}s audio → ~${estimatedSegments} segments → ` +
    `${estimatedBatches} LLM batches × ${SECONDS_PER_BATCH}s × ${LENIENCY}x leniency)`
  );
  return timeout;
}

// ============================================================================
// PHASE III: ASSET RETRIEVAL
// ============================================================================

/**
 * Calculate timeout for asset scout (stock search + AI prompt generation).
 *
 * The asset scout processes shots in LLM batches, each batch doing vector search
 * + prompt generation. ~2-4s per shot in practice.
 *
 * @param shotCount - Number of shots to process
 * @returns Timeout in milliseconds
 */
export function calculateAssetScoutTimeout(shotCount: number): number {
  const SECONDS_PER_SHOT = 4;    // stock search + prompt gen per shot
  const FIXED_OVERHEAD_S = 30;   // queue + startup + DB reads

  const estimatedSeconds = shotCount * SECONDS_PER_SHOT + FIXED_OVERHEAD_S;
  const timeout = Math.max(GLOBAL_FLOOR_MS, estimatedSeconds * 1_000 * LENIENCY);

  console.log(
    `${LOG_PREFIX} AssetScout: ${Math.round(timeout / 1000)}s ` +
    `(${shotCount} shots × ${SECONDS_PER_SHOT}s × ${LENIENCY}x leniency)`
  );
  return timeout;
}

// ============================================================================
// PHASE V: ASSEMBLY
// ============================================================================

/**
 * Calculate timeout for edit assembly.
 *
 * The assembler generates EDL chunks via LLM, ~15-25s per shot.
 * NO UPPER CAP — lets hour-long videos take as long as needed.
 *
 * @param shotCount - Number of shots in the timeline
 * @returns Timeout in milliseconds
 */
export function calculateAssemblyTimeout(shotCount: number): number {
  const BASE_S = 120;              // fixed startup overhead
  const SECONDS_PER_SHOT = 20;     // EDL generation per shot
  const FIXED_OVERHEAD_S = 30;     // queue + startup

  const estimatedSeconds = BASE_S + shotCount * SECONDS_PER_SHOT + FIXED_OVERHEAD_S;
  const timeout = Math.max(GLOBAL_FLOOR_MS, estimatedSeconds * 1_000 * LENIENCY);

  console.log(
    `${LOG_PREFIX} Assembly: ${Math.round(timeout / 1000)}s ` +
    `(${shotCount} shots × ${SECONDS_PER_SHOT}s + ${BASE_S}s base × ${LENIENCY}x leniency)`
  );
  return timeout;
}

// ============================================================================
// VERIFICATION LOOP TIMEOUTS
// ============================================================================

/**
 * Timeout for image edit jobs (recoverable verification failures).
 * Single GPU edit operation — generous but bounded.
 */
export function calculateImageEditTimeout(): number {
  return 90_000; // 90s — single edit + network buffer
}

/**
 * Timeout for verifier jobs (VLM quality gate).
 *
 * @param mediaType - 'image' or 'video'
 * @returns Timeout in milliseconds
 */
export function calculateVerifierTimeout(mediaType: 'image' | 'video'): number {
  // Video verification requires downloading + analyzing video frames — slower
  return mediaType === 'video' ? 180_000 : 120_000;
}

/**
 * Timeout for portrait generation (GCM entity portraits).
 * Single image generation — generous but bounded.
 */
export function calculatePortraitTimeout(): number {
  return 120_000; // 2 min — single portrait gen + webhook
}
