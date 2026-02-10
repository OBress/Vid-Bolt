/**
 * Babel Compiler Web Worker
 * 
 * Offloads JSX transpilation to a separate thread to prevent UI blocking.
 * Babel is lazy-loaded on first use to avoid impacting initial page load.
 * 
 * Communication protocol:
 * - Main thread sends JSX code
 * - Worker transpiles JSX → JavaScript
 * - Worker returns transpiled code or error
 * 
 * @module babel-compiler-worker
 */

// ==========================================
// TYPES
// ==========================================

export interface CompileRequest {
  type: 'compile' | 'preload' | 'ping';
  id: string;
  code?: string;
}

export interface CompileResponse {
  type: 'compiled' | 'error' | 'preloaded' | 'pong';
  id: string;
  transpiledCode?: string;
  error?: string;
  transpileTime?: number;
}

// ==========================================
// WORKER CODE
// ==========================================

const workerCode = `
// Babel instance - lazy loaded
let Babel = null;
let babelLoadPromise = null;
let babelLoaded = false;

// Load Babel from CDN (lazy, on first use)
async function loadBabel() {
  if (babelLoaded) return true;
  if (babelLoadPromise) return babelLoadPromise;
  
  babelLoadPromise = new Promise((resolve, reject) => {
    try {
      // Use importScripts for synchronous loading in worker
      // Using unpkg for reliable CDN delivery
      importScripts('https://unpkg.com/@babel/standalone@7.23.6/babel.min.js');
      
      if (typeof self.Babel !== 'undefined') {
        Babel = self.Babel;
        babelLoaded = true;
        console.log('[BabelWorker] Babel loaded successfully');
        resolve(true);
      } else {
        throw new Error('Babel not found after loading');
      }
    } catch (error) {
      console.error('[BabelWorker] Failed to load Babel:', error);
      reject(error);
    }
  });
  
  return babelLoadPromise;
}

// Transpile JSX to JavaScript
function transpileCode(code) {
  if (!Babel) {
    throw new Error('Babel not loaded');
  }
  
  const result = Babel.transform(code, {
    presets: ['react', 'typescript'],
    filename: 'dynamic-animation.tsx',
  });
  
  if (!result.code) {
    throw new Error('Transpilation returned empty result');
  }
  
  return result.code;
}

// Message handler
self.onmessage = async function(e) {
  const message = e.data;
  
  // Ping - health check
  if (message.type === 'ping') {
    self.postMessage({ type: 'pong', id: message.id });
    return;
  }
  
  // Preload - load Babel without compiling
  if (message.type === 'preload') {
    try {
      await loadBabel();
      self.postMessage({ type: 'preloaded', id: message.id });
    } catch (error) {
      self.postMessage({ 
        type: 'error', 
        id: message.id, 
        error: 'Failed to preload Babel: ' + error.message 
      });
    }
    return;
  }
  
  // Compile - transpile JSX to JS
  if (message.type === 'compile') {
    const startTime = performance.now();
    
    try {
      // Ensure Babel is loaded
      await loadBabel();
      
      // Transpile
      const transpiledCode = transpileCode(message.code);
      
      self.postMessage({
        type: 'compiled',
        id: message.id,
        transpiledCode,
        transpileTime: performance.now() - startTime,
      });
      
    } catch (error) {
      self.postMessage({
        type: 'error',
        id: message.id,
        error: error.message || 'Unknown compilation error',
      });
    }
    return;
  }
};

// Log worker initialization
console.log('[BabelWorker] Worker initialized, Babel will be loaded on first use');
`;

// ==========================================
// WORKER MANAGER
// ==========================================

class BabelWorkerManager {
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, {
    resolve: (result: string) => void;
    reject: (error: Error) => void;
    startTime: number;
  }>();
  private requestId = 0;
  private isSupported: boolean | null = null;
  private initPromise: Promise<boolean> | null = null;
  private babelPreloaded = false;

  /**
   * Check if Web Workers are supported
   */
  isWorkerSupported(): boolean {
    if (this.isSupported !== null) return this.isSupported;
    
    // Check for Worker and Blob support
    this.isSupported = typeof Worker !== 'undefined' && typeof Blob !== 'undefined';
    return this.isSupported;
  }

  /**
   * Initialize the worker
   */
  async initialize(): Promise<boolean> {
    if (!this.isWorkerSupported()) return false;
    
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = new Promise((resolve) => {
      try {
        // Create worker from inline code
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        
        this.worker = new Worker(workerUrl);
        
        this.worker.onmessage = (e: MessageEvent<CompileResponse>) => {
          this.handleMessage(e.data);
        };
        
        this.worker.onerror = (error) => {
          console.error('[BabelWorker] Worker error:', error);
          this.isSupported = false;
        };
        
        // Test worker with ping
        const testId = 'init-test';
        this.worker.postMessage({ type: 'ping', id: testId });
        
        const timeout = setTimeout(() => {
          console.warn('[BabelWorker] Worker initialization timeout');
          this.isSupported = false;
          resolve(false);
        }, 3000);
        
        const originalHandler = this.worker.onmessage;
        this.worker.onmessage = (e: MessageEvent<CompileResponse>) => {
          if (e.data.id === testId && e.data.type === 'pong') {
            clearTimeout(timeout);
            this.worker!.onmessage = originalHandler;
            console.log('[BabelWorker] Worker ready');
            resolve(true);
          } else {
            originalHandler?.call(this.worker!, e);
          }
        };
        
        // Cleanup blob URL after worker is created
        URL.revokeObjectURL(workerUrl);
        
      } catch (error) {
        console.error('[BabelWorker] Failed to create worker:', error);
        this.isSupported = false;
        resolve(false);
      }
    });
    
    return this.initPromise;
  }

  /**
   * Preload Babel in the worker (call during idle time)
   */
  async preloadBabel(): Promise<boolean> {
    if (this.babelPreloaded) return true;
    
    const initialized = await this.initialize();
    if (!initialized || !this.worker) return false;
    
    return new Promise((resolve) => {
      const id = `preload-${this.requestId++}`;
      
      const timeout = setTimeout(() => {
        console.warn('[BabelWorker] Babel preload timeout');
        resolve(false);
      }, 15000); // 15s timeout for CDN load
      
      const handler = (e: MessageEvent<CompileResponse>) => {
        if (e.data.id === id) {
          clearTimeout(timeout);
          this.worker!.removeEventListener('message', handler);
          
          if (e.data.type === 'preloaded') {
            this.babelPreloaded = true;
            console.log('[BabelWorker] Babel preloaded successfully');
            resolve(true);
          } else {
            console.warn('[BabelWorker] Babel preload failed:', e.data.error);
            resolve(false);
          }
        }
      };
      
      this.worker!.addEventListener('message', handler);
      this.worker!.postMessage({ type: 'preload', id });
    });
  }

  /**
   * Transpile JSX code using the worker
   */
  async transpile(code: string): Promise<string> {
    // Initialize if needed
    const initialized = await this.initialize();
    
    if (!initialized || !this.worker) {
      throw new Error('Worker not available');
    }
    
    return new Promise((resolve, reject) => {
      const id = `compile-${this.requestId++}`;
      
      // Store pending request
      this.pendingRequests.set(id, {
        resolve,
        reject,
        startTime: performance.now(),
      });
      
      // Send to worker
      this.worker!.postMessage({
        type: 'compile',
        id,
        code,
      });
      
      // Timeout after 30 seconds (includes potential Babel load time)
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Compilation timeout'));
        }
      }, 30000);
    });
  }

  /**
   * Handle messages from worker
   */
  private handleMessage(response: CompileResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) return;
    
    this.pendingRequests.delete(response.id);
    
    if (response.type === 'error') {
      pending.reject(new Error(response.error || 'Unknown compilation error'));
      return;
    }
    
    if (response.type === 'compiled' && response.transpiledCode) {
      // Log performance for slow compilations
      const totalTime = performance.now() - pending.startTime;
      if (totalTime > 100) {
        console.debug(`[BabelWorker] Compilation took ${totalTime.toFixed(1)}ms (transpile: ${response.transpileTime?.toFixed(1)}ms)`);
      }
      
      pending.resolve(response.transpiledCode);
    }
  }

  /**
   * Terminate the worker
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingRequests.clear();
    this.initPromise = null;
    this.babelPreloaded = false;
  }

  /**
   * Check if Babel is preloaded
   */
  isBabelReady(): boolean {
    return this.babelPreloaded;
  }
}

// ==========================================
// SINGLETON & EXPORTS
// ==========================================

// Singleton instance
export const babelWorker = new BabelWorkerManager();

/**
 * Preload Babel during idle time
 * Call this when entering the video editor
 */
export function preloadBabelWorker(): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => {
      babelWorker.preloadBabel();
    }, { timeout: 5000 });
  } else {
    // Fallback for browsers without requestIdleCallback
    setTimeout(() => {
      babelWorker.preloadBabel();
    }, 1000);
  }
}

/**
 * Check if worker-based compilation is available
 */
export function isWorkerCompilationAvailable(): boolean {
  return babelWorker.isWorkerSupported();
}
