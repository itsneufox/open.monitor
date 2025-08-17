import { ServerConfig } from '../types';
import { BehavioralAnalyzer } from './rateLimit/behavioralAnalyzer';

interface IPQueryData {
  lastHour: number[];
  guilds: Map<string, number>;
  totalQueries: number;
  failures: number;
  lastFailure: number;
  banned: boolean;
  banReason?: string;
  bannedAt?: number;
  trustScore: number;
  responseTimeHistory: number[];
}

interface SecurityThreat {
  type:
    | 'rate_abuse'
    | 'coordinated_attack'
    | 'suspicious_behavior'
    | 'server_abuse';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  confidence: number;
  mitigationSuggestion: string;
}

class SecurityValidator {
  private static ipQueryLimits = new Map<string, IPQueryData>();
  private static behavioralAnalyzer = new BehavioralAnalyzer();
  private static securityThreats: SecurityThreat[] = [];
  private static readonly MAX_QUERIES_PER_HOUR = 60;
  private static readonly MAX_GUILDS_PER_IP = 10;
  private static readonly SUSPICIOUS_FAILURE_RATE = 0.7;

  static validateServerIP(ip: string): boolean {
    const privateRanges = [
      /^10\./,
      /^192\.168\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^127\./,
      /^169\.254\./,
      /^0\./,
      /^255\./,
    ];

    if (privateRanges.some(range => range.test(ip))) {
      return process.env.NODE_ENV === 'development';
    }

    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) return true;

    const octets = ip.split('.').map(Number);
    return octets.every(octet => octet >= 0 && octet <= 255);
  }

  static async canQueryIP(
    targetIP: string,
    guildId: string,
    isMonitoringCycle: boolean = false,
    userId?: string
  ): Promise<{ allowed: boolean; reason?: string; trustScore?: number }> {
    const data = this.getOrCreateIPData(targetIP);

    if (data.banned) {
      return {
        allowed: false,
        reason: `IP ${targetIP} is banned: ${data.banReason}`,
        trustScore: 0,
      };
    }

    const behaviorResult = await this.behavioralAnalyzer.analyzeRequest({
      serverIp: targetIP,
      guildId,
      isMonitoring: isMonitoringCycle,
      timestamp: Date.now(),
      ...(userId && { userId }),
    });

    if (!behaviorResult.allowed) {
      return {
        allowed: false,
        reason: behaviorResult.reason,
        trustScore: behaviorResult.trustScore,
      };
    }

    const now = Date.now();
    data.lastHour = data.lastHour.filter(time => time > now - 3600000);

    const lastGuildQuery = data.guilds.get(guildId) || 0;
    const cooldownMs = isMonitoringCycle ? 15000 : 10000;

    if (data.lastHour.length >= this.MAX_QUERIES_PER_HOUR) {
      this.recordSecurityThreat({
        type: 'rate_abuse',
        severity: 'high',
        description: `IP ${targetIP} exceeded hourly query limit`,
        confidence: 0.95,
        mitigationSuggestion: 'Implement stricter rate limiting for this IP',
      });

      return {
        allowed: false,
        reason: `Global limit reached for ${targetIP}: ${data.lastHour.length}/${this.MAX_QUERIES_PER_HOUR} queries in last hour`,
        trustScore: data.trustScore,
      };
    }

    if (data.guilds.size > this.MAX_GUILDS_PER_IP) {
      this.recordSecurityThreat({
        type: 'coordinated_attack',
        severity: 'critical',
        description: `IP ${targetIP} is being queried by ${data.guilds.size} different guilds`,
        confidence: 0.9,
        mitigationSuggestion: 'Consider blocking this IP if pattern continues',
      });

      return {
        allowed: false,
        reason: `Too many guilds querying ${targetIP}: ${data.guilds.size}/${this.MAX_GUILDS_PER_IP}`,
        trustScore: data.trustScore,
      };
    }

    if (now - lastGuildQuery < cooldownMs) {
      return {
        allowed: false,
        reason: `Guild cooldown active for ${targetIP}: ${now - lastGuildQuery}ms ago (cooldown: ${cooldownMs}ms)`,
        trustScore: data.trustScore,
      };
    }

    const failureRate = data.failures / Math.max(data.totalQueries, 1);
    if (failureRate > this.SUSPICIOUS_FAILURE_RATE && data.totalQueries > 10) {
      this.recordSecurityThreat({
        type: 'server_abuse',
        severity: 'medium',
        description: `High failure rate for ${targetIP}: ${(failureRate * 100).toFixed(1)}%`,
        confidence: 0.8,
        mitigationSuggestion: 'Monitor this IP for potential server targeting',
      });

      data.trustScore *= 0.8;
    }

    data.lastHour.push(now);
    data.guilds.set(guildId, now);
    data.totalQueries++;

    return {
      allowed: true,
      trustScore: data.trustScore,
    };
  }

  private static getOrCreateIPData(targetIP: string): IPQueryData {
    let data = this.ipQueryLimits.get(targetIP);
    if (!data) {
      data = {
        lastHour: [],
        guilds: new Map(),
        totalQueries: 0,
        failures: 0,
        lastFailure: 0,
        banned: false,
        trustScore: 1.0,
        responseTimeHistory: [],
      };
      this.ipQueryLimits.set(targetIP, data);
    }
    return data;
  }

  static validateSAMPResponse(
    data: Buffer | undefined,
    server: ServerConfig,
    opcode: string
  ): boolean {
    if (!data || data.length < 11) {
      return false;
    }

    if (data.toString('ascii', 0, 4) !== 'SAMP') {
      return false;
    }

    const isDomain = !/^\d+\.\d+\.\d+\.\d+$/.test(server.ip);
    if (!isDomain) {
      const ipParts = [data[4] ?? 0, data[5] ?? 0, data[6] ?? 0, data[7] ?? 0];
      const responseIP = ipParts.join('.');
      const portLowByte = data[8] ?? 0;
      const portHighByte = data[9] ?? 0;
      const responsePort = portLowByte + (portHighByte << 8);

      if (responseIP !== server.ip || responsePort !== server.port) {
        console.warn(
          `Response IP/port mismatch: expected ${server.ip}:${server.port}, got ${responseIP}:${responsePort}`
        );
        return false;
      }
    }

    const responseOpcode = String.fromCharCode(data[10] ?? 0);
    const opcodeMatch = responseOpcode === opcode;

    if (!opcodeMatch) {
      console.warn(
        `Opcode mismatch: expected ${opcode}, got ${responseOpcode}`
      );
    }

    return opcodeMatch;
  }

  static validateStringField(
    data: Buffer | undefined,
    offset: number,
    maxLength = 256
  ) {
    if (!data || offset + 4 > data.length) return { valid: false, length: 0 };

    const length = data.readUInt32LE(offset);
    return {
      valid: length <= maxLength && offset + 4 + length <= data.length,
      length,
    };
  }

  static async recordQueryFailure(
    targetIP: string,
    error: Error,
    guildId?: string
  ): Promise<void> {
    const data = this.getOrCreateIPData(targetIP);

    data.failures++;
    data.lastFailure = Date.now();
    data.trustScore *= 0.95;

    await this.behavioralAnalyzer.recordResult({
      serverIp: targetIP,
      success: false,
      timestamp: Date.now(),
      ...(guildId && { guildId }),
    });

    const failureRate = data.failures / Math.max(data.totalQueries, 1);
    if (failureRate > this.SUSPICIOUS_FAILURE_RATE && data.totalQueries > 5) {
      this.recordSecurityThreat({
        type: 'server_abuse',
        severity: 'medium',
        description: `Repeated failures for ${targetIP}: ${data.failures} failures, ${(failureRate * 100).toFixed(1)}% failure rate`,
        confidence: 0.85,
        mitigationSuggestion:
          'Investigate server status or potential targeting',
      });
    }

    if (guildId) {
      this.logErrorToGuild(targetIP, error, guildId, data.failures);
    }
  }

  static async recordQuerySuccess(
    targetIP: string,
    responseTime: number,
    guildId?: string
  ): Promise<void> {
    const data = this.getOrCreateIPData(targetIP);

    data.responseTimeHistory.push(responseTime);
    if (data.responseTimeHistory.length > 10) {
      data.responseTimeHistory.shift();
    }

    if (data.trustScore < 1.0) {
      data.trustScore = Math.min(1.0, data.trustScore * 1.05);
    }

    await this.behavioralAnalyzer.recordResult({
      serverIp: targetIP,
      success: true,
      responseTime,
      timestamp: Date.now(),
      ...(guildId && { guildId }),
    });

    if (responseTime > 10000) {
      this.recordSecurityThreat({
        type: 'server_abuse',
        severity: 'low',
        description: `Slow response from ${targetIP}: ${responseTime}ms`,
        confidence: 0.6,
        mitigationSuggestion: 'Monitor server performance',
      });
    }
  }

  private static recordSecurityThreat(threat: SecurityThreat): void {
    this.securityThreats.push({
      ...threat,
      timestamp: Date.now(),
    } as any);

    if (this.securityThreats.length > 100) {
      this.securityThreats = this.securityThreats.slice(-50);
    }

    if (threat.severity === 'critical' || threat.severity === 'high') {
      console.warn(
        `Security threat detected: ${threat.description} (${threat.severity}, confidence: ${threat.confidence})`
      );
    }
  }

  private static async logErrorToGuild(
    targetIP: string,
    error: Error,
    guildId: string,
    failureCount: number
  ): Promise<void> {
    try {
      if (guildId !== '1309527094476275782') return;

      const { Client } = require('discord.js');
      const client = require('../index').default;

      if (!client || !client.channels) return;

      const channelId = '1405066715687026718';
      const channel = await client.channels.fetch(channelId).catch(() => null);

      if (!channel || !('send' in channel)) return;

      const errorType = this.getErrorType(error);
      const data = this.ipQueryLimits.get(targetIP);
      const trustScore = data ? Math.round(data.trustScore * 100) : 100;

      const embed = {
        color: failureCount > 5 ? 0xff0000 : 0xff9500,
        title: 'Server Query Error',
        fields: [
          {
            name: 'Server IP',
            value: `\`${targetIP}\``,
            inline: true,
          },
          {
            name: 'Error Type',
            value: errorType,
            inline: true,
          },
          {
            name: 'Failure Count',
            value: `${failureCount}`,
            inline: true,
          },
          {
            name: 'Trust Score',
            value: `${trustScore}%`,
            inline: true,
          },
          {
            name: 'Error Details',
            value: `\`${error.message.slice(0, 100)}\``,
            inline: false,
          },
        ],
        timestamp: new Date().toISOString(),
      };

      if (error.message.includes('ENOTFOUND')) {
        embed.fields.push({
          name: 'Recommendation',
          value:
            'Check if the server IP/domain is correct. This might be a typo in the server configuration.',
          inline: false,
        });
      } else if (error.message.includes('ECONNREFUSED')) {
        embed.fields.push({
          name: 'Recommendation',
          value:
            'Server is refusing connections. Check if the port is correct and the server is running.',
          inline: false,
        });
      } else if (error.message.includes('timeout')) {
        embed.fields.push({
          name: 'Recommendation',
          value:
            'Server might be offline, slow to respond, or behind a firewall blocking queries.',
          inline: false,
        });
      }

      await channel.send({ embeds: [embed] });
    } catch (logError) {
      console.error('Failed to log error to guild channel:', logError);
    }
  }

  private static getErrorType(error: Error): string {
    if (error.message.includes('ENOTFOUND')) {
      return 'DNS Resolution Failed';
    }
    if (error.message.includes('ECONNREFUSED')) {
      return 'Connection Refused';
    }
    if (error.message.includes('ETIMEDOUT')) {
      return 'Connection Timeout';
    }
    if (error.message.includes('timeout')) {
      return 'Query Timeout';
    }
    return 'Unknown Error';
  }

  static isIPBanned(targetIP: string): { banned: boolean; reason?: string } {
    const data = this.ipQueryLimits.get(targetIP);
    if (!data || !data.banned) {
      return { banned: false };
    }

    return {
      banned: true,
      ...(data.banReason && { reason: data.banReason }),
    };
  }

  static banIP(
    targetIP: string,
    reason: string
  ): { success: boolean; error?: string } {
    let data = this.ipQueryLimits.get(targetIP);

    if (!data) {
      data = this.getOrCreateIPData(targetIP);
    }

    if (data.banned) {
      return { success: false, error: 'IP is already banned' };
    }

    data.banned = true;
    data.bannedAt = Date.now();
    data.banReason = reason;
    data.trustScore = 0;

    this.recordSecurityThreat({
      type: 'rate_abuse',
      severity: 'critical',
      description: `IP ${targetIP} manually banned: ${reason}`,
      confidence: 1.0,
      mitigationSuggestion:
        'IP has been banned and will be blocked from all queries',
    });

    console.log(`Manually banned IP: ${targetIP} - Reason: ${reason}`);
    return { success: true };
  }

  static unbanIP(targetIP: string): {
    success: boolean;
    error?: string;
    previousReason?: string;
  } {
    const data = this.ipQueryLimits.get(targetIP);

    if (!data || !data.banned) {
      return { success: false, error: 'IP is not banned' };
    }

    const previousReason = data.banReason;
    data.banned = false;
    data.failures = 0;
    data.trustScore = 0.5;
    delete data.banReason;
    delete data.bannedAt;

    console.log(`Manually unbanned IP: ${targetIP}`);
    return {
      success: true,
      ...(previousReason && { previousReason }),
    };
  }

  static getBannedIPs(): Array<{
    ip: string;
    reason: string;
    failures: number;
    bannedAt: number;
    trustScore: number;
  }> {
    const banned: Array<{
      ip: string;
      reason: string;
      failures: number;
      bannedAt: number;
      trustScore: number;
    }> = [];

    for (const [ip, data] of this.ipQueryLimits.entries()) {
      if (data.banned) {
        banned.push({
          ip,
          reason: data.banReason || 'Unknown',
          failures: data.failures,
          bannedAt: data.bannedAt || 0,
          trustScore: data.trustScore,
        });
      }
    }

    return banned.sort((a, b) => b.bannedAt - a.bannedAt);
  }

  static getSecurityThreats(): SecurityThreat[] {
    const recentThreats = this.securityThreats.filter(
      threat => Date.now() - (threat as any).timestamp < 3600000
    );

    return recentThreats.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  static clearAllBans(): number {
    let count = 0;

    for (const [ip, data] of this.ipQueryLimits.entries()) {
      if (data.banned) {
        data.banned = false;
        data.failures = 0;
        data.trustScore = 0.5;
        delete data.banReason;
        delete data.bannedAt;
        count++;
      }
    }

    console.log(`Cleared ${count} banned IPs`);
    return count;
  }

  static clearRateLimits(): void {
    this.ipQueryLimits.clear();
    this.securityThreats.length = 0;
    console.log('Rate limits and security threats cleared');
  }

  static getRateLimitStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    const now = Date.now();

    for (const [ip, data] of this.ipQueryLimits.entries()) {
      const avgResponseTime =
        data.responseTimeHistory.length > 0
          ? data.responseTimeHistory.reduce((sum, time) => sum + time, 0) /
            data.responseTimeHistory.length
          : 0;

      stats[ip] = {
        queriesInLastHour: data.lastHour.length,
        totalGuilds: data.guilds.size,
        totalQueries: data.totalQueries,
        failures: data.failures,
        failureRate:
          data.totalQueries > 0 ? data.failures / data.totalQueries : 0,
        trustScore: Math.round(data.trustScore * 100) / 100,
        banned: data.banned,
        banReason: data.banReason,
        bannedAt: data.bannedAt,
        averageResponseTime: Math.round(avgResponseTime),
        guilds: Array.from(data.guilds.entries()).map(
          ([guildId, lastQuery]) => ({
            guildId,
            lastQuery: now - lastQuery + 'ms ago',
          })
        ),
      };
    }

    return stats;
  }

  static getSecuritySummary(): {
    totalThreats: number;
    criticalThreats: number;
    bannedIPs: number;
    lowTrustIPs: number;
    averageTrustScore: number;
  } {
    const threats = this.getSecurityThreats();
    const criticalThreats = threats.filter(
      t => t.severity === 'critical'
    ).length;
    const bannedIPs = this.getBannedIPs().length;

    const allIPs = Array.from(this.ipQueryLimits.values());
    const lowTrustIPs = allIPs.filter(data => data.trustScore < 0.5).length;
    const averageTrustScore =
      allIPs.length > 0
        ? allIPs.reduce((sum, data) => sum + data.trustScore, 0) / allIPs.length
        : 1.0;

    return {
      totalThreats: threats.length,
      criticalThreats,
      bannedIPs,
      lowTrustIPs,
      averageTrustScore: Math.round(averageTrustScore * 100) / 100,
    };
  }

  static cleanupOldEntries(): void {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    let cleanedIPs = 0;

    for (const [ip, data] of this.ipQueryLimits.entries()) {
      for (const [guildId, lastQuery] of data.guilds.entries()) {
        if (lastQuery < oneHourAgo) {
          data.guilds.delete(guildId);
        }
      }

      if (
        data.lastHour.length === 0 &&
        data.guilds.size === 0 &&
        !data.banned &&
        data.totalQueries === 0
      ) {
        this.ipQueryLimits.delete(ip);
        cleanedIPs++;
      }
    }

    this.securityThreats = this.securityThreats.filter(
      threat => now - (threat as any).timestamp < 86400000
    );

    this.behavioralAnalyzer.cleanup();

    console.log(
      `Security validator cleanup completed. Cleaned ${cleanedIPs} IPs. Active IPs: ${this.ipQueryLimits.size}, Active threats: ${this.securityThreats.length}`
    );
  }
}

export { SecurityValidator };
