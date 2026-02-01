import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteFile, getPublicBaseUrl } from "@/lib/services/r2-storage";

/**
 * POST /api/media/cleanup
 * 
 * Delete media files from R2 storage. Used when:
 * - User cancels modal without saving (cleanup pending regenerated media)
 * - User changes media type (cleanup old media + keyframes)
 * 
 * Request body:
 * {
 *   urls: string[],    // Array of public URLs to delete
 *   videoId: string    // Video ID for ownership verification
 * }
 */
export async function POST(request: NextRequest) {
  const logPrefix = "[API /media/cleanup]";

  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error(`${logPrefix} Auth error:`, authError);
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse request
    const { urls, videoId } = await request.json();

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { success: false, error: "No URLs provided" },
        { status: 400 }
      );
    }

    if (!videoId) {
      return NextResponse.json(
        { success: false, error: "videoId is required" },
        { status: 400 }
      );
    }

    // Verify video ownership
    const { data: video, error: videoError } = await supabase
      .from("videos")
      .select("user_id")
      .eq("id", videoId)
      .single();

    if (videoError || !video) {
      console.error(`${logPrefix} Video not found:`, videoError);
      return NextResponse.json(
        { success: false, error: "Video not found" },
        { status: 404 }
      );
    }

    if (video.user_id !== user.id) {
      console.error(`${logPrefix} Ownership mismatch`);
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Extract R2 keys from URLs and delete each file
    const publicBaseUrl = getPublicBaseUrl();
    let deleted = 0;
    const errors: string[] = [];

    for (const url of urls) {
      if (!url || typeof url !== "string") continue;

      try {
        // Extract key from URL
        // URL format: https://public-r2-url.com/users/{userId}/videos/{videoId}/...
        const key = url.replace(publicBaseUrl + "/", "");
        
        // Verify this key belongs to the user's video (security check)
        const expectedPrefix = `users/${user.id}/videos/${videoId}/`;
        if (!key.startsWith(expectedPrefix)) {
          console.warn(`${logPrefix} Skipping non-owned key: ${key}`);
          continue;
        }

        await deleteFile(key);
        deleted++;
        console.log(`${logPrefix} Deleted: ${key}`);
      } catch (deleteError) {
        console.error(`${logPrefix} Failed to delete ${url}:`, deleteError);
        errors.push(url);
      }
    }

    console.log(`${logPrefix} Cleanup complete: ${deleted} deleted, ${errors.length} errors`);

    return NextResponse.json({
      success: true,
      deleted,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error) {
    console.error(`${logPrefix} Error:`, error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
