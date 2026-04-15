/**
 * Visual Prompt Generator
 * ============================================================================
 * Generates AI image prompts for video segments based on content type.
 *
 * Architecture:
 * - Processes shots in chunks of 3 (quality-first: full LLM attention per shot)
 * - Injects a Visual Consistency Bible built from outlineAssets into every chunk
 *   so character/location descriptions are globally consistent regardless of
 *   chunk order (solves forward/backward consistency without cross-chunk deps)
 * - Passes last 2 generated descriptions as rolling window for local variety
 *   (prevents consecutive identical shot types at chunk boundaries)
 * - Global shot indices are preserved across chunks (shot 9 stays index 9)
 */

import { ShotEvent, ContentType } from "./types";
import { generateJSON } from "@/lib/ai/openrouter";

// ============================================================================
// TYPES
// ============================================================================

export interface OutlineAssets {
  characters?: Array<{
    id: string;
    name: string;
    role?: string;
    physicalCharacteristics?: {
      demographics?: { age?: number | string; gender?: string; ethnicity?: string };
      hair?: { color?: string; length?: string; style?: string };
      faceFeatures?: { eyeColor?: string; skinTone?: string };
      distinguishingFeatures?: string[];
    };
    wardrobe?: { defaultOutfit?: string };
    expressions?: { neutral?: string };
    visualInstructions?: { consistencyAnchors?: string[]; styleNotes?: string };
  }>;
  locations?: Array<{
    id: string;
    name: string;
    type?: string;
    essence?: string;
    lighting?: { natural?: string; mood?: string };
    environmentalDetails?: { weatherAtmosphere?: string };
    visualInstructions?: { consistencyAnchors?: string[] };
  }>;
  objects?: Array<{
    id: string;
    name: string;
    type?: string;
    physicalDescription?: { detailedDescription?: string; color?: string };
  }>;
}

export interface CreativeManifestContext {
  visualStyle?: string;
  colorPalette?: string;
  genre?: string;
  toneStyle?: string;
  masterCreativePrompt?: string;
}

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

const BASE_VISUAL_PROMPT_SYSTEM = `You are a visual director for high-end YouTube video content.
Your job is to generate specific, vivid image prompts for video segments and decide whether they should be AI-generated VIDEOS or MOTION GRAPHICS.

CRITICAL RULES:
1. NO text on screen - just visuals
2. Each image/video must be DISTINCT and SPECIFIC — never generic
3. Match the visual style to the content type
4. Use cinematic, professional imagery
5. Be concise but descriptive (1-2 sentences max)
6. DECIDE MEDIA TYPE:
   - "video" for: Cinematic scenes, atmospheric visuals, single-subject moments, emotional beats, transitions
   - "motiongraphic" for: Data-heavy content, comparisons, lists, step-by-step explanations, quote overlays,
     before/after reveals, timelines, evidence displays, multi-element compositions, annotated visuals
   - Use "motiongraphic" generously for content that benefits from structured visual storytelling
   - Use "video" when the power is in WATCHING a single moment unfold

## VISUAL QUALITY PRINCIPLES

**NARRATIVE PURPOSE**: Every visual must serve the story — it should show what the viewer NEEDS to see to understand and feel the narrative. A generic scene with no clear connection to the narration is a failure.

**DYNAMIC COMPOSITIONS**: Prefer visuals that imply MOVEMENT and LIFE — a person walking through a corridor, waves crashing against rocks, traffic flowing through a city, papers being shuffled on a desk. Static posed subjects should be the exception, not the rule.

**DRAMATIC CONTRAST**: For adjacent clips, ensure dramatic visual contrast — change the angle, lighting, scale, and subject between every shot. Two similar-looking shots in a row kill engagement.

**SHOT TYPE VARIETY**: Cycle through different shot types based on narrative purpose:
- Extreme close-up → for intimate details, evidence, objects
- Wide establishing → for scope, context, new locations
- Medium shot → for people, interactions, explanations
- Tight detail → for evidence, key objects, emphasis
- Over-shoulder / POV → for immersion, perspective

**DEPTH AND LAYERS**: Prefer compositions with foreground elements, a clear subject, and background context rather than flat, centered subjects.

For adjacent list items, ensure VISUAL VARIETY - each should be clearly different.

${Object.entries(CONTENT_TYPE_GUIDANCE).map(([_type, guidance]) => guidance).join('\n\n')}
`;

// ============================================================================
// VISUAL CONSISTENCY BIBLE (deterministic — no LLM cost)
// ============================================================================

/**
 * Build a compact Visual Consistency Bible string from outlineAssets and
 * creative manifest. Injected into EVERY chunk's system prompt so all chunks
 * share identical character/location/style anchors regardless of order.
 *
 * Zero LLM cost — pure string building from already-existing profile data.
 */
function buildVisualBible(
  outlineAssets?: OutlineAssets,
  creative?: CreativeManifestContext,
): string {
  const sections: string[] = [];

  // Global style
  if (creative?.visualStyle || creative?.colorPalette || creative?.masterCreativePrompt) {
    const styleLines = [
      creative.visualStyle && `Visual style: ${creative.visualStyle}`,
      creative.colorPalette && `Color palette: ${creative.colorPalette}`,
      creative.toneStyle && `Tone: ${creative.toneStyle}`,
      creative.masterCreativePrompt && `Creative direction: ${creative.masterCreativePrompt}`,
    ].filter(Boolean);
    sections.push(`GLOBAL STYLE:\n${styleLines.join('\n')}`);
  }

  // Characters
  const chars = outlineAssets?.characters;
  if (chars && chars.length > 0) {
    const charLines = chars.map(c => {
      const parts: string[] = [`• ${c.name}${c.role ? ` (${c.role})` : ''}`];
      const pc = c.physicalCharacteristics;
      if (pc) {
        const demo = pc.demographics;
        if (demo?.age || demo?.gender) parts.push(`  ${[demo.age, demo.gender, demo.ethnicity].filter(Boolean).join(', ')}`);
        if (pc.hair?.color) parts.push(`  Hair: ${[pc.hair.color, pc.hair.length, pc.hair.style].filter(Boolean).join(', ')}`);
        if (pc.faceFeatures?.skinTone) parts.push(`  Skin: ${pc.faceFeatures.skinTone}`);
        if (pc.distinguishingFeatures?.length) parts.push(`  Distinctive: ${pc.distinguishingFeatures.join(', ')}`);
      }
      if (c.wardrobe?.defaultOutfit) parts.push(`  Outfit: ${c.wardrobe.defaultOutfit}`);
      if (c.visualInstructions?.consistencyAnchors?.length) {
        parts.push(`  Consistency: ${c.visualInstructions.consistencyAnchors.join('. ')}`);
      }
      return parts.join('\n');
    });
    sections.push(`CHARACTERS (always describe consistently):\n${charLines.join('\n')}`);
  }

  // Locations
  const locs = outlineAssets?.locations;
  if (locs && locs.length > 0) {
    const locLines = locs.map(l => {
      const parts: string[] = [`• ${l.name}${l.type ? ` (${l.type})` : ''}`];
      if (l.essence) parts.push(`  ${l.essence}`);
      if (l.lighting?.natural) parts.push(`  Lighting: ${l.lighting.natural}${l.lighting.mood ? `, ${l.lighting.mood} mood` : ''}`);
      if (l.visualInstructions?.consistencyAnchors?.length) {
        parts.push(`  Anchors: ${l.visualInstructions.consistencyAnchors.join('. ')}`);
      }
      return parts.join('\n');
    });
    sections.push(`LOCATIONS (always describe consistently):\n${locLines.join('\n')}`);
  }

  // Objects
  const objs = outlineAssets?.objects;
  if (objs && objs.length > 0) {
    const objLines = objs.map(o => {
      const desc = o.physicalDescription?.detailedDescription || '';
      const color = o.physicalDescription?.color || '';
      return `• ${o.name}: ${[desc, color].filter(Boolean).join(', ')}`;
    });
    sections.push(`KEY OBJECTS:\n${objLines.join('\n')}`);
  }

  if (sections.length === 0) return '';

  return `\n══════════════════════════════════════════════\nVISUAL CONSISTENCY BIBLE\n(Use these anchors for EVERY shot — do not deviate)\n══════════════════════════════════════════════\n${sections.join('\n\n')}\n══════════════════════════════════════════════\n`;
}

// ============================================================================
// CHUNK PROCESSING
// ============================================================================

const CHUNK_SIZE = 3;

/**
 * Generate visual prompts for an array of shot events.
 * Processes in chunks of 3 with global consistency via injected profiles.
 *
 * @param userId        - User ID for API calls
 * @param segments      - All shots to generate prompts for
 * @param outlineAssets - Character/location/object profiles for consistency bible
 * @param creative      - Creative manifest context for global style
 */
export async function generateVisualPrompts(
  userId: string,
  segments: ShotEvent[],
  outlineAssets?: OutlineAssets,
  creative?: CreativeManifestContext,
): Promise<ShotEvent[]> {
  if (segments.length === 0) return [];

  // Build the Visual Consistency Bible once — injected into every chunk
  const bible = buildVisualBible(outlineAssets, creative);

  // System prompt is the same for all chunks (bible is embedded)
  const systemPrompt = `${BASE_VISUAL_PROMPT_SYSTEM}${bible}`;

  // Rolling window: last 2 generated visual_descriptions for variety management
  const rollingWindow: Array<{ globalIndex: number; visual_description: string; content_type: ContentType }> = [];

  const totalChunks = Math.ceil(segments.length / CHUNK_SIZE);

  try {
    for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
      const startGlobal = chunkIdx * CHUNK_SIZE;
      const endGlobal = Math.min(startGlobal + CHUNK_SIZE, segments.length);
      const chunk = segments.slice(startGlobal, endGlobal);

      // Boundary context: text of adjacent shots (context only, not generated)
      const prevBoundary = startGlobal > 0 ? segments[startGlobal - 1] : null;
      const nextBoundary = endGlobal < segments.length ? segments[endGlobal] : null;

      // Build rolling window context section
      const rollingContext = rollingWindow.length > 0
        ? `\nPREVIOUS SHOTS GENERATED (for visual variety — do NOT repeat these approaches):\n${rollingWindow.map(r => `  Shot ${r.globalIndex + 1} (${r.content_type}): "${r.visual_description}"`).join('\n')}\n`
        : '';

      // Build boundary context
      const boundaryContext = [
        prevBoundary && `PRECEDING SHOT text (context only): "${prevBoundary.text.substring(0, 120)}"`,
        nextBoundary && `FOLLOWING SHOT text (context only): "${nextBoundary.text.substring(0, 120)}"`,
      ].filter(Boolean).join('\n');

      // Prepare chunk input
      const chunkInput = chunk.map((s, localIdx) => ({
        globalIndex: startGlobal + localIdx,
        type: s.content_type,
        text: s.text,
        duration: s.duration_seconds,
        prev_type: localIdx > 0 ? chunk[localIdx - 1].content_type : (prevBoundary?.content_type ?? null),
        next_type: localIdx < chunk.length - 1 ? chunk[localIdx + 1].content_type : (nextBoundary?.content_type ?? null),
      }));

      console.log(`[VisualPromptGen] Chunk ${chunkIdx + 1}/${totalChunks}: shots ${startGlobal + 1}–${endGlobal}`);

      try {
        const response = await generateJSON<{
          prompts: Array<{ globalIndex: number; visual_description: string; media_type: 'video' | 'motiongraphic' }>;
        }>(
          userId,
          systemPrompt,
          `${rollingContext}${boundaryContext ? `\n${boundaryContext}\n` : ''}
Generate visual prompts and media types for these ${chunk.length} video segment(s):

${JSON.stringify(chunkInput, null, 2)}

IMPORTANT:
- Each globalIndex in your response must match the globalIndex in the input exactly
- For list-item segments, each item must have a VISUALLY DISTINCT prompt
- Match style and detail to content type
- Keep prompts concise (1-2 sentences)
- No text overlays, just imagery
- Determine "media_type": "video" or "motiongraphic"
- Ensure VISUAL VARIETY from the previous shots listed above

Return JSON:
{
  "prompts": [
    { "globalIndex": ${startGlobal}, "visual_description": "A detailed description...", "media_type": "video" }
  ]
}`,
        );

        // Merge results back using globalIndex
        if (response.prompts && Array.isArray(response.prompts)) {
          response.prompts.forEach(p => {
            const seg = segments[p.globalIndex];
            if (seg) {
              seg.visual_prompt = p.visual_description;
              seg.media_type = p.media_type || 'video';
              // Add to rolling window for next chunk's variety context
              rollingWindow.push({
                globalIndex: p.globalIndex,
                visual_description: p.visual_description.substring(0, 120),
                content_type: seg.content_type,
              });
            }
          });

          // Keep rolling window to last 2 entries
          while (rollingWindow.length > 2) rollingWindow.shift();
        }
      } catch (chunkError) {
        console.error(`[VisualPromptGen] Chunk ${chunkIdx + 1} failed, using fallbacks:`, chunkError);
        // Apply fallbacks for this chunk — don't abort the whole run
        chunk.forEach(s => {
          if (!s.visual_prompt) {
            s.visual_prompt = generateFallbackPrompt(s);
            s.media_type = s.media_type || 'video';
          }
        });
      }
    }

    // Fill any remaining missing prompts
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

// ============================================================================
// FALLBACKS
// ============================================================================

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
  return 'video';
}

/**
 * Generate a single visual prompt for a segment (for testing/preview).
 */
export function generateQuickPrompt(segment: ShotEvent): string {
  return generateFallbackPrompt(segment);
}
