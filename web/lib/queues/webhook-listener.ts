/**
 * Webhook Listener Helper
 * ============================================================================
 * Provides a helper to wait for GPU webhook results via Redis pub/sub.
 * Used by workers to avoid polling the GPU API directly.
 * 
 * Architecture:
 * 1. Worker submits job to GPU API with webhook_url and item_id=taskId
 * 2. Worker calls waitForWebhookResult(taskId) 
 * 3. GPU API completes job and POSTs to webhook callback
 * 4. Callback publishes to Redis "gpu-webhook-results" channel
 * 5. This listener receives the message and resolves the promise
 */

import Redis from 'ioredis';

// Channel name must match gpu-callback/route.ts
const WEBHOOK_CHANNEL = 'gpu-webhook-results';

export interface WebhookResult {
  event: string;
  jobId: string;
  itemId: string;        // Maps to taskId
  batchId?: string;
  status: 'completed' | 'failed';
  completedAt: number;
  generationType: string;
  result?: { 
    save_url?: string; 
    generation_time?: number;
  };
  errorMessage?: string;
  errorCode?: string;
  receivedAt: number;
}

/**
 * Get Redis config for subscriber connection.
 * Must create a NEW connection for pub/sub (Redis requirement).
 */
function getRedisConfig() {
  const redisUrl = process.env.REDIS_URL;
  
  if (redisUrl) {
    const url = new URL(redisUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port || '6379'),
      password: url.password || undefined,
      username: url.username || undefined,
      tls: redisUrl.startsWith('rediss://') ? {} : undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }
  
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

/**
 * Wait for a webhook result for a specific task.
 * 
 * Creates a dedicated Redis subscriber connection, subscribes to the
 * webhook results channel, and waits for a message matching the taskId.
 * 
 * @param taskId - The task ID to wait for (matches item_id in webhook payload)
 * @param timeoutMs - Maximum time to wait (default: 5 minutes)
 * @returns The webhook result when received
 * @throws Error if timeout or connection fails
 */
export async function waitForWebhookResult(
  taskId: string,
  timeoutMs: number = 300000
): Promise<WebhookResult> {
  // Create dedicated subscriber connection (Redis pub/sub requirement)
  const subscriber = new Redis(getRedisConfig());
  
  console.log(`[WebhookListener] Waiting for webhook result for task ${taskId}`);
  
  return new Promise<WebhookResult>((resolve, reject) => {
    // eslint-disable-next-line prefer-const
    let timeoutId: NodeJS.Timeout;
    let resolved = false;
    
    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      subscriber.unsubscribe(WEBHOOK_CHANNEL);
      subscriber.quit().catch(() => {}); // Ignore quit errors
    };
    
    // Set timeout
    timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(new Error(`Timeout waiting for webhook result after ${timeoutMs}ms`));
      }
    }, timeoutMs);
    
    // Handle messages
    subscriber.on('message', (channel, message) => {
      if (channel !== WEBHOOK_CHANNEL || resolved) return;
      
      try {
        const result: WebhookResult = JSON.parse(message);
        
        // Check if this message is for our task
        if (result.itemId === taskId) {
          resolved = true;
          cleanup();
          console.log(`[WebhookListener] Received webhook result for task ${taskId}: ${result.status}`);
          resolve(result);
        }
      } catch (error) {
        console.error('[WebhookListener] Failed to parse message:', error);
      }
    });
    
    // Handle errors
    subscriber.on('error', (error) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(new Error(`Redis subscription error: ${error.message}`));
      }
    });
    
    // Subscribe to channel
    subscriber.subscribe(WEBHOOK_CHANNEL, (err) => {
      if (err && !resolved) {
        resolved = true;
        cleanup();
        reject(new Error(`Failed to subscribe to ${WEBHOOK_CHANNEL}: ${err.message}`));
      }
    });
  });
}

/**
 * Check if webhook listener is functional by testing Redis connection.
 */
export async function isWebhookListenerReady(): Promise<boolean> {
  try {
    const testConnection = new Redis(getRedisConfig());
    const result = await testConnection.ping();
    await testConnection.quit();
    return result === 'PONG';
  } catch {
    return false;
  }
}
