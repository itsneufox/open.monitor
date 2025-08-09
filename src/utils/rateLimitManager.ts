interface QueuedOperation {
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  priority: 'high' | 'normal' | 'low';
  retries: number;
  createdAt: number;
  timeout?: NodeJS.Timeout | undefined;
}

interface QueueStats {
  size: number;
  processing: boolean;
  lastProcessed: number;
  totalProcessed: number;
  errors: number;
}

export class RateLimitManager {
  private channelUpdateQueues = new Map<string, QueuedOperation[]>();
  private processing = new Set<string>();
  private lastChannelUpdate = new Map<string, number>();
  private queueStats = new Map<string, QueueStats>();

  private readonly CHANNEL_UPDATE_COOLDOWN = 10 * 60 * 1000; // 10 minutes
  private readonly MAX_QUEUE_SIZE = 50; // Prevent memory issues
  private readonly MAX_OPERATION_AGE = 30 * 60 * 1000; // 30 minutes max wait
  private readonly QUEUE_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Periodic cleanup of old queues and operations
    setInterval(() => this.cleanupQueues(), this.QUEUE_CLEANUP_INTERVAL);
  }

  async queueChannelUpdate(
    channelId: string,
    updateFn: () => Promise<void>,
    priority: 'high' | 'normal' | 'low' = 'normal',
    force: boolean = false
  ): Promise<void> {
    // Check if we should skip this update
    if (!force && !this.shouldUpdateChannel(channelId)) {
      console.log(`Skipping channel update for ${channelId} - too recent`);
      return Promise.resolve();
    }

    // Initialize queue if it doesn't exist
    if (!this.channelUpdateQueues.has(channelId)) {
      this.channelUpdateQueues.set(channelId, []);
      this.queueStats.set(channelId, {
        size: 0,
        processing: false,
        lastProcessed: 0,
        totalProcessed: 0,
        errors: 0,
      });
    }

    const queue = this.channelUpdateQueues.get(channelId)!;
    const stats = this.queueStats.get(channelId)!;

    // Check queue size limit
    if (queue.length >= this.MAX_QUEUE_SIZE) {
      console.warn(
        `Queue for ${channelId} is full (${queue.length}/${this.MAX_QUEUE_SIZE}), dropping oldest operation`
      );
      const dropped = queue.shift();
      if (dropped) {
        dropped.reject(new Error('Queue overflow - operation dropped'));
        this.clearOperationTimeout(dropped);
      }
    }

    return new Promise((resolve, reject) => {
      const operation: QueuedOperation = {
        execute: updateFn,
        resolve,
        reject,
        priority,
        retries: 0,
        createdAt: Date.now(),
      };

      // Set timeout for operation
      operation.timeout = setTimeout(() => {
        this.removeOperationFromQueue(channelId, operation);
        reject(new Error('Operation timeout'));
      }, this.MAX_OPERATION_AGE);

      // Insert based on priority
      this.insertByPriority(queue, operation);
      stats.size = queue.length;

      this.processChannelQueue(channelId);
    });
  }

  // Add executeWithRetry method for backward compatibility
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

        // Don't retry permission errors
        if (error.code === 50013 || error.code === 50001) {
          throw error;
        }

        // Don't retry on final attempt
        if (attempt === maxRetries) {
          throw error;
        }

        // Calculate delay with exponential backoff
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(
          `Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms delay`
        );
        await this.delay(delay);
      }
    }

    throw lastError;
  }

  private insertByPriority(
    queue: QueuedOperation[],
    operation: QueuedOperation
  ): void {
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    const operationPriority = priorityOrder[operation.priority];

    let insertIndex = queue.length;
    for (let i = 0; i < queue.length; i++) {
      const queuedPriority = priorityOrder[queue[i]!.priority];
      if (operationPriority < queuedPriority) {
        insertIndex = i;
        break;
      }
    }

    queue.splice(insertIndex, 0, operation);
  }

  private removeOperationFromQueue(
    channelId: string,
    operation: QueuedOperation
  ): boolean {
    const queue = this.channelUpdateQueues.get(channelId);
    if (!queue) return false;

    const index = queue.indexOf(operation);
    if (index !== -1) {
      queue.splice(index, 1);
      this.clearOperationTimeout(operation);

      const stats = this.queueStats.get(channelId);
      if (stats) stats.size = queue.length;

      return true;
    }
    return false;
  }

  private clearOperationTimeout(operation: QueuedOperation): void {
    if (operation.timeout) {
      clearTimeout(operation.timeout);
      operation.timeout = undefined;
    }
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
    const stats = this.queueStats.get(channelId);

    if (!queue || !stats || queue.length === 0) {
      return;
    }

    this.processing.add(channelId);
    stats.processing = true;

    try {
      while (queue.length > 0) {
        const operation = queue.shift()!;
        stats.size = queue.length;
        this.clearOperationTimeout(operation);

        try {
          await operation.execute();
          this.lastChannelUpdate.set(channelId, Date.now());
          stats.lastProcessed = Date.now();
          stats.totalProcessed++;
          operation.resolve(undefined);

          // Add delay between operations
          if (queue.length > 0) {
            await this.delay(2000);
          }
        } catch (error: any) {
          stats.errors++;

          if (this.shouldRetry(error, operation)) {
            operation.retries++;
            this.insertByPriority(queue, operation); // Re-queue with priority
            stats.size = queue.length;

            // Set new timeout
            operation.timeout = setTimeout(() => {
              this.removeOperationFromQueue(channelId, operation);
              operation.reject(new Error('Operation timeout after retry'));
            }, this.MAX_OPERATION_AGE);

            await this.delay(this.getRetryDelay(operation.retries));
          } else {
            operation.reject(error);

            // For permission errors, clear the entire queue
            if (error.code === 50013 || error.code === 50001) {
              console.warn(
                `Clearing queue for ${channelId} due to permission error`
              );
              this.clearQueue(channelId);
              break;
            }
          }
        }
      }
    } finally {
      this.processing.delete(channelId);
      stats.processing = false;
    }
  }

  private shouldRetry(error: any, operation: QueuedOperation): boolean {
    // Don't retry permission errors
    if (error.code === 50013 || error.code === 50001) {
      return false;
    }

    // Don't retry if max retries reached
    if (operation.retries >= 3) {
      return false;
    }

    // Don't retry if operation is too old
    if (Date.now() - operation.createdAt > this.MAX_OPERATION_AGE) {
      return false;
    }

    // Retry rate limits and network errors
    return (
      error.code === 429 ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNRESET' ||
      error.message?.includes('timeout')
    );
  }

  private getRetryDelay(retryCount: number): number {
    // Exponential backoff: 5s, 10s, 20s
    return Math.min(5000 * Math.pow(2, retryCount - 1), 20000);
  }

  private clearQueue(channelId: string): void {
    const queue = this.channelUpdateQueues.get(channelId);
    if (!queue) return;

    // Reject all pending operations
    while (queue.length > 0) {
      const operation = queue.shift()!;
      this.clearOperationTimeout(operation);
      operation.reject(new Error('Queue cleared due to persistent errors'));
    }

    const stats = this.queueStats.get(channelId);
    if (stats) stats.size = 0;
  }

  private cleanupQueues(): void {
    const now = Date.now();
    const emptyQueueThreshold = 10 * 60 * 1000; // Remove empty queues after 10 minutes

    for (const [channelId, queue] of this.channelUpdateQueues.entries()) {
      const stats = this.queueStats.get(channelId);

      // Remove old operations
      const validOperations = queue.filter(op => {
        if (now - op.createdAt > this.MAX_OPERATION_AGE) {
          this.clearOperationTimeout(op);
          op.reject(new Error('Operation expired'));
          return false;
        }
        return true;
      });

      if (validOperations.length !== queue.length) {
        queue.length = 0;
        queue.push(...validOperations);
        if (stats) stats.size = queue.length;
      }

      // Remove empty queues that haven't been used recently
      if (queue.length === 0 && stats && !stats.processing) {
        const timeSinceLastUse = now - stats.lastProcessed;
        if (timeSinceLastUse > emptyQueueThreshold) {
          this.channelUpdateQueues.delete(channelId);
          this.queueStats.delete(channelId);
          this.lastChannelUpdate.delete(channelId);
          console.log(`Cleaned up empty queue for channel ${channelId}`);
        }
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Enhanced statistics
  getQueueStats(): Record<string, any> {
    const stats: Record<string, any> = {};

    for (const [channelId, queueStats] of this.queueStats.entries()) {
      stats[channelId] = {
        ...queueStats,
        isProcessing: this.processing.has(channelId),
      };
    }

    return stats;
  }

  getGlobalStats(): {
    totalQueues: number;
    totalOperations: number;
    processingQueues: number;
    totalProcessed: number;
    totalErrors: number;
  } {
    let totalOperations = 0;
    let totalProcessed = 0;
    let totalErrors = 0;

    for (const stats of this.queueStats.values()) {
      totalOperations += stats.size;
      totalProcessed += stats.totalProcessed;
      totalErrors += stats.errors;
    }

    return {
      totalQueues: this.channelUpdateQueues.size,
      totalOperations,
      processingQueues: this.processing.size,
      totalProcessed,
      totalErrors,
    };
  }

  // Force clear all queues (for shutdown)
  clearAllQueues(): void {
    for (const [channelId] of this.channelUpdateQueues.entries()) {
      this.clearQueue(channelId);
    }
    this.channelUpdateQueues.clear();
    this.queueStats.clear();
    this.processing.clear();
    this.lastChannelUpdate.clear();
  }
}
