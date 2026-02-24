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
import { validateCode, stripMarkdownFences } from './code-validator';
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
    parts.push(`\n\nNARRATION (spoken during this shot — time visual elements to match):\n"${narrationText}"`);
    parts.push(`\nUse the narration to pace animations: reveal text/graphics roughly when the narrator mentions them.`);
  }

  // Image assets — only for image/video manipulation tags
  const hasImageManipulation = routingTags.includes('remotion_image_manipulation');
  const hasVideoManipulation = routingTags.includes('remotion_video_manipulation');

  // Video overlay constraints — prevent precision positioning on dynamic video
  if (hasVideoManipulation) {
    parts.push('\n\nVIDEO OVERLAY CONSTRAINTS (this is a transparent overlay on dynamic video):');
    parts.push('\n- Do NOT attempt to track, circle, highlight, or point to specific objects in the video');
    parts.push('\n- Do NOT use position-specific annotations — the underlying video is dynamic and unpredictable');
    parts.push('\n- DO use: full-screen text overlays, lower-thirds, corner graphics, border effects, general screen tints/vignettes, animated titles/labels, info boxes in fixed screen positions');
    parts.push('\n- Keep overlays in screen-edge/corner safe zones — never rely on center-positioning to "match" video content');
    parts.push('\n- Prefer semi-transparent backgrounds behind text for readability over dynamic video');
    parts.push('\n- Think of this as a HUD or broadcast-style overlay, NOT a video annotation tool');
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
    finalPrompt = buildSimplifiedPrompt(prompt, duration);
    console.log(`[PipelineMG] Shot ${request.shotIndex}: Using simplified fallback prompt`);
  } else {
    finalPrompt = buildEnrichedMGPrompt(prompt, routingTags, imageAssets, duration, contextHint, narrationText);
    console.log(`[PipelineMG] Shot ${request.shotIndex}: Enriched prompt (${imageAssets.length} assets)`);
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

  console.log(`[PipelineMG] Shot ${request.shotIndex}: ✅ Generation complete (${cleanCode.length} chars, ${skills.length} skills)`);

  return {
    success: true,
    remotionCode: cleanCode,
    skills,
    durationFrames,
    usedIcons,
  };
}
