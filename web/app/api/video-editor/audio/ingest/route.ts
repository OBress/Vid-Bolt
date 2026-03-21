import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { normalizeExternalAudioToR2 } from '@/lib/services/audio-normalizer';
import { generateVideoEditorDerivedAudioKey } from '@/lib/services/r2-storage';

function buildSafeBaseName(filename: string | undefined, sourceUrl: string): string {
  if (filename?.trim()) {
    return filename
      .replace(/\.[a-zA-Z0-9]+$/, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  try {
    const url = new URL(sourceUrl);
    const raw = url.pathname.split('/').pop() || 'external-audio';
    return raw
      .replace(/\.[a-zA-Z0-9]+$/, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_');
  } catch {
    return 'external-audio';
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      sourceUrl,
      projectId,
      filename,
    } = body as {
      sourceUrl?: string;
      projectId?: string;
      filename?: string;
    };

    if (!sourceUrl?.trim()) {
      return NextResponse.json(
        { error: 'sourceUrl is required' },
        { status: 400 },
      );
    }

    const digest = createHash('sha1').update(sourceUrl.trim()).digest('hex').slice(0, 12);
    const baseName = buildSafeBaseName(filename, sourceUrl);
    const outputKey = generateVideoEditorDerivedAudioKey(
      user.id,
      projectId || null,
      `${baseName}-${digest}`,
      'mp3',
    );

    const normalized = await normalizeExternalAudioToR2(
      sourceUrl.trim(),
      outputKey,
      { outputFormat: 'mp3' },
    );

    const isCompleted =
      normalized.normalized ||
      normalized.skipReason === 'Already within tolerance';

    if (!isCompleted) {
      throw new Error(normalized.skipReason || 'Audio normalization failed');
    }

    return NextResponse.json({
      success: true,
      asset: {
        key: normalized.key,
        url: normalized.url,
        contentType: normalized.contentType,
        audioNormalizationStatus: 'completed',
        normalizedAudioUrl: normalized.url,
        originalLufs: normalized.originalLufs,
        normalizedLufs: normalized.normalizedLufs,
        truePeakDbtp: normalized.originalTruePeak,
        audioNormalizationError: null,
        audioNormalizedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[VideoEditorAudioIngest] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
