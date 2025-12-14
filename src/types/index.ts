import { Client, Collection } from 'discord.js';
import Keyv from 'keyv';
import { RateLimitManager } from '../utils/rateLimitManager';

export interface ServerConfig {
  id: string;
  name: string;
  ip: string;
  port: number;
  addedAt: number;
  addedBy: string;
  customBanner?: string; // Custom banner image URL (overrides open.mp banner)
  customLogo?: string; // Custom logo image URL (overrides open.mp logo)
}

export interface SimpleServer {
  ip: string;
  port: number;
}

export interface IntervalConfig {
  activeServerId?: string;
  statusChannel?: string;
  chartChannel?: string;
  serverIpChannel?: string;
  playerCountChannel?: string;
  voiceChannelStyle?: 'emoji' | 'text';
  enabled: boolean;
  next: number;
  statusMessage: string | null;
  managementRoleId?: string;
  dataLossNotificationSent?: boolean;
  preferredLanguage?: 'en' | 'pt' | 'es';
  lastVoiceUpdate?: number;
  statusTheme?: 'classic' | 'detailed';
  updateIntervalMinutes?: number; // Custom monitoring interval in minutes (2-30)
}

export interface PlayerCountResult {
  playerCount: number;
  maxPlayers: number;
  name: string;
  isOnline: boolean;
  isCached: boolean;
  error?: string;
}

export interface ChartData {
  maxPlayersToday: number;
  days: Array<{
    value: number;
    date: number;
  }>;
  name: string;
  maxPlayers: number;
  msg?: string;
}

export interface UptimeStats {
  uptime: number;
  downtime: number;
  lastCheckTime?: number; // Timestamp of last uptime check (to detect bot downtime gaps)
}

export interface GuildConfig {
  servers: ServerConfig[];
  interval?: IntervalConfig;
}

export interface CustomClient extends Client {
  commands: Collection<
    string,
    { data: { name: string }; execute: (...args: unknown[]) => Promise<void> }
  >;
  servers: Keyv<ServerConfig[]>;
  intervals: Keyv<IntervalConfig>;
  maxPlayers: Keyv<ChartData>;
  uptimes: Keyv<UptimeStats>;
  rateLimitManager: RateLimitManager;
  guildConfigs: Collection<string, GuildConfig>;
}

export function toSimpleServer(server: ServerConfig): SimpleServer {
  return {
    ip: server.ip,
    port: server.port,
  };
}

export function getServerDataKey(guildId: string, serverId: string): string {
  return `${guildId}:${serverId}`;
}
