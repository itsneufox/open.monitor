import { ServerConfig } from '../types';

interface IPQueryData {
  lastHour: number[];
  guilds: Map<string, {
    lastQuery: number;
    queryCount: number;
    lastMonitoringQuery?: number;
    lastUserQuery?: number;
  }>;
  totalQueries: number;
  failures: number;
  lastFailure: number;
  banned: boolean;
  banReason?: string;
  bannedAt?: number;
  suspiciousActivity: number;
}

class SecurityValidator {
  private static ipQueryLimits = new Map<string, IPQueryData>();

  private static readonly LIMITS = {
    MAX_QUERIES_PER_HOUR: 200,
    MAX_GUILDS_PER_IP: 15,
    MIN_MONITORING_INTERVAL: 0,
    MIN_USER_INTERVAL: 500,
    MAX_FAILURES_BEFORE_BAN: 15,
    SUSPICIOUS_THRESHOLD: 8,
    USER_BURST_ALLOWANCE: 5,
    USER_BURST_WINDOW: 10000,
  };

  static validateServerIP(ip: string): boolean {
    return true;
  }

  static canQueryIP(
    targetIP: string,
    guildId: string,
    isMonitoringCycle: boolean = false
  ): boolean {
    const data = this.getOrCreateIPData(targetIP);
    const now = Date.now();

    if (data.banned) {
      console.warn(`Blocked query to banned IP: ${targetIP} (${data.banReason})`);
      return false;
    }

    data.lastHour = data.lastHour.filter(time => time > now - 3600000);
    this.cleanOldGuildData(data, now);

    const guildData = data.guilds.get(guildId) || {
      lastQuery: 0,
      queryCount: 0,
      lastMonitoringQuery: 0,
      lastUserQuery: 0
    };

    if (data.lastHour.length >= this.LIMITS.MAX_QUERIES_PER_HOUR) {
      this.flagSuspiciousActivity(targetIP, `Hourly limit exceeded: ${data.lastHour.length}`);
      return false;
    }

    if (data.guilds.size >= this.LIMITS.MAX_GUILDS_PER_IP && !data.guilds.has(guildId)) {
      this.flagSuspiciousActivity(targetIP, `Too many guilds: ${data.guilds.size}`);
      return false;
    }

    if (isMonitoringCycle) {
      const lastMonitoring = guildData.lastMonitoringQuery || 0;
      if (now - lastMonitoring < this.LIMITS.MIN_MONITORING_INTERVAL) {
        console.warn(`Monitoring query too frequent for ${targetIP}: ${now - lastMonitoring}ms < ${this.LIMITS.MIN_MONITORING_INTERVAL}ms`);
        return false;
      }
    } else {
      const lastUser = guildData.lastUserQuery || 0;
      const timeSinceLastUser = now - lastUser;

      const recentUserQueries = data.lastHour.filter(time =>
        time > now - this.LIMITS.USER_BURST_WINDOW &&
        time > (guildData.lastMonitoringQuery || 0)
      ).length;

      if (recentUserQueries < this.LIMITS.USER_BURST_ALLOWANCE) {
        console.log(`Allowing user query ${recentUserQueries + 1}/${this.LIMITS.USER_BURST_ALLOWANCE} for ${targetIP}`);
      } else if (timeSinceLastUser < this.LIMITS.MIN_USER_INTERVAL) {
        console.warn(`User query too frequent for ${targetIP} (guild: ${guildId}): lastQuery=${timeSinceLastUser}ms ago (cooldown: ${this.LIMITS.MIN_USER_INTERVAL}ms, burst: ${recentUserQueries}/${this.LIMITS.USER_BURST_ALLOWANCE})`);
        return false;
      }
    }

    data.lastHour.push(now);
    guildData.lastQuery = now;

    if (isMonitoringCycle) {
      guildData.lastMonitoringQuery = now;
    } else {
      guildData.lastUserQuery = now;
    }

    guildData.queryCount++;
    data.guilds.set(guildId, guildData);
    data.totalQueries++;

    this.ipQueryLimits.set(targetIP, data);
    return true;
  }

  private static getOrCreateIPData(ip: string): IPQueryData {
    if (!this.ipQueryLimits.has(ip)) {
      this.ipQueryLimits.set(ip, {
        lastHour: [],
        guilds: new Map(),
        totalQueries: 0,
        failures: 0,
        lastFailure: 0,
        banned: false,
        suspiciousActivity: 0,
      });
    }
    return this.ipQueryLimits.get(ip)!;
  }

  private static cleanOldGuildData(data: IPQueryData, now: number): void {
    for (const [guildId, guildData] of data.guilds.entries()) {
      if (now - guildData.lastQuery > 14400000) {
        data.guilds.delete(guildId);
      } else if (now - guildData.lastQuery > 3600000) {
        guildData.queryCount = Math.floor(guildData.queryCount / 2);
      }
    }
  }

  private static flagSuspiciousActivity(ip: string, reason: string): void {
    const data = this.getOrCreateIPData(ip);
    data.suspiciousActivity++;

    console.warn(`Suspicious activity from ${ip}: ${reason} (count: ${data.suspiciousActivity})`);

    if (data.suspiciousActivity >= this.LIMITS.SUSPICIOUS_THRESHOLD) {
      this.autoBanIP(ip, `Automatic ban: ${data.suspiciousActivity} suspicious activities`);
    }
  }

  private static autoBanIP(ip: string, reason: string): void {
    const data = this.getOrCreateIPData(ip);
    data.banned = true;
    data.bannedAt = Date.now();
    data.banReason = reason;

    console.error(`AUTO-BANNED IP: ${ip} - ${reason}`);

    data.lastHour = [];
    data.guilds.clear();
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
        return false;
      }
    }

    const responseOpcode = String.fromCharCode(data[10] ?? 0);
    return responseOpcode === opcode;
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

  static recordQueryFailure(targetIP: string, error: Error, guildId?: string): void {
    const data = this.getOrCreateIPData(targetIP);
    data.failures++;
    data.lastFailure = Date.now();

    if (data.failures >= this.LIMITS.MAX_FAILURES_BEFORE_BAN) {
      this.autoBanIP(targetIP, `Automatic ban: ${data.failures} consecutive failures`);
    }

    if (guildId) {
      this.logErrorToGuild(targetIP, error, guildId, data.failures);
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

      const embed = {
        color: 0xff9500,
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
            name: 'Error Details',
            value: `\`${error.message}\``,
            inline: false,
          },
        ],
        timestamp: new Date().toISOString(),
      };

      if (error.message.includes('ENOTFOUND')) {
        embed.fields.push({
          name: 'Recommendation',
          value: 'Check if the server IP/domain is correct. This might be a typo in the server configuration.',
          inline: false,
        });
      } else if (error.message.includes('ECONNREFUSED')) {
        embed.fields.push({
          name: 'Recommendation',
          value: 'Server is refusing connections. Check if the port is correct and the server is running.',
          inline: false,
        });
      } else if (error.message.includes('timeout')) {
        embed.fields.push({
          name: 'Recommendation',
          value: 'Server might be offline, slow to respond, or behind a firewall blocking queries.',
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

    const result: { banned: boolean; reason?: string } = { banned: true };
    if (data.banReason) {
      result.reason = data.banReason;
    }
    return result;
  }

  static banIP(targetIP: string, reason: string): { success: boolean; error?: string } {
    let data = this.ipQueryLimits.get(targetIP);

    if (!data) {
      data = {
        lastHour: [],
        guilds: new Map(),
        totalQueries: 0,
        failures: 0,
        lastFailure: 0,
        banned: false,
        suspiciousActivity: 0,
      };
    }

    if (data.banned) {
      return { success: false, error: 'IP is already banned' };
    }

    data.banned = true;
    data.bannedAt = Date.now();
    data.banReason = reason;

    this.ipQueryLimits.set(targetIP, data);
    console.log(`Manually banned IP: ${targetIP} - Reason: ${reason}`);

    return { success: true };
  }

  static unbanIP(targetIP: string): { success: boolean; error?: string; previousReason?: string } {
    const data = this.ipQueryLimits.get(targetIP);

    if (!data || !data.banned) {
      return { success: false, error: 'IP is not banned' };
    }

    const previousReason = data.banReason;
    data.banned = false;
    data.failures = 0;
    delete data.banReason;
    delete data.bannedAt;

    this.ipQueryLimits.set(targetIP, data);
    console.log(`Manually unbanned IP: ${targetIP}`);

    const result: { success: boolean; error?: string; previousReason?: string } = { success: true };
    if (previousReason) {
      result.previousReason = previousReason;
    }
    return result;
  }

  static getBannedIPs(): Array<{ ip: string; reason: string; failures: number; bannedAt: number }> {
    const banned: Array<{ ip: string; reason: string; failures: number; bannedAt: number }> = [];

    for (const [ip, data] of this.ipQueryLimits.entries()) {
      if (data.banned) {
        banned.push({
          ip,
          reason: data.banReason || 'Unknown',
          failures: data.failures,
          bannedAt: data.bannedAt || 0,
        });
      }
    }

    return banned.sort((a, b) => b.bannedAt - a.bannedAt);
  }

  static clearAllBans(): number {
    let count = 0;

    for (const [ip, data] of this.ipQueryLimits.entries()) {
      if (data.banned) {
        data.banned = false;
        data.failures = 0;
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
    console.log('Rate limits cleared');
  }

  static getRateLimitStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    for (const [ip, data] of this.ipQueryLimits.entries()) {
      stats[ip] = {
        queriesInLastHour: data.lastHour.length,
        totalGuilds: data.guilds.size,
        totalQueries: data.totalQueries,
        failures: data.failures,
        banned: data.banned,
        banReason: data.banReason,
        bannedAt: data.bannedAt,
        suspiciousActivity: data.suspiciousActivity,
        guilds: Array.from(data.guilds.entries()).map(
          ([guildId, guildData]) => ({
            guildId,
            lastQuery: Date.now() - guildData.lastQuery + 'ms ago',
            queryCount: guildData.queryCount,
            lastMonitoring: guildData.lastMonitoringQuery ? Date.now() - guildData.lastMonitoringQuery + 'ms ago' : 'never',
            lastUser: guildData.lastUserQuery ? Date.now() - guildData.lastUserQuery + 'ms ago' : 'never',
          })
        ),
      };
    }
    return stats;
  }

  static cleanupOldEntries(): void {
    const now = Date.now();

    for (const [ip, data] of this.ipQueryLimits.entries()) {
      this.cleanOldGuildData(data, now);

      if (data.lastHour.length === 0 && data.guilds.size === 0 && !data.banned) {
        this.ipQueryLimits.delete(ip);
      }
    }

    console.log(
      `Rate limit cleanup completed. Active IPs: ${this.ipQueryLimits.size}`
    );
  }

  static getSecurityStats(): {
    activeIPs: number;
    bannedIPs: number;
    totalQueries: number;
    suspiciousActivities: number;
    recentFailures: number;
  } {
    let totalQueries = 0;
    let bannedCount = 0;
    let suspiciousCount = 0;
    let recentFailures = 0;
    const oneHourAgo = Date.now() - 3600000;

    for (const data of this.ipQueryLimits.values()) {
      totalQueries += data.totalQueries;
      if (data.banned) bannedCount++;
      suspiciousCount += data.suspiciousActivity;
      if (data.lastFailure > oneHourAgo) recentFailures++;
    }

    return {
      activeIPs: this.ipQueryLimits.size,
      bannedIPs: bannedCount,
      totalQueries,
      suspiciousActivities: suspiciousCount,
      recentFailures,
    };
  }

  static detectPotentialAttack(): boolean {
    const now = Date.now();
    const recentWindow = 300000;
    let recentQueries = 0;
    let recentNewIPs = 0;

    for (const data of this.ipQueryLimits.values()) {
      const recentQueriesFromIP = data.lastHour.filter(time => time > now - recentWindow);
      recentQueries += recentQueriesFromIP.length;

      if (data.lastHour.length > 0 && Math.min(...data.lastHour) > now - recentWindow) {
        recentNewIPs++;
      }
    }

    return recentQueries > 300 || recentNewIPs > 20;
  }
}

export { SecurityValidator };