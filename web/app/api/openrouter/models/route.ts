import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

interface OpenRouterModel {
  id: string;
  name: string;
  pricing: {
    prompt: string;
    completion: string;
  };
  context_length: number;
  created?: number; // Unix timestamp
  architecture?: {
    modality: string;
    tokenizer: string;
    instruct_type: string | null;
  };
}

interface ModelListResponse {
  models: Array<{
    id: string;
    name: string;
    contextLength: number;
    createdAt: number;
    pricing: {
      promptPer1M: number;
      completionPer1M: number;
    };
  }>;
}

/**
 * GET /api/openrouter/models
 * Fetches available models from OpenRouter API using the user's API key
 */
export async function GET(request: NextRequest) {
  try {
    // Get the current user from the session
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Ignore - can happen during SSR
            }
          },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user's OpenRouter API key
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: apiKeyData, error: keyError } = await serviceClient
      .from('user_api_keys')
      .select('openrouter_key')
      .eq('user_id', user.id)
      .single();

    if (keyError || !apiKeyData?.openrouter_key) {
      return NextResponse.json(
        { error: 'OpenRouter API key not configured. Please add your API key in Settings > API Keys.' },
        { status: 400 }
      );
    }

    // Fetch models from OpenRouter
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKeyData.openrouter_key}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'Vid-Bolt',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', errorText);
      return NextResponse.json(
        { error: 'Failed to fetch models from OpenRouter. Please check your API key is valid.' },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Transform and filter models - only include text generation models
    const models = (data.data as OpenRouterModel[])
      .filter((model) => {
        // Filter to only text models (not image/video generation)
        const modality = model.architecture?.modality || '';
        return modality.includes('text') || modality === '';
      })
      .map((model) => ({
        id: model.id,
        name: model.name,
        contextLength: model.context_length,
        createdAt: model.created || 0,
        pricing: {
          promptPer1M: parseFloat(model.pricing.prompt) * 1000000,
          completionPer1M: parseFloat(model.pricing.completion) * 1000000,
        },
      }))
      // Sort by newest first (highest created timestamp)
      .sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json({ models } as ModelListResponse);
  } catch (error) {
    console.error('Error fetching OpenRouter models:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
