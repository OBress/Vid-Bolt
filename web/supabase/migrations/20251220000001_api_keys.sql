-- Create user_api_keys table
CREATE TABLE IF NOT EXISTS "public"."user_api_keys" (
    "id" uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    "user_id" uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    "openrouter_key" text,
    "elevenlabs_key" text,
    "genai_key" text,
    "inworld_tts_key" text,
    "replicate_key" text,
    "google_cloud_credentials" text,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE "public"."user_api_keys" ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own keys" ON "public"."user_api_keys"
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own keys" ON "public"."user_api_keys"
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own keys" ON "public"."user_api_keys"
    FOR UPDATE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_api_keys_updated_at
    BEFORE UPDATE ON public.user_api_keys
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

-- Grant permissions
GRANT ALL ON TABLE "public"."user_api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."user_api_keys" TO "service_role";
