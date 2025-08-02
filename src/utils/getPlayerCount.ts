import { ServerConfig } from '../types';
import { SAMPQuery } from './sampQuery';

interface PlayerCountResult {
  playerCount: number;
  maxPlayers: number;
  name: string;
  isOnline: boolean;
}

const sampQuery = new SAMPQuery();

export async function getPlayerCount(
  server: ServerConfig,
  guildId: string = 'unknown',
  isMonitoring: boolean = false
): Promise<PlayerCountResult> {
  try {
    const info = await sampQuery.getServerInfo(server, guildId, isMonitoring);

    if (!info) {
      return {
        playerCount: 0,
        maxPlayers: 0,
        name: 'Server Offline',
        isOnline: false,
      };
    }

    return {
      playerCount: info.players,
      maxPlayers: info.maxplayers,
      name: info.hostname,
      isOnline: true,
    };
  } catch (error) {
    console.error('Error getting player count:', error);
    return {
      playerCount: 0,
      maxPlayers: 0,
      name: 'Server Offline',
      isOnline: false,
    };
  }
}