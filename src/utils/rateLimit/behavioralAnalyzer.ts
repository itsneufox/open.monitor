interface BehaviorRequest {
  serverIp: string;
  guildId: string;
  userId?: string;
  isMonitoring: boolean; 
  isManualCommand?: boolean;
  timestamp: number;
}

interface BehaviorResult {
  allowed: boolean;
  reason: string;
  trustScore: number;
  cooldownMs: number;
  flags: string[];
}

interface BehaviorRecord {
  requests: number[];
  lastSeen: number;
  flags: Set<string>;
  trustScore: number;
  failureCount: number;
  successCount: number;
  averageResponseTime: number;
}

interface AnomalyPattern {
  type: 'volume' | 'temporal' | 'geographic' | 'protocol';
  severity: 'low' | 'medium' | 'high';
  confidence: number;
  description: string;
}

export class BehavioralAnalyzer {
  private userBehavior = new Map<string, BehaviorRecord>();
  private guildBehavior = new Map<string, BehaviorRecord>();
  private ipBehavior = new Map<string, BehaviorRecord>();
  private readonly ANALYSIS_WINDOW = 3600000;
  private readonly MAX_REQUESTS_PER_MINUTE = 10;
  private readonly SUSPICIOUS_THRESHOLD = 0.3;
  private readonly COORDINATED_ATTACK_THRESHOLD = 5;

  async analyzeRequest(request: BehaviorRequest): Promise<BehaviorResult> {
    const { serverIp, guildId, userId, timestamp, isManualCommand, isMonitoring } = request;

    
    if (isMonitoring) {
      const record = this.guildBehavior.get(guildId);
      if (!record || record.requests.length < 50) {
        return {
          allowed: true,
          reason: 'Monitoring startup grace period',
          trustScore: 1.0,
          cooldownMs: 0,
          flags: ['startup_grace'],
        };
      }
    }

    
    if (isManualCommand) {
      return {
        allowed: true,
        reason: 'Manual command - analysis bypassed',
        trustScore: 1.0,
        cooldownMs: 0,
        flags: ['manual_command'],
      };
    }

    const ipAnalysis = this.analyzeEntity(serverIp, timestamp, this.ipBehavior);
    const guildAnalysis = this.analyzeEntity(
      guildId,
      timestamp,
      this.guildBehavior
    );
    const userAnalysis = userId
      ? this.analyzeEntity(userId, timestamp, this.userBehavior)
      : null;

    let trustScore = (ipAnalysis.trustScore + guildAnalysis.trustScore) / 2;
    if (userAnalysis) {
      trustScore = (trustScore + userAnalysis.trustScore) / 2;
    }

    const anomalies = this.detectAnomalies(
      serverIp,
      guildId,
      timestamp,
      userId,
      isManualCommand
    );
    const flags: string[] = [];
    const suspiciousReasons: string[] = [];

    if (ipAnalysis.trustScore < this.SUSPICIOUS_THRESHOLD) {
      suspiciousReasons.push('Suspicious IP behavior pattern detected');
      flags.push('suspicious_ip');
    }

    if (guildAnalysis.trustScore < this.SUSPICIOUS_THRESHOLD) {
      suspiciousReasons.push('Unusual guild activity pattern detected');
      flags.push('suspicious_guild');
    }

    if (userAnalysis && userAnalysis.trustScore < this.SUSPICIOUS_THRESHOLD) {
      suspiciousReasons.push('Suspicious user behavior pattern detected');
      flags.push('suspicious_user');
    }

    if (this.detectCoordinatedAttack(serverIp, guildId, timestamp)) {
      suspiciousReasons.push('Potential coordinated attack detected');
      trustScore *= 0.1;
      flags.push('coordinated_attack');
    }

    if (this.detectRateBurst(guildId, timestamp)) {
      suspiciousReasons.push('Rate burst detected');
      trustScore *= 0.5;
      flags.push('rate_burst');
    }

    for (const anomaly of anomalies) {
      if (anomaly.severity === 'high' && anomaly.confidence > 0.8) {
        suspiciousReasons.push(anomaly.description);
        trustScore *= 0.3;
        flags.push(`anomaly_${anomaly.type}`);
      }
    }

    if (
      suspiciousReasons.length > 0 &&
      trustScore < this.SUSPICIOUS_THRESHOLD
    ) {
      return {
        allowed: false,
        reason: suspiciousReasons[0]!,
        trustScore,
        cooldownMs: this.calculateCooldown(trustScore),
        flags,
      };
    }

    return {
      allowed: true,
      reason: 'Request allowed',
      trustScore,
      cooldownMs: 0,
      flags,
    };
  }

  private analyzeEntity(
    entityId: string,
    timestamp: number,
    behaviorMap: Map<string, BehaviorRecord>
  ): { trustScore: number; flags: Set<string> } {
    let record = behaviorMap.get(entityId);
    if (!record) {
      record = {
        requests: [],
        lastSeen: timestamp,
        flags: new Set(),
        trustScore: 1.0,
        failureCount: 0,
        successCount: 0,
        averageResponseTime: 0,
      };
      behaviorMap.set(entityId, record);
    }

    const windowStart = timestamp - this.ANALYSIS_WINDOW;
    record.requests = record.requests.filter(t => t > windowStart);
    record.requests.push(timestamp);
    record.lastSeen = timestamp;

    const requestCount = record.requests.length;
    const timeSpan = timestamp - (record.requests[0] || timestamp);
    const requestRate = timeSpan > 0 ? (requestCount / timeSpan) * 60000 : 0;

    let trustScore = 1.0;

    if (requestRate > this.MAX_REQUESTS_PER_MINUTE) {
      trustScore *= 0.3;
      record.flags.add('high_rate');
    }

    const recentRequests = record.requests.filter(t => t > timestamp - 60000);
    if (recentRequests.length > 20) {
      trustScore *= 0.2;
      record.flags.add('burst');
    }

    if (this.detectUniformPattern(record.requests)) {
      trustScore *= 0.4;
      record.flags.add('uniform_pattern');
    }

    const failureRate =
      record.failureCount /
      Math.max(record.successCount + record.failureCount, 1);
    if (failureRate > 0.5) {
      trustScore *= 0.6;
      record.flags.add('high_failure_rate');
    }

    record.trustScore = record.trustScore * 0.8 + trustScore * 0.2;

    return {
      trustScore: record.trustScore,
      flags: record.flags,
    };
  }

  private detectAnomalies(
    serverIp: string,
    guildId: string,
    timestamp: number,
    userId?: string,
    isManualCommand?: boolean
  ): AnomalyPattern[] {
    const anomalies: AnomalyPattern[] = [];

    const volumeAnomaly = this.detectVolumeAnomaly(
      guildId,
      timestamp,
      isManualCommand
    );
    if (volumeAnomaly) anomalies.push(volumeAnomaly);

    const temporalAnomaly = this.detectTemporalAnomaly(guildId, timestamp);
    if (temporalAnomaly) anomalies.push(temporalAnomaly);

    if (userId) {
      const protocolAnomaly = this.detectProtocolAnomaly(userId, timestamp);
      if (protocolAnomaly) anomalies.push(protocolAnomaly);
    }

    return anomalies;
  }

  private detectVolumeAnomaly(
    guildId: string,
    timestamp: number,
    isManualCommand = false
  ): AnomalyPattern | null {
    if (isManualCommand) return null;

    const record = this.guildBehavior.get(guildId);
    if (!record || record.requests.length < 20) return null;

    const recentWindow = 300000;
    const recentRequests = record.requests.filter(
      t => t > timestamp - recentWindow
    );

    const windowCounts = this.getRequestCountsPerWindow(
      record.requests,
      recentWindow
    );
    const cleanCounts = this.removeOutliers(windowCounts);
    const cleanAverage =
      cleanCounts.reduce((a, b) => a + b, 0) / cleanCounts.length;
    const standardDeviation = this.calculateStandardDeviation(cleanCounts);

    if (recentRequests.length > cleanAverage + 5 * standardDeviation) {
      return {
        type: 'volume',
        severity: 'high',
        confidence: 0.9,
        description: 'Unusual volume spike detected (>5σ above baseline)',
      };
    }

    return null;
  }

  private removeOutliers(values: number[]): number[] {
    if (values.length < 4) return values;

    const sorted = [...values].sort((a, b) => a - b);
    const q1Index = Math.floor(sorted.length * 0.25);
    const q3Index = Math.floor(sorted.length * 0.75);

    const q1 = sorted[q1Index] ?? 0;
    const q3 = sorted[q3Index] ?? 0;
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    const filtered = values.filter(v => v >= lowerBound && v <= upperBound);
    return filtered.length > 0 ? filtered : values;
  }

  private detectTemporalAnomaly(
    guildId: string,
    timestamp: number
  ): AnomalyPattern | null {
    const record = this.guildBehavior.get(guildId);
    if (!record || record.requests.length < 5) return null;

    const intervals = [];
    for (let i = 1; i < record.requests.length; i++) {
      intervals.push(record.requests[i]! - record.requests[i - 1]!);
    }

    if (intervals.length < 4) return null;

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance =
      intervals.reduce((acc, interval) => {
        return acc + Math.pow(interval - avgInterval, 2);
      }, 0) / intervals.length;

    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / avgInterval;

    if (coefficientOfVariation < 0.1 && avgInterval < 5000) {
      return {
        type: 'temporal',
        severity: 'medium',
        confidence: 0.85,
        description: 'Highly regular request pattern suggests automation',
      };
    }

    return null;
  }

  private detectProtocolAnomaly(
    userId: string,
    timestamp: number
  ): AnomalyPattern | null {
    const record = this.userBehavior.get(userId);
    if (!record) return null;

    const recentRequests = record.requests.filter(t => t > timestamp - 300000);
    if (recentRequests.length > 15) {
      return {
        type: 'protocol',
        severity: 'high',
        confidence: 0.95,
        description: 'Excessive request frequency indicates potential abuse',
      };
    }

    return null;
  }

  private detectCoordinatedAttack(
    serverIp: string,
    guildId: string,
    timestamp: number
  ): boolean {
    const recentWindow = timestamp - 300000;
    const guildsHittingSameServer = new Set<string>();

    for (const [otherGuildId, record] of this.guildBehavior.entries()) {
      if (otherGuildId === guildId) continue;

      const recentRequests = record.requests.filter(t => t > recentWindow);
      if (recentRequests.length > 0) {
        guildsHittingSameServer.add(otherGuildId);
      }
    }

    return guildsHittingSameServer.size > this.COORDINATED_ATTACK_THRESHOLD;
  }

  private detectRateBurst(guildId: string, timestamp: number): boolean {
    const record = this.guildBehavior.get(guildId);
    if (!record) return false;

    const last30Seconds = record.requests.filter(t => t > timestamp - 30000);
    return last30Seconds.length > 10;
  }

  private detectUniformPattern(requests: number[]): boolean {
    if (requests.length < 5) return false;

    const intervals = [];
    for (let i = 1; i < requests.length; i++) {
      intervals.push(requests[i]! - requests[i - 1]!);
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance =
      intervals.reduce((acc, interval) => {
        return acc + Math.pow(interval - avgInterval, 2);
      }, 0) / intervals.length;

    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / avgInterval;

    return coefficientOfVariation < 0.1;
  }

  private calculateStandardDeviation(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) /
      values.length;
    return Math.sqrt(variance);
  }

  private getRequestCountsPerWindow(
    requests: number[],
    windowSize: number
  ): number[] {
    const counts: number[] = [];
    const now = Date.now();
    const totalWindows = Math.floor(this.ANALYSIS_WINDOW / windowSize);

    for (let i = 0; i < totalWindows; i++) {
      const windowStart = now - (i + 1) * windowSize;
      const windowEnd = now - i * windowSize;
      const count = requests.filter(
        t => t >= windowStart && t < windowEnd
      ).length;
      counts.push(count);
    }

    return counts;
  }

  private calculateCooldown(trustScore: number): number {
    if (trustScore < 0.1) return 3600000;
    if (trustScore < 0.3) return 1800000;
    if (trustScore < 0.5) return 600000;
    return 300000;
  }

  async recordResult(result: {
    serverIp: string;
    guildId?: string;
    userId?: string;
    success: boolean;
    responseTime?: number;
    timestamp: number;
  }): Promise<void> {
    const ipRecord = this.ipBehavior.get(result.serverIp);
    if (ipRecord) {
      if (result.success) {
        ipRecord.successCount++;
        if (result.responseTime) {
          ipRecord.averageResponseTime =
            (ipRecord.averageResponseTime * (ipRecord.successCount - 1) +
              result.responseTime) /
            ipRecord.successCount;
        }
      } else {
        ipRecord.failureCount++;
        ipRecord.trustScore *= 0.9;
        ipRecord.flags.add('query_failures');
      }

      if (result.responseTime && result.responseTime > 5000) {
        ipRecord.flags.add('slow_responses');
      }
    }

    if (result.guildId) {
      const guildRecord = this.guildBehavior.get(result.guildId);
      if (guildRecord) {
        if (result.success) {
          guildRecord.successCount++;
        } else {
          guildRecord.failureCount++;
        }
      }
    }

    if (result.userId) {
      const userRecord = this.userBehavior.get(result.userId);
      if (userRecord) {
        if (result.success) {
          userRecord.successCount++;
        } else {
          userRecord.failureCount++;
        }
      }
    }
  }

  cleanup(): void {
    const now = Date.now();
    const cleanupThreshold = now - this.ANALYSIS_WINDOW * 2;

    for (const [entityId, record] of this.userBehavior.entries()) {
      if (record.lastSeen < cleanupThreshold) {
        this.userBehavior.delete(entityId);
      }
    }

    for (const [entityId, record] of this.guildBehavior.entries()) {
      if (record.lastSeen < cleanupThreshold) {
        this.guildBehavior.delete(entityId);
      }
    }

    for (const [entityId, record] of this.ipBehavior.entries()) {
      if (record.lastSeen < cleanupThreshold) {
        this.ipBehavior.delete(entityId);
      }
    }

    console.log(
      `Behavioral analysis cleanup completed. Active entities: Users=${this.userBehavior.size}, Guilds=${this.guildBehavior.size}, IPs=${this.ipBehavior.size}`
    );
  }

  getStats(): any {
    return {
      trackedUsers: this.userBehavior.size,
      trackedGuilds: this.guildBehavior.size,
      trackedIPs: this.ipBehavior.size,
      suspiciousEntities: {
        users: Array.from(this.userBehavior.entries()).filter(
          ([_, r]) => r.trustScore < 0.5
        ).length,
        guilds: Array.from(this.guildBehavior.entries()).filter(
          ([_, r]) => r.trustScore < 0.5
        ).length,
        ips: Array.from(this.ipBehavior.entries()).filter(
          ([_, r]) => r.trustScore < 0.5
        ).length,
      },
      totalRequests: {
        users: Array.from(this.userBehavior.values()).reduce(
          (sum, r) => sum + r.requests.length,
          0
        ),
        guilds: Array.from(this.guildBehavior.values()).reduce(
          (sum, r) => sum + r.requests.length,
          0
        ),
        ips: Array.from(this.ipBehavior.values()).reduce(
          (sum, r) => sum + r.requests.length,
          0
        ),
      },
      averageTrustScores: {
        users: this.calculateAverageTrustScore(this.userBehavior),
        guilds: this.calculateAverageTrustScore(this.guildBehavior),
        ips: this.calculateAverageTrustScore(this.ipBehavior),
      },
    };
  }

  private calculateAverageTrustScore(
    behaviorMap: Map<string, BehaviorRecord>
  ): number {
    if (behaviorMap.size === 0) return 1.0;

    const totalScore = Array.from(behaviorMap.values()).reduce(
      (sum, r) => sum + r.trustScore,
      0
    );
    return totalScore / behaviorMap.size;
  }
}