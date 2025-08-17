import { ServerConfig } from '../../types';
import { AdvancedRateLimitManager } from './advancedRateLimitManager';
import { BehavioralAnalyzer } from './behavioralAnalyzer';
import { CircuitBreaker } from './circuitBreaker';

interface MonitoringBatch {
  startTime: number;
  queriesInBatch: number;
}

interface ServerProtectionState {
  ip: string;
  totalQueries: number;
  guildsMonitoring: Set<string>;
  lastQuery: number;
  failures: number;
  successes: number;
  circuitBreaker: CircuitBreaker;
  behaviorScore: number;
  responseTimeHistory: number[];
  lastHealthCheck: number;
  averageResponseTime: number;
}

interface QueryRequest {
  server: ServerConfig;
  guildId: string;
  userId?: string;
  isMonitoring: boolean;
  queryType: 'info' | 'players' | 'detailed' | 'rules' | 'ping';
  isManualCommand?: boolean;
}

interface QueryResult {
  allowed: boolean;
  reason?: string;
  retryAfter?: number;
  useCache?: boolean;
  priority?: 'low' | 'normal' | 'high';
  trustScore?: number;
}

interface ProtectionStats {
  totalServers: number;
  activeCircuitBreakers: number;
  averageTrustScore: number;
  totalQueries: number;
  totalFailures: number;
  serversUnderProtection: number;
  activeBatches: number;
}

export class ServerProtectionManager {
  private servers = new Map<string, ServerProtectionState>();
  private monitoringBatches = new Map<string, MonitoringBatch>();
  private rateLimitManager: AdvancedRateLimitManager;
  private behavioralAnalyzer: BehavioralAnalyzer;
  private readonly MAX_QUERIES_PER_SECOND_PER_SERVER = 0.5;
  private readonly MAX_GUILDS_PER_SERVER = 10;
  private readonly MONITORING_COOLDOWN = 30000;
  private readonly MANUAL_COOLDOWN = 30000;
  private readonly HEALTH_CHECK_INTERVAL = 600000;
  private readonly MAX_RESPONSE_TIME_HISTORY = 10;
  private readonly BATCH_TIMEOUT = 60000;
  private readonly MAX_QUERIES_PER_BATCH = 10;

  constructor(rateLimitManager: AdvancedRateLimitManager) {
    this.rateLimitManager = rateLimitManager;
    this.behavioralAnalyzer = new BehavioralAnalyzer();

    setInterval(() => this.cleanup(), 3600000);
    setInterval(() => this.performHealthChecks(), this.HEALTH_CHECK_INTERVAL);
  }

  clearAllCooldowns(): void {
    for (const [serverKey, state] of this.servers.entries()) {
      state.lastQuery = 0;
      console.log(`Cleared cooldown for ${serverKey}`);
    }

    this.monitoringBatches.clear();
    console.log('Cleared all monitoring batches');
  }

  async checkQueryPermission(request: QueryRequest): Promise<QueryResult> {
    const {
      server,
      guildId,
      userId,
      isMonitoring,
      queryType,
      isManualCommand,
    } = request;

    if (isManualCommand) {
      console.log(
        `Manual command - bypassing rate limits for ${server.ip}:${server.port}`
      );
      return {
        allowed: true,
        priority: 'high',
        trustScore: 1.0,
      };
    }

    const serverKey = `${server.ip}:${server.port}`;

    let serverState = this.servers.get(serverKey);
    if (!serverState) {
      serverState = this.initializeServerState(serverKey, server.ip);
      this.servers.set(serverKey, serverState);
    }

    if (serverState.circuitBreaker.isOpen()) {
      return {
        allowed: false,
        reason: 'Server circuit breaker is open (too many failures)',
        retryAfter: serverState.circuitBreaker.getRetryAfter(),
        useCache: true,
        trustScore: serverState.behaviorScore,
      };
    }

    if (isMonitoring) {
      return this.checkMonitoringBatch(serverKey, request);
    }

    const behaviorResult = await this.behavioralAnalyzer.analyzeRequest({
      serverIp: server.ip,
      guildId,
      isMonitoring,
      isManualCommand: isManualCommand || false,
      timestamp: Date.now(),
      ...(userId && { userId }),
    });

    if (!behaviorResult.allowed) {
      return {
        allowed: false,
        reason: behaviorResult.reason,
        retryAfter: behaviorResult.cooldownMs,
        trustScore: behaviorResult.trustScore,
      };
    }

    const rateLimitChecks = this.buildRateLimitChecks(
      serverKey,
      guildId,
      userId,
      queryType,
      isMonitoring
    );

    const rateLimitResult =
      await this.rateLimitManager.checkMultipleLimits(rateLimitChecks);

    if (!rateLimitResult.allowed) {
      const failedCheck = rateLimitResult.failedChecks[0];
      const result = rateLimitResult.results[failedCheck!];
      return {
        allowed: false,
        reason: this.getRateLimitMessage(failedCheck!),
        retryAfter: result?.msBeforeNext || 60000,
        trustScore: serverState.behaviorScore,
      };
    }

    const cooldownResult = this.checkServerCooldown(serverState, isMonitoring);
    if (!cooldownResult.allowed) {
      return cooldownResult;
    }

    const guildLimitResult = this.checkGuildLimits(serverState, guildId);
    if (!guildLimitResult.allowed) {
      return guildLimitResult;
    }

    const trustScore = behaviorResult.trustScore;
    this.updateServerState(serverState, guildId, trustScore);

    return {
      allowed: true,
      priority: this.getQueryPriority(isMonitoring, trustScore),
      trustScore,
    };
  }

  private checkMonitoringBatch(serverKey: string, request: QueryRequest): QueryResult {
    const batchKey = `${serverKey}:${request.guildId}`;
    const now = Date.now();

    let batch = this.monitoringBatches.get(batchKey);

    if (!batch || (now - batch.startTime) > this.BATCH_TIMEOUT) {
      batch = { startTime: now, queriesInBatch: 0 };
      this.monitoringBatches.set(batchKey, batch);
      console.log(`Started new monitoring batch for ${serverKey} in guild ${request.guildId}`);
    }

    if (batch.queriesInBatch >= this.MAX_QUERIES_PER_BATCH) {
      const timeRemaining = this.BATCH_TIMEOUT - (now - batch.startTime);
      return {
        allowed: false,
        reason: `Monitoring batch limit reached (${this.MAX_QUERIES_PER_BATCH} queries per minute)`,
        retryAfter: timeRemaining,
        useCache: true,
      };
    }

    batch.queriesInBatch++;
    console.log(`Monitoring query ${batch.queriesInBatch}/${this.MAX_QUERIES_PER_BATCH} for ${serverKey}`);

    return {
      allowed: true,
      priority: 'high',
      trustScore: 1.0
    };
  }

  private initializeServerState(
    serverKey: string,
    ip: string
  ): ServerProtectionState {
    return {
      ip,
      totalQueries: 0,
      guildsMonitoring: new Set(),
      lastQuery: 0,
      failures: 0,
      successes: 0,
      circuitBreaker: new CircuitBreaker(serverKey, {
        failureThreshold: 5,
        successThreshold: 3,
        timeout: 60000,
        monitoringPeriod: 300000,
      }),
      behaviorScore: 1.0,
      responseTimeHistory: [],
      lastHealthCheck: 0,
      averageResponseTime: 0,
    };
  }

  private buildRateLimitChecks(
    serverKey: string,
    guildId: string,
    userId?: string,
    queryType?: string,
    isMonitoring?: boolean
  ) {
    const checks = [
      {
        limiterKey: 'samp_server_query',
        identifier: serverKey,
        points: this.getQueryCost(queryType || 'info'),
      },
      {
        limiterKey: 'guild_requests',
        identifier: guildId,
        points: 1,
      },
    ];

    if (userId) {
      checks.push({
        limiterKey: isMonitoring ? 'user_requests' : 'manual_query',
        identifier: userId,
        points: isMonitoring ? 1 : 5,
      });
    }

    return checks;
  }

  private checkServerCooldown(
    serverState: ServerProtectionState,
    isMonitoring: boolean
  ): QueryResult {
    const now = Date.now();
    const timeSinceLastQuery = now - serverState.lastQuery;
    const requiredCooldown = isMonitoring
      ? this.MONITORING_COOLDOWN
      : this.MANUAL_COOLDOWN;

    if (timeSinceLastQuery < requiredCooldown) {
      return {
        allowed: false,
        reason: `Server cooldown active (${Math.ceil((requiredCooldown - timeSinceLastQuery) / 1000)}s remaining)`,
        retryAfter: requiredCooldown - timeSinceLastQuery,
        useCache: true,
      };
    }

    return { allowed: true };
  }

  private checkGuildLimits(
    serverState: ServerProtectionState,
    guildId: string
  ): QueryResult {
    serverState.guildsMonitoring.add(guildId);

    if (serverState.guildsMonitoring.size > this.MAX_GUILDS_PER_SERVER) {
      return {
        allowed: false,
        reason: `Too many guilds monitoring this server (max ${this.MAX_GUILDS_PER_SERVER})`,
        retryAfter: 3600000,
        useCache: true,
      };
    }

    return { allowed: true };
  }

  private updateServerState(
    serverState: ServerProtectionState,
    guildId: string,
    trustScore: number
  ): void {
    serverState.totalQueries++;
    serverState.lastQuery = Date.now();
    serverState.behaviorScore =
      serverState.behaviorScore * 0.8 + trustScore * 0.2;
    serverState.guildsMonitoring.add(guildId);
  }

  async recordQueryResult(
    server: ServerConfig,
    success: boolean,
    responseTime?: number,
    error?: Error
  ): Promise<void> {
    const serverKey = `${server.ip}:${server.port}`;
    const serverState = this.servers.get(serverKey);

    if (!serverState) return;

    if (success) {
      serverState.circuitBreaker.recordSuccess();
      serverState.failures = 0;
      serverState.successes++;

      if (responseTime !== undefined) {
        this.updateResponseTimeHistory(serverState, responseTime);
      }
    } else {
      serverState.circuitBreaker.recordFailure();
      serverState.failures++;

      if (responseTime !== undefined) {
        this.updateResponseTimeHistory(serverState, responseTime);
      }
    }

    await this.behavioralAnalyzer.recordResult({
      serverIp: server.ip,
      success,
      timestamp: Date.now(),
      ...(responseTime !== undefined && { responseTime }),
    });

    if (success && responseTime && responseTime > 10000) {
      console.warn(
        `Slow response detected for ${serverKey}: ${responseTime}ms`
      );
    }
  }

  private updateResponseTimeHistory(
    serverState: ServerProtectionState,
    responseTime: number
  ): void {
    serverState.responseTimeHistory.push(responseTime);

    if (
      serverState.responseTimeHistory.length > this.MAX_RESPONSE_TIME_HISTORY
    ) {
      serverState.responseTimeHistory.shift();
    }

    serverState.averageResponseTime =
      serverState.responseTimeHistory.reduce((sum, time) => sum + time, 0) /
      serverState.responseTimeHistory.length;
  }

  private async performHealthChecks(): Promise<void> {
    const now = Date.now();
    let healthChecksPerformed = 0;

    for (const [serverKey, serverState] of this.servers.entries()) {
      if (now - serverState.lastHealthCheck > this.HEALTH_CHECK_INTERVAL) {
        await this.performServerHealthCheck(serverKey, serverState);
        serverState.lastHealthCheck = now;
        healthChecksPerformed++;
      }
    }

    if (healthChecksPerformed > 0) {
      console.log(`Performed ${healthChecksPerformed} server health checks`);
    }
  }

  private async performServerHealthCheck(
    serverKey: string,
    serverState: ServerProtectionState
  ): Promise<void> {
    const failureRate =
      serverState.failures /
      Math.max(serverState.successes + serverState.failures, 1);
    const avgResponseTime = serverState.averageResponseTime;

    if (failureRate > 0.5) {
      console.warn(
        `High failure rate detected for ${serverKey}: ${(failureRate * 100).toFixed(1)}%`
      );
    }

    if (avgResponseTime > 5000) {
      console.warn(
        `High average response time for ${serverKey}: ${avgResponseTime.toFixed(0)}ms`
      );
    }

    if (serverState.circuitBreaker.isOpen()) {
      console.log(
        `Circuit breaker open for ${serverKey}, retry in ${serverState.circuitBreaker.getRetryAfter()}ms`
      );
    }
  }

  private getQueryCost(queryType: string): number {
    const costs = {
      info: 1,
      ping: 1,
      rules: 2,
      players: 3,
      detailed: 4,
    };
    return costs[queryType as keyof typeof costs] || 1;
  }

  private getQueryPriority(
    isMonitoring: boolean,
    trustScore: number
  ): 'low' | 'normal' | 'high' {
    if (isMonitoring) return 'high';
    if (trustScore > 0.8) return 'normal';
    return 'low';
  }

  private getRateLimitMessage(limiterKey: string): string {
    const messages = {
      samp_server_query:
        'Server query rate limit exceeded - max 2 queries per 5 minutes',
      guild_requests: 'Guild rate limit exceeded - max 500 requests per hour',
      user_requests: 'User rate limit exceeded - max 100 requests per hour',
      manual_query: 'Manual query limit exceeded - max 10 queries per hour',
      behavioral_analysis: 'Suspicious behavior detected - temporary cooldown',
    };
    return (
      messages[limiterKey as keyof typeof messages] || 'Rate limit exceeded'
    );
  }

  private cleanup(): void {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    let cleanedServers = 0;
    let cleanedBatches = 0;

    
    for (const [batchKey, batch] of this.monitoringBatches.entries()) {
      if ((now - batch.startTime) > this.BATCH_TIMEOUT * 2) {
        this.monitoringBatches.delete(batchKey);
        cleanedBatches++;
      }
    }

    for (const [serverKey, state] of this.servers.entries()) {
      if (state.lastQuery < oneHourAgo) {
        state.guildsMonitoring.clear();

        if (state.totalQueries === 0) {
          this.servers.delete(serverKey);
          cleanedServers++;
        }
      }
    }

    this.behavioralAnalyzer.cleanup();

    if (cleanedServers > 0 || cleanedBatches > 0) {
      console.log(
        `Server protection cleanup: Removed ${cleanedServers} inactive servers, ${cleanedBatches} old batches. Active: ${this.servers.size} servers, ${this.monitoringBatches.size} batches`
      );
    }
  }

  async resetServerProtection(serverKey: string): Promise<boolean> {
    const serverState = this.servers.get(serverKey);
    if (!serverState) return false;

    serverState.circuitBreaker.reset();
    serverState.failures = 0;
    serverState.behaviorScore = 1.0;
    serverState.responseTimeHistory = [];
    serverState.averageResponseTime = 0;

    console.log(`Reset protection for server: ${serverKey}`);
    return true;
  }

  getServerStats(serverKey: string): any {
    const state = this.servers.get(serverKey);
    if (!state) return null;

    const failureRate =
      state.failures / Math.max(state.successes + state.failures, 1);

    return {
      totalQueries: state.totalQueries,
      guildsMonitoring: state.guildsMonitoring.size,
      lastQuery: state.lastQuery,
      failures: state.failures,
      successes: state.successes,
      failureRate: Math.round(failureRate * 100) / 100,
      circuitBreakerState: state.circuitBreaker.getState(),
      behaviorScore: Math.round(state.behaviorScore * 100) / 100,
      averageResponseTime: Math.round(state.averageResponseTime),
      responseTimeHistory: state.responseTimeHistory.slice(-5),
    };
  }

  getAllStats(): ProtectionStats {
    const servers = Array.from(this.servers.values());

    return {
      totalServers: this.servers.size,
      activeCircuitBreakers: servers.filter(s => s.circuitBreaker.isOpen())
        .length,
      averageTrustScore:
        servers.length > 0
          ? servers.reduce((sum, s) => sum + s.behaviorScore, 0) /
          servers.length
          : 1.0,
      totalQueries: servers.reduce((sum, s) => sum + s.totalQueries, 0),
      totalFailures: servers.reduce((sum, s) => sum + s.failures, 0),
      serversUnderProtection: servers.filter(
        s => s.behaviorScore < 0.5 || s.circuitBreaker.isOpen()
      ).length,
      activeBatches: this.monitoringBatches.size,
    };
  }

  getBehavioralStats(): any {
    return this.behavioralAnalyzer.getStats();
  }

  getBatchStats(): { [key: string]: MonitoringBatch } {
    return Object.fromEntries(this.monitoringBatches);
  }
}