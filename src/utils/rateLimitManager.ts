// utils/rateLimitManager.ts
interface QueuedOperation {
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  priority: 'high' | 'normal';
  retries: number;
}

export class RateLimitManager {
  private channelUpdateQueues = new Map<string, QueuedOperation[]>();
  private processing = new Set<string>();
  private lastChannelUpdate = new Map<string, number>();
  
  // Minimum time between channel updates (Discord.js handles the actual rate limits)
  private readonly CHANNEL_UPDATE_COOLDOWN = 10 * 60 * 1000; // 10 minutes safety buffer

  // Queue channel updates with smart timing
  async queueChannelUpdate(
    channelId: string,
    updateFn: () => Promise<void>,
    priority: 'high' | 'normal' = 'normal',
    force: boolean = false
  ): Promise<void> {
    // Check if we should skip this update based on timing
    if (!force && !this.shouldUpdateChannel(channelId)) {
      console.log(`Skipping channel update for ${channelId} - too recent`);
      return;
    }

    return new Promise((resolve, reject) => {
      const operation: QueuedOperation = {
        execute: updateFn,
        resolve,
        reject,
        priority,
        retries: 0
      };

      if (!this.channelUpdateQueues.has(channelId)) {
        this.channelUpdateQueues.set(channelId, []);
      }

      const queue = this.channelUpdateQueues.get(channelId)!;
      
      // Add to queue with priority
      if (priority === 'high') {
        queue.unshift(operation);
      } else {
        queue.push(operation);
      }

      this.processChannelQueue(channelId);
    });
  }

  private shouldUpdateChannel(channelId: string): boolean {
    const lastUpdate = this.lastChannelUpdate.get(channelId) || 0;
    return Date.now() - lastUpdate > this.CHANNEL_UPDATE_COOLDOWN;
  }

  private async processChannelQueue(channelId: string): Promise<void> {
    if (this.processing.has(channelId)) {
      return; // Already processing this channel
    }

    const queue = this.channelUpdateQueues.get(channelId);
    if (!queue || queue.length === 0) {
      return;
    }

    this.processing.add(channelId);

    try {
      while (queue.length > 0) {
        const operation = queue.shift()!;

        try {
          await operation.execute();
          this.lastChannelUpdate.set(channelId, Date.now());
          operation.resolve(undefined);
          
          // Add a small delay between operations
          if (queue.length > 0) {
            await this.delay(2000); // 2 second delay between channel operations
          }
          
        } catch (error: any) {
          if (error.code === 50013) {
            // Missing permissions - clear queue and reject all
            console.warn(`Missing permissions for channel ${channelId}`);
            operation.reject(error);
            // Clear remaining queue
            while (queue.length > 0) {
              const remaining = queue.shift()!;
              remaining.reject(new Error('Missing permissions'));
            }
            break;
          } else if (error.code === 50001) {
            // Missing access - similar to permissions
            console.warn(`Missing access for channel ${channelId}`);
            operation.reject(error);
            break;
          } else if (error.code === 429) {
            // Rate limited - Discord.js should handle this, but let's be safe
            const retryAfter = error.retryAfter || 60000;
            console.warn(`Rate limited on channel ${channelId}, waiting ${retryAfter}ms`);
            
            if (operation.retries < 3) {
              operation.retries++;
              queue.unshift(operation); // Put back at front
              await this.delay(retryAfter);
            } else {
              operation.reject(new Error('Max retries exceeded'));
            }
          } else {
            // Other errors - retry up to 2 times
            if (operation.retries < 2) {
              operation.retries++;
              queue.unshift(operation);
              await this.delay(5000); // 5 second delay for other errors
            } else {
              operation.reject(error);
            }
          }
        }
      }
    } finally {
      this.processing.delete(channelId);
    }
  }

  // Smart batching for message operations
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        
        if (error.code === 50013 || error.code === 50001) {
          // Permission errors - don't retry
          throw error;
        }
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Calculate delay with exponential backoff
        const delay = baseDelay * Math.pow(2, attempt);
        await this.delay(delay);
      }
    }
    
    throw lastError;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get statistics about queue usage
  getQueueStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [channelId, queue] of this.channelUpdateQueues.entries()) {
      stats[channelId] = queue.length;
    }
    return stats;
  }
}