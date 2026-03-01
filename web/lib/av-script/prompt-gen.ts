/**
 * Visual Prompt Generator
 * ============================================================================
 * Generates AI image prompts for video segments based on content type.
 * Each content type has a distinct visual style approach.
 */

import { ShotEvent, ContentType } from "./types";
import { generateJSON } from "@/lib/ai/openrouter";

// ============================================================================
// CONTENT-TYPE SPECIFIC PROMPTS
// ============================================================================

const CONTENT_TYPE_GUIDANCE: Record<ContentType, string> = {
  'list-item': `For LIST ITEMS:
- Focus tightly on the SPECIFIC item mentioned
- Make it visually DISTINCT from adjacent items
- Use clear, simple compositions
- Single subject, minimal background
- High contrast, eye-catching colors
Example: "gold Olympic medal on black velvet" or "athlete crossing finish line"`,

  'comparison': `For COMPARISONS:
- Create clear VISUAL CONTRAST between compared elements
- Use split compositions or stark differences
- Emphasize the difference being discussed
- Consider before/after or side-by-side concepts
Example: "cluttered chaotic desk" vs "minimal organized workspace"`,

  'concept': `For CONCEPT EXPLANATIONS:
- Rich, DETAILED scene that rewards longer viewing
- Multiple elements working together
- Atmospheric and immersive
- Deep compositions with foreground and background
Example: "sprawling coral reef ecosystem teeming with colorful fish, shafts of sunlight penetrating crystal blue water"`,

  'transition': `For TRANSITIONS:
- Neutral or bridging imagery
- Motion or transformation themes
- Abstract or environmental scenes
- Smooth, calming visuals
Example: "time-lapse of clouds moving across sky" or "waves gently lapping on shore"`,

  'emotional-beat': `For EMOTIONAL/IMPACTFUL MOMENTS:
- Evocative, atmospheric imagery
- Strong mood and lighting
- Let the visual BREATHE
- Cinematic quality
Example: "silhouette of person standing alone on cliff edge at sunset, contemplative mood"`,
};

const VISUAL_PROMPT_SYSTEM = `You are a visual director for video content.
Your job is to generate specific, vivid image prompts for video segments and decide whether they should be AI-generated VIDEOS or MOTION GRAPHICS.

CRITICAL RULES:
1. NO text on screen - just visuals
2. Each image/video must be DISTINCT and SPECIFIC
3. Match the visual style to the content type
4. Use cinematic, professional imagery
5. Be concise but descriptive (1-2 sentences max)
6. DECIDE MEDIA TYPE:
   - "video" for: Cinematic scenes, atmospheric visuals, single-subject moments, emotional beats, transitions
   - "motiongraphic" for: Data-heavy content, comparisons, lists, step-by-step explanations, quote overlays,
     before/after reveals, timelines, evidence displays, multi-element compositions, annotated visuals
   - Use "motiongraphic" generously for content that benefits from structured visual storytelling
   - Use "video" when the power is in WATCHING a single moment unfold

For adjacent list items, ensure VISUAL VARIETY - each should be clearly different.

${Object.entries(CONTENT_TYPE_GUIDANCE).map(([_type, guidance]) => guidance).join('\n\n')}
`;

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

/**
 * Generate visual prompts for an array of shot events.
 * Uses AI to create content-type-appropriate image descriptions.
 */
export async function generateVisualPrompts(
  userId: string, 
  segments: ShotEvent[]
): Promise<ShotEvent[]> {
  if (segments.length === 0) return [];

  try {
    // Prepare input with context about adjacent segments for variety
    const segmentsInput = segments.map((s, i) => ({
      index: i,
      type: s.content_type,
      text: s.text,
      duration: s.duration_seconds,
      // Provide context about adjacent segments for variety
      prev_type: i > 0 ? segments[i - 1].content_type : null,
      next_type: i < segments.length - 1 ? segments[i + 1].content_type : null,
    }));

    const response = await generateJSON<{ prompts: { index: number; visual_description: string; media_type: 'video' | 'motiongraphic' }[] }>(
      userId,
      VISUAL_PROMPT_SYSTEM,
      `Generate visual prompts and media types for these ${segments.length} video segments:

${JSON.stringify(segmentsInput, null, 2)}

IMPORTANT:
- For list-item segments, each item must have a VISUALLY DISTINCT prompt
- Match the style and detail level to the content type
- Keep prompts concise (1-2 sentences)
- No text overlays, just imagery
- Determine "media_type": "video" or "motiongraphic"

Return JSON:
{
  "prompts": [
    { "index": 0, "visual_description": "A detailed description...", "media_type": "video" }
  ]
}`
    );

    // Merge results back
    if (response.prompts && Array.isArray(response.prompts)) {
      response.prompts.forEach(p => {
        if (segments[p.index]) {
          segments[p.index].visual_prompt = p.visual_description;
          segments[p.index].media_type = p.media_type || 'video';
        }
      });
    }

    // Fill in any missing ones with content-type-specific fallback
    segments.forEach(s => {
      if (!s.visual_prompt) {
        s.visual_prompt = generateFallbackPrompt(s);
      }
      if (!s.media_type) {
         s.media_type = generateFallbackMediaType(s);
      }
    });

    return segments;

  } catch (error) {
    console.error("Failed to generate visual prompts:", error);
    
    // Fallback: generate basic prompts for all segments
    segments.forEach(s => {
      s.visual_prompt = generateFallbackPrompt(s);
      s.media_type = generateFallbackMediaType(s);
    });
    
    return segments;
  }
}

/**
 * Generate a fallback prompt based on content type and text.
 */
function generateFallbackPrompt(segment: ShotEvent): string {
  const text = segment.text.trim();
  const firstWords = text.split(' ').slice(0, 6).join(' ');
  
  switch (segment.content_type) {
    case 'list-item':
      return `Clear, focused shot representing: ${firstWords}`;
    
    case 'comparison':
      return `Contrasting visual scene for: ${firstWords}`;
    
    case 'concept':
      return `Rich, detailed cinematic scene illustrating: ${firstWords}`;
    
    case 'transition':
      return `Smooth transitional imagery with gentle motion`;
    
    case 'emotional-beat':
      return `Atmospheric, evocative scene with dramatic lighting: ${firstWords}`;
    
    default:
      return `Cinematic shot representing: ${firstWords}`;
  }
}

/**
 * Generate a fallback media type based on content type.
 * Only video is returned since 'image' is no longer a valid standalone option.
 */
function generateFallbackMediaType(_segment: ShotEvent): 'video' {
  // All content defaults to video - the AI in generateShotSummaries 
  // decides between 'video' and 'motiongraphic' based on content
  return 'video';
}

/**
 * Generate a single visual prompt for a segment (for testing/preview).
 */
export function generateQuickPrompt(segment: ShotEvent): string {
  return generateFallbackPrompt(segment);
}
