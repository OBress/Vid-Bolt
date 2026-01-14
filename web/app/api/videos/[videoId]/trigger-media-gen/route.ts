/**
 * Trigger Media Generation API Route
 * ============================================================================
 * POST /api/videos/[videoId]/trigger-media-gen
 * 
 * Triggers the complete media generation workflow for a video project.
 * This includes AV script generation, image generation, image editing,
 * and video generation.
 * 
 * Prerequisites:
 * - Audio generation must be complete (word_timestamps in metadata)
 * - Script content must exist
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { inngest } from "@/lib/inngest/client";
import type { VideoProjectMetadata } from "@/types/media-generation";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;

    if (!videoId) {
      return NextResponse.json(
        { error: "Missing videoId param" },
        { status: 400 }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch video to validate prerequisites
    const { data: video, error } = await supabase
      .from("video_projects")
      .select("*")
      .eq("id", videoId)
      .single();

    if (error || !video) {
      return NextResponse.json(
        { error: "Video not found", details: error },
        { status: 404 }
      );
    }

    // Validate prerequisites
    const metadata = (video.metadata as VideoProjectMetadata) || {};
    const wordTimestamps = metadata.word_timestamps || [];
    const script = video.script_content || "";

    if (!script || script.trim().length === 0) {
      return NextResponse.json(
        { error: "No script content found. Please complete script generation first." },
        { status: 400 }
      );
    }

    if (wordTimestamps.length === 0) {
      return NextResponse.json(
        { error: "No word timestamps found. Audio generation must complete first." },
        { status: 400 }
      );
    }

    // Check if media generation is already in progress or recently started
    const mediaGenStatus = metadata.media_generation?.status;
    const startedAt = metadata.media_generation?.started_at;
    const recentlyStarted = startedAt && 
      (Date.now() - new Date(startedAt).getTime()) < 30000; // Within 30 seconds
    
    if (mediaGenStatus === 'av_script' ||
        mediaGenStatus === 'images' ||
        mediaGenStatus === 'image_edits' ||
        mediaGenStatus === 'videos' ||
        (mediaGenStatus === 'pending' && recentlyStarted)) {
      console.log(`[API] Rejecting duplicate trigger - status: ${mediaGenStatus}, started: ${startedAt}`);
      return NextResponse.json(
        { 
          error: "Media generation already in progress",
          status: mediaGenStatus 
        },
        { status: 409 }
      );
    }

    console.log(`[API] Triggering media generation for video ${videoId}.`);

    // Parse request body for optional parameters
    let skipAvScript = false;
    try {
      const body = await request.json();
      skipAvScript = body.skipAvScript === true;
    } catch {
      // Empty body is fine
    }

    // Reset media generation progress in metadata
    await supabase.from("video_projects").update({
      metadata: {
        ...metadata,
        media_generation: {
          status: 'pending',
          started_at: new Date().toISOString(),
          av_script_completed: skipAvScript ? (metadata.av_script_completed || false) : false,
          total_shots: 0,
          current_shot_index: 0,
          current_phase: 'idle',
          images_completed: 0,
          images_failed: 0,
          edits_completed: 0,
          edits_failed: 0,
          edits_skipped: 0,
          videos_completed: 0,
          videos_failed: 0,
        },
        // Reset shot list if not skipping AV script
        ...(skipAvScript ? {} : { shot_list: [], av_script_completed: false }),
      },
      current_stage: 'media',
      status: 'processing',
    }).eq("id", videoId);

    // Trigger the media generation workflow
    await inngest.send({
      name: "media-generation/start",
      data: {
        videoId,
        userId: video.user_id,
        projectId: video.project_id || undefined,
        skipAvScript,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Media generation workflow triggered",
      videoId,
      skipAvScript,
    });

  } catch (error) {
    console.error("[API] Error triggering media generation:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
