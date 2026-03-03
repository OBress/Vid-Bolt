import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  getS3Client,
  getBucketName,
  getPublicUrl,
} from '@/lib/services/r2-storage';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { loraUploadLimiter } from '@/lib/utils/rate-limiters';

// ---------------------------------------------------------------------------
// Route Segment Config — allow large LoRA uploads (up to 500MB)
// ---------------------------------------------------------------------------
export const runtime = 'nodejs';
export const maxDuration = 120; // 2-minute timeout for large files
export const dynamic = 'force-dynamic';

/**
 * POST /api/lora/upload
 * 
 * Uploads a .safetensors LoRA file to R2 storage.
 * Returns the storage key and public URL for the LoRA metadata.
 * 
 * Request: multipart form data with:
 *   - file: .safetensors file
 *   - projectId: media project ID
 * 
 * Returns: { storageKey, url }
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
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
      },
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit check
    const rateLimited = loraUploadLimiter.check(user.id);
    if (rateLimited) return rateLimited;

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const projectId = formData.get('projectId') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!projectId) {
      return NextResponse.json(
        { error: 'No projectId provided' },
        { status: 400 },
      );
    }

    // Validate file
    if (!file.name.endsWith('.safetensors')) {
      return NextResponse.json(
        { error: 'Only .safetensors files are supported' },
        { status: 400 },
      );
    }

    const MAX_SIZE = 500 * 1024 * 1024; // 500MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum 500MB.' },
        { status: 400 },
      );
    }

    // Generate storage key: loras/{userId}/{loraId}/{filename}
    const loraId = uuidv4();
    const cleanFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `loras/${user.id}/${loraId}/${cleanFilename}`;

    // Upload to R2
    const client = getS3Client();
    const bucketName = getBucketName();
    const buffer = Buffer.from(await file.arrayBuffer());

    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: storageKey,
        Body: buffer,
        ContentType: 'application/octet-stream',
      }),
    );

    const publicUrl = getPublicUrl(storageKey);

    console.log(
      `[LoRA Upload] User ${user.id}: uploaded "${file.name}" (${(file.size / 1024 / 1024).toFixed(1)}MB) → ${storageKey}`,
    );

    return NextResponse.json({
      storageKey,
      url: publicUrl,
      size: file.size,
    });
  } catch (error) {
    console.error('[LoRA Upload] Failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 },
    );
  }
}
