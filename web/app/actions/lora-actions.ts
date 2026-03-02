'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  getS3Client,
  getBucketName,
  getPublicUrl,
} from '@/lib/services/r2-storage';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

/**
 * Server Action: Upload LoRA file to R2.
 *
 * Uses Server Action instead of Route Handler because Next.js applies the
 * `serverActions.bodySizeLimit` (500MB) to Server Actions, whereas Route
 * Handlers are capped at 10MB with no per-route override.
 *
 * @param formData — multipart form with `file` (.safetensors) and `projectId`
 * @returns { storageKey, url, size } on success, or { error } on failure
 */
export async function uploadLoraAction(
  formData: FormData,
): Promise<{ storageKey?: string; url?: string; size?: number; error?: string }> {
  try {
    // Authenticate
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
      return { error: 'Unauthorized' };
    }

    // Parse form data
    const file = formData.get('file') as File | null;
    const projectId = formData.get('projectId') as string | null;

    if (!file) return { error: 'No file provided' };
    if (!projectId) return { error: 'No projectId provided' };

    // Validate
    if (!file.name.endsWith('.safetensors')) {
      return { error: 'Only .safetensors files are supported' };
    }

    const MAX_SIZE = 500 * 1024 * 1024; // 500MB
    if (file.size > MAX_SIZE) {
      return { error: 'File too large. Maximum 500MB.' };
    }

    // Generate storage key
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

    return { storageKey, url: publicUrl, size: file.size };
  } catch (error) {
    console.error('[LoRA Upload] Failed:', error);
    return { error: error instanceof Error ? error.message : 'Upload failed' };
  }
}
