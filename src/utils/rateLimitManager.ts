export class RateLimitManager {
  private channelCooldowns = new Map<string, number>();
  private readonly CHANNEL_UPDATE_COOLDOWN = 10 * 60 * 1000; // 10 minutes

  canUpdateChannel(channelId: string): boolean {
    const lastUpdate = this.channelCooldowns.get(channelId) || 0;
    return Date.now() - lastUpdate > this.CHANNEL_UPDATE_COOLDOWN;
  }

  markChannelUpdated(channelId: string): void {
    this.channelCooldowns.set(channelId, Date.now());
  }

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        if (error.code === 50013 || error.code === 50001) {
          throw error;
        }


        if (attempt === maxRetries) {
          break;
        }

        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        await this.delay(delay);
      }
    }

    throw lastError;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  cleanup(): void {
    const now = Date.now();
    const threshold = now - this.CHANNEL_UPDATE_COOLDOWN * 2;

    for (const [channelId, lastUpdate] of this.channelCooldowns.entries()) {
      if (lastUpdate < threshold) {
        this.channelCooldowns.delete(channelId);
      }
    }
  }

  getStats(): { channels: number; oldestUpdate: number } {
    const now = Date.now();
    let oldestUpdate = now;

    for (const lastUpdate of this.channelCooldowns.values()) {
      if (lastUpdate < oldestUpdate) {
        oldestUpdate = lastUpdate;
      }
    }

    return {
      channels: this.channelCooldowns.size,
      oldestUpdate: oldestUpdate === now ? 0 : now - oldestUpdate
    };
  }

  getQueueStats(): Record<string, any> {
    return {};
  }

  getGlobalStats() {
    return {
      totalQueues: 0,
      totalOperations: 0,
      processingQueues: 0,
      totalProcessed: 0,
      totalErrors: 0,
    };
  }

  clearAllQueues(): void {
    this.channelCooldowns.clear();
  }
}