
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { generateEmbedding } from '@/lib/ai/embedding';
import { requireAdmin, isAuthError } from '@/lib/utils/admin-auth';

// Mock data used for the test
const MOCK_DATA = {
  text: "A golden retriever dog running joyfully through a green park during sunset",
  source: "other", // Use 'other' for mock data
  r2_key: "mock/dog-park.jpg", // Fake key
  metadata: {
    title: "Happy Dog in Park",
    description: "A golden retriever dog running joyfully through a green park during sunset",
    tags: ["dog", "park", "golden retriever", "sunset", "happy"],
    author: "Mock User",
    license: "CC0",
    thumbnailUrl: "https://images.unsplash.com/photo-1552053831-71594a27632d?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80" // Real Unsplash image for visual test
  }
};

/**
 * SECURITY: Admin-only endpoint.
 */
export async function POST() {
  // Admin-only
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  try {
    const supabase = createServiceClient();
    
    // 1. Generate Embedding
    const embedding = await generateEmbedding(MOCK_DATA.text);

    // 2. Insert into Supabase
    // Note: We use the 'vector' embedding field
    const { data, error } = await supabase
      .from('stock_media')
      .insert({
        source: MOCK_DATA.source,
        r2_key: MOCK_DATA.r2_key,
        metadata: MOCK_DATA.metadata,
        embedding: embedding
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase Insert Error:', error);
      throw new Error(`Supabase Insert Failed: ${error.message}`);
    }

    return NextResponse.json({ 
      success: true, 
      message: "Mock data inserted successfully",
      record: data 
    });

  } catch (error) {
    console.error('Seed API Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
