/**
 * List GPU API Test Media Gallery
 * ============================================================================
 * API endpoint to list all generated media in R2 for GPU API testing.
 * Returns files grouped by type (image, video, music, sfx, segmentation).
 */

import { NextRequest, NextResponse } from 'next/server';
import { listFilesWithPrefix, isR2Configured, getPublicUrl, STORAGE_PATHS } from '@/lib/services/r2-storage';

// GPU API test storage prefix (under temporary/)
const GPU_TEST_PREFIX = `${STORAGE_PATHS.TEMPORARY}/${STORAGE_PATHS.GPU_TEST}/`;

interface MediaItem {
  key: string;
  url: string;
  type: 'image' | 'video' | 'audio' | 'json' | 'unknown';
  size: number;
  lastModified: string;
  filename: string;
}

function getMediaType(key: string): MediaItem['type'] {
  const ext = key.split('.').pop()?.toLowerCase();
  if (!ext) return 'unknown';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'mov'].includes(ext)) return 'video';
  if (['wav', 'mp3', 'ogg', 'flac'].includes(ext)) return 'audio';
  if (ext === 'json') return 'json';
  return 'unknown';
}

export async function GET(_request: NextRequest) {
  try {
    if (!isR2Configured()) {
      return NextResponse.json(
        { success: false, error: 'R2 storage is not configured' },
        { status: 500 }
      );
    }

    const files = await listFilesWithPrefix(GPU_TEST_PREFIX);

    const media: MediaItem[] = files
      .map((file) => ({
        key: file.key,
        url: getPublicUrl(file.key),
        type: getMediaType(file.key),
        size: file.size,
        lastModified: file.lastModified.toISOString(),
        filename: file.key.split('/').pop() || file.key,
      }))
      .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());

    return NextResponse.json({
      success: true,
      data: {
        total: media.length,
        images: media.filter(m => m.type === 'image'),
        videos: media.filter(m => m.type === 'video'),
        audio: media.filter(m => m.type === 'audio'),
        json: media.filter(m => m.type === 'json'),
      },
    });
  } catch (error) {
    console.error('[MediaGallery] Failed to list media:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list media',
      },
      { status: 500 }
    );
  }
}
