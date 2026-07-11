import { ServerConfig, getServerDataKey } from '../types';
import {
  type CachedPlayerInfo,
  getCachedPlayerInfo,
  setCachedPlayerInfo,
} from './playerCountCache';
import { SAMPQuery } from './sampQuery';

interface PlayerCountResult {
  playerCount: number;
  maxPlayers: number;
  name: string;
  isOnline: boolean;
  isCached: boolean;
  error?: string;
}

const sampQuery = new SAMPQuery();

function createCachedResult(
  cachedInfo: CachedPlayerInfo,
  server: ServerConfig,
  error?: string
): PlayerCountResult {
  return {
    playerCount: cachedInfo.players || 0,
    maxPlayers: cachedInfo.maxPlayers || 100,
    name: cachedInfo.name || server.name,
    isOnline: true,
    isCached: true,
    ...(error ? { error } : {}),
  };
}

export async function getPlayerCount(
  server: ServerConfig,
  guildId: string = 'unknown',
  isMonitoring: boolean = false,
  ignoreCache: boolean = false
): Promise<PlayerCountResult> {
  try {
    console.log(
      `[getPlayerCount] guildId: ${guildId}, server: ${server.ip}:${server.port}, isMonitoring: ${isMonitoring}`
    );

    const cacheKey = getServerDataKey(guildId, server.id);

    if (!ignoreCache) {
      const cachedInfo = getCachedPlayerInfo(cacheKey);
      if (cachedInfo) {
        return createCachedResult(cachedInfo, server);
      }
    }

    const { SecurityValidator } = await import('./securityValidator');

    // Check if server is hardcoded banned
    const serverAddress = `${server.ip}:${server.port}`;
    const banCheck = SecurityValidator.isIPBanned(serverAddress);
    if (banCheck.banned) {
      console.warn(
        `Blocked query to banned server: ${serverAddress} (${banCheck.reason})`
      );
      return {
        playerCount: 0,
        maxPlayers: 0,
        name: 'Server Banned',
        isOnline: false,
        isCached: false,
        error: banCheck.reason || 'Server is banned',
      };
    }

    if (!SecurityValidator.canQueryIP(server.ip, guildId, isMonitoring)) {
      console.warn(`Rate limited for ${server.ip}, trying cached data`);

      const cachedInfo = getCachedPlayerInfo(cacheKey);
      if (cachedInfo) {
        return createCachedResult(
          cachedInfo,
          server,
          'Rate limited - showing cached data'
        );
      }

      return {
        playerCount: 0,
        maxPlayers: 100,
        name: server.name,
        isOnline: false,
        isCached: false,
        error: 'Rate limited - no cached data available',
      };
    }

    const info = await sampQuery.getServerInfo(server, guildId, isMonitoring);

    if (!info) {
      // Try to use cached data on timeout/failure
      const cachedInfo = getCachedPlayerInfo(cacheKey);
      if (cachedInfo) {
        console.log(
          `Using cached data for ${server.ip}:${server.port} after query failure`
        );
        return createCachedResult(
          cachedInfo,
          server,
          'Query timeout - showing cached data'
        );
      }

      return {
        playerCount: 0,
        maxPlayers: 100,
        name: 'Server Offline',
        isOnline: false,
        isCached: false,
      };
    }

    const result: PlayerCountResult = {
      playerCount: info.players,
      maxPlayers: info.maxplayers,
      name: info.hostname,
      isOnline: true,
      isCached: false,
    };

    const cacheTime = isMonitoring ? 600 : 60;
    setCachedPlayerInfo(
      cacheKey,
      {
        players: result.playerCount,
        maxPlayers: result.maxPlayers,
        name: result.name,
      },
      cacheTime
    );

    return result;
  } catch (error) {
    console.error('Error getting player count:', error);

    const cachedInfo = getCachedPlayerInfo(
      getServerDataKey(guildId, server.id)
    );
    if (cachedInfo) {
      return createCachedResult(
        cachedInfo,
        server,
        'Error occurred - showing cached data'
      );
    }

    return {
      playerCount: 0,
      maxPlayers: 100,
      name: 'Server Error',
      isOnline: false,
      isCached: false,
      error: 'Server offline or unreachable',
    };
  }
}

export type { PlayerCountResult };
