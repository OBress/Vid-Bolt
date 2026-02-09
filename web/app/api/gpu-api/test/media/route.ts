/**
 * GPU API Test Media Listing
 * ============================================================================
 * [DEVTOOLS-MEDIA] - This entire file supports DevTools media browsing.
 * Remove this file when the DevTools media integration is no longer needed.
 * 
 * Lists all GPU test media from R2 storage and returns them as typed items
 * for the Video Editor V2 asset panel.
 */

import { NextResponse } from 'next/server';
import {
  listFilesWithPrefix,
  getPublicUrl,
  STORAGE_PATHS,
} from '@/lib/services/r2-storage';

// Infer media type from R2 key filename
function inferMediaType(key: string): 'image' | 'video' | 'audio' | null {
  const filename = key.split('/').pop() || '';
  if (filename.startsWith('image_')) return 'image';
  if (filename.startsWith('video_')) return 'video';
  if (filename.startsWith('music_') || filename.startsWith('sfx_')) return 'audio';

  // Fallback: check extension
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp') return 'image';
  if (ext === 'mp4' || ext === 'webm') return 'video';
  if (ext === 'mp3' || ext === 'wav' || ext === 'ogg') return 'audio';

  return null;
}

// Generate a human-readable name from the R2 key
function nameFromKey(key: string): string {
  const filename = key.split('/').pop() || key;
  // e.g. "image_1707400000000_abc1234.png" → "image-abc1234"
  const parts = filename.replace(/\.[^.]+$/, '').split('_');
  const type = parts[0] || 'media';
  const id = parts[2] || parts[1] || '';
  return `${type}-${id.slice(0, 8)}`;
}

export async function GET() {
  try {
    const prefix = `${STORAGE_PATHS.TEMPORARY}/${STORAGE_PATHS.GPU_TEST}/`;
    const files = await listFilesWithPrefix(prefix);

    const items = files
      .map((file) => {
        const type = inferMediaType(file.key);
        if (!type) return null;

        return {
          id: file.key, // Use the R2 key as a stable ID
          type,
          url: getPublicUrl(file.key),
          name: nameFromKey(file.key),
          createdAt: file.lastModified.getTime(),
        };
      })
      .filter(Boolean)
      // Most recent first
      .sort((a, b) => (b?.createdAt ?? 0) - (a?.createdAt ?? 0));

    return NextResponse.json({ success: true, items });
  } catch (error) {
    console.error('[DevTools Media] Failed to list GPU test media:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error', items: [] },
      { status: 500 }
    );
  }
}
