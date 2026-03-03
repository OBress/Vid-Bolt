/**
 * SVG Thumbnail Generator
 * ============================================================================
 * Generates unique SVG thumbnails for video projects using Gemini 3 Flash
 * via OpenRouter. The SVG visually represents the video title and is stored
 * in video_projects.metadata.thumbnail_svg for display in VideoCard.
 */

import { generateText } from "@/lib/ai/openrouter";

const MAX_SVG_SIZE = 50_000; // 50 KB safety limit

const SYSTEM_PROMPT = `You create tiny, minimalist SVG thumbnails. Given a video title, output a single raw <svg> element. Nothing else — no markdown, no code fences, no explanation.

Strict rules:
- Start with exactly: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 225" width="400" height="225" preserveAspectRatio="xMidYMid slice">
- Background: a single <rect> filling the entire viewBox with a dark color (#111 to #1a1a2e range).
- Add 2-4 simple geometric shapes (circles, rectangles, lines, polygons) that loosely evoke the video's topic.
- Use 1-2 vibrant accent colors (e.g. #f97316 orange, #06b6d4 cyan, #ec4899 pink, #8b5cf6 purple).
- DO NOT include any <text> elements. No words, no title, no labels.
- DO NOT use complex paths, gradients with many stops, filters, or embedded images.
- Keep the total SVG under 2KB. Simpler is better.
- Make each design visually distinct based on the title's theme.`;

/**
 * Generate an SVG thumbnail for a video based on its title.
 *
 * @param userId - Owner user ID (for OpenRouter API key lookup)
 * @param videoTitle - The video's title/name
 * @returns The sanitised SVG string, or null if generation fails
 */
export async function generateThumbnailSvg(
  userId: string,
  videoTitle: string
): Promise<string | null> {
  try {
    const response = await generateText(
      userId,
      SYSTEM_PROMPT,
      `Video title: "${videoTitle}"`,
      {
        model: "google/gemini-3.1-flash-lite-preview",
        temperature: 0.9,
      }
    );

    const svg = extractSvg(response.content);
    if (!svg) {
      console.warn("[SVG Thumbnail] Failed to extract valid SVG from response");
      console.warn("[SVG Thumbnail] Raw response (first 500 chars):", response.content.substring(0, 500));
      return null;
    }

    if (svg.length > MAX_SVG_SIZE) {
      console.warn(
        `[SVG Thumbnail] SVG exceeds size limit (${svg.length} bytes)`
      );
      return null;
    }

    return svg;
  } catch (error) {
    console.error("[SVG Thumbnail] Generation failed:", error);
    return null;
  }
}

/**
 * Extract and sanitise the SVG content from the model's response.
 * Strips markdown fences and validates the SVG structure.
 */
function extractSvg(raw: string): string | null {
  let content = raw.trim();

  // Strip all markdown code fences (including nested/multiple)
  content = content.replace(/```[\w]*\s*\n?/gi, "").trim();

  // Extract just the <svg>...</svg> block
  const svgMatch = content.match(/<svg[\s\S]*?<\/svg>/i);
  if (!svgMatch) return null;

  return svgMatch[0];
}
