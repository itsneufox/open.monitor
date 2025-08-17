import { ServerConfig } from '../../types';
import { SAMPProtocol } from './protocol';
import { SAMPParser } from './parser';
import {
  SAMPInfo,
  SAMPPlayer,
  SAMPDetailedPlayer,
  SAMPRules,
  OpenMPExtraInfo,
} from './types';

export class SAMPLegacy {
  static async getQuickStatus(
    server: ServerConfig,
    guildId: string
  ): Promise<{ players: number; isOnline: boolean; gamemode?: string } | null> {
    const data = await SAMPProtocol.query(
      server,
      'i',
      guildId,
      undefined,
      true
    );
    if (!data) return null;

    const info = SAMPParser.parseInfoResponse(data);
    if (!info) return null;

    return {
      players: info.players,
      isOnline: true,
      gamemode: info.gamemode,
    };
  }

  static async getServerInfo(
    server: ServerConfig,
    guildId: string,
    isMonitoring: boolean
  ): Promise<SAMPInfo | null> {
    const data = await SAMPProtocol.query(
      server,
      'i',
      guildId,
      undefined,
      isMonitoring
    );
    return data ? SAMPParser.parseInfoResponse(data) : null;
  }

  static async getServerRules(
    server: ServerConfig,
    guildId: string,
    isMonitoring: boolean
  ): Promise<SAMPRules> {
    const data = await SAMPProtocol.query(
      server,
      'r',
      guildId,
      undefined,
      isMonitoring
    );
    return data ? SAMPParser.parseRulesResponse(data) : {};
  }

  static async getPlayers(
    server: ServerConfig,
    guildId: string
  ): Promise<SAMPPlayer[]> {
    const data = await SAMPProtocol.query(server, 'c', guildId);
    return data ? SAMPParser.parsePlayersResponse(data) : [];
  }

  static async getDetailedPlayers(
    server: ServerConfig,
    guildId: string
  ): Promise<SAMPDetailedPlayer[]> {
    const data = await SAMPProtocol.query(server, 'd', guildId);
    return data ? SAMPParser.parseDetailedPlayersResponse(data) : [];
  }

  static async getPing(server: ServerConfig, guildId: string): Promise<number> {
    const startTime = Date.now();
    const sentSequence = Array.from({ length: 4 }, () =>
      Math.floor(Math.random() * 256)
    );
    const pingPacket = SAMPProtocol.createPingPacket(server.ip, server.port);

    for (let i = 0; i < 4; i++) {
      const sequenceValue = sentSequence[i];
      if (sequenceValue !== undefined) {
        pingPacket.writeUInt8(sequenceValue, 11 + i);
      }
    }

    const data = await SAMPProtocol.query(server, 'p', guildId, pingPacket);
    if (!data) return -1;

    const endTime = Date.now();
    const pingData = SAMPParser.parsePingResponse(data, sentSequence);

    return pingData ? endTime - startTime : -1;
  }

  static async isOpenMP(
    server: ServerConfig,
    guildId: string,
    isMonitoring: boolean
  ): Promise<boolean> {
    try {
      const data = await SAMPProtocol.query(
        server,
        'o',
        guildId,
        undefined,
        isMonitoring
      );
      if (data !== null && data.length > 11) {
        return true;
      }

      const rules = await this.getServerRules(server, guildId, isMonitoring);

      if (
        rules.allowed_clients ||
        (rules.version && rules.version.includes('omp '))
      ) {
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  static async getOpenMPExtraInfo(
    server: ServerConfig,
    guildId: string,
    isMonitoring: boolean
  ): Promise<OpenMPExtraInfo | null> {
    try {
      const data = await SAMPProtocol.query(
        server,
        'o',
        guildId,
        undefined,
        isMonitoring
      );
      return data ? SAMPParser.parseOpenMPExtraInfo(data) : null;
    } catch (error) {
      return null;
    }
  }
}
