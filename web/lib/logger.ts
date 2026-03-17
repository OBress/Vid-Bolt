/**
 * Structured Logger
 * ==========================================================================
 * Simple log-level-based logger for controlling console output verbosity.
 * 
 * Usage:
 *   import { createLogger } from '@/lib/logger';
 *   const log = createLogger('ModuleName');
 *   log.debug('detailed info');   // Only when LOG_LEVEL=debug
 *   log.info('milestone');        // Default visible
 *   log.warn('non-fatal issue');  // Always visible
 *   log.error('critical', err);   // Always visible
 * 
 * Control via LOG_LEVEL env var: 'debug' | 'info' | 'warn' | 'error'
 * Default: 'info'
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getConfiguredLevel(): LogLevel {
  const envLevel = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
  return LEVEL_PRIORITY[envLevel] !== undefined ? envLevel : 'info';
}

export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/**
 * Create a tagged logger instance.
 * @param tag - Module name prefix, e.g. 'StockMediaDirector'
 */
export function createLogger(tag: string): Logger {
  const prefix = `[${tag}]`;

  const shouldLog = (level: LogLevel): boolean => {
    const configured = getConfiguredLevel();
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[configured];
  };

  return {
    debug: (...args: unknown[]) => {
      if (shouldLog('debug')) console.log(prefix, ...args);
    },
    info: (...args: unknown[]) => {
      if (shouldLog('info')) console.log(prefix, ...args);
    },
    warn: (...args: unknown[]) => {
      if (shouldLog('warn')) console.warn(prefix, ...args);
    },
    error: (...args: unknown[]) => {
      if (shouldLog('error')) console.error(prefix, ...args);
    },
  };
}
