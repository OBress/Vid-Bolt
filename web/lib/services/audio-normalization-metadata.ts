export const AUDIO_NORMALIZATION_STATUSES = [
  'pending',
  'processing',
  'completed',
  'failed',
  'not_applicable',
] as const;

export type AudioNormalizationStatus =
  (typeof AUDIO_NORMALIZATION_STATUSES)[number];

export interface AudioNormalizationMetadata {
  audioNormalizationStatus?: AudioNormalizationStatus | null;
  hasEmbeddedAudio?: boolean | null;
  normalizedAudioUrl?: string | null;
  originalLufs?: number | null;
  normalizedLufs?: number | null;
  truePeakDbtp?: number | null;
  audioNormalizationError?: string | null;
  audioNormalizedAt?: string | null;
}

export function getInitialAudioNormalizationStatus(
  mediaType: 'video' | 'image' | 'audio',
): AudioNormalizationStatus {
  return mediaType === 'image' ? 'not_applicable' : 'pending';
}

export function isAudioNormalizationReady(
  mediaType: 'video' | 'image' | 'audio',
  metadata: AudioNormalizationMetadata,
): boolean {
  if (mediaType === 'image') {
    return true;
  }

  if (mediaType === 'audio') {
    return (
      metadata.audioNormalizationStatus === 'completed' &&
      !!metadata.normalizedAudioUrl
    );
  }

  if (metadata.hasEmbeddedAudio === false) {
    return metadata.audioNormalizationStatus === 'completed';
  }

  return (
    metadata.audioNormalizationStatus === 'completed' &&
    !!metadata.normalizedAudioUrl
  );
}

