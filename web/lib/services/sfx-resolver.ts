/**
 * SFX Resolver
 * ============================================================================
 * Resolves AI-generated SFX descriptions to actual audio file URLs
 * using the Freesound API.
 *
 * Called during the production pipeline after the AV-script worker
 * generates shot descriptions with sound_effects[].description fields.
 *
 * Example flow:
 *   AI outputs: { type: "chain snap", description: "Heavy metal chain breaking" }
 *   Resolver:   searches Freesound → finds best match → populates audio_url
 */

import { findBestMatch } from '@/lib/services/freesound-service';
import type { SoundEffect } from '@/types/video';

// ============================================================================
// TYPES
// ============================================================================

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
 * @param soundEffects - Array of SoundEffect entries with description text
 * @param maxDuration - Max duration for SFX clips (default: 10s)
 * @returns Updated sound effects with audio_url populated where possible
 */
export async function resolveSfxUrls(
  soundEffects: SoundEffect[],
  maxDuration: number = 10
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

  console.log(`[SfxResolver] Resolving ${soundEffects.length} SFX entries...`);

  const resolvedEffects: SoundEffect[] = [];

  for (const sfx of soundEffects) {
    try {
      // Search Freesound using the AI-generated description
      const match = await findBestMatch(sfx.description, maxDuration);

      if (match) {
        resolvedEffects.push({
          ...sfx,
          audio_url: match.url,
          freesound_id: match.id,
        });
        stats.resolved++;
        stats.details.push({
          type: sfx.type,
          description: sfx.description,
          resolved: true,
          audio_url: match.url,
          freesound_id: match.id,
        });
        console.log(
          `[SfxResolver] ✓ "${sfx.type}" → "${match.name}" (${match.duration.toFixed(1)}s)`
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
 * @returns Updated shots with audio_url populated on their sound_effects
 */
export async function resolveSfxForShots<
  T extends { sound_effects?: SoundEffect[] }
>(shots: T[]): Promise<{ shots: T[]; totalStats: SfxResolutionResult }> {
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
  const { resolved, stats } = await resolveSfxUrls(allSfxEffects);

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
