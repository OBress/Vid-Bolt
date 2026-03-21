ALTER TABLE video_editor_media
ADD COLUMN IF NOT EXISTS audio_normalization_status TEXT
  DEFAULT 'pending'
  CHECK (
    audio_normalization_status IN (
      'pending',
      'processing',
      'completed',
      'failed',
      'not_applicable'
    )
  );

ALTER TABLE video_editor_media
ADD COLUMN IF NOT EXISTS has_embedded_audio BOOLEAN;

ALTER TABLE video_editor_media
ADD COLUMN IF NOT EXISTS normalized_audio_url TEXT;

ALTER TABLE video_editor_media
ADD COLUMN IF NOT EXISTS original_lufs DOUBLE PRECISION;

ALTER TABLE video_editor_media
ADD COLUMN IF NOT EXISTS normalized_lufs DOUBLE PRECISION;

ALTER TABLE video_editor_media
ADD COLUMN IF NOT EXISTS true_peak_dbtp DOUBLE PRECISION;

ALTER TABLE video_editor_media
ADD COLUMN IF NOT EXISTS audio_normalization_error TEXT;

ALTER TABLE video_editor_media
ADD COLUMN IF NOT EXISTS audio_normalized_at TIMESTAMPTZ;

UPDATE video_editor_media
SET
  audio_normalization_status = CASE
    WHEN type = 'image' THEN 'not_applicable'
    ELSE 'completed'
  END,
  normalized_audio_url = CASE
    WHEN type = 'audio' THEN s3_url
    ELSE normalized_audio_url
  END,
  has_embedded_audio = CASE
    WHEN type = 'video' THEN COALESCE(has_embedded_audio, FALSE)
    ELSE has_embedded_audio
  END
WHERE audio_normalization_status IS NULL;

