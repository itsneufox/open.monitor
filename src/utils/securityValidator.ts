import { ServerConfig } from '../types';

interface IPQueryData {
  lastHour: number[];
  guilds: Map<string, number>;
  totalQueries: number;
  failures: number;
  lastFailure: number;
  banned: boolean;
  banReason?: string;
  bannedAt?: number;
}

class SecurityValidator {
  private static ipQueryLimits = new Map<string, IPQueryData>();

  static validateServerIP(ip: string): boolean {
    return true;
  }

  static canQueryIP(
    targetIP: string,
    guildId: string,
    isMonitoringCycle: boolean = false
  ): boolean {
    const data = this.ipQueryLimits.get(targetIP) ?? {
      lastHour: [],
      guilds: new Map(),
      totalQueries: 0,
      failures: 0,
      lastFailure: 0,
      banned: false,
    };

    const now = Date.now();

    if (data.banned) {
      console.warn(`IP ${targetIP} is banned: ${data.banReason}`);
      return false;
    }

    data.lastHour = data.lastHour.filter(time => time > now - 3600000);

    const lastGuildQuery = data.guilds.get(guildId) || 0;

    const maxQueriesPerHour = 120;
    const maxGuilds = 10;
    const cooldownMs = isMonitoringCycle ? 10 : 10000;;

    if (
      data.lastHour.length >= maxQueriesPerHour ||
      data.guilds.size > maxGuilds
    ) {
      console.warn(
        `Global limit reached for ${targetIP}: queries=${data.lastHour.length}/${maxQueriesPerHour}, guilds=${data.guilds.size}/${maxGuilds}`
      );
      return false;
    }

    if (now - lastGuildQuery < cooldownMs) {
      console.warn(
        `Guild cooldown active for ${targetIP} (guild: ${guildId}): lastQuery=${now - lastGuildQuery}ms ago (cooldown: ${cooldownMs}ms, monitoring: ${isMonitoringCycle})`
      );
      return false;
    }

    data.lastHour.push(now);
    data.guilds.set(guildId, now);
    data.totalQueries++;

    this.ipQueryLimits.set(targetIP, data);
    return true;
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
    const data = this.ipQueryLimits.get(targetIP) ?? {
      lastHour: [],
      guilds: new Map(),
      totalQueries: 0,
      failures: 0,
      lastFailure: 0,
      banned: false,
    };

    data.failures++;
    data.lastFailure = Date.now();

    if (guildId) {
      this.logErrorToGuild(targetIP, error, guildId, data.failures);
    }

    this.ipQueryLimits.set(targetIP, data);
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
        guilds: Array.from(data.guilds.entries()).map(
          ([guildId, lastQuery]) => ({
            guildId,
            lastQuery: Date.now() - lastQuery + 'ms ago',
          })
        ),
      };
    }
    return stats;
  }

  static cleanupOldEntries(): void {
    const now = Date.now();
    const oneHourAgo = now - 3600000;

    for (const [ip, data] of this.ipQueryLimits.entries()) {
      for (const [guildId, lastQuery] of data.guilds.entries()) {
        if (lastQuery < oneHourAgo) {
          data.guilds.delete(guildId);
        }
      }

      if (data.lastHour.length === 0 && data.guilds.size === 0 && !data.banned) {
        this.ipQueryLimits.delete(ip);
      }
    }

    console.log(
      `Rate limit cleanup completed. Active IPs: ${this.ipQueryLimits.size}`
    );
  }
}

export { SecurityValidator };
