import { v4 as uuidv4 } from 'uuid';
import type { PlannedShot } from '@/lib/types/closed-loop';
import {
  callGpuImageSegment,
  callGpuAnimateSegment,
  callGpuVideoSegment,
  type AnimateSegmentRequest,
  type ImageSegmentRequest,
  type SegmentOperation,
  type VideoSegmentRequest,
} from '@/lib/services/gpu-api-service';
import { waitForWebhookResult } from '@/lib/queues/webhook-listener';
import {
  generateMediaKey,
  generatePresignedPutUrl,
  STORAGE_PATHS,
} from '@/lib/services/r2-storage';

const WEBHOOK_TIMEOUT_MS = 10 * 60 * 1000;

interface ExecuteSegmentationShotArgs {
  userId: string;
  videoId: string;
  shot: PlannedShot;
  inputUrl: string;
}

export interface ExecuteSegmentationShotResult {
  success: boolean;
  mediaUrl?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

function getWebhookUrl(): string {
  return process.env.WEBHOOK_CALLBACK_URL || 'http://localhost:3000/api/gpu-callback';
}

function getWebhookSecret(): string | undefined {
  return process.env.GPU_WEBHOOK_SECRET;
}

function inferScale(intensity: 'subtle' | 'moderate' | 'strong' | undefined): number {
  switch (intensity) {
    case 'subtle': return 1.12;
    case 'strong': return 1.32;
    default: return 1.22;
  }
}

function mapPlannedOperationToGpuOperation(
  operation: NonNullable<NonNullable<PlannedShot['segmentation_treatment']>['operations']>[number]
): SegmentOperation {
  return {
    type: operation.type,
    target: operation.target,
    color: operation.color,
    thickness: operation.thickness,
    strength: operation.strength,
    radius: operation.radius,
    intensity: operation.intensity,
    darkness: operation.darkness,
    scale: operation.scale,
    object_index: operation.object_index,
    object_label: operation.object_label,
    object_labels: operation.object_labels,
    object_id: operation.object_id,
    object_ids: operation.object_ids,
    block_size: operation.block_size,
    brightness: operation.brightness,
    contrast: operation.contrast,
    saturation: operation.saturation,
    hue_shift: operation.hue_shift,
    saturation_scale: operation.saturation_scale,
    image_url: operation.image_url,
    progress: operation.progress,
    levels: operation.levels,
    noise_type: operation.noise_type,
    detail: operation.detail,
    color_dark: operation.color_dark,
    color_light: operation.color_light,
    dot_size: operation.dot_size,
    rgb_shift: operation.rgb_shift,
    seed: operation.seed,
    angle: operation.angle,
    offset: operation.offset,
    value: operation.value,
    amount: operation.amount,
    animation: operation.animation,
  };
}

function buildSegmentOperations(shot: PlannedShot): SegmentOperation[] {
  const treatment = shot.segmentation_treatment;
  if (!treatment) return [];

  const operations: SegmentOperation[] = [];
  const scale = inferScale(treatment.intensity);
  const subjectTarget = 'mask' as const;
  const backgroundTarget = 'background' as const;

  if (treatment.allow_background_desaturation) {
    operations.push({
      type: 'grayscale',
      target: backgroundTarget,
      animation: {
        mode: 'transition',
        easing: 'ease_in_out',
        start: { intensity: 0 },
        end: { intensity: 1 },
        duration: 1.2,
      },
    });
  }

  switch (treatment.preset) {
    case 'danger_emphasis':
      operations.push({
        type: 'spotlight',
        target: subjectTarget,
        darkness: 0.72,
        animation: {
          mode: 'transition',
          easing: 'ease_in_out',
          start: { darkness: 0.25 },
          end: { darkness: 0.72 },
          duration: 1.4,
        },
      });
      operations.push({
        type: 'outline',
        target: subjectTarget,
        color: [255, 80, 80, 255],
        thickness: 3,
        animation: {
          mode: 'draw',
          easing: 'ease_in_out',
          delay: 0.5,
          duration: 1.6,
        },
      });
      break;
    case 'focus_reveal':
      operations.push({
        type: 'spotlight',
        target: subjectTarget,
        darkness: 0.65,
        animation: {
          mode: 'transition',
          easing: 'ease_in_out',
          start: { darkness: 0.1 },
          end: { darkness: 0.65 },
          duration: 1.1,
        },
      });
      operations.push({
        type: 'outline',
        target: subjectTarget,
        color: [0, 255, 255, 255],
        thickness: 3,
        animation: {
          mode: 'draw',
          easing: 'ease_in_out',
          delay: 0.4,
          duration: 1.6,
        },
      });
      break;
    case 'detail_callout':
      operations.push({
        type: 'outline',
        target: subjectTarget,
        color: [255, 240, 120, 255],
        thickness: 4,
        animation: {
          mode: 'draw',
          easing: 'ease_out',
          duration: 1.2,
        },
      });
      break;
    case 'subject_isolation':
      operations.push({
        type: 'spotlight',
        target: subjectTarget,
        darkness: 0.6,
      });
      operations.push({
        type: 'bokeh',
        target: backgroundTarget,
        strength: 18,
        animation: {
          mode: 'transition',
          easing: 'ease_in_out',
          start: { strength: 0 },
          end: { strength: 18 },
          duration: 1.2,
        },
      });
      break;
    case 'progressive_reveal':
      operations.push({
        type: 'outline',
        target: subjectTarget,
        color: [0, 255, 255, 255],
        thickness: 3,
        animation: {
          mode: 'draw',
          easing: 'ease_in_out',
          duration: 1.8,
        },
      });
      break;
    case 'tracked_annotation':
      operations.push({
        type: 'outline',
        target: subjectTarget,
        color: [255, 255, 0, 255],
        thickness: 3,
      });
      operations.push({
        type: 'glow',
        target: subjectTarget,
        color: [255, 230, 90],
        radius: 18,
        animation: {
          mode: 'pulse',
          easing: 'ease_in_out',
          start: { intensity: 0.15 },
          end: { intensity: 0.75 },
          cycles: 2,
        },
      });
      break;
    default:
      break;
  }

  if (treatment.allow_tracked_annotation && !operations.some(op => op.type === 'outline')) {
    operations.push({
      type: 'outline',
      target: subjectTarget,
      color: [0, 255, 255, 255],
      thickness: 3,
    });
  }

  if (treatment.allow_guided_zoom) {
    operations.push({
      type: 'zoom',
      target: 'mask',
      animation: {
        mode: 'transition',
        easing: 'ease_out',
        start: { scale: 1.0 },
        end: { scale },
        duration: 2.0,
      },
      scale,
    });
  }

  if (treatment.operations.length > 0) {
    operations.push(
      ...treatment.operations.map(mapPlannedOperationToGpuOperation)
    );
  }

  return operations;
}

function buildOutputTarget(
  userId: string,
  videoId: string,
  shotIndex: number,
  executionMode: NonNullable<NonNullable<PlannedShot['segmentation_treatment']>['execution_mode']>,
  outputKind: 'video' | 'image' | 'json',
): Promise<{ putUrl: string; publicUrl: string }> {
  const key = generateMediaKey(
    userId,
    videoId,
    outputKind === 'video' ? STORAGE_PATHS.FOOTAGE.GENERATED : STORAGE_PATHS.IMAGES.GENERATED,
    outputKind === 'video'
      ? `shot_${shotIndex}_${executionMode}.mp4`
      : outputKind === 'json'
        ? `shot_${shotIndex}_${executionMode}.json`
        : `shot_${shotIndex}_${executionMode}.png`,
  );
  return generatePresignedPutUrl(
    key,
    outputKind === 'video'
      ? 'video/mp4'
      : outputKind === 'json'
        ? 'application/json'
        : 'image/png',
  );
}

async function waitForSegmentationWebhook(
  itemId: string,
  publicUrl: string,
  sourceMediaUrl: string,
  laneDecision: string,
): Promise<ExecuteSegmentationShotResult> {
  try {
    const webhookResult = await waitForWebhookResult(itemId, WEBHOOK_TIMEOUT_MS);
    if (webhookResult.status === 'completed') {
      return {
        success: true,
        mediaUrl: publicUrl,
        metadata: {
          ...(webhookResult.result?.metadata as Record<string, unknown> | undefined),
          source_media_url: sourceMediaUrl,
          lane_decision: laneDecision,
        },
      };
    }

    return {
      success: false,
      error: webhookResult.errorMessage || 'Segmentation job failed',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown segmentation error',
    };
  }
}

export async function executeSegmentationShot(
  args: ExecuteSegmentationShotArgs,
): Promise<ExecuteSegmentationShotResult> {
  const { userId, videoId, shot, inputUrl } = args;
  const treatment = shot.segmentation_treatment;

  if (!treatment?.execution_mode) {
    return { success: false, error: 'Shot has no segmentation treatment' };
  }

  const itemId = `segment-shot-${shot.segment_index}-${uuidv4().slice(0, 8)}`;
  const textPrompt = treatment.target_mode === 'text_prompt'
    ? (treatment.text_prompt || treatment.subject_focus || shot.subject_focus)
    : undefined;
  const objectPrompts = treatment.target_mode === 'object_prompts' && treatment.object_prompts.length > 0
    ? treatment.object_prompts
    : undefined;
  const operations = buildSegmentOperations(shot);
  const laneDecision = shot.render_strategy || treatment.execution_mode;
  const commonMetadata = {
    source_media_url: inputUrl,
    lane_decision: laneDecision,
  };

  if (treatment.execution_mode === 'segment_animate') {
    const outputTarget = await buildOutputTarget(userId, videoId, shot.segment_index, treatment.execution_mode, 'video');
    const request: AnimateSegmentRequest = {
      job_id: `seg-animate-${shot.segment_index}-${uuidv4().slice(0, 8)}`,
      input_image_url: inputUrl,
      text_prompt: textPrompt,
      point_prompts: treatment.point_prompts,
      box_prompts: treatment.box_prompts,
      box_prompts_labeled: treatment.box_prompts_labeled,
      object_prompts: objectPrompts,
      confidence_threshold: treatment.confidence_threshold,
      max_objects: treatment.max_objects,
      duration_seconds: Math.max(2, Math.round(shot.duration_seconds)),
      fps: 30,
      operations,
      save_url: outputTarget.putUrl,
      webhook_url: getWebhookUrl(),
      item_id: itemId,
      webhook_secret: getWebhookSecret(),
    };

    const result = await callGpuAnimateSegment(request);
    if (!result.success) {
      return { success: false, error: result.errorMessage || 'Animated segmentation request failed' };
    }
    if (!result.isAsync) {
      return {
        success: true,
        mediaUrl: outputTarget.publicUrl,
        metadata: {
          ...(result.metadata as Record<string, unknown> | undefined),
          ...commonMetadata,
        },
      };
    }
    return waitForSegmentationWebhook(itemId, outputTarget.publicUrl, inputUrl, laneDecision);
  }

  if (treatment.execution_mode === 'segment_mask_prep' && shot.media_type !== 'video') {
    const outputKind = treatment.output_type === 'masks_json' ? 'json' : 'image';
    const outputTarget = await buildOutputTarget(userId, videoId, shot.segment_index, treatment.execution_mode, outputKind);
    const request: ImageSegmentRequest = {
      job_id: `seg-image-${shot.segment_index}-${uuidv4().slice(0, 8)}`,
      input_image_url: inputUrl,
      text_prompt: textPrompt,
      point_prompts: treatment.point_prompts,
      box_prompts: treatment.box_prompts,
      box_prompts_labeled: treatment.box_prompts_labeled,
      object_prompts: objectPrompts,
      confidence_threshold: treatment.confidence_threshold,
      max_objects: treatment.max_objects,
      output_type: treatment.output_type || 'masks_json',
      operations,
      save_url: outputTarget.putUrl,
      webhook_url: getWebhookUrl(),
      item_id: itemId,
      webhook_secret: getWebhookSecret(),
    };

    const result = await callGpuImageSegment(request);
    if (!result.success) {
      return { success: false, error: result.errorMessage || 'Image segmentation request failed' };
    }
    if (!result.isAsync) {
      return {
        success: true,
        mediaUrl: outputTarget.publicUrl,
        metadata: {
          ...(result.metadata as Record<string, unknown> | undefined),
          ...commonMetadata,
        },
      };
    }
    return waitForSegmentationWebhook(itemId, outputTarget.publicUrl, inputUrl, laneDecision);
  }

  const outputKind = treatment.output_format === 'masks_json' ? 'json' : 'video';
  const outputTarget = await buildOutputTarget(userId, videoId, shot.segment_index, treatment.execution_mode, outputKind);
  const request: VideoSegmentRequest = {
    job_id: `seg-video-${shot.segment_index}-${uuidv4().slice(0, 8)}`,
    input_video_url: inputUrl,
    text_prompt: textPrompt,
    text_prompts: treatment.text_prompts,
    point_prompts: treatment.point_prompts,
    point_labels: treatment.point_labels,
    box_prompts: treatment.box_prompts,
    box_labels: treatment.box_labels,
    object_prompts: objectPrompts,
    prompt_frame_index: treatment.prompt_frame_index,
    propagation_direction: treatment.propagation_direction,
    confidence_threshold: treatment.confidence_threshold,
    include_tracking_metadata: treatment.include_tracking_metadata ?? true,
    output_format: treatment.output_format || (treatment.execution_mode === 'segment_mask_prep' ? 'masks_json' : 'video'),
    operations,
    max_frames: treatment.max_frames,
    save_url: outputTarget.putUrl,
    webhook_url: getWebhookUrl(),
    item_id: itemId,
    webhook_secret: getWebhookSecret(),
  };

  const result = await callGpuVideoSegment(request);
  if (!result.success) {
    return { success: false, error: result.errorMessage || 'Video segmentation request failed' };
  }

  if (!result.isAsync) {
    return {
      success: true,
      mediaUrl: outputTarget.publicUrl,
      metadata: {
        ...(result.metadata as Record<string, unknown> | undefined),
        ...commonMetadata,
      },
    };
  }

  return waitForSegmentationWebhook(itemId, outputTarget.publicUrl, inputUrl, laneDecision);
}
