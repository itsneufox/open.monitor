import { Client, Collection } from 'discord.js';
import Keyv from 'keyv';

// Basic server configuration
export interface ServerConfig {
  id: string;              // Unique ID: "ip:port"
  name: string;            // Friendly name
  ip: string;
  port: number;
  addedAt: number;         // Timestamp
  addedBy: string;         // User ID who added it
}

// Simple server info for query functions
export interface SimpleServer {
  ip: string;
  port: number;
}

// Guild's monitoring configuration
export interface IntervalConfig {
  activeServerId?: string;         // Which server is currently being monitored
  statusChannel?: string;          // Channel for status embeds
  chartChannel?: string;           // Channel for daily charts  
  serverIpChannel?: string;        // Channel to rename with server IP
  playerCountChannel?: string;     // Channel to rename with player count
  enabled: boolean;
  next: number;                    // Next update time
  statusMessage: string | null;    // Message ID of current status message
  managementRoleId?: string;       // Role that can manage server settings
}

// Chart data for a specific server
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

// Uptime statistics for a specific server
export interface UptimeStats {
  uptime: number;
  downtime: number;
}

// Custom Discord client with database connections
export interface CustomClient extends Client {
  commands: Collection<string, any>;
  
  // Database collections
  servers: Keyv<ServerConfig[]>;          // Array of servers per guild
  intervals: Keyv<IntervalConfig>;        // Monitoring config per guild
  maxPlayers: Keyv<ChartData>;           // Chart data per server (key: "ip:port")
  uptimes: Keyv<UptimeStats>;            // Uptime stats per server (key: "ip:port")
  
  // In-memory cache for faster access
  guildConfigs: Collection<string, {
    servers: ServerConfig[];
    interval?: IntervalConfig;
  }>;
}

// Helper function to convert ServerConfig to SimpleServer
export function toSimpleServer(server: ServerConfig): SimpleServer {
  return {
    ip: server.ip,
    port: server.port
  };
}