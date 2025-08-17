class InputValidator {
  static validateServerName(name: string): {
    valid: boolean;
    sanitized?: string;
    error?: string;
  } {
    if (!name || typeof name !== 'string') {
      return { valid: false, error: 'Server name is required' };
    }

    if (name.length < 1 || name.length > 64) {
      return {
        valid: false,
        error: 'Server name must be between 1 and 64 characters',
      };
    }

    const sanitized = name
      .replace(/[<>'"&\x00-\x1f\x7f-\x9f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (sanitized.length === 0) {
      return {
        valid: false,
        error: 'Server name contains only invalid characters',
      };
    }

    const suspiciousPatterns = [
      /discord\.gg/i,
      /bit\.ly/i,
      /tinyurl/i,
      /admin/i,
      /moderator/i,
      /owner/i,
      /official/i,
      /@everyone/i,
      /@here/i,
    ];

    if (suspiciousPatterns.some(pattern => pattern.test(sanitized))) {
      return { valid: false, error: 'Server name contains prohibited content' };
    }

    return { valid: true, sanitized };
  }

  static validatePort(port: number): { valid: boolean; error?: string } {
    if (!Number.isInteger(port)) {
      return { valid: false, error: 'Port must be a valid integer' };
    }

    if (port < 1 || port > 65535) {
      return { valid: false, error: 'Port must be between 1 and 65535' };
    }

    const blockedPorts = [
      21, 22, 23, 25, 53, 80, 110, 143, 443, 993, 995, 135, 137, 138, 139, 445,
      1433, 3306, 5432, 6379, 27017, 3389, 5900, 6667, 6697,
    ];

    if (blockedPorts.includes(port)) {
      return { valid: false, error: `Port ${port} is blocked` };
    }

    return { valid: true };
  }

  static validateDiscordId(
    id: string,
    type: string = 'role'
  ): { valid: boolean; error?: string } {
    if (!id || typeof id !== 'string') {
      return { valid: false, error: `${type} ID is required` };
    }

    if (!/^\d{17,19}$/.test(id)) {
      return { valid: false, error: `Invalid ${type} ID format` };
    }

    const timestamp = (BigInt(id) >> 22n) + 1420070400000n;
    const now = BigInt(Date.now());
    if (timestamp < 1420070400000n || timestamp > now + 86400000n) {
      return { valid: false, error: `${type} ID timestamp is invalid` };
    }

    return { valid: true };
  }

  static validateCommandOption(
    value: string,
    maxLength: number = 100
  ): { valid: boolean; sanitized?: string; error?: string } {
    if (!value || typeof value !== 'string') {
      return { valid: false, error: 'Value is required' };
    }

    if (value.length > maxLength) {
      return {
        valid: false,
        error: `Value must be ${maxLength} characters or less`,
      };
    }

    const sanitized = value
      .replace(/[<>'"&\x00-\x1f\x7f-\x9f]/g, '')
      .replace(/\$\{.*?\}/g, '')
      .replace(/`.*?`/g, '')
      .trim();

    if (sanitized.length === 0) {
      return { valid: false, error: 'Value contains only invalid characters' };
    }

    return { valid: true, sanitized };
  }

  static validateChannelName(name: string): {
    valid: boolean;
    sanitized?: string;
    error?: string;
  } {
    if (!name || typeof name !== 'string') {
      return { valid: false, error: 'Channel name is required' };
    }

    const sanitized = name.trim().slice(0, 100);

    if (sanitized.length === 0) {
      return { valid: false, error: 'Channel name cannot be empty' };
    }

    const prohibitedChars = /[\x00-\x1f\x7f]/g;
    if (prohibitedChars.test(sanitized)) {
      return {
        valid: false,
        error: 'Channel name contains invalid characters',
      };
    }

    return { valid: true, sanitized };
  }

  static validateDatabaseKey(key: string): { valid: boolean; error?: string } {
    if (!key || typeof key !== 'string') {
      return { valid: false, error: 'Database key is required' };
    }

    if (!/^[a-zA-Z0-9\.:_-]+$/.test(key)) {
      return {
        valid: false,
        error: 'Database key contains invalid characters',
      };
    }

    if (key.length > 255) {
      return { valid: false, error: 'Database key too long' };
    }

    return { valid: true };
  }

  private static commandUsage = new Map<
    string,
    { lastUsed: number; count: number }
  >();

  static checkCommandRateLimit(
    userId: string,
    command: string,
    limitPerMinute: number = 5
  ): { allowed: boolean; remainingTime?: number } {
    const key = `${userId}:${command}`;
    const now = Date.now();
    const usage = this.commandUsage.get(key) || { lastUsed: 0, count: 0 };

    if (usage.lastUsed < now - 60000) {
      usage.count = 0;
    }

    if (usage.count >= limitPerMinute) {
      return { allowed: false, remainingTime: 60000 - (now - usage.lastUsed) };
    }

    usage.count++;
    usage.lastUsed = now;
    this.commandUsage.set(key, usage);
    return { allowed: true };
  }

  static validateGuildConfig(
    guildId: string,
    config: any
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const validateId = (id: string, type: string) => {
      const result = this.validateDiscordId(id, type);
      if (!result.valid) errors.push(`${type}: ${result.error}`);
    };

    validateId(guildId, 'Guild ID');

    [
      'statusChannel',
      'chartChannel',
      'playerCountChannel',
      'serverIpChannel',
    ].forEach(type => {
      if (config[type]) validateId(config[type], type);
    });

    if (config.managementRoleId) {
      validateId(config.managementRoleId, 'Management role');
    }

    return { valid: errors.length === 0, errors };
  }
}

export { InputValidator };
