enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  monitoringPeriod: number;
}

interface CircuitBreakerStats {
  state: string;
  failures: number;
  successes: number;
  lastFailureTime: number;
  retryAfter: number;
  totalOperations: number;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime: number = 0;
  private lastOpenTime: number = 0;
  private totalOperations: number = 0;
  private readonly config: CircuitBreakerConfig;
  private readonly identifier: string;

  constructor(identifier: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.identifier = identifier;
    this.config = {
      failureThreshold: 5,
      successThreshold: 3,
      timeout: 60000,
      monitoringPeriod: 300000,
      ...config,
    };
  }

  isOpen(): boolean {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() - this.lastOpenTime > this.config.timeout) {
        this.state = CircuitBreakerState.HALF_OPEN;
        this.successes = 0;
        console.log(
          `Circuit breaker ${this.identifier} transitioning to HALF_OPEN`
        );
      }
    }
    return this.state === CircuitBreakerState.OPEN;
  }

  isClosed(): boolean {
    return this.state === CircuitBreakerState.CLOSED;
  }

  isHalfOpen(): boolean {
    return this.state === CircuitBreakerState.HALF_OPEN;
  }

  recordSuccess(): void {
    this.totalOperations++;
    this.failures = 0;
    this.lastFailureTime = 0;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.state = CircuitBreakerState.CLOSED;
        this.successes = 0;
        console.log(
          `Circuit breaker ${this.identifier} transitioning to CLOSED`
        );
      }
    }
  }

  recordFailure(): void {
    this.totalOperations++;
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.OPEN;
      this.lastOpenTime = Date.now();
      console.log(
        `Circuit breaker ${this.identifier} transitioning back to OPEN`
      );
    } else if (
      this.state === CircuitBreakerState.CLOSED &&
      this.failures >= this.config.failureThreshold
    ) {
      this.state = CircuitBreakerState.OPEN;
      this.lastOpenTime = Date.now();
      console.log(`Circuit breaker ${this.identifier} transitioning to OPEN`);
    }
  }

  getRetryAfter(): number {
    if (this.state === CircuitBreakerState.OPEN) {
      return Math.max(
        0,
        this.config.timeout - (Date.now() - this.lastOpenTime)
      );
    }
    return 0;
  }

  getState(): string {
    return this.state;
  }

  getFailureRate(): number {
    if (this.totalOperations === 0) return 0;
    return this.failures / this.totalOperations;
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      retryAfter: this.getRetryAfter(),
      totalOperations: this.totalOperations,
    };
  }

  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = 0;
    this.lastOpenTime = 0;
    this.totalOperations = 0;
    console.log(`Circuit breaker ${this.identifier} manually reset`);
  }

  forceOpen(): void {
    this.state = CircuitBreakerState.OPEN;
    this.lastOpenTime = Date.now();
    console.log(`Circuit breaker ${this.identifier} forced to OPEN state`);
  }

  forceClose(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = 0;
    this.lastOpenTime = 0;
    console.log(`Circuit breaker ${this.identifier} forced to CLOSED state`);
  }
}
