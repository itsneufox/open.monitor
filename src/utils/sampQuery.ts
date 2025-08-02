import * as dgram from 'dgram';
import { ServerConfig } from '../types';
import { SecurityValidator } from './securityValidator';

interface SAMPInfo {
  password: boolean;
  players: number;
  maxplayers: number;
  hostname: string;
  gamemode: string;
  language: string;
}

interface SAMPPlayer {
  name: string;
  score: number;
}

interface SAMPDetailedPlayer {
  id: number;
  name: string;
  score: number;
  ping: number;
}

interface SAMPRules {
  [key: string]: string;
}

interface SAMPPing {
  time: number;
  sequence: number[];
}

interface OpenMPExtraInfo {
  discord?: string;
  lightBanner?: string;
  darkBanner?: string;
  logo?: string;
}

interface SAMPFullInfo {
  info: SAMPInfo;
  rules: SAMPRules;
  players: SAMPPlayer[];
  detailedPlayers: SAMPDetailedPlayer[];
  ping: number;
  isOpenMP?: boolean;
  extraInfo?: OpenMPExtraInfo | null;
}

export class SAMPQuery {
  private createPacket(ip: string, port: number, opcode: string): Buffer {
    // Build SA:MP query packet: "SAMP" + IP octets + port bytes + OPCODE
    const ipOctets = ip.split('.').map(octet => parseInt(octet, 10));
    const portLow = port & 0xff;
    const portHigh = (port >> 8) & 0xff;

    const packet = Buffer.alloc(11);
    let offset = 0;

    packet.write('SAMP', offset);
    offset += 4;

    for (let i = 0; i < 4; i++) {
      const octet = ipOctets[i];
      if (octet !== undefined) {
        packet.writeUInt8(octet, offset + i);
      }
    }
    offset += 4;

    packet.writeUInt8(portLow, offset);
    packet.writeUInt8(portHigh, offset + 1);
    offset += 2;

    packet.writeUInt8(opcode.charCodeAt(0), offset);

    return packet;
  }

  private createPingPacket(ip: string, port: number): Buffer {
    // Ping packet needs 4 random bytes after the base packet
    const basePacket = this.createPacket(ip, port, 'p');
    const packet = Buffer.alloc(15);

    basePacket.copy(packet, 0);

    for (let i = 0; i < 4; i++) {
      packet.writeUInt8(Math.floor(Math.random() * 256), 11 + i);
    }

    return packet;
  }

  // OPCODE 'i' - Server Information
  private parseInfoResponse(data: Buffer): SAMPInfo | null {
    try {
      let offset = 11; // Skip validated header

      if (offset + 7 > data.length) return null; // Need minimum fields

      const password = data.readUInt8(offset) === 1;
      offset += 1;

      const players = data.readUInt16LE(offset);
      offset += 2;

      const maxplayers = data.readUInt16LE(offset);
      offset += 2;

      // Validate hostname string
      const hostnameValidation = SecurityValidator.validateStringField(data, offset, 128);
      if (!hostnameValidation.valid) {
        console.warn('Invalid hostname field in server response');
        return null;
      }

      const hostnameLength = hostnameValidation.length;
      offset += 4;

      const hostname = data.subarray(offset, offset + hostnameLength).toString('utf8');
      offset += hostnameLength;

      // Validate gamemode string
      const gamemodeValidation = SecurityValidator.validateStringField(data, offset, 64);
      if (!gamemodeValidation.valid) {
        console.warn('Invalid gamemode field in server response');
        return null;
      }

      const gamemodeLength = gamemodeValidation.length;
      offset += 4;

      const gamemode = data.subarray(offset, offset + gamemodeLength).toString('utf8');
      offset += gamemodeLength;

      // Validate language string
      const languageValidation = SecurityValidator.validateStringField(data, offset, 64);
      if (!languageValidation.valid) {
        console.warn('Invalid language field in server response');
        return null;
      }

      const languageLength = languageValidation.length;
      offset += 4;

      const language = data.subarray(offset, offset + languageLength).toString('utf8');

      // Sanity check values
      if (players > 1000 || maxplayers > 1000 || players > maxplayers) {
        console.warn(`Suspicious player count values: ${players}/${maxplayers}`);
        return null;
      }

      return {
        password,
        players,
        maxplayers,
        hostname: hostname.slice(0, 128), // Truncate to prevent overflow
        gamemode: gamemode.slice(0, 64),
        language: language.slice(0, 64),
      };
    } catch (error) {
      console.error('Error parsing SA:MP info response:', error);
      return null;
    }
  }

  // OPCODE 'r' - Server Rules
  private parseRulesResponse(data: Buffer): SAMPRules {
    try {
      let offset = 11;

      const ruleCount = data.readUInt16LE(offset);
      offset += 2;

      const rules: SAMPRules = {};

      for (let i = 0; i < ruleCount && offset < data.length; i++) {
        const nameLength = data.readUInt8(offset);
        offset += 1;

        const ruleName = data
          .subarray(offset, offset + nameLength)
          .toString('utf8');
        offset += nameLength;

        const valueLength = data.readUInt8(offset);
        offset += 1;

        const ruleValue = data
          .subarray(offset, offset + valueLength)
          .toString('utf8');
        offset += valueLength;

        rules[ruleName] = ruleValue;
      }

      return rules;
    } catch (error) {
      console.error('Error parsing rules response:', error);
      return {};
    }
  }

  // OPCODE 'c' - Client List (Basic Player Info)
  private parsePlayersResponse(data: Buffer): SAMPPlayer[] {
    try {
      let offset = 11;

      const playerCount = data.readUInt16LE(offset);
      offset += 2;

      const players: SAMPPlayer[] = [];

      for (let i = 0; i < playerCount && offset < data.length; i++) {
        const nameLength = data.readUInt8(offset);
        offset += 1;

        const name = data
          .subarray(offset, offset + nameLength)
          .toString('utf8');
        offset += nameLength;

        const score = data.readInt32LE(offset);
        offset += 4;

        players.push({ name, score });
      }

      return players;
    } catch (error) {
      console.error('Error parsing players response:', error);
      return [];
    }
  }

  // OPCODE 'd' - Detailed Player Information
  private parseDetailedPlayersResponse(data: Buffer): SAMPDetailedPlayer[] {
    try {
      let offset = 11;

      const playerCount = data.readUInt16LE(offset);
      offset += 2;

      const players: SAMPDetailedPlayer[] = [];

      for (let i = 0; i < playerCount && offset < data.length; i++) {
        const id = data.readUInt8(offset);
        offset += 1;

        const nameLength = data.readUInt8(offset);
        offset += 1;

        const name = data
          .subarray(offset, offset + nameLength)
          .toString('utf8');
        offset += nameLength;

        const score = data.readInt32LE(offset);
        offset += 4;

        const ping = data.readUInt32LE(offset);
        offset += 4;

        players.push({ id, name, score, ping });
      }

      return players;
    } catch (error) {
      console.error('Error parsing detailed players response:', error);
      return [];
    }
  }

  // OPCODE 'p' - Ping
  private parsePingResponse(
    data: Buffer,
    sentSequence: number[]
  ): SAMPPing | null {
    try {
      if (data.length < 15) return null;

      const receivedSequence = [
        data.readUInt8(11),
        data.readUInt8(12),
        data.readUInt8(13),
        data.readUInt8(14),
      ];

      return {
        time: Date.now(),
        sequence: receivedSequence,
      };
    } catch (error) {
      console.error('Error parsing ping response:', error);
      return null;
    }
  }

  // OPCODE 'o' - open.mp Extra Info
  private parseOpenMPExtraInfo(data: Buffer): OpenMPExtraInfo | null {
    try {
      if (data.length < 11) return null;

      let offset = 11; // Skip header
      const extraInfo: OpenMPExtraInfo = {};

      // Read discord link length and data
      if (offset + 4 <= data.length) {
        const discordLength = data.readUInt32LE(offset);
        offset += 4;
        if (discordLength > 0 && offset + discordLength <= data.length) {
          extraInfo.discord = data
            .subarray(offset, offset + discordLength)
            .toString('utf8');
          offset += discordLength;
        }
      }

      // Read light banner URL
      if (offset + 4 <= data.length) {
        const lightBannerLength = data.readUInt32LE(offset);
        offset += 4;
        if (
          lightBannerLength > 0 &&
          offset + lightBannerLength <= data.length
        ) {
          extraInfo.lightBanner = data
            .subarray(offset, offset + lightBannerLength)
            .toString('utf8');
          offset += lightBannerLength;
        }
      }

      // Read dark banner URL
      if (offset + 4 <= data.length) {
        const darkBannerLength = data.readUInt32LE(offset);
        offset += 4;
        if (darkBannerLength > 0 && offset + darkBannerLength <= data.length) {
          extraInfo.darkBanner = data
            .subarray(offset, offset + darkBannerLength)
            .toString('utf8');
          offset += darkBannerLength;
        }
      }

      // Read logo URL
      if (offset + 4 <= data.length) {
        const logoLength = data.readUInt32LE(offset);
        offset += 4;
        if (logoLength > 0 && offset + logoLength <= data.length) {
          extraInfo.logo = data
            .subarray(offset, offset + logoLength)
            .toString('utf8');
          offset += logoLength;
        }
      }

      return extraInfo;
    } catch (error) {
      console.error('Error parsing open.mp extra info:', error);
      return null;
    }
  }

  private async query(
    server: ServerConfig,
    opcode: string,
    customPacket?: Buffer
  ): Promise<Buffer | null> {
    // Security check before querying
    if (!SecurityValidator.validateServerIP(server.ip)) {
      console.warn(`Blocked query to invalid IP: ${server.ip}`);
      return null;
    }

    if (!SecurityValidator.canQueryIP(server.ip, 'global')) {
      console.warn(`Rate limit exceeded for IP: ${server.ip}`);
      return null;
    }

    return new Promise(resolve => {
      const socket = dgram.createSocket('udp4');
      const timeoutMs = 5000; // timeout for security

      const timeout = setTimeout(() => {
        socket.close();
        resolve(null);
      }, timeoutMs);

      socket.on('message', data => {
        clearTimeout(timeout);
        socket.close();

        // Validate response before processing
        if (!SecurityValidator.validateSAMPResponse(data, server, opcode)) {
          console.warn(`Invalid response from ${server.ip}:${server.port}`);
          resolve(null);
          return;
        }

        resolve(data);
      });

      socket.on('error', error => {
        clearTimeout(timeout);
        socket.close();
        console.error(`SA:MP query error (${opcode}):`, error);
        resolve(null);
      });

      const packet = customPacket || this.createPacket(server.ip, server.port, opcode);

      socket.send(packet, server.port, server.ip, error => {
        if (error) {
          clearTimeout(timeout);
          socket.close();
          console.error(`Failed to send SA:MP query (${opcode}):`, error);
          resolve(null);
        }
      });
    });
  }

  public async getServerInfo(server: ServerConfig): Promise<SAMPInfo | null> {
    const data = await this.query(server, 'i');
    return data ? this.parseInfoResponse(data) : null;
  }

  public async getServerRules(server: ServerConfig): Promise<SAMPRules> {
    const data = await this.query(server, 'r');
    return data ? this.parseRulesResponse(data) : {};
  }

  public async getPlayers(server: ServerConfig): Promise<SAMPPlayer[]> {
    const data = await this.query(server, 'c');
    return data ? this.parsePlayersResponse(data) : [];
  }

  public async getDetailedPlayers(
    server: ServerConfig
  ): Promise<SAMPDetailedPlayer[]> {
    const data = await this.query(server, 'd');
    return data ? this.parseDetailedPlayersResponse(data) : [];
  }

  public async getPing(server: ServerConfig): Promise<number> {
    const startTime = Date.now();
    const sentSequence = Array.from({ length: 4 }, () =>
      Math.floor(Math.random() * 256)
    );
    const pingPacket = this.createPingPacket(server.ip, server.port);

    // Set our sequence in the packet
    for (let i = 0; i < 4; i++) {
      const sequenceValue = sentSequence[i];
      if (sequenceValue !== undefined) {
        pingPacket.writeUInt8(sequenceValue, 11 + i);
      }
    }

    const data = await this.query(server, 'p', pingPacket);

    if (!data) return -1;

    const endTime = Date.now();
    const pingData = this.parsePingResponse(data, sentSequence);

    return pingData ? endTime - startTime : -1;
  }

  // Definitive open.mp detection using 'o' opcode
  public async isOpenMP(server: ServerConfig): Promise<boolean> {
    try {
      const data = await this.query(server, 'o');
      return data !== null && data.length > 11;
    } catch (error) {
      return false;
    }
  }

  // Get open.mp extra information (discord, banners, etc.)
  public async getOpenMPExtraInfo(
    server: ServerConfig
  ): Promise<OpenMPExtraInfo | null> {
    try {
      const data = await this.query(server, 'o');
      return data ? this.parseOpenMPExtraInfo(data) : null;
    } catch (error) {
      return null;
    }
  }

  public async getFullServerInfo(
    server: ServerConfig
  ): Promise<Partial<SAMPFullInfo>> {
    console.log(`Performing full SA:MP query for ${server.ip}:${server.port}`);

    const results: Partial<SAMPFullInfo> = {};

    // Get basic info first
    const info = await this.getServerInfo(server);
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

    // Check if it's open.mp
    results.isOpenMP = await this.isOpenMP(server);
    console.log(`Server type: ${results.isOpenMP ? 'open.mp' : 'SA:MP'}`);

    // Get open.mp extra info if applicable
    if (results.isOpenMP) {
      results.extraInfo = await this.getOpenMPExtraInfo(server);
      if (results.extraInfo) {
        console.log(
          `Extra info retrieved: discord=${!!results.extraInfo.discord}, banners=${!!(results.extraInfo.lightBanner || results.extraInfo.darkBanner)}`
        );
      }
    }

    // Get additional data
    try {
      results.rules = await this.getServerRules(server);
      console.log(
        `Rules: ${Object.keys(results.rules).length} rules retrieved`
      );
    } catch (error) {
      console.log(`Rules query failed:`, error);
      results.rules = {};
    }

    try {
      results.ping = await this.getPing(server);
      console.log(`Ping: ${results.ping}ms`);
    } catch (error) {
      console.log(`Ping query failed:`, error);
      results.ping = -1;
    }

    // Get player lists for smaller servers
    if (results.info.players > 0 && results.info.players <= 100) {
      try {
        results.players = await this.getPlayers(server);
        console.log(
          `Basic players: ${results.players.length} players retrieved`
        );

        results.detailedPlayers = await this.getDetailedPlayers(server);
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

  public async testAllOpcodes(server: ServerConfig): Promise<void> {
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
        const startTime = Date.now();
        const data = await this.query(server, opcode.code);
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
}

export type {
  SAMPInfo,
  SAMPPlayer,
  SAMPDetailedPlayer,
  SAMPRules,
  SAMPPing,
  SAMPFullInfo,
  OpenMPExtraInfo,
};
