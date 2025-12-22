type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

export class SettingsCache {
  private static CACHE_PREFIX = 'vidbolt_settings_';
  private static CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  /**
   * Get data from local storage cache
   */
  static get<T>(key: string): { data: T; stale: boolean } | null {
    if (typeof window === 'undefined') return null;

    try {
      const item = localStorage.getItem(`${this.CACHE_PREFIX}${key}`);
      if (!item) return null;

      const entry: CacheEntry<T> = JSON.parse(item);
      const now = Date.now();
      const isStale = now - entry.timestamp > this.CACHE_TTL;

      return {
        data: entry.data,
        stale: isStale,
      };
    } catch (e) {
      console.error('Error reading from settings cache:', e);
      return null;
    }
  }

  /**
   * Set data into local storage cache
   */
  static set<T>(key: string, data: T): void {
    if (typeof window === 'undefined') return;

    try {
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(`${this.CACHE_PREFIX}${key}`, JSON.stringify(entry));
    } catch (e) {
      console.error('Error writing to settings cache:', e);
    }
  }

  /**
   * Invalidate a cache entry
   */
  static invalidate(key: string): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(`${this.CACHE_PREFIX}${key}`);
  }

  /**
   * Clear all settings cache
   */
  static clear(): void {
    if (typeof window === 'undefined') return;
    
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.CACHE_PREFIX)) {
            keysToRemove.push(key);
        }
    }
    
    keysToRemove.forEach(k => localStorage.removeItem(k));
  }
}
