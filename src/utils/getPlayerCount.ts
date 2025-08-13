import { ServerConfig, getServerDataKey } from '../types';
import { SAMPInfo, SAMPQuery } from './sampQuery';

interface PlayerCountResult {
  playerCount: number;
  maxPlayers: number;
  name: string;
  isOnline: boolean;
  isCached: boolean;
}

const sampQuery = new SAMPQuery();

export async function getPlayerCount(
  server: ServerConfig,
  guildId: string = 'unknown',
  isMonitoring: boolean = false,
  ignoreCache: boolean = false
): Promise<PlayerCountResult> {
  try {
    // Declare cacheKey at function level
    const cacheKey = getServerDataKey(guildId, server.id);
    
    if (!ignoreCache) {
      try {
        const { client: valkey } = await import('./valkey');
        let cachedInfo = await valkey.get(cacheKey);
        if (cachedInfo) {
          const info: SAMPInfo = JSON.parse(cachedInfo as string);
          if (info) {
            return {
              playerCount: info.players,
              maxPlayers: info.maxplayers,
              name: info.hostname,
              isOnline: true,
              isCached: true
            };
          }
        }
      } catch (error) {
        console.log('Cache unavailable, continuing without cache');
      }
    }

    const info = await sampQuery.getServerInfo(server, guildId, isMonitoring);

    if (!info) {
      return {
        playerCount: 0,
        maxPlayers: 0,
        name: 'Server Offline',
        isOnline: false,
        isCached: false
      };
    }

    try {
      const { client: valkey } = await import('./valkey');
      const { TimeUnit } = await import('@valkey/valkey-glide');
     
      await valkey.set(cacheKey, JSON.stringify(info), {
        expiry: {
          type: TimeUnit.Seconds,
          count: Number(process.env.VALKEY_KEY_EXPIRY_SECONDS) || 60
        },
      });
    } catch (error) {
      console.log('Failed to cache data, continuing without cache');
    }

    return {
      playerCount: info.players,
      maxPlayers: info.maxplayers,
      name: info.hostname,
      isOnline: true,
      isCached: false
    };

  } catch (error) {
    console.error('Error getting player count:', error);
    return {
      playerCount: 0,
      maxPlayers: 0,
      name: 'Server Offline',
      isOnline: false,
      isCached: false
    };
  }
}