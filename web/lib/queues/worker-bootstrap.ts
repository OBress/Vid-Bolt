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
import { closeAllQueues, gpuShutdownCheckQueue } from './queues';
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
    concurrency: parseInt(process.env.RENDER_CONCURRENCY_LIMIT || '4', 10),
    description: 'Video rendering via Remotion Lambda → R2',
  },
  {
    queue: 'edit-assembly-workflow',
    processor: editAssemblyProcessor,
    concurrency: 3,
    description: 'AI-driven EDL generation for video editing',
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
