/**
 * Pipeline Motion Graphics Generator
 * ============================================================================
 * Server-side orchestrator for batch motion graphic generation in the
 * video creation pipeline (Step 6). Wraps the existing MotionGraphicsService
 * SSE streaming into a request-response pattern for the pipeline API.
 *
 * Features:
 * - Collects SSE stream into final result
 * - Prompt enrichment with R2 image URLs
 * - Simplified fallback prompt on repeated failures
 * - Syntax validation before returning
 */

import { motionGraphicsService, type GenerationRequest } from './motion-graphics-service';
import { validateCode, transpileCheck, stripMarkdownFences } from './code-validator';
import type { RoutingTag } from '@/types/video';

// ============================================================
// TYPES
// ============================================================

export interface ImageAsset {
  /** R2 public URL */
  url: string;
  /** What this image/video shows */
  description: string;
  /** How it should be used in the animation */
  suggestedUsage: string;
}

export interface PipelineGenerationRequest {
  /** The user/AI prompt describing the desired motion graphic */
  prompt: string;
  /** Duration in seconds */
  duration: number;
  /** Shot index within the video */
  shotIndex: number;
  /** Video project ID */
  videoId: string;
  /** OpenRouter API key */
  apiKey: string;
  /** OpenRouter model ID */
  model: string;
  /** Routing tags from Step 5 */
  routingTags?: RoutingTag[];
  /** Image/video assets from R2 to reference in the animation */
  imageAssets?: ImageAsset[];
  /** Context hint for the type of motion graphic */
  contextHint?: string;
  /** Narration text spoken during this shot — used for timing visual elements */
  narrationText?: string;
  /** QC feedback from a previous failed attempt */
  previousQCFeedback?: string;
  /** If true, generate a simplified fallback animation */
  simplifiedRetry?: boolean;
}

export interface PipelineGenerationResult {
  success: boolean;
  /** The generated Remotion component code */
  remotionCode?: string;
  /** Error message if generation failed */
  error?: string;
  /** Detected skills used */
  skills?: string[];
  /** Duration in frames (from AI planning) */
  durationFrames?: number;
  /** Icons used in the animation */
  usedIcons?: string[];
}

// ============================================================
// PROMPT ENRICHMENT
// ============================================================

/**
 * Build an enriched motion graphics prompt that includes R2 image URLs
 * with explicit usage instructions based on routing tags.
 */
export function buildEnrichedMGPrompt(
  basePrompt: string,
  routingTags: RoutingTag[],
  imageAssets: ImageAsset[],
  duration: number,
  contextHint?: string,
  narrationText?: string,
): string {
  const parts: string[] = [];

  // Base prompt
  parts.push(basePrompt);

  // Duration context
  parts.push(`\nDuration: ${duration} seconds (${duration * 30} frames at 30fps).`);

  // Context hint
  if (contextHint) {
    parts.push(`\nType: ${contextHint}`);
  }

  // Narration text — helps the AI time visual elements to match spoken content
  if (narrationText) {
    const wordCount = narrationText.split(/\s+/).length;
    const wordsPerSecond = wordCount / duration;
    parts.push(`\n\nNARRATION (spoken during this shot — time visual elements to match):\n"${narrationText}"`);
    parts.push(`\n\nTIMING ALIGNMENT (CRITICAL):
- This narration has ${wordCount} words spoken over ${duration}s (~${wordsPerSecond.toFixed(1)} words/sec)
- Map your animation phases to the narration structure:
  * Entrance animations should trigger within the first 0.5s
  * Key visual elements (labels, badges, highlights) should appear when the narrator reaches the relevant words
  * Don't front-load all animations at the start — spread them across the duration to match pacing
  * Reserve the final 0.3-0.5s for a clean hold or subtle exit
- If the narration mentions specific items in sequence, animate corresponding elements in the SAME sequence`);
  }

  // Image assets — only for image/video manipulation tags
  const hasImageManipulation = routingTags.includes('remotion_image_manipulation');
  const hasVideoManipulation = routingTags.includes('remotion_video_manipulation');

  // Video overlay guidance — creative overlay composition on dynamic video
  if (hasVideoManipulation) {
    parts.push('\n\n⚠️ VIDEO OVERLAY MODE (CRITICAL — your component renders ON TOP of video footage):');
    parts.push('\n⚠️ The <AbsoluteFill> ROOT MUST have style={{ background: "transparent" }}. NO EXCEPTIONS.');
    parts.push('\n⚠️ Any solid/opaque background on the root element will COMPLETELY BLOCK the video beneath it.');
    parts.push('\n⚠️ VERIFY: no top-level container has an opaque backgroundColor. Only inner elements (text labels, badges, etc.) may have solid backgrounds.');
    parts.push('\n- Design elements that COMPLEMENT the underlying video, not compete with it');
    parts.push('\n- Use semi-transparent backgrounds behind text for readability (e.g., rgba(0,0,0,0.6))');
    parts.push('\n');
    parts.push('\nCREATIVE OVERLAY TYPES you should create:');
    parts.push('\n- Location tags: Animated pin icon + location name, slides in from edge with spring animation');
    parts.push('\n- Lower-thirds: Name/title bar at bottom 20% with smooth entrance, semi-transparent background');
    parts.push('\n- Animated titles: Large text that fades/slides in, positioned top or center, bold and cinematic');
    parts.push('\n- Info badges: Icon + text in rounded container, appears in corners');
    parts.push('\n- Border/frame effects: Animated borders, corner brackets, or cinematic letterboxing');
    parts.push('\n- Vignette/tint: Color wash or vignette overlay, driven by frame for animation');
    parts.push('\n- Data HUD: Stats, meters, or progress bars styled like a broadcast overlay');
    parts.push('\n- Lens effects: Glow, light leak, or subtle flare overlaid as CSS effects');
    parts.push('\n');
    parts.push('\nPOSITIONING RULES:');
    parts.push('\n- Prefer screen edges and corners for persistent elements (lower-thirds, badges)');
    parts.push('\n- Center is OK for brief title reveals that fade in and out');
    parts.push('\n- Do NOT try to track or circle specific objects in the video — the video content is dynamic');
    parts.push('\n- Do NOT use position-specific annotations that assume knowledge of video content');
  }

  if ((hasImageManipulation || hasVideoManipulation) && imageAssets.length > 0) {
    parts.push('\n\nAVAILABLE MEDIA ASSETS (use via Remotion\'s <Img> or <OffthreadVideo> components):');

    imageAssets.forEach((asset, i) => {
      parts.push(`\n${i + 1}. ${asset.url}`);
      parts.push(`   Shows: ${asset.description}`);
      parts.push(`   Usage: ${asset.suggestedUsage}`);
    });

    parts.push('\n\nIMPORTANT: These are real, accessible R2 URLs. Use Remotion\'s <Img src={url} /> component to render them. Do NOT create placeholder images or use dummy URLs. Import Img from "remotion" at the top of your component.');
  }

  return parts.join('');
}

/**
 * Build a simplified fallback prompt for when full generation + QC fails.
 * Produces a minimal animated text card that's unlikely to fail.
 */
export function buildSimplifiedPrompt(originalPrompt: string, duration: number): string {
  // Extract the core concept from the original prompt (first sentence or 80 chars)
  const coreText = originalPrompt
    .split(/[.!?]/)[0]
    .trim()
    .substring(0, 80);

  return `Create a simple, clean animated text card. Duration: ${duration} seconds.

Display this text with a smooth fade-in animation: "${coreText}"

Requirements:
- Dark gradient background (dark blue to dark purple)
- White text, centered, using clean sans-serif styling
- Simple fade-in entrance animation using Remotion's interpolate()
- No complex elements, no external images, no icons
- Keep it minimal and elegant`;
}

/**
 * Generate a static hardcoded Remotion fallback component.
 * This is the absolute last resort — guaranteed to produce valid, renderable
 * Remotion code without any LLM call. Used when both full generation and
 * simplified retry have failed. The pipeline must never halt.
 *
 * @param narrationText - The text spoken during this shot
 * @param duration - Duration in seconds
 * @param shotIndex - Shot index for identification
 */
export function getStaticRemotionFallback(
  narrationText: string,
  duration: number,
  shotIndex: number,
  isOverlay: boolean = false,
): PipelineGenerationResult {
  // Extract first ~60 chars of narration for visual display
  const displayText = narrationText
    ? narrationText.substring(0, 60) + (narrationText.length > 60 ? '...' : '')
    : `Scene ${shotIndex + 1}`;

  const fps = 30;
  const totalFrames = Math.max(fps, Math.round(duration * fps));

  const code = `import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, spring } from 'remotion';

const StaticFallback: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Smooth fade in over 0.5s
  const fadeIn = interpolate(frame, [0, Math.round(fps * 0.5)], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Gentle scale spring
  const scale = spring({
    frame,
    fps,
    config: { damping: 200, mass: 1, stiffness: 100 },
  });

  // Subtle gradient shift
  const gradientOffset = interpolate(frame, [0, ${totalFrames}], [0, 30]);

  return (
    <AbsoluteFill
      style={{
        background: \`linear-gradient(\${135 + gradientOffset}deg, #0f0c29 0%, #302b63 50%, #24243e 100%)\`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 60,
      }}
    >
      <div
        style={{
          opacity: fadeIn,
          transform: \`scale(\${0.9 + scale * 0.1})\`,
          textAlign: 'center',
          maxWidth: '80%',
        }}
      >
        <div
          style={{
            fontSize: 42,
            fontWeight: 700,
            color: '#ffffff',
            lineHeight: 1.4,
            fontFamily: 'Inter, Arial, sans-serif',
            textShadow: '0 2px 20px rgba(0,0,0,0.5)',
          }}
        >
          ${JSON.stringify(displayText)}
        </div>
        <div
          style={{
            marginTop: 20,
            width: 60,
            height: 3,
            background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
            borderRadius: 2,
            margin: '20px auto 0',
            opacity: fadeIn,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

export default StaticFallback;`;

  console.log(`[PipelineMG] Shot ${shotIndex}: Using STATIC FALLBACK (no LLM call)`);

  return {
    success: true,
    remotionCode: code,
    skills: ['text-animation'],
    durationFrames: totalFrames,
    usedIcons: [],
  };
}

// ============================================================
// PIPELINE GENERATOR
// ============================================================

/**
 * Generate a motion graphic for the pipeline by collecting the SSE stream
 * from MotionGraphicsService into a single result.
 */
export async function generateMotionGraphic(
  request: PipelineGenerationRequest
): Promise<PipelineGenerationResult> {
  const {
    prompt,
    duration,
    apiKey,
    model,
    routingTags = [],
    imageAssets = [],
    contextHint,
    narrationText,
    previousQCFeedback,
    simplifiedRetry = false,
  } = request;

  // Build the final prompt
  let finalPrompt: string;

  if (simplifiedRetry) {
    // M2 Fix: Simplified retry preserves narrationText and routingTags for content
    // relevance. Only the visual complexity is reduced, not the context.
    finalPrompt = buildEnrichedMGPrompt(prompt, routingTags, imageAssets, duration, contextHint, narrationText);
    finalPrompt += `\n\n⚠️ REDUCED COMPLEXITY MODE: Previous attempts with full visual complexity failed.
Use ONLY these safe patterns:
- Simple fade-in/fade-out text with interpolate()
- Basic spring() animations for scale/position
- Solid or gradient backgrounds (no images unless provided above)
- No complex SVG paths or canvas operations
- Maximum 3-4 animated elements total
Keep the content relevant to the narration above, but simplify the visual execution.`;
  } else {
    finalPrompt = buildEnrichedMGPrompt(prompt, routingTags, imageAssets, duration, contextHint, narrationText);
  }

  // If we have QC feedback, format it as error correction
  const errorCorrection = previousQCFeedback
    ? {
        error: `Visual Quality Check failed. Issues found:\n${previousQCFeedback}\n\nPlease fix these issues while keeping the same overall design.`,
        attemptNumber: 1,
        maxAttempts: 2,
      }
    : undefined;

  // Collect SSE events into a final result
  let finalCode = '';
  let skills: string[] = [];
  let durationFrames: number | undefined;
  let usedIcons: string[] = [];
  let streamError: string | undefined;

  const generationRequest: GenerationRequest = {
    prompt: finalPrompt,
    model,
    errorCorrection,
    currentCode: errorCorrection ? undefined : undefined,
    previouslyUsedSkills: [],
  };

  // SSE collector — receives events from MotionGraphicsService
  const sendSSE = (data: Record<string, unknown>) => {
    switch (data.type) {
      case 'skills':
        skills = (data.skills as string[]) || [];
        break;

      case 'plan':
        if (data.plan && typeof data.plan === 'object') {
          const plan = data.plan as Record<string, unknown>;
          if (typeof plan.duration === 'number' && plan.duration > 0) {
            durationFrames = plan.duration;
          }
        }
        break;

      case 'code_chunk':
        if (data.fullCode) {
          finalCode = data.fullCode as string;
        } else if (data.chunk) {
          finalCode += data.chunk as string;
        }
        break;

      case 'complete':
        if (data.code) {
          finalCode = data.code as string;
        }
        if (data.metadata && typeof data.metadata === 'object') {
          const metadata = data.metadata as Record<string, unknown>;
          if (Array.isArray(metadata.usedIcons)) {
            usedIcons = metadata.usedIcons as string[];
          }
        }
        if (data.skills) {
          skills = data.skills as string[];
        }
        break;

      case 'error':
        streamError = data.error as string;
        break;

      // Ignore stage, vision, done, validation events
      default:
        break;
    }
  };

  try {
    await motionGraphicsService.streamGeneration(sendSSE, apiKey, generationRequest);
  } catch (err) {
    console.error(`[PipelineMG] Shot ${request.shotIndex}: Stream error:`, err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Generation stream failed',
    };
  }

  // Check for stream errors
  if (streamError) {
    console.error(`[PipelineMG] Shot ${request.shotIndex}: Generation error:`, streamError);
    return {
      success: false,
      error: streamError,
    };
  }

  // Validate we got code
  if (!finalCode.trim()) {
    return {
      success: false,
      error: 'No code was generated',
    };
  }

  // Strip markdown fences and validate syntax
  const cleanCode = stripMarkdownFences(finalCode);
  const validation = validateCode(cleanCode);

  if (!validation.isValid) {
    console.warn(`[PipelineMG] Shot ${request.shotIndex}: Code validation failed:`, validation.errors);
    return {
      success: false,
      remotionCode: cleanCode, // Return code anyway for debugging
      error: `Code validation failed: ${validation.errors.join('; ')}`,
    };
  }

  // Babel syntax check — catches ALL syntax errors the regex check misses.
  // This is the #1 reason MG generation "succeeds" but fails at render time.
  const syntaxResult = transpileCheck(validation.fixedCode || cleanCode);
  if (!syntaxResult.valid) {
    console.warn(`[PipelineMG] Shot ${request.shotIndex}: ❌ Babel check failed: ${syntaxResult.error}`);
    return {
      success: false,
      remotionCode: validation.fixedCode || cleanCode,
      error: `Syntax error: ${syntaxResult.error}`,
    };
  }

  console.log(`[PipelineMG] Shot ${request.shotIndex}: ✅ Generation complete (${cleanCode.length} chars, ${skills.length} skills)`);

  return {
    success: true,
    remotionCode: cleanCode,
    skills,
    durationFrames,
    usedIcons,
  };
}

// ============================================================
// TWO-PASS PATTERN: PASS 2 (Asset Swap)
// ============================================================

/**
 * Pass 2 of the MG Two-Pass Pattern.
 *
 * During Phase IV, MG Pass 1 runs on CPU in parallel with GPU work,
 * using placeholder asset URLs. After the GPU pipeline completes,
 * Pass 2 swaps placeholder URLs for real R2 URLs in the Remotion code.
 *
 * @param pass1Code - The Remotion composition code from Pass 1
 * @param assetMap - Mapping of placeholder URLs to real R2 URLs
 * @returns Updated Remotion code with real asset URLs
 */
export function generateMotionGraphicPass2(
  pass1Code: string,
  assetMap: Record<string, string>
): PipelineGenerationResult {
  const LOG = '[MG-Pass2]';

  if (!pass1Code) {
    console.error(`${LOG} No Pass 1 code provided`);
    return { success: false, error: 'No Pass 1 code to update' };
  }

  let updatedCode = pass1Code;
  let swapCount = 0;

  // Replace all placeholder URLs with real R2 URLs
  for (const [placeholder, realUrl] of Object.entries(assetMap)) {
    if (!realUrl) continue;

    // Match placeholder patterns: "placeholder://shot-N", "PLACEHOLDER_IMAGE_N", etc.
    const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedPlaceholder, 'g');
    const matches = updatedCode.match(regex);

    if (matches) {
      updatedCode = updatedCode.replace(regex, realUrl);
      swapCount += matches.length;
      console.log(`${LOG} Swapped ${matches.length}x: ${placeholder.substring(0, 40)} → ${realUrl.substring(0, 40)}...`);
    }
  }

  console.log(`${LOG} Total swaps: ${swapCount}`);

  // Validate the updated code
  const validation = validateCode(updatedCode);
  if (!validation.isValid) {
    console.error(`${LOG} Post-swap validation failed: ${validation.errors?.join(', ')}`);
    // Return the code anyway — it's better than nothing and the user can fix it
  }

  return {
    success: true,
    remotionCode: updatedCode,
  };
}

/**
 * Build placeholder asset URLs for MG Pass 1.
 * These placeholders will be replaced with real R2 URLs in Pass 2.
 *
 * @param shotIndex - The shot index
 * @param assetCount - Number of assets needed for this composition
 * @returns Map of placeholder key → placeholder URL
 */
export function buildPlaceholderAssets(
  shotIndex: number,
  assetCount: number = 1
): ImageAsset[] {
  const assets: ImageAsset[] = [];

  for (let i = 0; i < assetCount; i++) {
    assets.push({
      url: `placeholder://shot-${shotIndex}/asset-${i}`,
      description: `Placeholder for AI-generated asset ${i + 1} (will be swapped in Pass 2)`,
      suggestedUsage: 'primary',
    });
  }

  return assets;
}
