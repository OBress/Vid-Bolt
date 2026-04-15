/**
 * MG Channel Style Manifest
 * ============================================================================
 * Manages cross-video brand consistency for motion graphics on the same channel.
 * A channel style manifest captures the accent color, font, and mode established
 * in early videos so that subsequent videos on the same channel feel visually related.
 *
 * Derived from: manifest.color_palette and manifest.style.mg_font in channel settings.
 * Storage: Persisted to media_project metadata in Supabase.
 */

import { getSupabaseServiceClient } from '@/lib/queues/shared';

// ============================================================================
// TYPES
// ============================================================================

export interface ChannelStyleManifest {
  /** Channel / media project ID this style belongs to */
  channelId: string;
  /** Primary accent color — drives borders, stamps, and emphasis */
  accentColor: string;
  /** Font family name for all MG text */
  fontFamily: string;
  /** Whether MG should use dark (near-black) or light backgrounds */
  darkMode: boolean;
  /** Corner radius system */
  borderRadiusSystem: 'sharp' | 'medium' | 'rounded';
  /** ISO timestamp of when this manifest was last updated */
  lastUpdated: string;
}

const LOG_PREFIX = '[MgChannelStyle]';

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Load the channel style manifest from media_project metadata.
 * Returns null if no project ID is provided or no manifest exists.
 */
export async function loadChannelStyleManifest(
  channelId: string | null | undefined,
): Promise<ChannelStyleManifest | null> {
  if (!channelId) return null;

  try {
    const supabase = getSupabaseServiceClient();
    const { data } = await supabase
      .from('media_projects')
      .select('metadata')
      .eq('id', channelId)
      .single();

    const manifest = data?.metadata?.mgChannelStyle;
    if (manifest && manifest.channelId === channelId) {
      return manifest as ChannelStyleManifest;
    }
  } catch (err) {
    console.warn(`${LOG_PREFIX} Failed to load channel style for ${channelId}:`, err);
  }

  return null;
}

/**
 * Persist the channel style manifest to media_project metadata.
 */
export async function saveChannelStyleManifest(
  manifest: ChannelStyleManifest,
): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data } = await supabase
      .from('media_projects')
      .select('metadata')
      .eq('id', manifest.channelId)
      .single();

    const currentMetadata = (data?.metadata as Record<string, unknown>) || {};
    await supabase
      .from('media_projects')
      .update({
        metadata: {
          ...currentMetadata,
          mgChannelStyle: manifest,
        },
      })
      .eq('id', manifest.channelId);

    console.log(`${LOG_PREFIX} Saved channel style for ${manifest.channelId}`);
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to save channel style:`, err);
  }
}

// ============================================================================
// DERIVATION
// ============================================================================

/**
 * Derive a channel style manifest from the creative manifest fields that already
 * exist in channel settings (color_palette, mg_font, mg_theme).
 */
export function deriveChannelStyle(
  channelId: string,
  colorPalette: string[] | undefined,
  mgFont: string | undefined,
  mgTheme: 'dark' | 'light' | undefined,
): ChannelStyleManifest {
  // Pick the most visually prominent color from the palette as accent
  // Heuristic: skip near-black/near-white, use first vivid color
  const accentColor = pickAccentFromPalette(colorPalette) || '#e2b714';
  const fontFamily = mgFont || 'Inter';
  const darkMode = mgTheme !== 'light';

  return {
    channelId,
    accentColor,
    fontFamily,
    darkMode,
    borderRadiusSystem: 'medium',
    lastUpdated: new Date().toISOString(),
  };
}

function pickAccentFromPalette(palette: string[] | undefined): string | null {
  if (!palette || palette.length === 0) return null;
  for (const color of palette) {
    const hex = color.replace('#', '');
    if (hex.length !== 6) continue;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    // Skip near-black (brightness < 30) and near-white (brightness > 220)
    const brightness = (r + g + b) / 3;
    if (brightness < 30 || brightness > 220) continue;
    return color;
  }
  // Fall back to first color
  return palette[0] || null;
}

// ============================================================================
// PROMPT INJECTION
// ============================================================================

/**
 * Build a prompt fragment that injects channel brand tokens into every MG generation.
 * This ensures all MGs on a channel share the same visual DNA regardless of video.
 */
export function buildChannelStyleFragment(
  manifest: ChannelStyleManifest | null,
): string {
  if (!manifest) return '';

  const radiusDesc =
    manifest.borderRadiusSystem === 'sharp'
      ? '2-4px (angular, architectural)'
      : manifest.borderRadiusSystem === 'rounded'
        ? '20-28px (soft, approachable)'
        : '10-16px (balanced)';

  return `\nCHANNEL BRAND TOKENS (apply to every motion graphic on this channel):
- Accent color: ${manifest.accentColor} — use for borders, stamps, highlights, and active indicators
- Font family: ${manifest.fontFamily} — use for all headings and labels
- Background mode: ${manifest.darkMode ? 'dark (near-black backgrounds #0b1020 – #1f2937)' : 'light (near-white backgrounds)'}
- Border radius: ${radiusDesc}
These tokens create cross-video visual consistency. Vary layouts and animations freely.\n`;
}
