/**
 * GPU API Test Media Proxy
 * ============================================================================
 * Proxies R2 media files through the server to avoid CORS/access issues
 * when displaying in the gallery. Streams the file from R2 directly.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getS3Client, getBucketName } from '@/lib/services/r2-storage';
import { GetObjectCommand } from '@aws-sdk/client-s3';

export async function GET(request: NextRequest) {
  try {
    const key = request.nextUrl.searchParams.get('key');
    if (!key) {
      return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 });
    }

    // Only allow access to temporary/gpu-api-test/ files
    if (!key.startsWith('temporary/gpu-api-test/')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const client = getS3Client();
    const bucketName = getBucketName();

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const response = await client.send(command);

    if (!response.Body) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Determine content type
    let contentType = response.ContentType || 'application/octet-stream';
    const ext = key.split('.').pop()?.toLowerCase();
    if (contentType === 'application/octet-stream' && ext) {
      const mimeTypes: Record<string, string> = {
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'webp': 'image/webp',
        'gif': 'image/gif',
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'json': 'application/json',
      };
      contentType = mimeTypes[ext] || contentType;
    }

    // Stream the response
    const arrayBuffer = await response.Body.transformToByteArray();
    const buffer = Buffer.from(arrayBuffer);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'Content-Length': String(arrayBuffer.length),
      },
    });
  } catch (error) {
    console.error('[MediaProxy] Failed to proxy media:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to proxy media' },
      { status: 500 }
    );
  }
}
