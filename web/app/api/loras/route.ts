/**
 * LORA Listing API
 * ============================================================================
 * Returns available LORAs for image generation.
 * 
 * Currently returns a static list. Future: fetch from GPU API.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// Static LORA list - can be expanded or fetched from GPU API in future
const AVAILABLE_LORAS = [
  // Style LORAs
  { name: "cinematic-film", label: "Cinematic Film", category: "style" },
  { name: "anime-style", label: "Anime Style", category: "style" },
  { name: "photorealistic", label: "Photorealistic", category: "style" },
  { name: "oil-painting", label: "Oil Painting", category: "style" },
  { name: "watercolor", label: "Watercolor", category: "style" },
  // Mood LORAs
  { name: "dark-moody", label: "Dark & Moody", category: "mood" },
  { name: "bright-vibrant", label: "Bright & Vibrant", category: "mood" },
  { name: "vintage-retro", label: "Vintage Retro", category: "mood" },
] as const;

export type LoraItem = typeof AVAILABLE_LORAS[number];

/**
 * GET /api/loras
 * Returns list of available LORAs for image generation
 */
export async function GET(request: NextRequest) {
  try {
    // Auth check
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Return available LORAs
    return NextResponse.json({
      success: true,
      loras: AVAILABLE_LORAS,
      // Group by category for UI convenience
      categories: {
        style: AVAILABLE_LORAS.filter(l => l.category === "style"),
        mood: AVAILABLE_LORAS.filter(l => l.category === "mood"),
      },
    });
  } catch (error) {
    console.error("[API /api/loras] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
