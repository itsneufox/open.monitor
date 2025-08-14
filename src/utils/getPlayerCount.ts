import { ServerConfig, getServerDataKey } from '../types';
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

export async function getPlayerCount(
  server: ServerConfig,
  guildId: string = 'unknown',
  isMonitoring: boolean = false,
  ignoreCache: boolean = false
): Promise<PlayerCountResult> {
  try {
    console.log(`[getPlayerCount] guildId: ${guildId}, server: ${server.ip}:${server.port}, isMonitoring: ${isMonitoring}`);

    const cacheKey = getServerDataKey(guildId, server.id);

    if (!ignoreCache) {
      try {
        const { client: valkey } = await import('./valkey');
        const cachedInfo = await valkey.get(cacheKey);
        if (cachedInfo) {
          const info = JSON.parse(cachedInfo as string);
          return {
            playerCount: info.players || 0,
            maxPlayers: info.maxPlayers || 100,
            name: info.name || server.name,
            isOnline: true,
            isCached: true
          };
        }
      } catch (error) {
        console.log('Cache unavailable, querying server directly');
      }
    }

    const { SecurityValidator } = require('./securityValidator');

    if (!SecurityValidator.canQueryIP(server.ip, guildId, isMonitoring)) {
      console.warn(`Rate limited for ${server.ip}, trying cached data`);

      try {
        const { client: valkey } = await import('./valkey');
        const cachedInfo = await valkey.get(cacheKey);
        if (cachedInfo) {
          const info = JSON.parse(cachedInfo as string);
          return {
            playerCount: info.players || 0,
            maxPlayers: info.maxPlayers || 100,
            name: info.name || server.name,
            isOnline: true,
            isCached: true,
            error: 'Rate limited - showing cached data'
          };
        }
      } catch (cacheError) {
        console.log('No cached data available during rate limit');
      }

      return {
        playerCount: 0,
        maxPlayers: 100,
        name: server.name,
        isOnline: false,
        isCached: false,
        error: 'Rate limited - no cached data available'
      };
    }

    const info = await sampQuery.getServerInfo(server, guildId, isMonitoring);

    if (!info) {
      return {
        playerCount: 0,
        maxPlayers: 100,
        name: 'Server Offline',
        isOnline: false,
        isCached: false
      };
    }

    const result: PlayerCountResult = {
      playerCount: info.players,
      maxPlayers: info.maxplayers,
      name: info.hostname,
      isOnline: true,
      isCached: false
    };

    try {
      const { client: valkey } = await import('./valkey');
      const { TimeUnit } = await import('@valkey/valkey-glide');

      const cacheTime = isMonitoring ? 600 : 60;

      await valkey.set(cacheKey, JSON.stringify({
        players: result.playerCount,
        maxPlayers: result.maxPlayers,
        name: result.name
      }), {
        expiry: {
          type: TimeUnit.Seconds,
          count: cacheTime
        },
      });
    } catch (error) {
      console.log('Failed to cache player data');
    }

    return result;

  } catch (error) {
    console.error('Error getting player count:', error);

    try {
      const { client: valkey } = await import('./valkey');
      const cachedInfo = await valkey.get(getServerDataKey(guildId, server.id));
      if (cachedInfo) {
        const info = JSON.parse(cachedInfo as string);
        return {
          playerCount: info.players || 0,
          maxPlayers: info.maxPlayers || 100,
          name: info.name || server.name,
          isOnline: true,
          isCached: true,
          error: 'Error occurred - showing cached data'
        };
      }
    } catch (cacheError) {
      console.log('No cached data available during error');
    }

    return {
      playerCount: 0,
      maxPlayers: 100,
      name: 'Server Error',
      isOnline: false,
      isCached: false,
      error: 'Server offline or unreachable'
    };
  }
}

export type { PlayerCountResult };