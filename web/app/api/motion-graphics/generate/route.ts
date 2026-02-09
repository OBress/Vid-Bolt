/**
 * POST /api/motion-graphics/generate
 * 
 * SSE streaming endpoint for motion graphics code generation.
 * Adapted from gpt-story-writer-niche-sys/backend/src/routes/motionGraphicsRoutes.js
 * 
 * Auth: Bearer token → Supabase session
 * API Key: x-openrouter-key header OR fetched from user_api_keys table
 */

import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { motionGraphicsService, type GenerationRequest } from '@/lib/services/motion-graphics/motion-graphics-service';

// Disable body size limit for this route (code can be large)
export const maxDuration = 300; // 5 minutes timeout for long generations

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate via Supabase session
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
      return new Response(
        JSON.stringify({ error: 'Unauthorized', type: 'api' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Get OpenRouter API key
    let apiKey = request.headers.get('x-openrouter-key');
    
    if (!apiKey) {
      // Fall back to getting key from database
      const serviceClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { data: apiKeyData } = await serviceClient
        .from('user_api_keys')
        .select('openrouter_key')
        .eq('user_id', user.id)
        .single();

      apiKey = apiKeyData?.openrouter_key;
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({ 
          error: 'OpenRouter API key not configured. Please add your API key in Settings > API Keys.',
          type: 'api' 
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. Parse request body
    const body = await request.json();
    const {
      prompt,
      model,
      currentCode,
      conversationHistory,
      isFollowUp,
      errorCorrection,
      previouslyUsedSkills,
    } = body;

    if (!prompt || !model) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: prompt, model', type: 'validation' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. Create SSE stream
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      async start(controller) {
        const sendSSE = (data: Record<string, unknown>) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            // Stream may have been closed
          }
        };

        try {
          const generationRequest: GenerationRequest = {
            prompt,
            model,
            currentCode,
            conversationHistory,
            isFollowUp,
            errorCorrection,
            previouslyUsedSkills,
          };

          await motionGraphicsService.streamGeneration(sendSSE, apiKey!, generationRequest);
        } catch (error) {
          console.error('[MotionGraphics API] Stream error:', error);
          const sendSSEOnError = (data: Record<string, unknown>) => {
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            } catch {
              // Stream closed
            }
          };
          sendSSEOnError({
            type: 'error',
            error: (error as Error).message || 'Generation failed',
            errorType: 'api',
          });
          sendSSEOnError({ type: 'done' });
        } finally {
          try {
            controller.close();
          } catch {
            // Already closed
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });

  } catch (error) {
    console.error('[MotionGraphics API] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: (error as Error).message || 'Internal server error',
        type: 'api' 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
