/**
 * Stock Media Batch Scrape API
 * ============================================================================
 * POST /api/stock-media/batch-scrape
 * 
 * Orchestrates stock media collection from all sources based on level and scenes:
 * - Uses Query Generator for per-scene AI-powered query generation
 * - Scales with video length (more scenes = more queries)
 * - Supports mediaDensity: images_only, images_minimal_video, images_heavy_video
 * 
 * Uses BullMQ for background processing with AI classification.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { v4 as uuidv4 } from "uuid";
import { stockMediaQueue } from "@/lib/queues/queues";
import { generateQueries, convertToSceneInputs } from "@/lib/query-generator";
import { MEDIA_DENSITY_CONFIG, MediaDensityLevel } from "@/lib/query-generator/types";
import { stockScrapeLimiter } from "@/lib/utils/rate-limiters";

export const dynamic = "force-dynamic";

interface AssetRegistry {
  characters?: Array<{ id: string; name: string; role: string }>;
  locations?: Array<{ id: string; name: string; essence: string }>;
  objects?: Array<{ id: string; name: string; type: string }>;
}

interface BatchScrapeRequest {
  videoId: string;
  level: "standard" | "extensive";
  outlineAssets?: AssetRegistry;
  topic?: string;
  mediaDensity?: MediaDensityLevel;
  spine?: { beats: any[] };
  expandedBeats?: any[];
}

export async function POST(request: Request) {
  try {
    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit check
    const rateLimited = stockScrapeLimiter.check(user.id);
    if (rateLimited) return rateLimited;

    const body: BatchScrapeRequest = await request.json();
    const { videoId, level, outlineAssets, topic, mediaDensity, spine, expandedBeats } = body;

    if (!videoId) {
      return NextResponse.json({ error: "videoId is required" }, { status: 400 });
    }

    const effectiveDensity = mediaDensity || 'images_heavy_video';
    const densityConfig = MEDIA_DENSITY_CONFIG[effectiveDensity];
    
    console.log(`[Batch Scrape] Starting ${level} scrape for video ${videoId}`);
    console.log(`[Batch Scrape] Media density: ${effectiveDensity} (${densityConfig.imageQueriesPerScene} images + ${densityConfig.videoQueriesPerScene} videos per scene)`);

    // Create a task for tracking progress
    const serviceClient = createServiceClient();
    const taskId = uuidv4();

    const { error: taskError } = await serviceClient.from("tasks").insert({
      id: taskId,
      user_id: user.id,
      type: "video",
      name: `Stock Media Scrape (${level})`,
      status: "pending",
      progress_percent: 0,
      current_phase: "preprocessing",
      current_step: "Generating queries...",
      input_data: { videoId, level, outlineAssets, topic, mediaDensity: effectiveDensity },
      steps: [],
      output_data: {},
    });

    if (taskError) {
      console.error("[Batch Scrape] Failed to create task:", taskError);
      return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
    }

    // Generate search queries - use Query Generator if spine data is available
    let searchQueries: string[] = [];
    let queryStats = { total: 0, image: 0, video: 0, sceneCount: 0 };

    if (spine?.beats?.length && densityConfig.generateQueries) {
      // Use per-scene Query Generator for intelligent query generation
      console.log(`[Batch Scrape] Using Query Generator with ${spine.beats.length} scenes`);
      
      try {
        const scenes = convertToSceneInputs(spine, expandedBeats);
        const queryResult = await generateQueries({
          videoId,
          userId: user.id,
          scenes,
          mediaDensity: effectiveDensity,
          assetRegistry: outlineAssets as any,
        });

        // Flatten queries from all sources
        const serperQueries = queryResult.queriesBySource.serper.map(q => q.query);
        const pexelsQueries = queryResult.queriesBySource.pexels.map(q => q.query);
        const youtubeQueries = queryResult.queriesBySource.youtube.map(q => q.query);
        
        // Combine all queries (deduplicated)
        searchQueries = [...new Set([
          ...serperQueries,
          ...pexelsQueries,
          ...youtubeQueries,
        ])];
        
        queryStats = {
          total: queryResult.totalQueries,
          image: queryResult.queryCountByType.image,
          video: queryResult.queryCountByType.video,
          sceneCount: scenes.length,
        };

        console.log(`[Batch Scrape] Query Generator produced ${queryResult.totalQueries} queries:`);
        console.log(`  - Serper (images): ${serperQueries.length}`);
        console.log(`  - Pexels (videos): ${pexelsQueries.length}`);
        console.log(`  - YouTube (videos): ${youtubeQueries.length}`);
      } catch (err) {
        console.error("[Batch Scrape] Query Generator failed, falling back to simple generation:", err);
        searchQueries = generateSearchQueriesSimple(outlineAssets, topic, level);
      }
    } else {
      // Fallback to simple query generation from assets
      console.log(`[Batch Scrape] No spine data, using simple query generation`);
      searchQueries = generateSearchQueriesSimple(outlineAssets, topic, level);
    }

    console.log(`[Batch Scrape] Final query count: ${searchQueries.length}`);

    // Update video_projects to record we're starting stock media collection
    const { data: videoData } = await serviceClient
      .from("video_projects")
      .select("metadata")
      .eq("id", videoId)
      .single();

    const existingMetadata = (videoData?.metadata as Record<string, any>) || {};
    await serviceClient
      .from("video_projects")
      .update({
        current_stage: "stock",
        metadata: {
          ...existingMetadata,
          stockMediaTaskId: taskId,
          stockMediaQueryStats: queryStats,
        },
      })
      .eq("id", videoId);

    // Add job to BullMQ queue for background processing
    await stockMediaQueue.add(
      'scrape',
      {
        userId: user.id,
        videoId,
        taskId,
        level,
        mediaDensity: effectiveDensity,
        searchQueries,
        topic: topic || '',
        outlineAssets,
        queryStats,
      },
      {
        jobId: taskId, // Use taskId as jobId for easy correlation
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 100 },
      }
    );

    console.log(`[Batch Scrape] Job queued with taskId: ${taskId}, ${searchQueries.length} queries`);

    return NextResponse.json({
      success: true,
      taskId,
      queryCount: searchQueries.length,
      queryStats,
      message: `Stock media scraping started (${level} level, ${searchQueries.length} queries)`,
    });

  } catch (error) {
    console.error("[Batch Scrape] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scraping failed" },
      { status: 500 }
    );
  }
}

/**
 * Simple fallback query generation from outline assets and topic
 * Used when spine data is not available
 */
function generateSearchQueriesSimple(
  assets?: AssetRegistry,
  topic?: string,
  level?: "standard" | "extensive"
): string[] {
  const queries: string[] = [];

  // Add topic-based queries (multiple variations)
  if (topic) {
    queries.push(topic);
    // Add shorter variations for better stock results
    const words = topic.split(' ');
    if (words.length > 3) {
      queries.push(words.slice(0, 3).join(' '));
      queries.push(words.slice(-3).join(' '));
    }
  }

  // Add queries from asset registry (increased limits)
  if (assets) {
    // Extract character names (up to 5)
    if (assets.characters) {
      assets.characters.slice(0, 5).forEach((char) => {
        queries.push(`${char.name} ${char.role}`);
        // Also add just the name for better image results
        if (char.name.length > 2) {
          queries.push(char.name);
        }
      });
    }

    // Extract locations (up to 5)
    if (assets.locations) {
      assets.locations.slice(0, 5).forEach((loc) => {
        queries.push(`${loc.name} ${loc.essence}`);
        // Also add just the location name
        if (loc.name.length > 2) {
          queries.push(loc.name);
        }
      });
    }

    // Extract key objects (up to 4)
    if (assets.objects) {
      assets.objects.slice(0, 4).forEach((obj) => {
        queries.push(`${obj.name} ${obj.type}`);
      });
    }
  }

  // Deduplicate and limit based on level
  // Extensive mode gets more queries to support higher targets
  const queryLimit = level === "extensive" ? 15 : 12;
  const uniqueQueries = [...new Set(queries)].slice(0, queryLimit);
  
  console.log(`[Batch Scrape] Generated ${uniqueQueries.length} unique queries from ${queries.length} total`);
  
  // Fallback if no queries
  if (uniqueQueries.length === 0) {
    uniqueQueries.push("professional stock footage");
    uniqueQueries.push("documentary footage");
  }

  return uniqueQueries;
}
