import { ServerConfig, ServerMetadata, CustomClient } from '../../types';
import { SAMPRateLimitManager } from './rateLimitManager';
import { SAMPProtocol } from './protocol';
import { SAMPParser } from './parser';
import { SAMPLegacy } from './legacy';
import {
  SAMPInfo,
  SAMPPlayer,
  SAMPDetailedPlayer,
  SAMPRules,
  SAMPFullInfo,
  OpenMPExtraInfo,
  QueryOptions,
} from './types';

export class SAMPQuery {
  constructor(client?: CustomClient) {
    if (client && !SAMPRateLimitManager.isInitialized) {
      SAMPRateLimitManager.initialize(client);
    }
  }

  async getQuickStatus(
    server: ServerConfig,
    guildId: string = 'unknown',
    userId?: string,
    isManualCommand: boolean = false
  ): Promise<{
    players: number;
    isOnline: boolean;
    isRateLimited?: boolean;
  } | null> {
    await SAMPRateLimitManager.ensureInitialized();

    if (
      !SAMPRateLimitManager.isInitialized ||
      !SAMPRateLimitManager.protection
    ) {
      const cacheKey = `quick_status:${server.ip}:${server.port}`;
      const staleData = await SAMPRateLimitManager.cache?.get<{
        players: number;
        isOnline: boolean;
      }>(cacheKey);
      if (staleData) {
        return {
          ...staleData,
          isRateLimited: true,
        };
      }

      return null;
    }

    const protectionResult =
      await SAMPRateLimitManager.protection.checkQueryPermission({
        server,
        guildId,
        ...(userId && { userId }),
        isMonitoring: true,
        queryType: 'info',
        isManualCommand,
      });

    if (!protectionResult.allowed) {
      console.log(`Server info query blocked: ${protectionResult.reason}`);

      const cacheKey = `quick_status:${server.ip}:${server.port}`;
      const staleData = await SAMPRateLimitManager.cache?.get<{
        players: number;
        isOnline: boolean;
      }>(cacheKey);
      if (staleData) {
        return {
          ...staleData,
          isRateLimited: true,
        };
      }

      return null;
    }

    try {
      const startTime = Date.now();
      const data = await SAMPProtocol.query(
        server,
        'i',
        guildId,
        undefined,
        true,
        isManualCommand
      );
      const responseTime = Date.now() - startTime;

      if (!data) {
        await SAMPRateLimitManager.protection.recordQueryResult(
          server,
          false,
          responseTime
        );

        const cacheKey = `quick_status:${server.ip}:${server.port}`;
        const cached = await SAMPRateLimitManager.cache?.get<{
          players: number;
          isOnline: boolean;
        }>(cacheKey);
        if (cached) {
          return {
            ...cached,
            isRateLimited: true,
          };
        }

        return null;
      }

      const info = SAMPParser.parseInfoResponse(data);
      if (!info) {
        await SAMPRateLimitManager.protection.recordQueryResult(
          server,
          false,
          responseTime
        );

        const cacheKey = `quick_status:${server.ip}:${server.port}`;
        const cached = await SAMPRateLimitManager.cache?.get<{
          players: number;
          isOnline: boolean;
        }>(cacheKey);
        if (cached) {
          return {
            ...cached,
            isRateLimited: true,
          };
        }

        return null;
      }

      const result = {
        players: info.players,
        isOnline: true,
        gamemode: info.gamemode,
      };

      const cacheKey = `quick_status:${server.ip}:${server.port}`;
      await SAMPRateLimitManager.cache?.set(cacheKey, result, 120000, 300000);
      await SAMPRateLimitManager.protection.recordQueryResult(
        server,
        true,
        responseTime
      );

      return result;
    } catch (error) {
      await SAMPRateLimitManager.protection.recordQueryResult(server, false);
      console.error('Query error:', error);

      const cacheKey = `quick_status:${server.ip}:${server.port}`;
      const cached = await SAMPRateLimitManager.cache?.get<{
        players: number;
        isOnline: boolean;
      }>(cacheKey);
      if (cached) {
        return {
          ...cached,
          isRateLimited: true,
        };
      }

      return null;
    }
  }

  async getServerMetadata(
    server: ServerConfig,
    guildId: string = 'unknown',
    userId?: string,
    isManualCommand: boolean = false
  ): Promise<ServerMetadata | null> {
    await SAMPRateLimitManager.ensureInitialized();

    try {
      
      const metadataCacheKey = `server_metadata:${server.ip}:${server.port}`;
      const cachedMetadata = await SAMPRateLimitManager.cache?.get<ServerMetadata>(metadataCacheKey);

      
      if (cachedMetadata && !isManualCommand && (Date.now() - cachedMetadata.lastUpdated) < 3600000) { 
        return cachedMetadata;
      }

      if (isManualCommand) {
        console.log(`Fetching full metadata for ${server.ip}:${server.port}`);
      }

      const info = await this.getServerInfo(
        server,
        guildId,
        !isManualCommand,
        userId,
        isManualCommand
      );
      if (!info) return null;

      const openMPCacheKey = `is_openmp:${server.ip}:${server.port}`;
      let isOpenMP = await SAMPRateLimitManager.cache?.get<boolean>(openMPCacheKey);

      if (isOpenMP === null || isOpenMP === undefined) {
        isOpenMP = await this.isOpenMP(
          server,
          guildId,
          !isManualCommand,
          userId,
          isManualCommand
        );
      }

      let version = 'Unknown';
      let banner: string | undefined;
      let logo: string | undefined;

      
      const extraInfoCacheKey = `openmp_extra:${server.ip}:${server.port}`;
      let extraInfo = await SAMPRateLimitManager.cache?.get<OpenMPExtraInfo>(extraInfoCacheKey);

      
      
      
      
      const needsFreshExtraInfo = isManualCommand || !extraInfo || (!extraInfo.darkBanner && !extraInfo.lightBanner && !extraInfo.logo);

      try {
        const rules = await this.getServerRules(
          server,
          guildId,
          !isManualCommand,
          userId,
          isManualCommand
        );

        version = rules.version || rules.Ver || rules.v || (isOpenMP ? 'open.mp' : 'SA:MP 0.3.7');

        if (isOpenMP) {
          if (needsFreshExtraInfo) {
            try {
              extraInfo = await this.getOpenMPExtraInfo(
                server,
                guildId,
                !isManualCommand,
                userId,
                isManualCommand
              );
              console.log(`Fetched fresh extra info for ${server.ip}:${server.port}`);
            } catch (error) {
              console.log('Failed to get fresh open.mp extras:', error);
            }
          }

          if (extraInfo) {
            banner = extraInfo.darkBanner || extraInfo.lightBanner;
            logo = extraInfo.logo;
          }
        }
      } catch (error) {
        console.log('Failed to get rules:', error);
        version = isOpenMP ? 'open.mp' : 'SA:MP 0.3.7';
      }

      const metadata: ServerMetadata = {
        hostname: info.hostname,
        gamemode: info.gamemode,
        language: info.language,
        version,
        isOpenMP,
        maxPlayers: info.maxplayers,
        lastUpdated: Date.now(),
      };

      if (banner) {
        metadata.banner = banner;
      }
      if (logo) {
        metadata.logo = logo;
      }

      
      await SAMPRateLimitManager.cache?.set(metadataCacheKey, metadata, 3600000, 7200000);

      return metadata;
    } catch (error) {
      console.error('Error fetching server metadata:', error);
      return null;
    }
  }

  async getServerInfo(
    server: ServerConfig,
    guildId: string = 'unknown',
    isMonitoring: boolean = false,
    userId?: string,
    isManualCommand: boolean = false
  ): Promise<SAMPInfo | null> {
    await SAMPRateLimitManager.ensureInitialized();

    if (
      !SAMPRateLimitManager.isInitialized ||
      !SAMPRateLimitManager.protection
    ) {
      return SAMPLegacy.getServerInfo(server, guildId, isMonitoring);
    }

    const cacheKey = `server_info:${server.ip}:${server.port}`;
    const cached = await SAMPRateLimitManager.cache?.get<SAMPInfo>(cacheKey);

    if (cached && isMonitoring && !isManualCommand) {
      return cached;
    }

    const protectionResult =
      await SAMPRateLimitManager.protection.checkQueryPermission({
        server,
        guildId,
        ...(userId && { userId }),
        isMonitoring,
        queryType: 'info',
        isManualCommand,
      });

    if (!protectionResult.allowed) {
      console.log(`Server info query blocked: ${protectionResult.reason}`);
      return protectionResult.useCache ? cached || null : null;
    }

    try {
      const startTime = Date.now();
      const data = await SAMPProtocol.query(
        server,
        'i',
        guildId,
        undefined,
        isMonitoring,
        isManualCommand
      );
      const responseTime = Date.now() - startTime;

      if (!data) {
        await SAMPRateLimitManager.protection.recordQueryResult(
          server,
          false,
          responseTime
        );
        return null;
      }

      const info = SAMPParser.parseInfoResponse(data);
      if (info) {
        const cacheDuration = isMonitoring ? 300000 : 180000;
        await SAMPRateLimitManager.cache?.set(
          cacheKey,
          info,
          cacheDuration,
          cacheDuration * 2
        );
        await SAMPRateLimitManager.protection.recordQueryResult(
          server,
          true,
          responseTime
        );
      } else {
        await SAMPRateLimitManager.protection.recordQueryResult(
          server,
          false,
          responseTime
        );
      }

      return info;
    } catch (error) {
      await SAMPRateLimitManager.protection?.recordQueryResult(server, false);
      console.error('Server info query error:', error);
      return null;
    }
  }

  async getServerRules(
    server: ServerConfig,
    guildId: string = 'unknown',
    isMonitoring: boolean = false,
    userId?: string,
    isManualCommand: boolean = false
  ): Promise<SAMPRules> {
    await SAMPRateLimitManager.ensureInitialized();

    if (
      !SAMPRateLimitManager.isInitialized ||
      !SAMPRateLimitManager.protection
    ) {
      return SAMPLegacy.getServerRules(server, guildId, isMonitoring);
    }

    const cacheKey = `server_rules:${server.ip}:${server.port}`;
    const cached = await SAMPRateLimitManager.cache?.get<SAMPRules>(cacheKey);

    if (cached && !isManualCommand) {
      return cached;
    }

    const protectionResult =
      await SAMPRateLimitManager.protection.checkQueryPermission({
        server,
        guildId,
        ...(userId && { userId }),
        isMonitoring,
        queryType: 'rules',
        isManualCommand,
      });

    if (!protectionResult.allowed) {
      console.log(`Server rules query blocked: ${protectionResult.reason}`);
      return cached || {};
    }

    try {
      const startTime = Date.now();
      const data = await SAMPProtocol.query(
        server,
        'r',
        guildId,
        undefined,
        isMonitoring,
        isManualCommand
      );
      const responseTime = Date.now() - startTime;

      if (!data) {
        await SAMPRateLimitManager.protection.recordQueryResult(
          server,
          false,
          responseTime
        );
        return {};
      }

      const rules = SAMPParser.parseRulesResponse(data);
      if (Object.keys(rules).length > 0) {
        await SAMPRateLimitManager.cache?.set(
          cacheKey,
          rules,
          1800000,
          3600000
        );
        await SAMPRateLimitManager.protection.recordQueryResult(
          server,
          true,
          responseTime
        );
      } else {
        await SAMPRateLimitManager.protection.recordQueryResult(
          server,
          false,
          responseTime
        );
      }

      return rules;
    } catch (error) {
      await SAMPRateLimitManager.protection?.recordQueryResult(server, false);
      console.error('Server rules query error:', error);
      return {};
    }
  }

  async getPlayers(
    server: ServerConfig,
    guildId: string = 'unknown',
    userId?: string,
    isManualCommand: boolean = false
  ): Promise<SAMPPlayer[]> {
    await SAMPRateLimitManager.ensureInitialized();

    if (
      !SAMPRateLimitManager.isInitialized ||
      !SAMPRateLimitManager.protection
    ) {
      return SAMPLegacy.getPlayers(server, guildId);
    }

    const protectionResult =
      await SAMPRateLimitManager.protection.checkQueryPermission({
        server,
        guildId,
        ...(userId && { userId }),
        isMonitoring: false,
        queryType: 'players',
        isManualCommand,
      });

    if (!protectionResult.allowed) {
      console.log(`Players query blocked: ${protectionResult.reason}`);
      return [];
    }

    try {
      const startTime = Date.now();
      const data = await SAMPProtocol.query(
        server,
        'c',
        guildId,
        undefined,
        false,
        isManualCommand
      );
      const responseTime = Date.now() - startTime;

      if (!data) {
        await SAMPRateLimitManager.protection.recordQueryResult(
          server,
          false,
          responseTime
        );
        return [];
      }

      const players = SAMPParser.parsePlayersResponse(data);
      await SAMPRateLimitManager.protection.recordQueryResult(
        server,
        true,
        responseTime
      );
      return players;
    } catch (error) {
      await SAMPRateLimitManager.protection?.recordQueryResult(server, false);
      console.error('Players query error:', error);
      return [];
    }
  }

  async getDetailedPlayers(
    server: ServerConfig,
    guildId: string = 'unknown',
    userId?: string,
    isManualCommand: boolean = false
  ): Promise<SAMPDetailedPlayer[]> {
    await SAMPRateLimitManager.ensureInitialized();

    if (
      !SAMPRateLimitManager.isInitialized ||
      !SAMPRateLimitManager.protection
    ) {
      return SAMPLegacy.getDetailedPlayers(server, guildId);
    }

    const protectionResult =
      await SAMPRateLimitManager.protection.checkQueryPermission({
        server,
        guildId,
        ...(userId && { userId }),
        isMonitoring: false,
        queryType: 'detailed',
        isManualCommand,
      });

    if (!protectionResult.allowed) {
      console.log(`Detailed players query blocked: ${protectionResult.reason}`);
      return [];
    }

    try {
      const startTime = Date.now();
      const data = await SAMPProtocol.query(
        server,
        'd',
        guildId,
        undefined,
        false,
        isManualCommand
      );
      const responseTime = Date.now() - startTime;

      if (!data) {
        await SAMPRateLimitManager.protection.recordQueryResult(
          server,
          false,
          responseTime
        );
        return [];
      }

      const players = SAMPParser.parseDetailedPlayersResponse(data);
      await SAMPRateLimitManager.protection.recordQueryResult(
        server,
        true,
        responseTime
      );
      return players;
    } catch (error) {
      await SAMPRateLimitManager.protection?.recordQueryResult(server, false);
      console.error('Detailed players query error:', error);
      return [];
    }
  }

  async getPing(
    server: ServerConfig,
    guildId: string = 'unknown',
    userId?: string,
    isManualCommand: boolean = false
  ): Promise<number> {
    await SAMPRateLimitManager.ensureInitialized();

    if (
      !SAMPRateLimitManager.isInitialized ||
      !SAMPRateLimitManager.protection
    ) {
      return SAMPLegacy.getPing(server, guildId);
    }

    const protectionResult =
      await SAMPRateLimitManager.protection.checkQueryPermission({
        server,
        guildId,
        ...(userId && { userId }),
        isMonitoring: false,
        queryType: 'ping',
        isManualCommand,
      });

    if (!protectionResult.allowed) {
      console.log(`Ping query blocked: ${protectionResult.reason}`);
      return -1;
    }

    try {
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

      const data = await SAMPProtocol.query(
        server,
        'p',
        guildId,
        pingPacket,
        false,
        isManualCommand
      );
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      if (!data) {
        await SAMPRateLimitManager.protection.recordQueryResult(
          server,
          false,
          responseTime
        );
        return -1;
      }

      const pingData = SAMPParser.parsePingResponse(data, sentSequence);
      await SAMPRateLimitManager.protection.recordQueryResult(
        server,
        true,
        responseTime
      );

      return pingData ? responseTime : -1;
    } catch (error) {
      await SAMPRateLimitManager.protection?.recordQueryResult(server, false);
      console.error('Ping query error:', error);
      return -1;
    }
  }

  async isOpenMP(
    server: ServerConfig,
    guildId: string = 'unknown',
    isMonitoring: boolean = false,
    userId?: string,
    isManualCommand: boolean = false
  ): Promise<boolean> {
    await SAMPRateLimitManager.ensureInitialized();

    if (
      !SAMPRateLimitManager.isInitialized ||
      !SAMPRateLimitManager.protection
    ) {
      return SAMPLegacy.isOpenMP(server, guildId, isMonitoring);
    }

    const cacheKey = `is_openmp:${server.ip}:${server.port}`;
    const cached = await SAMPRateLimitManager.cache?.get<boolean>(cacheKey);

    if (cached !== null && cached !== undefined && !isManualCommand) {
      return cached;
    }

    try {
      const data = await SAMPProtocol.query(
        server,
        'o',
        guildId,
        undefined,
        isMonitoring,
        isManualCommand
      );
      let isOpenMP = false;

      if (data !== null && data.length > 11) {
        isOpenMP = true;
      } else {
        if (isManualCommand) {
          const rules = await this.getServerRules(
            server,
            guildId,
            isMonitoring,
            userId,
            isManualCommand
          );
          if (rules.allowed_clients) {
            isOpenMP = true;
          } else if (rules.version && rules.version.includes('omp ')) {
            isOpenMP = true;
          }
        }
      }

      await SAMPRateLimitManager.cache?.set(
        cacheKey,
        isOpenMP,
        7200000,
        14400000
      );
      return isOpenMP;
    } catch (error) {
      return false;
    }
  }

  async getOpenMPExtraInfo(
    server: ServerConfig,
    guildId: string = 'unknown',
    isMonitoring: boolean = false,
    userId?: string,
    isManualCommand: boolean = false
  ): Promise<OpenMPExtraInfo | null> {
    await SAMPRateLimitManager.ensureInitialized();

    if (
      !SAMPRateLimitManager.isInitialized ||
      !SAMPRateLimitManager.protection
    ) {
      return SAMPLegacy.getOpenMPExtraInfo(server, guildId, isMonitoring);
    }

    const cacheKey = `openmp_extra:${server.ip}:${server.port}`;
    const cached =
      await SAMPRateLimitManager.cache?.get<OpenMPExtraInfo>(cacheKey);

    if (cached && !isManualCommand) {
      return cached;
    }

    const protectionResult =
      await SAMPRateLimitManager.protection.checkQueryPermission({
        server,
        guildId,
        ...(userId && { userId }),
        isMonitoring,
        queryType: 'info',
        isManualCommand,
      });

    if (!protectionResult.allowed) {
      console.log(
        `OpenMP extra info query blocked: ${protectionResult.reason}`
      );
      return null;
    }

    try {
      const startTime = Date.now();
      const data = await SAMPProtocol.query(
        server,
        'o',
        guildId,
        undefined,
        isMonitoring,
        isManualCommand
      );
      const responseTime = Date.now() - startTime;

      if (!data) {
        await SAMPRateLimitManager.protection.recordQueryResult(
          server,
          false,
          responseTime
        );
        return null;
      }

      const extraInfo = SAMPParser.parseOpenMPExtraInfo(data);
      if (extraInfo) {
        
        await SAMPRateLimitManager.cache?.set(
          cacheKey,
          extraInfo,
          21600000, 
          43200000  
        );
        await SAMPRateLimitManager.protection.recordQueryResult(
          server,
          true,
          responseTime
        );
      } else {
        await SAMPRateLimitManager.protection.recordQueryResult(
          server,
          false,
          responseTime
        );
      }

      return extraInfo;
    } catch (error) {
      await SAMPRateLimitManager.protection?.recordQueryResult(server, false);
      console.error('OpenMP extra info query error:', error);
      return null;
    }
  }

  

  async getFullServerInfo(
    server: ServerConfig,
    guildId: string = 'unknown',
    userId?: string,
    isManualCommand: boolean = false
  ): Promise<Partial<SAMPFullInfo>> {
    console.log(`Performing full SA:MP query for ${server.ip}:${server.port}`);

    const results: Partial<SAMPFullInfo> = {};

    const info = await this.getServerInfo(
      server,
      guildId,
      false,
      userId,
      isManualCommand
    );
    if (info) {
      results.info = info;
    }

    if (!results.info) {
      console.log(`Server ${server.ip}:${server.port} appears to be offline`);
      return results;
    }

    console.log(
      `Basic info: ${results.info.hostname} (${results.info.players}/${results.info.maxplayers})`
    );

    results.isOpenMP = await this.isOpenMP(
      server,
      guildId,
      false,
      userId,
      isManualCommand
    );
    console.log(`Server type: ${results.isOpenMP ? 'open.mp' : 'SA:MP'}`);

    if (results.isOpenMP) {
      results.extraInfo = await this.getOpenMPExtraInfo(
        server,
        guildId,
        false,
        userId,
        isManualCommand
      );
      if (results.extraInfo) {
        console.log(
          `Extra info retrieved: discord=${!!results.extraInfo.discord}, banners=${!!(results.extraInfo.lightBanner || results.extraInfo.darkBanner)}`
        );
      }
    }

    try {
      results.rules = await this.getServerRules(
        server,
        guildId,
        false,
        userId,
        isManualCommand
      );
      console.log(
        `Rules: ${Object.keys(results.rules).length} rules retrieved`
      );
    } catch (error) {
      console.log(`Rules query failed:`, error);
      results.rules = {};
    }

    try {
      results.ping = await this.getPing(
        server,
        guildId,
        userId,
        isManualCommand
      );
      console.log(`Ping: ${results.ping}ms`);
    } catch (error) {
      console.log(`Ping query failed:`, error);
      results.ping = -1;
    }

    if (results.info.players > 0 && results.info.players <= 100) {
      try {
        results.players = await this.getPlayers(
          server,
          guildId,
          userId,
          isManualCommand
        );
        console.log(
          `Basic players: ${results.players.length} players retrieved`
        );

        results.detailedPlayers = await this.getDetailedPlayers(
          server,
          guildId,
          userId,
          isManualCommand
        );
        console.log(
          `Detailed players: ${results.detailedPlayers.length} players with ping info`
        );
      } catch (error) {
        console.log(`Player list queries failed:`, error);
        results.players = [];
        results.detailedPlayers = [];
      }
    } else {
      console.log(
        `Skipping player lists (${results.info.players} players - too many or none)`
      );
      results.players = [];
      results.detailedPlayers = [];
    }

    return results;
  }

  async testAllOpcodes(
    server: ServerConfig,
    guildId: string = 'unknown',
    userId?: string,
    isManualCommand: boolean = false
  ): Promise<void> {
    console.log(`Testing all SA:MP opcodes for ${server.ip}:${server.port}`);

    const opcodes = [
      { code: 'i', name: 'Information' },
      { code: 'r', name: 'Rules' },
      { code: 'c', name: 'Client List' },
      { code: 'd', name: 'Detailed Players' },
      { code: 'p', name: 'Ping' },
      { code: 'o', name: 'open.mp Extra Info' },
    ];

    for (const opcode of opcodes) {
      try {
        await SAMPRateLimitManager.ensureInitialized();

        if (SAMPRateLimitManager.protection) {
          const protectionResult =
            await SAMPRateLimitManager.protection.checkQueryPermission({
              server,
              guildId,
              ...(userId && { userId }),
              isMonitoring: false,
              queryType: opcode.code as
                | 'info'
                | 'players'
                | 'detailed'
                | 'rules'
                | 'ping',
              isManualCommand,
            });

          if (!protectionResult.allowed) {
            console.log(
              `${opcode.name} (${opcode.code}): Blocked - ${protectionResult.reason}`
            );
            continue;
          }
        }

        const startTime = Date.now();
        const data = await SAMPProtocol.query(
          server,
          opcode.code,
          guildId,
          undefined,
          false,
          isManualCommand
        );
        const endTime = Date.now();

        if (data) {
          console.log(
            `${opcode.name} (${opcode.code}): ${data.length} bytes in ${endTime - startTime}ms`
          );
        } else {
          console.log(`${opcode.name} (${opcode.code}): No response`);
        }
      } catch (error) {
        console.log(`${opcode.name} (${opcode.code}): Error -`, error);
      }
    }
  }

  static getStats(): any {
    if (!SAMPRateLimitManager.isInitialized) {
      return {
        error: 'Rate limiting not initialized',
        legacy: true,
        initialized: false,
      };
    }

    return {
      initialized: true,
      rateLimiting: SAMPRateLimitManager.rateLimit?.getStats() || {},
      serverProtection: SAMPRateLimitManager.protection?.getAllStats() || {},
      cache: SAMPRateLimitManager.cache?.getStats() || {},
    };
  }

  static async resetServerLimits(serverKey: string): Promise<void> {
    if (SAMPRateLimitManager.rateLimit) {
      await SAMPRateLimitManager.rateLimit.resetLimit(
        'samp_server_query',
        serverKey
      );
      console.log(`Reset rate limits for server: ${serverKey}`);
    }
  }

  static async resetUserLimits(userId: string): Promise<void> {
    if (SAMPRateLimitManager.rateLimit) {
      await SAMPRateLimitManager.rateLimit.resetLimit('user_requests', userId);
      await SAMPRateLimitManager.rateLimit.resetLimit('manual_query', userId);
      console.log(`Reset rate limits for user: ${userId}`);
    }
  }

  static async resetGuildLimits(guildId: string): Promise<void> {
    if (SAMPRateLimitManager.rateLimit) {
      await SAMPRateLimitManager.rateLimit.resetLimit(
        'guild_requests',
        guildId
      );
      console.log(`Reset rate limits for guild: ${guildId}`);
    }
  }

  static getServerProtectionStats(serverKey: string): any {
    if (!SAMPRateLimitManager.protection) {
      return null;
    }
    return SAMPRateLimitManager.protection.getServerStats(serverKey);
  }

  static async invalidateCache(pattern?: string): Promise<void> {
    if (SAMPRateLimitManager.cache) {
      if (pattern) {
        await SAMPRateLimitManager.cache.invalidatePattern(pattern);
      } else {
        SAMPRateLimitManager.cache.clearStats();
      }
    }
  }

  static async invalidateServerCache(serverKey: string): Promise<void> {
    if (SAMPRateLimitManager.cache) {
      const patterns = [
        `quick_status:${serverKey}`,
        `server_info:${serverKey}`,
        `server_rules:${serverKey}`,
        `is_openmp:${serverKey}`,
        `openmp_extra:${serverKey}`,
        `server_metadata:${serverKey}`, 
      ];

      for (const pattern of patterns) {
        await SAMPRateLimitManager.cache.invalidate(pattern);
      }
    }
  }

  static isInitialized(): boolean {
    return SAMPRateLimitManager.isInitialized;
  }

  static async forceInitialization(client: CustomClient): Promise<void> {
    if (!SAMPRateLimitManager.isInitialized) {
      await SAMPRateLimitManager.initialize(client);
    }
  }

  static async resetCircuitBreaker(serverKey: string): Promise<void> {
    if (SAMPRateLimitManager.protection) {
      const serverState =
        SAMPRateLimitManager.protection.getServerStats(serverKey);
      if (serverState?.circuitBreakerState) {
        console.log(`Circuit breaker reset requested for: ${serverKey}`);
      }
    }
  }

  static getBehavioralStats(): any {
    if (!SAMPRateLimitManager.protection) {
      return null;
    }
    return {};
  }
}