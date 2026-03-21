import { getKeyFromUrl } from './r2-storage';

export interface VideoEditorMediaRow {
  id: string;
  user_id: string;
  project_id: string | null;
  s3_key: string;
  s3_url: string;
  name: string;
  type: 'video' | 'image' | 'audio';
  size: number;
  duration: number | null;
  thumbnail: string | null;
  width: number | null;
  height: number | null;
  audio_normalization_status?: string | null;
  has_embedded_audio?: boolean | null;
  normalized_audio_url?: string | null;
  original_lufs?: number | null;
  normalized_lufs?: number | null;
  true_peak_dbtp?: number | null;
  audio_normalization_error?: string | null;
  audio_normalized_at?: string | null;
  created_at: string;
}

export function mapVideoEditorMediaRow(
  item: VideoEditorMediaRow,
  source: 'upload' | 'generated' = 'upload',
) {
  return {
    id: item.id,
    userId: item.user_id,
    projectId: item.project_id,
    s3Key: item.s3_key,
    s3Url: item.s3_url,
    name: item.name,
    type: item.type,
    size: item.size,
    duration: item.duration,
    thumbnail: item.thumbnail,
    width: item.width,
    height: item.height,
    audioNormalizationStatus: item.audio_normalization_status ?? null,
    hasEmbeddedAudio: item.has_embedded_audio ?? null,
    normalizedAudioUrl: item.normalized_audio_url ?? null,
    originalLufs: item.original_lufs ?? null,
    normalizedLufs: item.normalized_lufs ?? null,
    truePeakDbtp: item.true_peak_dbtp ?? null,
    audioNormalizationError: item.audio_normalization_error ?? null,
    audioNormalizedAt: item.audio_normalized_at ?? null,
    createdAt: item.created_at,
    source,
  };
}

export function getVideoEditorMediaDeletionKeys(item: {
  s3_key?: string | null;
  normalized_audio_url?: string | null;
  s3_url?: string | null;
}): string[] {
  const keys = new Set<string>();

  if (item.s3_key) {
    keys.add(item.s3_key);
  }

  if (
    item.normalized_audio_url &&
    item.normalized_audio_url !== item.s3_url
  ) {
    keys.add(getKeyFromUrl(item.normalized_audio_url));
  }

  return Array.from(keys);
}
