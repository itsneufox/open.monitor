import { ServerConfig, getServerDataKey, PlayerCountResult } from '../types';
import { SAMPQuery } from './sampQuery';

const sampQuery = new SAMPQuery();

export async function getPlayerCount(
  server: ServerConfig,
  guildId: string = 'unknown',
  isMonitoring: boolean = false,
  ignoreCache: boolean = false
): Promise<PlayerCountResult> {
  try {
    const cacheKey = getServerDataKey(guildId, server.id);
    
    if (!ignoreCache) {
      try {
        const { client: valkey } = await import('./valkey');
        const cachedInfo = await valkey.get(cacheKey);
        if (cachedInfo) {
          const info = JSON.parse(cachedInfo as string);
          return {
            playerCount: info.players,
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
      console.warn(`Rate limited for ${server.ip}, returning error status`);
      
      try {
        const { ServerMetadataCache } = await import('./serverCache');
        const cachedMetadata = await ServerMetadataCache.getMetadata(server, guildId, null as any);
        
        return {
          playerCount: 0,
          maxPlayers: cachedMetadata?.maxPlayers || 100,
          name: cachedMetadata?.hostname || server.name,
          isOnline: false,
          isCached: false,
          error: 'Bot rate limited - please try again later'
        };
      } catch (metaError) {
        return {
          playerCount: 0,
          maxPlayers: 100,
          name: server.name,
          isOnline: false,
          isCached: false,
          error: 'Bot rate limited - please try again later'
        };
      }
    }

    const quickStatus = await sampQuery.getQuickStatus(server, guildId);

    if (!quickStatus) {
      return {
        playerCount: 0,
        maxPlayers: 100,
        name: 'Server Offline',
        isOnline: false,
        isCached: false
      };
    }

    try {
      const { ServerMetadataCache } = await import('./serverCache');
      const metadata = await ServerMetadataCache.getMetadata(server, guildId, null as any);

      const result = {
        playerCount: quickStatus.players,
        maxPlayers: metadata?.maxPlayers || 100,
        name: metadata?.hostname || server.name,
        isOnline: true,
        isCached: false
      };

      try {
        const { client: valkey } = await import('./valkey');
        const { TimeUnit } = await import('@valkey/valkey-glide');
        
        const cacheTime = isMonitoring ? 240 : 60;
       
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
    } catch (metaError) {
      return {
        playerCount: quickStatus.players,
        maxPlayers: 100,
        name: server.name,
        isOnline: true,
        isCached: false
      };
    }

  } catch (error) {
    console.error('Error getting player count:', error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isRateLimit = errorMessage.includes('rate limit') || 
                       errorMessage.includes('too many requests');
    
    return {
      playerCount: 0,
      maxPlayers: 100,
      name: 'Server Error',
      isOnline: false,
      isCached: false,
      error: isRateLimit ? 'Bot rate limited - try again later' : 'Server offline or unreachable'
    };
  }
}