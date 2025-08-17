interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  staleUntil: number;
  accessCount: number;
  lastAccessed: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  staleHits: number;
  size: number;
  hitRate: number;
  staleHitRate: number;
  evictions: number;
}

interface CachePattern {
  pattern: string;
  count: number;
}

export class CacheManager {
  private l1Cache = new Map<string, CacheEntry<any>>();
  private l2Client: any;
  private readonly L1_MAX_SIZE = 1000;
  private readonly L1_DEFAULT_TTL = 60000;
  private readonly L2_DEFAULT_TTL = 300000;
  private readonly L3_DEFAULT_TTL = 3600000;
  private readonly STALE_WHILE_REVALIDATE_WINDOW = 300000;
  private stats = { hits: 0, misses: 0, staleHits: 0, evictions: 0 };
  private revalidationQueue = new Set<string>();

  constructor() {
    this.initializeL2Cache();

    setInterval(() => this.cleanupL1Cache(), 60000);
    setInterval(() => this.processRevalidationQueue(), 30000);
  }

  private async initializeL2Cache(): Promise<void> {
    try {
      const { client: valkey } = await import('../valkey');
      this.l2Client = valkey;
      console.log('Cache manager initialized with Valkey L2 cache');
    } catch (error) {
      console.warn('Valkey unavailable for L2 cache, using L1 only');
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const l1Entry = this.l1Cache.get(key);
    if (l1Entry) {
      const now = Date.now();
      l1Entry.accessCount++;
      l1Entry.lastAccessed = now;

      if (now < l1Entry.timestamp + l1Entry.ttl) {
        this.stats.hits++;
        return l1Entry.data;
      } else if (now < l1Entry.staleUntil) {
        this.stats.staleHits++;
        this.scheduleRevalidation(key);
        return l1Entry.data;
      }
    }

    if (this.l2Client) {
      try {
        const l2Data = await this.l2Client.get(`cache:${key}`);
        if (l2Data) {
          const parsed = JSON.parse(l2Data as string);

          this.setL1(key, parsed, this.L1_DEFAULT_TTL);
          this.stats.hits++;
          return parsed;
        }
      } catch (error) {
        console.error('L2 cache error:', error);
      }
    }

    this.stats.misses++;
    return null;
  }

  async set<T>(
    key: string,
    data: T,
    ttl: number = this.L1_DEFAULT_TTL,
    l2Ttl?: number,
    l3Ttl?: number
  ): Promise<void> {
    this.setL1(key, data, ttl);

    if (this.l2Client) {
      try {
        const { TimeUnit } = await import('@valkey/valkey-glide');
        await this.l2Client.set(`cache:${key}`, JSON.stringify(data), {
          expiry: {
            type: TimeUnit.Milliseconds,
            count: l2Ttl || this.L2_DEFAULT_TTL,
          },
        });
      } catch (error) {
        console.error('L2 cache set error:', error);
      }
    }
  }

  private setL1<T>(key: string, data: T, ttl: number): void {
    if (this.l1Cache.size >= this.L1_MAX_SIZE) {
      this.evictLRU();
    }

    const now = Date.now();
    this.l1Cache.set(key, {
      data,
      timestamp: now,
      ttl,
      staleUntil: now + ttl + this.STALE_WHILE_REVALIDATE_WINDOW,
      accessCount: 1,
      lastAccessed: now,
    });
  }

  private evictLRU(): void {
    let oldestKey = '';
    let oldestTime = Date.now();

    for (const [key, entry] of this.l1Cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.l1Cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  private scheduleRevalidation(key: string): void {
    if (!this.revalidationQueue.has(key)) {
      this.revalidationQueue.add(key);
    }
  }

  private async processRevalidationQueue(): Promise<void> {
    const keysToProcess = Array.from(this.revalidationQueue);
    this.revalidationQueue.clear();

    for (const key of keysToProcess) {
      try {
        await this.revalidateKey(key);
      } catch (error) {
        console.error(`Failed to revalidate key ${key}:`, error);
      }
    }
  }

  private async revalidateKey(key: string): Promise<void> {
    console.log(`Background revalidation triggered for key: ${key}`);
  }

  async invalidate(key: string): Promise<void> {
    this.l1Cache.delete(key);

    if (this.l2Client) {
      try {
        await this.l2Client.del(`cache:${key}`);
      } catch (error) {
        console.error('L2 cache invalidation error:', error);
      }
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    for (const key of this.l1Cache.keys()) {
      if (key.includes(pattern)) {
        this.l1Cache.delete(key);
      }
    }

    if (this.l2Client) {
      try {
        const keys = await this.l2Client.keys(`cache:*${pattern}*`);
        if (keys.length > 0) {
          await this.l2Client.del(...keys);
        }
      } catch (error) {
        console.error('L2 cache pattern invalidation error:', error);
      }
    }
  }

  async getWithStaleWhileRevalidate<T>(
    key: string,
    revalidateFunction: () => Promise<T>,
    ttl: number = this.L1_DEFAULT_TTL
  ): Promise<T | null> {
    const cached = await this.get<T>(key);

    if (cached !== null) {
      const entry = this.l1Cache.get(key);
      if (entry && Date.now() > entry.timestamp + entry.ttl) {
        this.scheduleBackgroundRevalidation(key, revalidateFunction, ttl);
      }
      return cached;
    }

    try {
      const freshData = await revalidateFunction();
      await this.set(key, freshData, ttl);
      return freshData;
    } catch (error) {
      console.error(`Failed to revalidate ${key}:`, error);
      return null;
    }
  }

  private async scheduleBackgroundRevalidation<T>(
    key: string,
    revalidateFunction: () => Promise<T>,
    ttl: number
  ): Promise<void> {
    setImmediate(async () => {
      try {
        const freshData = await revalidateFunction();
        await this.set(key, freshData, ttl);
        console.log(`Background revalidation completed for ${key}`);
      } catch (error) {
        console.error(`Background revalidation failed for ${key}:`, error);
      }
    });
  }

  private cleanupL1Cache(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.l1Cache.entries()) {
      if (now > entry.staleUntil) {
        this.l1Cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`Cleaned ${cleaned} expired entries from L1 cache`);
    }
  }

  async warmup(patterns: CachePattern[]): Promise<void> {
    console.log('Starting cache warmup...');

    for (const { pattern, count } of patterns) {
      try {
        for (let i = 0; i < count; i++) {
          const key = `${pattern}:${i}`;
          await this.get(key);
        }
      } catch (error) {
        console.error(`Cache warmup failed for pattern ${pattern}:`, error);
      }
    }

    console.log('Cache warmup completed');
  }

  async getMultiple<T>(keys: string[]): Promise<Map<string, T | null>> {
    const results = new Map<string, T | null>();

    const promises = keys.map(async key => {
      const value = await this.get<T>(key);
      results.set(key, value);
    });

    await Promise.all(promises);
    return results;
  }

  async setMultiple<T>(entries: Map<string, T>, ttl?: number): Promise<void> {
    const promises = Array.from(entries.entries()).map(([key, value]) =>
      this.set(key, value, ttl)
    );

    await Promise.all(promises);
  }

  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    const totalWithStale = total + this.stats.staleHits;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      staleHits: this.stats.staleHits,
      size: this.l1Cache.size,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      staleHitRate:
        totalWithStale > 0 ? this.stats.staleHits / totalWithStale : 0,
      evictions: this.stats.evictions,
    };
  }

  clearStats(): void {
    this.stats = { hits: 0, misses: 0, staleHits: 0, evictions: 0 };
  }

  getMemoryUsage(): { l1Size: number; estimatedMemoryMB: number } {
    const l1Size = this.l1Cache.size;
    const estimatedMemoryMB =
      Math.round(((l1Size * 1024) / 1024 / 1024) * 100) / 100;

    return { l1Size, estimatedMemoryMB };
  }

  async flush(): Promise<void> {
    this.l1Cache.clear();

    if (this.l2Client) {
      try {
        const keys = await this.l2Client.keys('cache:*');
        if (keys.length > 0) {
          await this.l2Client.del(...keys);
        }
      } catch (error) {
        console.error('Failed to flush L2 cache:', error);
      }
    }

    this.clearStats();
    console.log('Cache flushed completely');
  }
}
