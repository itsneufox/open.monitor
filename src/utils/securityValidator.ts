// utils/securityValidator.ts
import { ServerConfig } from '../types';

class SecurityValidator {
  private static ipQueryLimits = new Map<string, {
    lastHour: number[],
    guilds: Set<string>,
    lastQuery: number
  }>();

  static validateServerIP(ip: string): boolean {
    // Allow all IPs as requested
    return true;
  }

  static canQueryIP(targetIP: string, guildId: string, isMonitoringCycle: boolean = false): boolean {
    const data = this.ipQueryLimits.get(targetIP) ?? {
      lastHour: [],
      guilds: new Set(),
      lastQuery: 0
    };

    const now = Date.now();
    data.lastHour = data.lastHour.filter(time => time > now - 3600000);
    data.guilds.add(guildId);

    // Different limits based on context
    const maxQueriesPerHour = 60;
    const maxGuilds = 10;
    const cooldownMs = isMonitoringCycle ? 1000 : 10000; // 1s for monitoring, 10s for manual

    if (data.lastHour.length >= maxQueriesPerHour || 
        data.guilds.size > maxGuilds ||
        (now - data.lastQuery) < cooldownMs) {
      console.warn(`🚨 Query blocked for ${targetIP}: queries=${data.lastHour.length}/${maxQueriesPerHour}, guilds=${data.guilds.size}/${maxGuilds}, lastQuery=${now - data.lastQuery}ms ago (cooldown: ${cooldownMs}ms, monitoring: ${isMonitoringCycle})`);
      return false;
    }

    data.lastHour.push(now);
    data.lastQuery = now;
    this.ipQueryLimits.set(targetIP, data);
    return true;
  }

  static validateSAMPResponse(data: Buffer | undefined, server: ServerConfig, opcode: string): boolean {
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

  static validateStringField(data: Buffer | undefined, offset: number, maxLength = 256) {
    if (!data || offset + 4 > data.length) return { valid: false, length: 0 };
    
    const length = data.readUInt32LE(offset);
    return {
      valid: length <= maxLength && offset + 4 + length <= data.length,
      length
    };
  }

  // Add method to clear rate limits for debugging
  static clearRateLimits(): void {
    this.ipQueryLimits.clear();
    console.log('Rate limits cleared');
  }
}

export { SecurityValidator };