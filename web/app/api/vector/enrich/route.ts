
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { callOpenRouter } from '@/lib/ai/openrouter';

const ENRICH_MODEL = 'google/gemini-2.0-flash-exp:free';

export async function POST(req: Request) {
  try {
    const { imageUrl, prompt } = await req.json();

    if (!imageUrl) {
      return NextResponse.json({ error: 'Image URL required' }, { status: 400 });
    }

    // 1. Authenticate user to get their ID (and thus their API key from Supabase)
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error("Auth error:", authError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sysPrompt = "You are an expert stock media tagger. Detailed visual description.";
    const userPrompt = prompt || "Describe this image in detail for vector search.";

   // 2. Call OpenRouter using the shared utility
   // We cast the content to `any` because the current OpenRouterMessage interface 
   // in lib/ai/openrouter.ts strictly defines content as string, but the API supports arrays for multimodal.
    const response = await callOpenRouter(
      user.id,
      [
        { role: "system", content: sysPrompt },
        { 
          role: "user", 
          content: [
            { type: "text", text: userPrompt },
            { type: "image_url", image_url: { url: imageUrl } }
          ] as any 
        }
      ],
      {
        model: ENRICH_MODEL,
        temperature: 0.2
      }
    );

    const description = response.content;

    return NextResponse.json({ description });

  } catch (error) {
    console.error('Enrichment API Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 });
  }
}
