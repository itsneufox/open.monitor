import { ServerConfig, getServerDataKey, PlayerCountResult } from '../types';
import { SAMPQuery } from './sampQuery';

const sampQuery = new SAMPQuery();

export async function getPlayerCount(
  server: ServerConfig,
  guildId: string = 'unknown',
  isMonitoring: boolean = false,
  isManualCommand: boolean = false,
  userId?: string
): Promise<PlayerCountResult> {
  try {
    const quickStatus = await sampQuery.getQuickStatus(
      server,
      guildId,
      userId,
      isManualCommand
    );

    if (!quickStatus) {
      return {
        playerCount: 0,
        maxPlayers: 100,
        name: 'Server Offline',
        isOnline: false,
        isCached: false,
        error: 'Server offline or unreachable',
      };
    }

    if (quickStatus.isRateLimited) {
      try {
        const { ServerMetadataCache } = await import('./serverCache');
        const metadata = await ServerMetadataCache.getMetadata(
          server,
          guildId,
          null as any
        );

        return {
          playerCount: quickStatus.players,
          maxPlayers: metadata?.maxPlayers || 100,
          name: metadata?.hostname || server.name,
          isOnline: true,
          isCached: true,
          error: 'rate limit',
        };
      } catch (metaError) {
        return {
          playerCount: quickStatus.players,
          maxPlayers: 100,
          name: server.name,
          isOnline: true,
          isCached: true,
          error: 'rate limit',
        };
      }
    }

    try {
      const { ServerMetadataCache } = await import('./serverCache');
      const metadata = await ServerMetadataCache.getMetadata(
        server,
        guildId,
        null as any
      );

      return {
        playerCount: quickStatus.players,
        maxPlayers: metadata?.maxPlayers || 100,
        name: metadata?.hostname || server.name,
        isOnline: true,
        isCached: false,
      };
    } catch (metaError) {
      return {
        playerCount: quickStatus.players,
        maxPlayers: 100,
        name: server.name,
        isOnline: true,
        isCached: false,
      };
    }
  } catch (error) {
    console.error('Error getting player count:', error);

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
