/**
 * Webhook Listener Helper
 * ============================================================================
 * Provides a helper to wait for GPU webhook results via Redis pub/sub.
 * Uses a SINGLETON shared subscriber to avoid creating N Redis connections
 * for N-item batches. This eliminates the race condition where a subscriber
 * connects after the webhook was already published.
 * 
 * Architecture:
 * 1. Worker submits job to GPU API with webhook_url and item_id=taskId
 * 2. Worker calls waitForWebhookResult(taskId) 
 * 3. GPU API completes job and POSTs to webhook callback
 * 4. Callback publishes to Redis "gpu-webhook-results" channel
 * 5. Shared subscriber receives the message and resolves the matching promise
 */

import Redis from 'ioredis';

// Channel name must match gpu-callback/route.ts
const WEBHOOK_CHANNEL = 'gpu-webhook-results';

export interface WebhookResult {
  event: string;
  jobId: string;
  itemId: string;        // Maps to taskId
  batchId?: string;
  status: 'completed' | 'failed' | 'cancelled';
  completedAt: number;
  generationType: string;
  result?: { 
    save_url?: string; 
    generation_time?: number;
    metadata?: Record<string, unknown>;
  };
  errorMessage?: string;
  errorCode?: string;
  receivedAt: number;
}

// ============================================================================
// SINGLETON SHARED SUBSCRIBER
// ============================================================================

interface PendingListener {
  resolve: (result: WebhookResult) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
}

/** In-memory map of taskId → pending promise callbacks */
const pendingListeners = new Map<string, PendingListener>();

/** Singleton Redis subscriber connection */
let sharedSubscriber: Redis | null = null;
let subscriberReady = false;
let subscriberInitPromise: Promise<void> | null = null;

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
 * Initialize the shared subscriber if not already running.
 * Uses a promise guard to prevent multiple concurrent initializations.
 */
async function ensureSharedSubscriber(): Promise<void> {
  if (subscriberReady && sharedSubscriber) return;
  
  if (subscriberInitPromise) {
    await subscriberInitPromise;
    return;
  }
  
  subscriberInitPromise = (async () => {
    try {
      sharedSubscriber = new Redis(getRedisConfig());
      
      // Handle incoming messages — route to the correct pending listener
      sharedSubscriber.on('message', (channel, message) => {
        if (channel !== WEBHOOK_CHANNEL) return;
        
        try {
          const result: WebhookResult = JSON.parse(message);
          const listener = pendingListeners.get(result.itemId);
          
          if (listener) {
            clearTimeout(listener.timeoutId);
            pendingListeners.delete(result.itemId);
            console.log(`[WebhookListener] Received webhook result for task ${result.itemId}: ${result.status}`);
            listener.resolve(result);
          }
          // If no listener found, the message is for a different worker or already timed out — ignore
        } catch (error) {
          console.error('[WebhookListener] Failed to parse message:', error);
        }
      });
      
      // Handle connection errors
      sharedSubscriber.on('error', (error) => {
        console.error('[WebhookListener] Shared subscriber error:', error);
        // Reject all pending listeners
        for (const [taskId, listener] of pendingListeners) {
          clearTimeout(listener.timeoutId);
          listener.reject(new Error(`Redis subscription error: ${error.message}`));
          pendingListeners.delete(taskId);
        }
        // Reset so next call reinitializes
        subscriberReady = false;
        sharedSubscriber = null;
        subscriberInitPromise = null;
      });
      
      // Subscribe to the channel
      await sharedSubscriber.subscribe(WEBHOOK_CHANNEL);
      subscriberReady = true;
      console.log(`[WebhookListener] Shared subscriber connected to ${WEBHOOK_CHANNEL} (1 connection for all items)`);
    } catch (err) {
      subscriberReady = false;
      sharedSubscriber = null;
      subscriberInitPromise = null;
      throw err;
    }
  })();
  
  await subscriberInitPromise;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Wait for a webhook result for a specific task.
 * 
 * Uses a shared Redis subscriber connection. Multiple concurrent calls
 * all share the same connection, eliminating the per-item connection overhead
 * and the race condition where a late subscriber misses an early webhook.
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
  // Ensure the shared subscriber is connected before registering the listener.
  // This guarantees we're subscribed BEFORE the GPU could possibly send the webhook.
  await ensureSharedSubscriber();
  
  console.log(`[WebhookListener] Waiting for webhook result for task ${taskId}`);
  
  return new Promise<WebhookResult>((resolve, reject) => {
    // Set timeout
    const timeoutId = setTimeout(() => {
      if (pendingListeners.has(taskId)) {
        pendingListeners.delete(taskId);
        reject(new Error(`Timeout waiting for webhook result after ${timeoutMs}ms`));
      }
    }, timeoutMs);
    
    // Register in the shared map
    pendingListeners.set(taskId, { resolve, reject, timeoutId });
  });
}

/**
 * Get the number of currently pending webhook listeners.
 * Useful for monitoring and debugging.
 */
export function getPendingListenerCount(): number {
  return pendingListeners.size;
}

/**
 * Abort a pending webhook listener for a specific task.
 * The listener's promise is rejected with the given reason.
 * 
 * @param taskId - The task ID whose listener should be aborted
 * @param reason - Optional reason string for the rejection
 * @returns true if a listener was found and aborted, false otherwise
 */
export function abortPendingListener(taskId: string, reason?: string): boolean {
  const listener = pendingListeners.get(taskId);
  if (!listener) return false;

  clearTimeout(listener.timeoutId);
  pendingListeners.delete(taskId);
  listener.reject(new Error(reason || `Webhook listener aborted for ${taskId}`));
  console.log(`[WebhookListener] Aborted pending listener for ${taskId}`);
  return true;
}

/**
 * Abort all pending webhook listeners whose taskId starts with the given prefix.
 * Useful for bulk-cancelling all items in a batch (e.g., prefix = "shot-" for a videoId).
 * 
 * @param prefix - Prefix to match against pending listener taskIds
 * @param reason - Optional reason string for the rejections
 * @returns Number of listeners that were aborted
 */
export function abortAllListenersForPrefix(prefix: string, reason?: string): number {
  let aborted = 0;
  for (const [taskId, listener] of pendingListeners) {
    if (taskId.startsWith(prefix)) {
      clearTimeout(listener.timeoutId);
      pendingListeners.delete(taskId);
      listener.reject(new Error(reason || `Webhook listener aborted (prefix: ${prefix})`));
      aborted++;
    }
  }
  if (aborted > 0) {
    console.log(`[WebhookListener] Aborted ${aborted} pending listeners for prefix "${prefix}"`);
  }
  return aborted;
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

/**
 * Gracefully shut down the shared subscriber.
 * Call this during process shutdown to avoid dangling connections.
 */
export async function disposeWebhookListener(): Promise<void> {
  if (sharedSubscriber) {
    // Reject all pending listeners
    for (const [taskId, listener] of pendingListeners) {
      clearTimeout(listener.timeoutId);
      listener.reject(new Error('Webhook listener shutting down'));
      pendingListeners.delete(taskId);
    }
    
    try {
      await sharedSubscriber.unsubscribe(WEBHOOK_CHANNEL);
      await sharedSubscriber.quit();
    } catch {
      // Ignore quit errors during shutdown
    }
    
    sharedSubscriber = null;
    subscriberReady = false;
    subscriberInitPromise = null;
    console.log('[WebhookListener] Shared subscriber disposed');
  }
}
