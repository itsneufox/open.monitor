// utils/securityValidator.ts
import { ServerConfig } from '../types';

interface IPQueryData {
  lastHour: number[];
  guilds: Map<string, number>; // guildId -> lastQuery timestamp
  totalQueries: number;
}

class SecurityValidator {
  private static ipQueryLimits = new Map<string, IPQueryData>();

  static validateServerIP(ip: string): boolean {
    // Allow all IPs
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
    };

    const now = Date.now();

    // Clean up old queries from last hour
    data.lastHour = data.lastHour.filter(time => time > now - 3600000);

    // Get the last query time for this specific guild
    const lastGuildQuery = data.guilds.get(guildId) || 0;

    // Different limits based on context
    const maxQueriesPerHour = 60;
    const maxGuilds = 10;
    const cooldownMs = isMonitoringCycle ? 15 : 10000; // 15ms for monitoring, 10s for manual

    // Check global limits
    if (
      data.lastHour.length >= maxQueriesPerHour ||
      data.guilds.size > maxGuilds
    ) {
      console.warn(
        `🚨 Global limit reached for ${targetIP}: queries=${data.lastHour.length}/${maxQueriesPerHour}, guilds=${data.guilds.size}/${maxGuilds}`
      );
      return false;
    }

    // Check per-guild cooldown
    if (now - lastGuildQuery < cooldownMs) {
      console.warn(
        `🚨 Guild cooldown active for ${targetIP} (guild: ${guildId}): lastQuery=${now - lastGuildQuery}ms ago (cooldown: ${cooldownMs}ms, monitoring: ${isMonitoringCycle})`
      );
      return false;
    }

    // Update tracking data
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

    // Skip IP validation for domain names
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

  // Add method to clear rate limits for debugging
  static clearRateLimits(): void {
    this.ipQueryLimits.clear();
    console.log('Rate limits cleared');
  }

  // Add method to get current rate limit stats
  static getRateLimitStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    for (const [ip, data] of this.ipQueryLimits.entries()) {
      stats[ip] = {
        queriesInLastHour: data.lastHour.length,
        totalGuilds: data.guilds.size,
        totalQueries: data.totalQueries,
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

  // Cleanup method to remove old guild entries periodically
  static cleanupOldEntries(): void {
    const now = Date.now();
    const oneHourAgo = now - 3600000;

    for (const [ip, data] of this.ipQueryLimits.entries()) {
      // Remove guilds that haven't queried in the last hour
      for (const [guildId, lastQuery] of data.guilds.entries()) {
        if (lastQuery < oneHourAgo) {
          data.guilds.delete(guildId);
        }
      }

      // Remove the entire IP entry if no recent activity
      if (data.lastHour.length === 0 && data.guilds.size === 0) {
        this.ipQueryLimits.delete(ip);
      }
    }

    console.log(
      `🧹 Rate limit cleanup completed. Active IPs: ${this.ipQueryLimits.size}`
    );
  }
}

export { SecurityValidator };
