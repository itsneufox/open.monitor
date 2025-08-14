import { InputValidator } from '../../../utils/inputValidator';
import { SecurityValidator } from '../../../utils/securityValidator';

export interface ServerValidationResult {
  valid: boolean;
  error?: string;
  sanitizedName?: string | null;
}

export function validateServerInput(ip: string, port: number, name: string | null): ServerValidationResult {
  const portValidation = InputValidator.validatePort(port);
  if (!portValidation.valid) {
    return { valid: false, error: portValidation.error! };
  }

  let sanitizedName: string | null = name;
  if (name) {
    const nameValidation = InputValidator.validateServerName(name);
    if (!nameValidation.valid) {
      return { valid: false, error: `Server name invalid: ${nameValidation.error!}` };
    }
    sanitizedName = nameValidation.sanitized!;
  }

  const ipValidation = InputValidator.validateCommandOption(ip, 253);
  if (!ipValidation.valid) {
    return { valid: false, error: `IP address invalid: ${ipValidation.error!}` };
  }

  if (!SecurityValidator.validateServerIP(ip)) {
    return {
      valid: false,
      error: 'Invalid or blocked IP address. Please use a valid public IPv4 address.\n\n' +
        '**Blocked ranges:**\n' +
        '• Private networks (10.x.x.x, 192.168.x.x, 172.16-31.x.x)\n' +
        '• Loopback (127.x.x.x) - only allowed in development\n' +
        '• Invalid ranges (0.x.x.x, 169.254.x.x, 224.x.x.x, 255.x.x.x)'
    };
  }

  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;

  const isValidIP = ipRegex.test(ip);
  const isValidDomain = domainRegex.test(ip) && ip.includes('.') && !ip.startsWith('.') && !ip.endsWith('.');

  if (!isValidIP && !isValidDomain) {
    return {
      valid: false,
      error: 'Invalid address format. Please provide a valid IPv4 address (e.g., 192.168.1.100) or domain name (e.g., server.example.com).'
    };
  }

  if (isValidIP) {
    const octets = ip.split('.').map(Number);
    if (octets.some(octet => octet < 0 || octet > 255)) {
      return { valid: false, error: 'Invalid IP address. Each octet must be between 0 and 255.' };
    }
  }

  if (ip.startsWith('127.') || ip === '::1') {
    return { valid: false, error: 'Localhost addresses (127.x.x.x and ::1) are not allowed.' };
  }

  return { valid: true, sanitizedName };
}

export function canQueryServer(ip: string, guildId: string): boolean {
  return SecurityValidator.canQueryIP(ip, guildId);
}

export function validateServerExists(serverIdentifier: string, servers: any[]): { valid: boolean; server?: any; error?: string } {
  if (!serverIdentifier) {
    return { valid: false, error: 'Server identifier is required.' };
  }

  const server = servers.find(
    s => s.id === serverIdentifier || s.name.toLowerCase() === serverIdentifier.toLowerCase()
  );

  if (!server) {
    return { valid: false, error: 'Server not found. Use `/server list` to see available servers.' };
  }

  return { valid: true, server };
}

export function isValidServerName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  if (name.length < 1 || name.length > 64) return false;
  
  const sanitized = name.replace(/[<>'"&\x00-\x1f\x7f-\x9f]/g, '').trim();
  return sanitized.length > 0;
}

export function sanitizeServerName(name: string): string {
  return name
    .replace(/[<>'"&\x00-\x1f\x7f-\x9f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64);
}