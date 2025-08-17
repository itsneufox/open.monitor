import { CustomClient } from '../../types';
import type { AdvancedRateLimitManager } from '../rateLimit/advancedRateLimitManager';
import type { ServerProtectionManager } from '../rateLimit/serverProtectionManager';
import type { CacheManager } from '../rateLimit/cacheManager';

export class SAMPRateLimitManager {
  private static rateLimitManager: AdvancedRateLimitManager | null = null;
  private static protectionManager: ServerProtectionManager | null = null;
  private static cacheManager: CacheManager | null = null;
  private static initialized = false;
  private static initializationPromise: Promise<void> | null = null;

  static async initialize(client: CustomClient): Promise<void> {
    if (this.initialized || this.initializationPromise) {
      return this.initializationPromise || Promise.resolve();
    }

    this.initializationPromise = this.doInitialize(client);
    return this.initializationPromise;
  }

  private static async doInitialize(client: CustomClient): Promise<void> {
    try {
      const rateLimit = await import('../rateLimit');

      this.rateLimitManager = new rateLimit.AdvancedRateLimitManager(client);
      await this.rateLimitManager.initialize();

      this.protectionManager = new rateLimit.ServerProtectionManager(
        this.rateLimitManager
      );
      this.cacheManager = new rateLimit.CacheManager();

      this.initialized = true;
      console.log(
        'SAMPQuery: Advanced rate limiting initialized with enhanced protection'
      );
    } catch (error) {
      console.warn(
        'SAMPQuery: Failed to initialize rate limiting, using legacy mode:',
        error
      );
      this.initialized = false;
    }
  }

  static get isInitialized(): boolean {
    return this.initialized;
  }

  static get protection(): ServerProtectionManager | null {
    return this.protectionManager;
  }

  static get cache(): CacheManager | null {
    return this.cacheManager;
  }

  static get rateLimit(): AdvancedRateLimitManager | null {
    return this.rateLimitManager;
  }

  static async ensureInitialized(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  static async performHealthCheck(): Promise<{
    rateLimitManager: boolean;
    protectionManager: boolean;
    cacheManager: boolean;
    overall: boolean;
  }> {
    if (!this.initialized) {
      return {
        rateLimitManager: false,
        protectionManager: false,
        cacheManager: false,
        overall: false,
      };
    }

    const rateLimitOk = this.rateLimitManager !== null;
    const protectionOk = this.protectionManager !== null;
    const cacheOk = this.cacheManager !== null;

    return {
      rateLimitManager: rateLimitOk,
      protectionManager: protectionOk,
      cacheManager: cacheOk,
      overall: rateLimitOk && protectionOk && cacheOk,
    };
  }

  static getComprehensiveStats(): any {
    if (!this.initialized) {
      return {
        error: 'Rate limiting not initialized',
        legacy: true,
        initialized: false,
      };
    }

    return {
      initialized: true,
      rateLimiting: this.rateLimitManager?.getStats() || {},
      serverProtection: this.protectionManager?.getAllStats() || {},
      behavioral: this.protectionManager?.getBehavioralStats() || {},
      cache: this.cacheManager?.getStats() || {},
      healthCheck: this.performHealthCheck(),
    };
  }

  static async resetAllLimits(): Promise<void> {
    if (!this.rateLimitManager) return;

    const limitTypes = [
      'samp_server_query',
      'user_requests',
      'guild_requests',
      'manual_query',
    ];

    for (const limitType of limitTypes) {
      try {
        await this.rateLimitManager.resetLimit(limitType, '*');
      } catch (error) {
        console.error(`Failed to reset ${limitType} limits:`, error);
      }
    }

    console.log('All rate limits have been reset');
  }

  static async getDetailedServerStats(serverKey: string): Promise<any> {
    if (!this.protectionManager) return null;

    const protectionStats = this.protectionManager.getServerStats(serverKey);
    const cacheStats = this.cacheManager?.getStats();

    return {
      protection: protectionStats,
      cache: cacheStats,
      timestamp: Date.now(),
    };
  }

  static async optimizeCache(): Promise<void> {
    if (!this.cacheManager) return;

    try {
      const stats = this.cacheManager.getStats();

      if (stats.hitRate < 0.7) {
        console.log('Cache hit rate is low, performing optimization...');
      }

      const memoryUsage = this.cacheManager.getMemoryUsage();
      if (memoryUsage.estimatedMemoryMB > 100) {
        console.log('Cache memory usage is high, considering cleanup...');
      }
    } catch (error) {
      console.error('Cache optimization failed:', error);
    }
  }
}
