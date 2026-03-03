/**
 * SVG Thumbnail Generator
 * ============================================================================
 * Generates unique SVG thumbnails for video projects using Gemini 3 Flash
 * via OpenRouter. The SVG visually represents the video title and is stored
 * in video_projects.metadata.thumbnail_svg for display in VideoCard.
 */

import { generateText } from "@/lib/ai/openrouter";

const MAX_SVG_SIZE = 50_000; // 50 KB safety limit

const SYSTEM_PROMPT = `You are an SVG graphic designer. Given a video title, create a single visually appealing SVG that represents the topic.

Rules:
- Output ONLY the raw SVG markup. No markdown, no code fences, no explanation.
- The SVG must be a single <svg> element with xmlns="http://www.w3.org/2000/svg".
- Use viewBox="0 0 400 225" (16:9 aspect ratio).
- Use a dark background (dark grays, near-black) to fit a dark-themed UI.
- Use bold, vibrant accent colors (orange, cyan, magenta, electric blue, etc.) for visual elements.
- Include abstract shapes, icons, or simple illustrations that relate to the title's topic.
- Add the video title or a short version of it as text within the SVG using a clean sans-serif font.
- Keep the SVG concise (under 40KB). Avoid embedded images or overly complex paths.
- Make it look modern, sleek, and distinctive so each video is visually unique.`;

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
      `Create an SVG thumbnail for a video titled: "${videoTitle}"`,
      {
        model: "google/gemini-3-flash-preview",
        temperature: 0.9, // Higher creativity for visual variety
        maxTokens: 4096,
      }
    );

    const svg = extractSvg(response.content);
    if (!svg) {
      console.warn("[SVG Thumbnail] Failed to extract valid SVG from response");
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

  // Strip markdown code fences if present
  content = content
    .replace(/^```(?:svg|xml|html)?\s*\n?/i, "")
    .replace(/\n?\s*```$/i, "")
    .trim();

  // Extract just the <svg>...</svg> block
  const svgMatch = content.match(/<svg[\s\S]*<\/svg>/i);
  if (!svgMatch) return null;

  const svg = svgMatch[0];

  // Basic validation
  if (!svg.startsWith("<svg") || !svg.endsWith("</svg>")) return null;

  return svg;
}
