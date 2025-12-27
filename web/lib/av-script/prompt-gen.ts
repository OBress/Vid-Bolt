
import { ShotEvent } from "./types";
import { generateJSON } from "@/lib/ai/openrouter";

const VISUAL_PROMPT_SYSTEM = `You are a visual director for video content.
Your job is to generate specific, vivid image prompts for video segments.

Input: Use the 'content_type' and 'text' of the segment to determine the imagery.
- list-item: Focus tightly on the specific item mentioned. Distinct from others.
- comparison: Create clear visual contrast between the two sides.
- concept: Rich, detailed scene.
- emotional-beat: Atmospheric, evocative lighting/mood.
- transition: Bridges scenes (e.g., clouds, blurs, motion).

Output: specific image descriptions (no text on screen, just visuals).
`;

export async function generateVisualPrompts(userId: string, segments: ShotEvent[]): Promise<ShotEvent[]> {
  if (segments.length === 0) return [];

  // We process in batches or all at once depending on length. For now, all at once is likely fine for typical scripts.
  
  try {
    const segmentsInput = segments.map((s, i) => ({
        index: i,
        type: s.content_type,
        text: s.text
    }));

    const response = await generateJSON<{ prompts: { index: number, visual_description: string }[] }>(
        userId,
        VISUAL_PROMPT_SYSTEM,
        `Generate visual prompts for these video segments:

${JSON.stringify(segmentsInput, null, 2)}

Return JSON:
{
  "prompts": [
    { "index": 0, "visual_description": "A detailed description..." }
  ]
}`
    );

    // Merge results back
    if (response.prompts && Array.isArray(response.prompts)) {
        response.prompts.forEach(p => {
            if (segments[p.index]) {
                segments[p.index].visual_prompt = p.visual_description;
            }
        });
    }

    // Fill in any missing ones with basic fallback
    segments.forEach(s => {
        if (!s.visual_prompt) {
            s.visual_prompt = `Cinematic shot related to: ${s.text}`;
        }
    });

    return segments;

  } catch (error) {
      console.error("Failed to generate visual prompts:", error);
      // Fallback
      segments.forEach(s => {
          s.visual_prompt = `Cinematic shot representing: ${s.text}`;
      });
      return segments;
  }
}
