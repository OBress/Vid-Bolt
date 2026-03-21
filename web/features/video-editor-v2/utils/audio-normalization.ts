import type {
  AudioNormalizationMetadata,
  AudioNormalizationStatus,
} from '@/lib/services/audio-normalization-metadata';
import { ingestExternalAudio } from '../services/media-storage-service';

type MediaType = 'video' | 'image' | 'audio';

export interface NormalizableMediaSource extends AudioNormalizationMetadata {
  type?: MediaType;
  path?: string;
  s3Url?: string;
  src?: string;
  url?: string;
  file?: string;
  name?: string;
  filename?: string;
  projectId?: string | null;
  _isLocalMedia?: boolean;
}

export function getMediaSourceUrl(media: NormalizableMediaSource): string {
  return media.path || media.s3Url || media.src || media.url || media.file || '';
}

export function getNormalizedAudioUrl(
  media: NormalizableMediaSource,
): string | null {
  if (media.type === 'audio') {
    if (media.normalizedAudioUrl) {
      return media.normalizedAudioUrl;
    }

    if (media.audioNormalizationStatus === 'completed') {
      return getMediaSourceUrl(media) || null;
    }

    return null;
  }

  if (media.type === 'video') {
    return media.normalizedAudioUrl || null;
  }

  return null;
}

export function getNormalizationBlockReason(
  media: NormalizableMediaSource,
): string | null {
  const type = media.type;
  const status = media.audioNormalizationStatus;

  if (!type || type === 'image') {
    return null;
  }

  if (status === 'failed') {
    return media.audioNormalizationError || 'Audio normalization failed';
  }

  if (status === 'pending' || status === 'processing') {
    return 'Audio is still being normalized';
  }

  if (type === 'audio' && !getNormalizedAudioUrl(media)) {
    return 'Audio is missing a normalized playback URL';
  }

  if (
    type === 'video' &&
    media.hasEmbeddedAudio &&
    !getNormalizedAudioUrl(media)
  ) {
    return 'Video audio is missing its normalized linked audio';
  }

  return null;
}

export function isTimelineReadyMedia(
  media: NormalizableMediaSource,
): boolean {
  return getNormalizationBlockReason(media) === null;
}

export async function ensureNormalizedTimelineAudio(
  media: NormalizableMediaSource,
  projectId?: string | null,
): Promise<{
  url: string;
  audioNormalizationStatus: AudioNormalizationStatus;
  normalizedAudioUrl: string;
  originalLufs?: number | null;
  normalizedLufs?: number | null;
  truePeakDbtp?: number | null;
}> {
  const readyUrl = getNormalizedAudioUrl(media);
  const blockReason = getNormalizationBlockReason(media);

  if (readyUrl && !blockReason) {
    return {
      url: readyUrl,
      audioNormalizationStatus: 'completed',
      normalizedAudioUrl: readyUrl,
      originalLufs: media.originalLufs ?? null,
      normalizedLufs: media.normalizedLufs ?? null,
      truePeakDbtp: media.truePeakDbtp ?? null,
    };
  }

  const rawUrl = getMediaSourceUrl(media);
  if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
    throw new Error(blockReason || 'Audio source is not ready');
  }

  const ingested = await ingestExternalAudio({
    sourceUrl: rawUrl,
    projectId: projectId || media.projectId || undefined,
    filename: media.name || media.filename,
  });

  if (
    ingested.audioNormalizationStatus !== 'completed' ||
    !ingested.normalizedAudioUrl
  ) {
    throw new Error(
      ingested.audioNormalizationError || 'Failed to normalize external audio',
    );
  }

  return {
    url: ingested.normalizedAudioUrl,
    audioNormalizationStatus: ingested.audioNormalizationStatus,
    normalizedAudioUrl: ingested.normalizedAudioUrl,
    originalLufs: ingested.originalLufs ?? null,
    normalizedLufs: ingested.normalizedLufs ?? null,
    truePeakDbtp: ingested.truePeakDbtp ?? null,
  };
}
