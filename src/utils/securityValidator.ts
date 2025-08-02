import { ServerConfig } from '../types';

class SecurityValidator {
  // Block private/special IP ranges (except in development)
  private static readonly BLOCKED_IP_RANGES = [
    /^0\./,                                     // 0.x.x.x (invalid)
    /^10\./,                                    // 10.x.x.x (private)
    /^172\.(1[6-9]|2[0-9]|3[01])\./,            // 172.16-31.x.x (private)
    /^192\.168\./,                              // 192.168.x.x (private)
    /^169\.254\./,                              // 169.254.x.x (link-local)
    /^224\./,                                   // 224.x.x.x (multicast)
    /^255\./,                                   // 255.x.x.x (broadcast)
    /^127\./                                    // 127.x.x.x (loopback)
  ];

  private static ipQueryLimits = new Map<string, {
    lastHour: number[],    // Timestamps for rate limiting
    guilds: Set<string>,   // Track guilds per IP
    lastQuery: number
  }>();

  static validateServerIP(ip: string): boolean {
    const isBlocked = this.BLOCKED_IP_RANGES.some(range => range.test(ip));
    
    return process.env.NODE_ENV === 'development'
      ? !isBlocked || /^127\./.test(ip) // Allow localhost in dev
      : !isBlocked;
  }

  static canQueryIP(targetIP: string, guildId: string): boolean {
    const data = this.ipQueryLimits.get(targetIP) ?? {
      lastHour: [],
      guilds: new Set(),
      lastQuery: 0
    };

    const now = Date.now();
    data.lastHour = data.lastHour.filter(time => time > now - 3600000);
    data.guilds.add(guildId);

    // Rate limits: 12 queries/hour, 3 guilds, 30s cooldown
    if (data.lastHour.length >= 12 || data.guilds.size > 3 ||
        (now - data.lastQuery) < 30000) {
      console.warn(`🚨 Query blocked for ${targetIP}: queries=${data.lastHour.length}, guilds=${data.guilds.size}, lastQuery=${now - data.lastQuery}ms ago`);
      return false;
    }

    data.lastHour.push(now);
    data.lastQuery = now;
    this.ipQueryLimits.set(targetIP, data);
    return true;
  }

  static validateSAMPResponse(data: Buffer | undefined, server: ServerConfig, opcode: string): boolean {
    // Early return if data is missing or too small
    if (!data || data.length < 11) {
      console.warn(`Invalid packet: ${data ? `size=${data.length} bytes` : 'null/undefined data'}`);
      return false;
    }

    // Verify packet header
    if (data.toString('ascii', 0, 4) !== 'SAMP') {
      console.warn('Invalid packet header');
      return false;
    }

    // Safely extract IP components (data.length >=11 confirmed above)
    const ipParts = [
      data[4] ?? 0,
      data[5] ?? 0,
      data[6] ?? 0,
      data[7] ?? 0
    ];
    const responseIP = ipParts.join('.');

    // Safely extract port
    const portLowByte = data[8] ?? 0;
    const portHighByte = data[9] ?? 0;
    const responsePort = portLowByte + (portHighByte << 8);

    // Verify response matches query
    if (responseIP !== server.ip) {
      console.warn(`IP mismatch: expected ${server.ip}, got ${responseIP}`);
      return false;
    }

    if (responsePort !== server.port) {
      console.warn(`Port mismatch: expected ${server.port}, got ${responsePort}`);
      return false;
    }

    // Verify opcode (safe, we checked data.length >=11)
    const responseOpcode = String.fromCharCode(data[10] ?? 0);
    if (responseOpcode !== opcode) {
      console.warn(`Opcode mismatch: expected ${opcode}, got ${responseOpcode}`);
      return false;
    }

    // Opcode-specific size validation
    const minSizes: Record<string, number> = {
      'i': 15, 'p': 15, 'r': 13,
      'c': 13, 'd': 13, 'o': 15
    };
    const requiredSize = minSizes[opcode] ?? 11;
    return data.length >= requiredSize;
  }

  static validateStringField(data: Buffer | undefined, offset: number, maxLength = 256) {
    if (!data || offset + 4 > data.length) return { valid: false, length: 0 };
    
    const length = data.readUInt32LE(offset);
    return {
      valid: length <= maxLength && offset + 4 + length <= data.length,
      length
    };
  }
}

export { SecurityValidator };