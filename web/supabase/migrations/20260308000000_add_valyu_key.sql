-- Add valyu_key column to user_api_keys table
-- This is used for Valyu research search and DeepResearch features

ALTER TABLE "public"."user_api_keys"
ADD COLUMN IF NOT EXISTS "valyu_key" text;

COMMENT ON COLUMN "public"."user_api_keys"."valyu_key" IS 'Valyu API key for research search and DeepResearch features';
