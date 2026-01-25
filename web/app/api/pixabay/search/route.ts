import { NextResponse } from 'next/server';
import { PixabayApi } from '@/lib/pixabay/api';
import { PixabaySearchParams } from '@/lib/pixabay/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const apiKey = process.env.PIXABAY_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Pixabay API key not configured' },
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

    const mediaType = searchParams.get('mediaType') as 'image' | 'video' || 'image';
    const maxResults = parseInt(searchParams.get('maxResults') || '20', 10);
    const page = parseInt(searchParams.get('page') || '1', 10);

    const pixabay = new PixabayApi(apiKey);
    
    // Convert generic mediaType to Pixabay specific params if needed
    // For now, simple mapping
    const params: PixabaySearchParams = {
      query,
      mediaType,
      maxResults,
      page,
      safeSearch: true,
    };

    const results = await pixabay.search(params);

    return NextResponse.json(results);
  } catch (error) {
    console.error('[Pixabay Search] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Search failed' },
      { status: 500 }
    );
  }
}
