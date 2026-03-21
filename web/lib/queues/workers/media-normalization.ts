import { Job, Processor } from 'bullmq';
import { parse } from 'path';
import { getSupabaseServiceClient } from '@/lib/queues/shared';
import {
  extractAndNormalizeVideoAudioFromR2,
  normalizeAudioFromR2,
  type NormalizationResult,
} from '@/lib/services/audio-normalizer';
import { generateVideoEditorDerivedAudioKey } from '@/lib/services/r2-storage';

export interface MediaNormalizationJobData {
  mediaId: string;
  userId: string;
  projectId: string | null;
  s3Key: string;
  s3Url: string;
  type: 'video' | 'audio';
  name: string;
}

const LOG_PREFIX = '[MediaNormalization]';

export const mediaNormalizationProcessor: Processor<MediaNormalizationJobData> =
  async (job: Job<MediaNormalizationJobData>) => {
    const { mediaId, userId, projectId, s3Key, s3Url, type } = job.data;
    const supabase = getSupabaseServiceClient();

    console.log(`${LOG_PREFIX} Starting ${type} normalization for media ${mediaId}`);

    await supabase
      .from('video_editor_media')
      .update({
        audio_normalization_status: 'processing',
        audio_normalization_error: null,
      })
      .eq('id', mediaId)
      .eq('user_id', userId);

    try {
      if (type === 'audio') {
        const ext = parse(s3Key).ext.replace(/^\./, '').toLowerCase() || 'mp3';
        const result = await normalizeAudioFromR2(s3Url, s3Key, {
          inputFormat: ext,
          outputFormat: ext,
        });

        if (!isCompletedAudioNormalization(result)) {
          throw new Error(result.skipReason || 'Audio normalization failed');
        }

        await supabase
          .from('video_editor_media')
          .update({
            audio_normalization_status: 'completed',
            has_embedded_audio: false,
            normalized_audio_url: s3Url,
            original_lufs: result.originalLufs,
            normalized_lufs: result.normalizedLufs,
            true_peak_dbtp: result.originalTruePeak,
            audio_normalization_error: null,
            audio_normalized_at: new Date().toISOString(),
          })
          .eq('id', mediaId)
          .eq('user_id', userId);

        return { success: true, mediaId, type };
      }

      const baseName = parse(s3Key).name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const derivedAudioKey = generateVideoEditorDerivedAudioKey(
        userId,
        projectId,
        `${baseName}-embedded-audio`,
        'mp3',
      );

      const extracted = await extractAndNormalizeVideoAudioFromR2(
        s3Url,
        derivedAudioKey,
        { outputFormat: 'mp3' },
      );

      if (
        !extracted.hasEmbeddedAudio &&
        extracted.skipReason &&
        extracted.skipReason !== 'Video has no embedded audio stream'
      ) {
        throw new Error(extracted.skipReason);
      }

      await supabase
        .from('video_editor_media')
        .update({
          audio_normalization_status: 'completed',
          has_embedded_audio: extracted.hasEmbeddedAudio,
          normalized_audio_url: extracted.normalizedAudioUrl || null,
          original_lufs: extracted.originalLufs ?? null,
          normalized_lufs: extracted.normalizedLufs ?? null,
          true_peak_dbtp: extracted.truePeakDbtp ?? null,
          audio_normalization_error: null,
          audio_normalized_at: new Date().toISOString(),
        })
        .eq('id', mediaId)
        .eq('user_id', userId);

      return {
        success: true,
        mediaId,
        type,
        hasEmbeddedAudio: extracted.hasEmbeddedAudio,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`${LOG_PREFIX} Failed for media ${mediaId}: ${message}`);

      await supabase
        .from('video_editor_media')
        .update({
          audio_normalization_status: 'failed',
          audio_normalization_error: message,
        })
        .eq('id', mediaId)
        .eq('user_id', userId);

      throw error;
    }
  };

function isCompletedAudioNormalization(result: NormalizationResult): boolean {
  if (result.normalized) {
    return true;
  }

  return result.skipReason === 'Already within tolerance';
}
