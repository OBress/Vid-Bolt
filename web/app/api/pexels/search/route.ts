import { NextResponse } from 'next/server';
import { PexelsApi } from '@/lib/pexels/api';
import { PexelsSearchParams } from '@/lib/pexels/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const apiKey = process.env.PEXELS_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Pexels API key not configured' },
        { status: 500 }
      );
    }

    const query = searchParams.get('q');
    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter "q" is required' },
        { status: 400 }
      );
    }

    const mediaType = (searchParams.get('mediaType') as 'photo' | 'video') || 'photo';
    const maxResults = parseInt(searchParams.get('maxResults') || '20', 10);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const orientation = searchParams.get('orientation') as 'landscape' | 'portrait' | 'square' | undefined;
    const color = searchParams.get('color') || undefined;

    const pexels = new PexelsApi(apiKey);
    
    const params: PexelsSearchParams = {
      query,
      mediaType,
      maxResults,
      page,
      orientation,
      color,
    };

    const results = await pexels.search(params);

    // Normalize response to match UI expectations
    // Convert photos/videos to uniform "hits" array for consistency with Pixabay
    const hits = 'photos' in results 
      ? results.photos.map(photo => ({
          id: photo.id,
          type: 'photo' as const,
          url: photo.url,
          previewURL: photo.src.medium,
          webformatURL: photo.src.large,
          largeImageURL: photo.src.original,
          imageWidth: photo.width,
          imageHeight: photo.height,
          photographer: photo.photographer,
          alt: photo.alt,
          avgColor: photo.avg_color,
        }))
      : results.videos.map(video => ({
          id: video.id,
          type: 'video' as const,
          url: video.url,
          previewURL: video.image,
          thumbnailURL: video.image,
          duration: video.duration,
          videoWidth: video.width,
          videoHeight: video.height,
          user: video.user.name,
          video_files: video.video_files,
          video_pictures: video.video_pictures,
        }));

    return NextResponse.json({
      total: results.total_results,
      page: results.page,
      per_page: results.per_page,
      hits,
    });
  } catch (error) {
    console.error('[Pexels Search] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Search failed' },
      { status: 500 }
    );
  }
}
