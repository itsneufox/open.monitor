export interface SAMPInfo {
  password: boolean;
  players: number;
  maxplayers: number;
  hostname: string;
  gamemode: string;
  language: string;
}

export interface SAMPPlayer {
  name: string;
  score: number;
}

export interface SAMPDetailedPlayer {
  id: number;
  name: string;
  score: number;
  ping: number;
}

export interface SAMPRules {
  [key: string]: string;
}

export interface SAMPPing {
  time: number;
  sequence: number[];
}

export interface OpenMPExtraInfo {
  discord?: string;
  lightBanner?: string;
  darkBanner?: string;
  logo?: string;
}

export interface SAMPFullInfo {
  info: SAMPInfo;
  rules: SAMPRules;
  players: SAMPPlayer[];
  detailedPlayers: SAMPDetailedPlayer[];
  ping: number;
  isOpenMP?: boolean;
  extraInfo?: OpenMPExtraInfo | null;
}

export interface QueryOptions {
  timeout?: number;
  retries?: number;
  priority?: 'low' | 'normal' | 'high';
}

export interface BehaviorRequest {
  serverIp: string;
  guildId: string;
  userId?: string;
  isMonitoring: boolean; 
  isManualCommand?: boolean;
  timestamp: number;
}

export interface BehaviorResult {
  allowed: boolean;
  reason?: string;
  trustScore: number;
  cooldownMs?: number;
}

export interface QueryRequest {
  server: any;
  guildId: string;
  userId?: string;
  isMonitoring: boolean;
  queryType: 'info' | 'players' | 'detailed' | 'rules' | 'ping';
  isManualCommand?: boolean;
}

export interface QueryResult {
  allowed: boolean;
  reason?: string;
  retryAfter?: number;
  useCache?: boolean;
  priority?: 'low' | 'normal' | 'high';
}