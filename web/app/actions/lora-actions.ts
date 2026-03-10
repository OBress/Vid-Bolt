'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  generateLoraStorageKey,
  generatePresignedPutUrl,
  getPublicUrl,
} from '@/lib/services/r2-storage';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LoraUploadUrlResult {
  /** Presigned PUT URL — browser uploads directly to R2 with this */
  putUrl?: string;
  /** R2 object key for later reference */
  storageKey?: string;
  /** Public CDN URL for the uploaded LoRA */
  publicUrl?: string;
  /** Error message if the request failed */
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_LORA_SIZE = 500 * 1024 * 1024; // 500 MB
const PRESIGNED_URL_EXPIRY = 3600; // 1 hour

/**
 * Server Action: Generate a presigned PUT URL for direct LoRA upload to R2.
 *
 * The browser uses the returned `putUrl` to PUT the .safetensors file
 * straight to R2, bypassing Cloudflare's proxy size limit entirely.
 *
 * @param filename  — Original file name (must end with .safetensors)
 * @param fileSize  — File size in bytes (validated ≤ 500 MB)
 * @param projectId — Media project ID (for authorisation context)
 */
export async function getLoraUploadUrl(
  filename: string,
  fileSize: number,
  projectId: string,
): Promise<LoraUploadUrlResult> {
  try {
    // ── Authenticate ──────────────────────────────────────────────────
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

    // ── Validate ──────────────────────────────────────────────────────
    if (!filename || !filename.toLowerCase().endsWith('.safetensors')) {
      return { error: 'Only .safetensors files are supported' };
    }

    if (!fileSize || fileSize <= 0) {
      return { error: 'Invalid file size' };
    }

    if (fileSize > MAX_LORA_SIZE) {
      return { error: `File too large. Maximum ${MAX_LORA_SIZE / (1024 * 1024)}MB.` };
    }

    if (!projectId) {
      return { error: 'No projectId provided' };
    }

    // ── Generate storage key & presigned URL ──────────────────────────
    const loraId = uuidv4();
    const storageKey = generateLoraStorageKey(user.id, loraId, filename);

    const { putUrl } = await generatePresignedPutUrl(
      storageKey,
      'application/octet-stream',
      PRESIGNED_URL_EXPIRY,
    );

    const publicUrl = getPublicUrl(storageKey);

    console.log(
      `[LoRA Upload] User ${user.id}: generated presigned URL for "${filename}" (${(fileSize / 1024 / 1024).toFixed(1)}MB) → ${storageKey}`,
    );

    return { putUrl, storageKey, publicUrl };
  } catch (error) {
    console.error('[LoRA Upload] Failed to generate presigned URL:', error);
    return { error: error instanceof Error ? error.message : 'Failed to prepare upload' };
  }
}
