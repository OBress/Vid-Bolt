/**
 * POST /api/process/edit-assembly
 *
 * Trigger route for AI-driven edit assembly via BullMQ.
 * Creates a task row, enqueues the job, and returns { taskId }.
 *
 * The worker (edit-assembly.ts) reads project data from Supabase and
 * generates an EDL in chunks.
 */

import { NextRequest, NextResponse } from 'next/server';
import { editAssemblyQueue } from '@/lib/queues';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate
    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(
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

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { videoId } = body;

    if (!videoId) {
      return NextResponse.json(
        { error: 'Missing required field: videoId' },
        { status: 400 }
      );
    }

    // 2. Create task in database
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .insert({
        user_id: user.id,
        type: 'edit_assembly',
        name: 'Edit Assembly: EDL Generation',
        status: 'pending',
        steps: [],
        input_data: { videoId },
        output_data: {},
      })
      .select()
      .single();

    if (taskError) {
      console.error('[EditAssembly API] Failed to create task:', taskError);
      return NextResponse.json({ error: taskError.message }, { status: 500 });
    }

    // 3. Enqueue BullMQ job
    const job = await editAssemblyQueue.add(
      'edit-assembly',
      {
        taskId: task.id,
        userId: user.id,
        videoId,
      },
      {
        jobId: task.id,
      }
    );

    console.log(`[EditAssembly API] Created task ${task.id}, job ${job.id}`);

    return NextResponse.json({
      success: true,
      taskId: task.id,
      jobId: job.id,
    });
  } catch (error) {
    console.error('[EditAssembly API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
