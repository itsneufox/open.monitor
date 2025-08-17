import { Client, Collection } from 'discord.js';
import Keyv from 'keyv';

export interface ServerConfig {
  id: string;
  name: string;
  ip: string;
  port: number;
  addedAt: number;
  addedBy: string;
  timezone: string;
  dayResetHour: number;
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
  enabled: boolean;
  next: number;
  statusMessage: string | null;
  managementRoleId?: string;
  dataLossNotificationSent?: boolean;
  preferredLanguage?: 'en' | 'pt' | 'es';
  lastVoiceUpdate?: number;
}

export interface ChartData {
  maxPlayersToday: number;
  days: Array<{
    value: number;
    date: number;
    timezone: string;
    dayResetHour: number;
  }>;
  name: string;
  maxPlayers: number;
  msg?: string;
}

export interface UptimeStats {
  uptime: number;
  downtime: number;
}

export interface ServerMetadata {
  hostname: string;
  gamemode: string;
  language: string;
  version: string;
  isOpenMP: boolean;
  maxPlayers: number;
  banner?: string;
  logo?: string;
  lastUpdated: number;
}

export interface PlayerCountResult {
  playerCount: number;
  maxPlayers: number;
  name: string;
  isOnline: boolean;
  isCached: boolean;
  error?: string;
}

export interface GuildConfig {
  servers: ServerConfig[];
  interval?: IntervalConfig;
}

export interface CustomClient extends Client {
  commands: Collection<string, any>;
  servers: Keyv<ServerConfig[]>;
  intervals: Keyv<IntervalConfig>;
  maxPlayers: Keyv<ChartData>;
  uptimes: Keyv<UptimeStats>;
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
