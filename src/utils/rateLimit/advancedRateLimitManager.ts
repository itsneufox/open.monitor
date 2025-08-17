import {
  RateLimiterRedis,
  RateLimiterMemory,
  RateLimiterRes,
} from 'rate-limiter-flexible';
import { CustomClient } from '../../types';

interface RateLimitConfig {
  points: number;
  duration: number;
  blockDuration?: number;
  execEvenly?: boolean;
}

interface RateLimitResult {
  allowed: boolean;
  remainingPoints: number;
  msBeforeNext: number;
  totalHits: number;
  retryAfter?: number;
}

export class AdvancedRateLimitManager {
  private limiters = new Map<string, RateLimiterRedis | RateLimiterMemory>();
  private client: CustomClient;
  private redisClient: any;
  private isInitialized = false;

  constructor(client: CustomClient) {
    this.client = client;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const { client: valkey } = await import('../valkey');
      this.redisClient = valkey;
      console.log('Advanced rate limiter using Valkey backend');
    } catch (error) {
      console.warn(
        'Valkey unavailable, using memory backend for rate limiting'
      );
    }

    this.createLimiters();
    this.isInitialized = true;
  }

  private createLimiters(): void {
    const configs = {
      discord_api: {
        points: 45,
        duration: 1,
        execEvenly: true,
        blockDuration: 2,
      },
      samp_server_query: {
        points: 20, 
        duration: 300,
        blockDuration: 60, 
        execEvenly: false,
      },
      user_requests: {
        points: 100,
        duration: 3600,
        blockDuration: 1800,
      },
      guild_requests: {
        points: 500,
        duration: 3600,
        blockDuration: 900,
      },
      manual_query: {
        points: 50, 
        duration: 3600,
        blockDuration: 300, 
      },
      server_add: {
        points: 5,
        duration: 86400,
        blockDuration: 43200,
      },
      behavioral_analysis: {
        points: 10, 
        duration: 300,
        blockDuration: 600,
      },
    };

    Object.entries(configs).forEach(([key, config]) => {
      this.createLimiter(key, config);
    });
  }

  private createLimiter(key: string, config: RateLimitConfig): void {
    try {
      if (this.redisClient) {
        const limiter = new RateLimiterRedis({
          storeClient: this.redisClient,
          keyPrefix: `rl_${key}`,
          points: config.points,
          duration: config.duration,
          blockDuration: config.blockDuration || config.duration,
          execEvenly: config.execEvenly || false,
        });
        this.limiters.set(key, limiter);
      } else {
        const limiter = new RateLimiterMemory({
          keyPrefix: `rl_${key}`,
          points: config.points,
          duration: config.duration,
          blockDuration: config.blockDuration || config.duration,
          execEvenly: config.execEvenly || false,
        });
        this.limiters.set(key, limiter);
      }
    } catch (error) {
      console.error(`Failed to create rate limiter ${key}:`, error);
    }
  }

  async checkLimit(
    limiterKey: string,
    identifier: string,
    points: number = 1
  ): Promise<RateLimitResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const limiter = this.limiters.get(limiterKey);
    if (!limiter) {
      console.warn(`Rate limiter ${limiterKey} not found, allowing request`);
      return {
        allowed: true,
        remainingPoints: 999,
        msBeforeNext: 0,
        totalHits: 0,
      };
    }

    try {
      const result = await limiter.consume(identifier, points);
      return {
        allowed: true,
        remainingPoints: result.remainingPoints || 0,
        msBeforeNext: result.msBeforeNext || 0,
        totalHits: (result as any).totalHits || 0,
      };
    } catch (rejRes) {
      const res = rejRes as RateLimiterRes;
      return {
        allowed: false,
        remainingPoints: 0,
        msBeforeNext: res.msBeforeNext || 0,
        totalHits: (res as any).totalHits || 0,
        retryAfter: res.msBeforeNext || 0,
      };
    }
  }

  async checkMultipleLimits(
    checks: Array<{ limiterKey: string; identifier: string; points?: number }>
  ): Promise<{
    allowed: boolean;
    failedChecks: string[];
    results: Record<string, RateLimitResult>;
    retryAfter?: number;
  }> {
    const results: Record<string, RateLimitResult> = {};
    const failedChecks: string[] = [];
    let maxRetryAfter = 0;

    for (const check of checks) {
      const result = await this.checkLimit(
        check.limiterKey,
        check.identifier,
        check.points
      );
      results[check.limiterKey] = result;

      if (!result.allowed) {
        failedChecks.push(check.limiterKey);
        if (result.retryAfter && result.retryAfter > maxRetryAfter) {
          maxRetryAfter = result.retryAfter;
        }
      }
    }

    return {
      allowed: failedChecks.length === 0,
      failedChecks,
      results,
      ...(maxRetryAfter > 0 && { retryAfter: maxRetryAfter }),
    };
  }

  async getRemainingQuota(
    limiterKey: string,
    identifier: string
  ): Promise<number> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const limiter = this.limiters.get(limiterKey);
    if (!limiter) return 999;

    try {
      const res = await limiter.get(identifier);
      return res?.remainingPoints ?? 999;
    } catch (error) {
      return 999;
    }
  }

  async resetLimit(limiterKey: string, identifier: string): Promise<void> {
    const limiter = this.limiters.get(limiterKey);
    if (limiter) {
      try {
        await limiter.delete(identifier);
      } catch (error) {
        console.error(
          `Failed to reset limit for ${limiterKey}:${identifier}`,
          error
        );
      }
    }
  }

  getStats(): Record<string, any> {
    return {
      limiters: Array.from(this.limiters.keys()),
      backend: this.redisClient ? 'Valkey' : 'Memory',
      totalLimiters: this.limiters.size,
      initialized: this.isInitialized,
    };
  }
}
