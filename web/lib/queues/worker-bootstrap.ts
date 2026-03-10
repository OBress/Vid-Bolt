/**
 * Worker Bootstrap
 * ============================================================================
 * Initializes and starts all BullMQ workers.
 * 
 * Run this as a separate process:
 *   npm run workers       (development with hot-reload)
 *   npm run workers:start (production)
 * 
 * On Railway, configure a separate service with start command:
 *   npm run workers:start
 */

// Load environment variables from .env.local (same as Next.js)
import { config } from 'dotenv';
import { resolve } from 'path';

// Use process.cwd() which is the project root where npm run workers:dev is executed
const envLocalPath = resolve(process.cwd(), '.env.local');
const envPath = resolve(process.cwd(), '.env');
console.log('[WorkerBootstrap] Loading env from:', envLocalPath);
config({ path: envLocalPath });
config({ path: envPath });

// Diagnostic logging for environment
console.log('[WorkerBootstrap] Environment check:');
console.log('  SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '✓ present' : '✗ MISSING');
console.log('  SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ present' : '✗ MISSING');
console.log('  CLOUDFLARE_ACCOUNT_ID:', process.env.CLOUDFLARE_ACCOUNT_ID ? '✓ present' : '✗ MISSING');
console.log('  CLOUDFLARE_WORKER_API_TOKEN:', process.env.CLOUDFLARE_WORKER_API_TOKEN ? '✓ present' : '✗ MISSING');
console.log('  PEXELS_API_KEY:', process.env.PEXELS_API_KEY ? '✓ present' : '✗ MISSING');

import { Worker, Processor } from 'bullmq';
import { getRedisConnection, closeRedisConnection, isRedisReady } from './redis';
import { closeAllQueues, gpuShutdownCheckQueue, dataRetentionCleanupQueue, analyticsChannelStatsQueue, analyticsDailySnapshotQueue, analyticsVideoQueue, analyticsDemographicsQueue, analyticsCompetitorQueue, analyticsPlatformAggregateQueue, nicheDiscoveryQueue } from './queues';
import { lambdaConfig } from '@/lib/services/render/lambda-config';
import { 
  writingProcessor, 
  universalScriptProcessor,
  outlineProcessor,
  scriptWritingProcessor,
  audioProcessor,
  avScriptProcessor,
  visualDirectorProcessor,
  gpuImageCreateProcessor,
  gpuImageEditProcessor,
  gpuVideoCreateProcessor,
  gpuLtx2CreateProcessor,
  gpuLtx2InterpolateProcessor,
  gpuMusicCreateProcessor,
  gpuSfxCreateProcessor,
  gcpProvisionProcessor,
  segmentProcessor,
  stockMediaProcessor,
  assetReferenceImageProcessor,
  researchCompareProcessor,
  gpuShutdownCheckProcessor,
  videoRenderProcessor,
  editAssemblyProcessor,
  orchestratorProcessor,
  shotPlannerProcessor,
  assetScoutProcessor,
  imageGenProcessor,
  videoGenProcessor,
  verifierProcessor,
  imageEditProcessor,
  dataRetentionCleanupProcessor,
  channelStatsSyncProcessor,
  dailySnapshotSyncProcessor,
  videoAnalyticsSyncProcessor,
  demographicsSyncProcessor,
  competitorSyncProcessor,
  platformDailyAggregateProcessor,
  nicheDiscoveryProcessor,
} from './workers';

// ============================================================================
// WORKER CONFIGURATIONS
// ============================================================================

interface WorkerConfig {
  queue: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  processor: Processor<any, any, string>;
  concurrency: number;
  description: string;
}

const workerConfigs: WorkerConfig[] = [
  {
    queue: 'writing-workflow',
    processor: writingProcessor,
    concurrency: 3,
    description: 'Script generation workflow',
  },
  {
    queue: 'universal-script-workflow',
    processor: universalScriptProcessor,
    concurrency: 3,
    description: 'Universal script generation (6-phase pipeline)',
  },
  {
    queue: 'outline-workflow',
    processor: outlineProcessor,
    concurrency: 3,
    description: 'Outline generation (phases 1-4: research, scoping, spine, assets)',
  },
  {
    queue: 'script-writing-workflow',
    processor: scriptWritingProcessor,
    concurrency: 3,
    description: 'Script writing (phases 5-6: expansion, assembly)',
  },
  {
    queue: 'audio-workflow',
    processor: audioProcessor,
    concurrency: 5,
    description: 'TTS audio generation',
  },
  {
    queue: 'av-script-workflow',
    processor: avScriptProcessor,
    concurrency: 10,
    description: 'AV script shot list generation',
  },
  {
    queue: 'visual-director-workflow',
    processor: visualDirectorProcessor,
    concurrency: 3,
    description: 'Visual director scene planning',
  },
  {
    queue: 'gpu-image-create',
    processor: gpuImageCreateProcessor,
    concurrency: 5,
    description: 'GPU image creation test',
  },
  {
    queue: 'gpu-image-edit',
    processor: gpuImageEditProcessor,
    concurrency: 5,
    description: 'GPU image editing test',
  },
  {
    queue: 'gpu-video-create',
    processor: gpuVideoCreateProcessor,
    concurrency: 3,
    description: 'GPU video creation test',
  },
  {
    queue: 'gpu-ltx2-create',
    processor: gpuLtx2CreateProcessor,
    concurrency: 3,
    description: 'GPU LTX-2 generation',
  },
  {
    queue: 'gpu-ltx2-interpolate',
    processor: gpuLtx2InterpolateProcessor,
    concurrency: 3,
    description: 'GPU LTX-2 interpolation',
  },
  {
    queue: 'gpu-music-create',
    processor: gpuMusicCreateProcessor,
    concurrency: 2,
    description: 'GPU music generation (ACE-Step 1.5)',
  },
  {
    queue: 'gpu-sfx-create',
    processor: gpuSfxCreateProcessor,
    concurrency: 3,
    description: 'GPU sound effect generation (AudioGen)',
  },
  {
    queue: 'gcp-provisioning-queue',
    processor: gcpProvisionProcessor,
    concurrency: 2,
    description: 'GCP VM Provisioning',
  },
  {
    queue: 'video-segmentation',
    processor: segmentProcessor,
    concurrency: 1,
    description: 'YouTube video download + segmentation',
  },
  {
    queue: 'stock-media-scrape',
    processor: stockMediaProcessor,
    concurrency: 2,
    description: 'Stock media scraping with classification',
  },
  {
    queue: 'asset-reference-images',
    processor: assetReferenceImageProcessor,
    concurrency: 2,
    description: 'AI reference image generation for video assets',
  },
  {
    queue: 'research-compare',
    processor: researchCompareProcessor,
    concurrency: 2,
    description: 'Research comparison for dev tools',
  },
  {
    queue: 'gpu-shutdown-check',
    processor: gpuShutdownCheckProcessor,
    concurrency: 1,
    description: 'GPU VM inactivity shutdown checker',
  },
  {
    queue: 'video-render',
    processor: videoRenderProcessor,
    concurrency: Math.min(
      parseInt(process.env.RENDER_CONCURRENCY_LIMIT || '4', 10),
      lambdaConfig.maxSafeConcurrentRenders
    ),
    description: 'Video rendering via Remotion Lambda → R2',
  },
  {
    queue: 'edit-assembly-workflow',
    processor: editAssemblyProcessor,
    concurrency: 3,
    description: 'AI-driven EDL generation for video editing',
  },
  {
    queue: 'orchestrator',
    processor: orchestratorProcessor,
    concurrency: 2,
    description: 'Closed-loop pipeline orchestrator (Phase I→V)',
  },
  {
    queue: 'shot-planner',
    processor: shotPlannerProcessor,
    concurrency: 3,
    description: 'Shot planning (Phase II)',
  },
  {
    queue: 'asset-scout',
    processor: assetScoutProcessor,
    concurrency: 3,
    description: 'Asset retrieval + prompt generation (Phase III)',
  },
  {
    queue: 'image-gen',
    processor: imageGenProcessor,
    concurrency: 3,
    description: 'Batch AI image generation (Phase IV)',
  },
  {
    queue: 'video-gen',
    processor: videoGenProcessor,
    concurrency: 2,
    description: 'Sequential AI video generation (Phase IV)',
  },
  {
    queue: 'verifier',
    processor: verifierProcessor,
    concurrency: 5,
    description: 'VLM quality verification (Gemini 3 Flash)',
  },
  {
    queue: 'image-edit',
    processor: imageEditProcessor,
    concurrency: 1,
    description: 'GCM consistency editing (Qwen-Image-Edit-2511)',
  },
  {
    queue: 'data-retention-cleanup',
    processor: dataRetentionCleanupProcessor,
    concurrency: 1,
    description: 'Automated data retention cleanup (R2 + Supabase)',
  },
  // Analytics sync workers
  {
    queue: 'analytics-channel-stats',
    processor: channelStatsSyncProcessor,
    concurrency: 1,
    description: 'YouTube channel stats sync (daily 11 AM UTC)',
  },
  {
    queue: 'analytics-daily-snapshot',
    processor: dailySnapshotSyncProcessor,
    concurrency: 1,
    description: 'YouTube daily snapshot sync (daily 2 AM UTC)',
  },
  {
    queue: 'analytics-video',
    processor: videoAnalyticsSyncProcessor,
    concurrency: 1,
    description: 'YouTube video analytics sync (daily 3 AM UTC)',
  },
  {
    queue: 'analytics-demographics',
    processor: demographicsSyncProcessor,
    concurrency: 1,
    description: 'YouTube demographics sync (weekly Sunday 4 AM UTC)',
  },
  {
    queue: 'analytics-competitor',
    processor: competitorSyncProcessor,
    concurrency: 1,
    description: 'Competitor channel sync (daily 5 AM UTC)',
  },
  {
    queue: 'analytics-platform-aggregate',
    processor: platformDailyAggregateProcessor,
    concurrency: 1,
    description: 'Platform daily aggregate (daily 6 AM UTC, admin)',
  },
  {
    queue: 'niche-discovery',
    processor: nicheDiscoveryProcessor,
    concurrency: 1,
    description: 'Niche network discovery (weekly Sunday 1 AM UTC)',
  },
];

// ============================================================================
// REPEATABLE JOB REGISTRATION
// ============================================================================

/**
 * Register repeatable jobs for scheduled tasks.
 * These persist in Redis and automatically trigger on schedule.
 */
async function registerRepeatableJobs(): Promise<void> {
  console.log('[WorkerBootstrap] Registering repeatable jobs...');
  
  // GPU shutdown check - every 5 minutes
  await gpuShutdownCheckQueue.add(
    'check-inactive-vms',
    {},
    { 
      repeat: { every: 5 * 60 * 1000 },
      jobId: 'gpu-shutdown-repeatable'  // Prevents duplicate registrations
    }
  );
  console.log('[WorkerBootstrap] Registered: gpu-shutdown-check (every 5 minutes)');

  // Data retention cleanup - every 6 hours
  await dataRetentionCleanupQueue.add(
    'cleanup-expired-videos',
    {},
    {
      repeat: { every: 6 * 60 * 60 * 1000 },
      jobId: 'data-retention-repeatable'  // Prevents duplicate registrations
    }
  );
  console.log('[WorkerBootstrap] Registered: data-retention-cleanup (every 6 hours)');

  // Analytics: Channel stats sync - daily at 11 AM UTC (after YouTube data refresh ~10 AM UTC)
  await analyticsChannelStatsQueue.add(
    'sync-channel-stats',
    {},
    {
      repeat: { pattern: '0 11 * * *' },
      jobId: 'analytics-channel-stats-repeatable'
    }
  );
  console.log('[WorkerBootstrap] Registered: analytics-channel-stats (daily 11 AM UTC)');

  // Analytics: Daily snapshot - daily at 11:30 AM UTC
  await analyticsDailySnapshotQueue.add(
    'sync-daily-snapshot',
    {},
    {
      repeat: { pattern: '30 11 * * *' },
      jobId: 'analytics-daily-snapshot-repeatable'
    }
  );
  console.log('[WorkerBootstrap] Registered: analytics-daily-snapshot (daily 11:30 AM UTC)');

  // Analytics: Video analytics - daily at 12 PM UTC
  await analyticsVideoQueue.add(
    'sync-video-analytics',
    {},
    {
      repeat: { pattern: '0 12 * * *' },
      jobId: 'analytics-video-repeatable'
    }
  );
  console.log('[WorkerBootstrap] Registered: analytics-video (daily 12 PM UTC)');

  // Analytics: Demographics - weekly Sunday at 4 AM UTC
  await analyticsDemographicsQueue.add(
    'sync-demographics',
    {},
    {
      repeat: { pattern: '0 4 * * 0' },
      jobId: 'analytics-demographics-repeatable'
    }
  );
  console.log('[WorkerBootstrap] Registered: analytics-demographics (weekly Sun 4 AM UTC)');

  // Analytics: Competitor sync - daily at 1 PM UTC
  await analyticsCompetitorQueue.add(
    'sync-competitors',
    {},
    {
      repeat: { pattern: '0 13 * * *' },
      jobId: 'analytics-competitor-repeatable'
    }
  );
  console.log('[WorkerBootstrap] Registered: analytics-competitor (daily 1 PM UTC)');

  // Analytics: Platform daily aggregate - daily at 2 PM UTC
  await analyticsPlatformAggregateQueue.add(
    'sync-platform-aggregate',
    {},
    {
      repeat: { pattern: '0 14 * * *' },
      jobId: 'analytics-platform-aggregate-repeatable'
    }
  );
  console.log('[WorkerBootstrap] Registered: analytics-platform-aggregate (daily 2 PM UTC)');

  // Niche discovery - weekly Sunday at 1 AM UTC
  await nicheDiscoveryQueue.add(
    'discover-niche-channels',
    {},
    {
      repeat: { pattern: '0 1 * * 0' },
      jobId: 'niche-discovery-repeatable'
    }
  );
  console.log('[WorkerBootstrap] Registered: niche-discovery (weekly Sun 1 AM UTC)');
}

// ============================================================================
// WORKER MANAGEMENT
// ============================================================================

const workers: Worker[] = [];

async function startWorkers(): Promise<void> {
  console.log('='.repeat(60));
  console.log('[WorkerBootstrap] Starting BullMQ workers...');
  console.log('='.repeat(60));
  
  // Check Redis connection
  const redisReady = await isRedisReady();
  if (!redisReady) {
    throw new Error('Redis is not ready. Make sure Redis is running (docker-compose up -d)');
  }
  console.log('[WorkerBootstrap] Redis connection verified');
  
  const connection = getRedisConnection();
  
  for (const config of workerConfigs) {
    console.log(`[WorkerBootstrap] Creating worker: ${config.queue} (${config.description})`);
    
    const worker = new Worker(config.queue, config.processor, {
      connection,
      concurrency: config.concurrency,
    });
    
    // Event handlers
    worker.on('ready', () => {
      console.log(`[${config.queue}] Worker ready`);
    });
    
    worker.on('active', (job: { id?: string; name?: string }) => {
      console.log(`[${config.queue}] Job ${job.id} started (${job.name})`);
    });
    
    worker.on('completed', (job: { id?: string }, result: { success?: boolean }) => {
      console.log(`[${config.queue}] Job ${job.id} completed`);
      if (result?.success !== undefined) {
        console.log(`[${config.queue}]   -> Success: ${result.success}`);
      }
    });
    
    worker.on('failed', (job: { id?: string; attemptsMade?: number; opts?: { attempts?: number } } | undefined, err: Error) => {
      console.error(`[${config.queue}] Job ${job?.id} failed: ${err.message}`);
      if (job?.attemptsMade !== undefined && job?.opts?.attempts !== undefined) {
        console.error(`[${config.queue}]   -> Attempts: ${job.attemptsMade}/${job.opts.attempts}`);
      }
    });
    
    worker.on('error', (err: Error) => {
      console.error(`[${config.queue}] Worker error:`, err.message);
    });
    
    worker.on('stalled', (jobId: string) => {
      console.warn(`[${config.queue}] Job ${jobId} stalled`);
    });
    
    workers.push(worker);
    console.log(`[WorkerBootstrap] Worker started: ${config.queue} (concurrency: ${config.concurrency})`);
  }
  
  console.log('='.repeat(60));
  console.log(`[WorkerBootstrap] ${workers.length} worker(s) started and ready`);
  console.log('[WorkerBootstrap] Press Ctrl+C to stop');
  console.log('='.repeat(60));
  
  // Register the GPU shutdown checker as a repeatable job (every 5 minutes)
  await registerRepeatableJobs();
}

async function stopWorkers(): Promise<void> {
  console.log('\n[WorkerBootstrap] Shutting down workers...');
  
  // Close all workers
  await Promise.all(workers.map(async (w) => {
    try {
      await w.close();
    } catch (err) {
      console.error('[WorkerBootstrap] Error closing worker:', err);
    }
  }));
  
  // Close all queues
  await closeAllQueues();
  
  // Close Redis connection
  await closeRedisConnection();
  
  console.log('[WorkerBootstrap] Shutdown complete');
}

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

let isShuttingDown = false;

async function handleShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    console.log('[WorkerBootstrap] Force exit');
    process.exit(1);
  }
  
  isShuttingDown = true;
  console.log(`\n[WorkerBootstrap] Received ${signal}, shutting down gracefully...`);
  
  try {
    await stopWorkers();
    process.exit(0);
  } catch (err) {
    console.error('[WorkerBootstrap] Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

async function main(): Promise<void> {
  try {
    await startWorkers();
    
    // Keep the process running
    // Workers will process jobs as they come in
    
  } catch (err) {
    console.error('[WorkerBootstrap] Failed to start workers:', err);
    process.exit(1);
  }
}

// Run if this file is executed directly
main();
