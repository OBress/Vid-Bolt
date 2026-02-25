/**
 * Freesound Audio Adaptor
 * ============================================================================
 * Implements SoundOverlayAdaptor for the video editor's AudioTab.
 * Searches Freesound.org via the /api/audio/search proxy route.
 *
 * Preview URLs are browser-playable MP3s (no auth needed).
 */

import { SoundOverlayAdaptor } from '../types/overlay-adaptors';
import { StandardAudio } from '../types/media-adaptors';

/**
 * Freesound audio adaptor for the editor.
 * Provides live search against Freesound's 500k+ CC0 sound library.
 */
export const freesoundAudioAdaptor: SoundOverlayAdaptor = {
  name: 'freesound',
  displayName: 'Freesound SFX',
  description: 'Search 500k+ CC0 sound effects from Freesound.org',
  requiresAuth: false,

  search: async (params) => {
    const query = params.query?.trim();

    // Don't call API with empty query
    if (!query) {
      return { items: [], totalCount: 0, hasMore: false };
    }

    try {
      const searchParams = new URLSearchParams({
        q: query,
        page: String(params.page || 1),
        per_page: String(params.perPage || 20),
        max_duration: '30', // SFX are typically short
      });

      const response = await fetch(`/api/audio/search?${searchParams.toString()}`);

      if (!response.ok) {
        console.error(`[FreesoundAdaptor] Search failed: ${response.status}`);
        return { items: [], totalCount: 0, hasMore: false };
      }

      const data = await response.json();

      // Transform API response to StandardAudio[]
      const items: StandardAudio[] = (data.items || []).map((item: Record<string, unknown>) => ({
        id: item.id as string,
        title: item.title as string,
        artist: item.artist as string,
        duration: item.duration as number,
        file: item.file as string,
        thumbnail: item.thumbnail as string | undefined,
        attribution: item.attribution as StandardAudio['attribution'],
      }));

      return {
        items,
        totalCount: data.totalCount || items.length,
        hasMore: data.hasMore || false,
      };
    } catch (error) {
      console.error('[FreesoundAdaptor] Search error:', error);
      return { items: [], totalCount: 0, hasMore: false };
    }
  },

  getAudioUrl: (audio: StandardAudio) => audio.file,
};
