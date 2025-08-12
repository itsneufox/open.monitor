import { ServerConfig } from '../types';
import { SAMPInfo, SAMPQuery } from './sampQuery';
import { client as valkey } from './valkey';
import { TimeUnit } from "@valkey/valkey-glide";


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
    if (!ignoreCache) {
      let cachedInfo = await valkey.get(server.id);
      if (cachedInfo) {
        const info: SAMPInfo = (JSON.parse(cachedInfo as any)) as SAMPInfo;
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

    valkey.set(server.id, JSON.stringify(info), {
      expiry: {
        type: TimeUnit.Seconds,
        count: Number(process.env.VALKEY_KEY_EXPIRY_SECONDS) || 60
      },
    });

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
