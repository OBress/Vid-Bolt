-- Add groq_key column to user_api_keys table
-- This is used for Groq Whisper transcription with word-level timestamps

ALTER TABLE "public"."user_api_keys"
ADD COLUMN IF NOT EXISTS "groq_key" text;

COMMENT ON COLUMN "public"."user_api_keys"."groq_key" IS 'Groq API key for Whisper transcription with word-level timestamps';
