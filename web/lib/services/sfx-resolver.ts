/**
 * SFX Resolver
 * ============================================================================
 * Resolves AI-generated SFX descriptions to actual audio file URLs
 * using the Freesound API.
 *
 * When R2 context (userId, videoId) is provided, SFX audio is:
 *   1. Downloaded from Freesound
 *   2. Normalized to -16 LUFS (EBU R128 compliant)
 *   3. Uploaded to R2 storage
 *   4. The R2 URL is returned (not the external Freesound URL)
 *
 * Called during the production pipeline after the AV-script worker
 * generates shot descriptions with sound_effects[].description fields.
 *
 * Example flow:
 *   AI outputs: { type: "chain snap", description: "Heavy metal chain breaking" }
 *   Resolver:   searches Freesound → finds best match → downloads → normalizes → uploads to R2
 */

import { findBestMatch } from '@/lib/services/freesound-service';
import type { SoundEffect } from '@/types/video';

// ============================================================================
// TYPES
// ============================================================================

/** Optional R2 storage context for caching + normalizing SFX to R2 */
export interface SfxR2Context {
  userId: string;
  videoId: string;
}

export interface SfxResolutionResult {
  /** Total SFX entries processed */
  total: number;
  /** Successfully resolved (have audio_url) */
  resolved: number;
  /** Failed to resolve (no match or API error) */
  failed: number;
  /** Per-SFX resolution details */
  details: Array<{
    type: string;
    description: string;
    resolved: boolean;
    audio_url?: string;
    freesound_id?: number;
    /** Whether the audio was normalized and cached in R2 */
    cachedInR2?: boolean;
    error?: string;
  }>;
}

// ============================================================================
// RATE LIMITER
// ============================================================================

/**
 * Simple rate limiter to respect Freesound's 60 req/min limit.
 * Adds a small delay between requests.
 */
const DELAY_BETWEEN_REQUESTS_MS = 200; // 5 req/sec = 300 req/min (well under 60/min bursts)

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// RESOLVER
// ============================================================================

/**
 * Resolve SFX descriptions to audio URLs for a single shot's sound effects.
 *
 * When `r2Context` is provided, each resolved SFX is downloaded from Freesound,
 * normalized to -16 LUFS, and cached in R2. The returned `audio_url` points
 * to the R2 copy, not the external Freesound URL.
 *
 * @param soundEffects - Array of SoundEffect entries with description text
 * @param maxDuration - Max duration for SFX clips (default: 10s)
 * @param r2Context - Optional userId/videoId for R2 caching + normalization
 * @returns Updated sound effects with audio_url populated where possible
 */
export async function resolveSfxUrls(
  soundEffects: SoundEffect[],
  maxDuration: number = 10,
  r2Context?: SfxR2Context,
): Promise<{ resolved: SoundEffect[]; stats: SfxResolutionResult }> {
  const stats: SfxResolutionResult = {
    total: soundEffects.length,
    resolved: 0,
    failed: 0,
    details: [],
  };

  if (soundEffects.length === 0) {
    return { resolved: [], stats };
  }

  console.log(`[SfxResolver] Resolving ${soundEffects.length} SFX entries${r2Context ? ' (with R2 caching + normalization)' : ''}...`);

  const resolvedEffects: SoundEffect[] = [];

  for (const sfx of soundEffects) {
    try {
      // Search Freesound using the AI-generated description
      const match = await findBestMatch(sfx.description, maxDuration);

      if (match) {
        let finalUrl = match.url;
        let cachedInR2 = false;

        // If R2 context is available, download → normalize → cache in R2
        if (r2Context) {
          try {
            const cached = await cacheAndNormalizeSfx(
              match.url,
              match.id,
              sfx.type,
              r2Context,
            );
            if (cached) {
              finalUrl = cached;
              cachedInR2 = true;
            }
          } catch (cacheErr) {
            console.warn(`[SfxResolver] R2 caching failed for "${sfx.type}", using Freesound URL:`, cacheErr);
          }
        }

        resolvedEffects.push({
          ...sfx,
          audio_url: finalUrl,
          freesound_id: match.id,
        });
        stats.resolved++;
        stats.details.push({
          type: sfx.type,
          description: sfx.description,
          resolved: true,
          audio_url: finalUrl,
          freesound_id: match.id,
          cachedInR2,
        });
        console.log(
          `[SfxResolver] ✓ "${sfx.type}" → "${match.name}" (${match.duration.toFixed(1)}s)${cachedInR2 ? ' [R2 cached + normalized]' : ''}`
        );
      } else {
        // No match found — keep the SFX entry without audio_url
        resolvedEffects.push(sfx);
        stats.failed++;
        stats.details.push({
          type: sfx.type,
          description: sfx.description,
          resolved: false,
          error: 'No matching sound found',
        });
        console.log(`[SfxResolver] ✗ "${sfx.type}" — no match for "${sfx.description}"`);
      }
    } catch (error) {
      // API error — keep the SFX entry without audio_url
      resolvedEffects.push(sfx);
      stats.failed++;
      stats.details.push({
        type: sfx.type,
        description: sfx.description,
        resolved: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      console.error(`[SfxResolver] ✗ "${sfx.type}" — error:`, error);
    }

    // Rate limit between calls
    if (soundEffects.indexOf(sfx) < soundEffects.length - 1) {
      await delay(DELAY_BETWEEN_REQUESTS_MS);
    }
  }

  console.log(
    `[SfxResolver] Done: ${stats.resolved}/${stats.total} resolved, ${stats.failed} failed`
  );

  return { resolved: resolvedEffects, stats };
}

/**
 * Resolve SFX for multiple shots at once.
 * Processes all sound_effects arrays across all shots.
 *
 * @param shots - Array of shots with sound_effects to resolve
 * @param r2Context - Optional userId/videoId for R2 caching + normalization
 * @returns Updated shots with audio_url populated on their sound_effects
 */
export async function resolveSfxForShots<
  T extends { sound_effects?: SoundEffect[] }
>(shots: T[], r2Context?: SfxR2Context): Promise<{ shots: T[]; totalStats: SfxResolutionResult }> {
  // Collect all SFX entries and their shot indices
  const allSfx: Array<{ shotIndex: number; sfxIndex: number; sfx: SoundEffect }> = [];

  shots.forEach((shot, shotIndex) => {
    shot.sound_effects?.forEach((sfx, sfxIndex) => {
      allSfx.push({ shotIndex, sfxIndex, sfx });
    });
  });

  if (allSfx.length === 0) {
    return {
      shots,
      totalStats: { total: 0, resolved: 0, failed: 0, details: [] },
    };
  }

  console.log(
    `[SfxResolver] Resolving ${allSfx.length} SFX across ${shots.length} shots...`
  );

  // Resolve all SFX descriptions
  const allSfxEffects = allSfx.map(entry => entry.sfx);
  const { resolved, stats } = await resolveSfxUrls(allSfxEffects, 10, r2Context);

  // Map resolved SFX back to their shots
  const updatedShots = shots.map(shot => ({ ...shot }));

  allSfx.forEach((entry, i) => {
    const shot = updatedShots[entry.shotIndex];
    if (shot.sound_effects) {
      shot.sound_effects = [...(shot.sound_effects || [])];
      shot.sound_effects[entry.sfxIndex] = resolved[i];
    }
  });

  return { shots: updatedShots, totalStats: stats };
}

// ============================================================================
// R2 CACHING + NORMALIZATION
// ============================================================================

/**
 * Download SFX audio from Freesound, normalize to -16 LUFS, and upload to R2.
 *
 * @param freesoundUrl - External Freesound preview URL
 * @param freesoundId - Freesound sound ID (for key generation)
 * @param sfxType - SFX type label (for key generation)
 * @param r2Context - userId/videoId for R2 key generation
 * @returns R2 public URL, or null if caching failed
 */
async function cacheAndNormalizeSfx(
  freesoundUrl: string,
  freesoundId: number,
  sfxType: string,
  r2Context: SfxR2Context,
): Promise<string | null> {
  const { downloadAudioFromUrl, normalizeAudio } = await import('./audio-normalizer');
  const { uploadAudioBuffer, generateMediaKey, STORAGE_PATHS, getPublicUrl } = await import('./r2-storage');

  // Download from Freesound
  const audioBuffer = await downloadAudioFromUrl(freesoundUrl);

  if (audioBuffer.length === 0) {
    console.warn(`[SfxResolver] Downloaded empty audio for SFX "${sfxType}" (id: ${freesoundId})`);
    return null;
  }

  // Detect format from URL
  const urlPath = new URL(freesoundUrl).pathname;
  const ext = urlPath.split('.').pop()?.toLowerCase() || 'mp3';
  const inputFormat = ['wav', 'flac', 'ogg', 'aac'].includes(ext) ? ext : 'mp3';

  // Normalize to -16 LUFS (always output as MP3 for consistency)
  let finalBuffer = audioBuffer;
  try {
    const normResult = await normalizeAudio(audioBuffer, { inputFormat, outputFormat: 'mp3' });
    if (normResult.normalized) {
      finalBuffer = normResult.buffer;
      console.log(
        `[SfxResolver] Normalized "${sfxType}": ${normResult.originalLufs.toFixed(1)} → ${normResult.normalizedLufs.toFixed(1)} LUFS ` +
        `(${normResult.processingTimeMs}ms)`
      );
    } else if (normResult.skipReason) {
      console.log(`[SfxResolver] Normalization skipped for "${sfxType}" — ${normResult.skipReason}`);
    }
  } catch (normErr) {
    console.warn(`[SfxResolver] Normalization failed for "${sfxType}", uploading original:`, normErr);
  }

  // Upload to R2
  const safeSfxType = sfxType.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
  const filename = `${safeSfxType}-${freesoundId}.mp3`;
  const r2Key = generateMediaKey(
    r2Context.userId,
    r2Context.videoId,
    STORAGE_PATHS.AUDIO.SOUND_EFFECTS,
    filename,
  );

  await uploadAudioBuffer(finalBuffer, r2Key, 'audio/mpeg');
  return getPublicUrl(r2Key);
}
