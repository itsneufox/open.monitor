import * as dgram from 'dgram';
import * as iconv from 'iconv-lite';
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

interface ServerMetadata {
  hostname: string;
  gamemode: string;
  language: string;
  version: string;
  isOpenMP: boolean;
  maxPlayers: number;
  banner?: string;
  logo?: string;
  lastUpdated: number;
}

export class SAMPQuery {
  private decodeString(buffer: Buffer): string {
    try {
      let decoded = buffer.toString('utf8');

      if (decoded.includes('ï¿½') || decoded.includes('\ufffd')) {
        const encodings = ['latin1', 'cp1252', 'iso-8859-1', 'cp850'];

        for (const encoding of encodings) {
          try {
            decoded = iconv.decode(buffer, encoding);
            if (!decoded.includes('ï¿½') && !decoded.includes('\ufffd')) {
              break;
            }
          } catch (error) {
            continue;
          }
        }
      }

      return decoded.trim();
    } catch (error) {
      return iconv.decode(buffer, 'latin1').trim();
    }
  }

  private createPacket(ip: string, port: number, opcode: string): Buffer {
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
    const basePacket = this.createPacket(ip, port, 'p');
    const packet = Buffer.alloc(15);

    basePacket.copy(packet, 0);

    for (let i = 0; i < 4; i++) {
      packet.writeUInt8(Math.floor(Math.random() * 256), 11 + i);
    }

    return packet;
  }

  private parseInfoResponse(data: Buffer): SAMPInfo | null {
    try {
      let offset = 11;

      if (offset + 7 > data.length) return null;

      const password = data.readUInt8(offset) === 1;
      offset += 1;

      const players = data.readUInt16LE(offset);
      offset += 2;

      const maxplayers = data.readUInt16LE(offset);
      offset += 2;

      const hostnameValidation = SecurityValidator.validateStringField(
        data,
        offset,
        128
      );
      if (!hostnameValidation.valid) {
        console.warn('Invalid hostname field in server response');
        return null;
      }

      const hostnameLength = hostnameValidation.length;
      offset += 4;

      const hostname = this.decodeString(
        data.subarray(offset, offset + hostnameLength)
      );
      offset += hostnameLength;

      const gamemodeValidation = SecurityValidator.validateStringField(
        data,
        offset,
        64
      );
      if (!gamemodeValidation.valid) {
        console.warn('Invalid gamemode field in server response');
        return null;
      }

      const gamemodeLength = gamemodeValidation.length;
      offset += 4;

      const gamemode = this.decodeString(
        data.subarray(offset, offset + gamemodeLength)
      );
      offset += gamemodeLength;

      const languageValidation = SecurityValidator.validateStringField(
        data,
        offset,
        64
      );
      if (!languageValidation.valid) {
        console.warn('Invalid language field in server response');
        return null;
      }

      const languageLength = languageValidation.length;
      offset += 4;

      const language = this.decodeString(
        data.subarray(offset, offset + languageLength)
      );

      if (players > 1000 || maxplayers > 1000 || players > maxplayers) {
        console.warn(
          `Suspicious player count values: ${players}/${maxplayers}`
        );
        return null;
      }

      return {
        password,
        players,
        maxplayers,
        hostname: hostname.slice(0, 128),
        gamemode: gamemode.slice(0, 64),
        language: language.slice(0, 64),
      };
    } catch (error) {
      console.error('Error parsing SA:MP info response:', error);
      return null;
    }
  }

  private parseRulesResponse(data: Buffer): SAMPRules {
    try {
      let offset = 11;
      const ruleCount = data.readUInt16LE(offset);
      offset += 2;

      const rules: SAMPRules = {};

      for (let i = 0; i < ruleCount && offset < data.length; i++) {
        const nameLength = data.readUInt8(offset);
        offset += 1;

        const ruleName = this.decodeString(
          data.subarray(offset, offset + nameLength)
        );
        offset += nameLength;

        const valueLength = data.readUInt8(offset);
        offset += 1;

        const ruleValue = this.decodeString(
          data.subarray(offset, offset + valueLength)
        );
        offset += valueLength;

        rules[ruleName] = ruleValue;
      }

      return rules;
    } catch (error) {
      console.error('Error parsing rules response:', error);
      return {};
    }
  }

  private parsePlayersResponse(data: Buffer): SAMPPlayer[] {
    try {
      let offset = 11; // Skip SAMP header

      if (offset + 2 > data.length) {
        console.log('Player response too short for player count');
        return [];
      }

      const playerCount = data.readUInt16LE(offset);
      offset += 2;

      console.log(`Parsing players response: ${playerCount} players reported`);

      if (playerCount === 0) {
        return [];
      }

      if (playerCount > 1000) {
        console.warn(`Suspicious player count: ${playerCount}`);
        return [];
      }

      const players: SAMPPlayer[] = [];

      for (let i = 0; i < playerCount && offset < data.length; i++) {
        try {
          if (offset + 1 > data.length) {
            console.log(`Not enough data for player ${i} name length`);
            break;
          }

          const nameLength = data.readUInt8(offset);
          offset += 1;

          console.log(`Player ${i}: name length = ${nameLength}`);

          if (nameLength > 64) {
            console.warn(`Invalid name length for player ${i}: ${nameLength}`);
            break;
          }

          if (offset + nameLength > data.length) {
            console.log(`Not enough data for player ${i} name (need ${nameLength} bytes)`);
            break;
          }

          const nameBuffer = data.subarray(offset, offset + nameLength);
          const name = this.decodeString(nameBuffer);
          offset += nameLength;

          if (offset + 4 > data.length) {
            console.log(`Not enough data for player ${i} score`);
            break;
          }

          const score = data.readInt32LE(offset);
          offset += 4;

          console.log(`Player ${i}: name="${name}", score=${score}`);

          if (name && name.length > 0) {
            players.push({ name, score });
          }

        } catch (playerError) {
          console.error(`Error parsing player ${i}:`, playerError);
          break;
        }
      }

      console.log(`Successfully parsed ${players.length} players out of ${playerCount} reported`);
      return players;

    } catch (error) {
      console.error('Error parsing players response:', error);
      return [];
    }
  }

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

        const name = this.decodeString(
          data.subarray(offset, offset + nameLength)
        );
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

  private parseOpenMPExtraInfo(data: Buffer): OpenMPExtraInfo | null {
    try {
      if (data.length < 11) return null;

      let offset = 11;
      const extraInfo: OpenMPExtraInfo = {};

      if (offset + 4 <= data.length) {
        const discordLength = data.readUInt32LE(offset);
        offset += 4;
        if (discordLength > 0 && offset + discordLength <= data.length) {
          extraInfo.discord = this.decodeString(
            data.subarray(offset, offset + discordLength)
          );
          offset += discordLength;
        }
      }

      if (offset + 4 <= data.length) {
        const lightBannerLength = data.readUInt32LE(offset);
        offset += 4;
        if (lightBannerLength > 0 && offset + lightBannerLength <= data.length) {
          extraInfo.lightBanner = this.decodeString(
            data.subarray(offset, offset + lightBannerLength)
          );
          offset += lightBannerLength;
        }
      }

      if (offset + 4 <= data.length) {
        const darkBannerLength = data.readUInt32LE(offset);
        offset += 4;
        if (darkBannerLength > 0 && offset + darkBannerLength <= data.length) {
          extraInfo.darkBanner = this.decodeString(
            data.subarray(offset, offset + darkBannerLength)
          );
          offset += darkBannerLength;
        }
      }

      if (offset + 4 <= data.length) {
        const logoLength = data.readUInt32LE(offset);
        offset += 4;
        if (logoLength > 0 && offset + logoLength <= data.length) {
          extraInfo.logo = this.decodeString(
            data.subarray(offset, offset + logoLength)
          );
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
    guildId: string,
    customPacket?: Buffer,
    isMonitoringCycle: boolean = false
  ): Promise<Buffer | null> {
    if (!SecurityValidator.validateServerIP(server.ip)) {
      console.warn(`Blocked query to invalid IP: ${server.ip}`);
      return null;
    }

    if (!SecurityValidator.canQueryIP(server.ip, guildId, isMonitoringCycle)) {
      console.warn(`Rate limit exceeded for IP: ${server.ip}`);
      return null;
    }

    return new Promise(resolve => {
      const socket = dgram.createSocket('udp4');
      const timeoutMs = 5000;

      const timeout = setTimeout(() => {
        socket.close();
        resolve(null);
      }, timeoutMs);

      socket.on('message', data => {
        clearTimeout(timeout);
        socket.close();

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

      const packet =
        customPacket || this.createPacket(server.ip, server.port, opcode);

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

  public async getQuickStatus(
    server: ServerConfig,
    guildId: string = 'unknown'
  ): Promise<{ players: number; isOnline: boolean; gamemode?: string } | null> {
    console.log(`[getQuickStatus] guildId: ${guildId}, server: ${server.ip}:${server.port}`);

    const data = await this.query(server, 'i', guildId, undefined, true);
    if (!data) return null;

    const info = this.parseInfoResponse(data);
    if (!info) return null;

    return {
      players: info.players,
      isOnline: true,
      gamemode: info.gamemode
    };
  }

  public async getServerMetadata(
    server: ServerConfig,
    guildId: string = 'unknown'
  ): Promise<any | null> {

    try {
      console.log(`Fetching full metadata for ${server.ip}:${server.port}`);

      const info = await this.getServerInfo(server, guildId, false);
      if (!info) return null;

      const isOpenMP = await this.isOpenMP(server, guildId, false);

      let version = 'Unknown';
      let banner: string | undefined;
      let logo: string | undefined;

      if (isOpenMP) {
        try {
          const rules = await this.getServerRules(server, guildId, false);
          version = rules.version || 'open.mp';

          const extraInfo = await this.getOpenMPExtraInfo(server, guildId, false);
          if (extraInfo) {
            banner = extraInfo.darkBanner || extraInfo.lightBanner;
            logo = extraInfo.logo;
          }
        } catch (error) {
          console.log('Failed to get open.mp extras:', error);
        }
      } else {
        try {
          const rules = await this.getServerRules(server, guildId, false);
          version = rules.version || rules.Ver || rules.v || 'SA:MP 0.3.7';
        } catch (error) {
          console.log('Failed to get SA:MP version:', error);
        }
      }

      const metadata: ServerMetadata = {
        hostname: info.hostname,
        gamemode: info.gamemode,
        language: info.language,
        version,
        isOpenMP,
        maxPlayers: info.maxplayers,
        lastUpdated: Date.now()
      };

      if (banner) {
        metadata.banner = banner;
      }
      if (logo) {
        metadata.logo = logo;
      }

      return metadata;

    } catch (error) {
      console.error('Error fetching server metadata:', error);
      return null;
    }
  }

  public async getServerInfo(
    server: ServerConfig,
    guildId: string = 'unknown',
    isMonitoring: boolean = false
  ): Promise<SAMPInfo | null> {
    console.log(`[getServerInfo] guildId: ${guildId}, server: ${server.ip}:${server.port}, isMonitoring: ${isMonitoring}`);

    const data = await this.query(
      server,
      'i',
      guildId,
      undefined,
      isMonitoring
    );
    return data ? this.parseInfoResponse(data) : null;
  }


  public async getServerRules(
    server: ServerConfig,
    guildId: string = 'unknown',
    isMonitoring: boolean = false
  ): Promise<SAMPRules> {
    const data = await this.query(
      server,
      'r',
      guildId,
      undefined,
      isMonitoring
    );
    return data ? this.parseRulesResponse(data) : {};
  }

  public async getPlayers(
    server: ServerConfig,
    guildId: string = 'unknown'
  ): Promise<SAMPPlayer[]> {
    console.log(`[getPlayers] guildId: ${guildId}, server: ${server.ip}:${server.port}`);
    console.log(`[DEBUG] Querying players for ${server.ip}:${server.port}`);

    const data = await this.query(server, 'c', guildId);

    if (!data) {
      console.log('[DEBUG] No response data received');
      return [];
    }

    console.log(`[DEBUG] Response length: ${data.length} bytes`);
    console.log(`[DEBUG] First 20 bytes: ${data.subarray(0, 20).toString('hex')}`);

    if (data.length < 11 || data.toString('ascii', 0, 4) !== 'SAMP') {
      console.log('[DEBUG] Invalid SAMP response header');
      return [];
    }

    const opcode = String.fromCharCode(data[10]!);
    console.log(`[DEBUG] Response opcode: '${opcode}' (expected: 'c')`);

    if (opcode !== 'c') {
      console.log('[DEBUG] Wrong opcode in response');
      return [];
    }

    const result = this.parsePlayersResponse(data);
    console.log(`[DEBUG] Parsed ${result.length} players`);

    return result;
  }

  public async getDetailedPlayers(
    server: ServerConfig,
    guildId: string = 'unknown'
  ): Promise<SAMPDetailedPlayer[]> {
    console.log(`[getDetailedPlayers] guildId: ${guildId}, server: ${server.ip}:${server.port}`);

    const data = await this.query(server, 'd', guildId);
    return data ? this.parseDetailedPlayersResponse(data) : [];
  }

  public async getPing(
    server: ServerConfig,
    guildId: string = 'unknown'
  ): Promise<number> {
    const startTime = Date.now();
    const sentSequence = Array.from({ length: 4 }, () =>
      Math.floor(Math.random() * 256)
    );
    const pingPacket = this.createPingPacket(server.ip, server.port);

    for (let i = 0; i < 4; i++) {
      const sequenceValue = sentSequence[i];
      if (sequenceValue !== undefined) {
        pingPacket.writeUInt8(sequenceValue, 11 + i);
      }
    }

    const data = await this.query(server, 'p', guildId, pingPacket);

    if (!data) return -1;

    const endTime = Date.now();
    const pingData = this.parsePingResponse(data, sentSequence);

    return pingData ? endTime - startTime : -1;
  }

  public async isOpenMP(
    server: ServerConfig,
    guildId: string = 'unknown',
    isMonitoring: boolean = false
  ): Promise<boolean> {
    try {
      const data = await this.query(server, 'o', guildId, undefined, isMonitoring);
      if (data !== null && data.length > 11) {
        return true;
      }

      const rules = await this.getServerRules(server, guildId, isMonitoring);

      if (rules.allowed_clients) {
        return true;
      }

      if (rules.version && rules.version.includes('omp ')) {
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  public async getOpenMPExtraInfo(
    server: ServerConfig,
    guildId: string = 'unknown',
    isMonitoring: boolean = false
  ): Promise<OpenMPExtraInfo | null> {
    try {
      const data = await this.query(
        server,
        'o',
        guildId,
        undefined,
        isMonitoring
      );
      return data ? this.parseOpenMPExtraInfo(data) : null;
    } catch (error) {
      return null;
    }
  }

  public async getFullServerInfo(
    server: ServerConfig,
    guildId: string = 'unknown'
  ): Promise<Partial<SAMPFullInfo>> {
    console.log(`Performing full SA:MP query for ${server.ip}:${server.port}`);

    const results: Partial<SAMPFullInfo> = {};

    const info = await this.getServerInfo(server, guildId);
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

    results.isOpenMP = await this.isOpenMP(server, guildId);
    console.log(`Server type: ${results.isOpenMP ? 'open.mp' : 'SA:MP'}`);

    if (results.isOpenMP) {
      results.extraInfo = await this.getOpenMPExtraInfo(server, guildId);
      if (results.extraInfo) {
        console.log(
          `Extra info retrieved: discord=${!!results.extraInfo.discord}, banners=${!!(results.extraInfo.lightBanner || results.extraInfo.darkBanner)}`
        );
      }
    }

    try {
      results.rules = await this.getServerRules(server, guildId);
      console.log(
        `Rules: ${Object.keys(results.rules).length} rules retrieved`
      );
    } catch (error) {
      console.log(`Rules query failed:`, error);
      results.rules = {};
    }

    try {
      results.ping = await this.getPing(server, guildId);
      console.log(`Ping: ${results.ping}ms`);
    } catch (error) {
      console.log(`Ping query failed:`, error);
      results.ping = -1;
    }

    if (results.info.players > 0 && results.info.players <= 100) {
      try {
        results.players = await this.getPlayers(server, guildId);
        console.log(
          `Basic players: ${results.players.length} players retrieved`
        );

        results.detailedPlayers = await this.getDetailedPlayers(
          server,
          guildId
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

  // Debug method for testing specific servers
  public async testPlayersRaw(server: ServerConfig): Promise<void> {
    console.log(`Testing raw players query for ${server.ip}:${server.port}`);

    try {
      // Create socket
      const socket = dgram.createSocket('udp4');

      // Create packet manually
      const packet = Buffer.alloc(11);
      packet.write('SAMP', 0);
      const ipOctets = server.ip.split('.').map(n => parseInt(n));

      // Fix: Add proper null checks
      if (ipOctets.length !== 4 || ipOctets.some(octet => isNaN(octet))) {
        console.error('Invalid IP address format');
        return;
      }

      packet[4] = ipOctets[0] || 0;
      packet[5] = ipOctets[1] || 0;
      packet[6] = ipOctets[2] || 0;
      packet[7] = ipOctets[3] || 0;
      packet[8] = server.port & 0xFF;
      packet[9] = (server.port >> 8) & 0xFF;
      packet[10] = 'c'.charCodeAt(0);

      console.log(`Sending packet: ${packet.toString('hex')}`);

      socket.on('message', (data, rinfo) => {
        console.log(`Received ${data.length} bytes from ${rinfo.address}:${rinfo.port}`);
        console.log(`Raw response: ${data.toString('hex')}`);

        if (data.length >= 13) {
          const playerCount = data.readUInt16LE(11);
          console.log(`Player count in response: ${playerCount}`);

          if (playerCount > 0) {
            console.log('Response has players - parsing issue in bot!');

            let offset = 13;
            for (let i = 0; i < Math.min(3, playerCount) && offset < data.length; i++) {
              try {
                const nameLength = data.readUInt8(offset);
                offset += 1;

                if (offset + nameLength + 4 <= data.length) {
                  const nameBuffer = data.subarray(offset, offset + nameLength);
                  const name = nameBuffer.toString('utf8').replace(/\0/g, '');
                  offset += nameLength;

                  const score = data.readInt32LE(offset);
                  offset += 4;

                  console.log(`Player ${i}: "${name}" (score: ${score})`);
                } else {
                  console.log(`Player ${i}: Not enough data remaining`);
                  break;
                }
              } catch (parseError) {
                console.log(`Player ${i}: Parse error:`, parseError);
                break;
              }
            }
          }
        }

        socket.close();
      });

      socket.on('error', (err) => {
        console.error('Socket error:', err);
        socket.close();
      });

      const timeout = setTimeout(() => {
        console.log('Query timeout');
        socket.close();
      }, 5000);

      socket.send(packet, server.port, server.ip, (err) => {
        if (err) {
          console.error('Send error:', err);
          clearTimeout(timeout);
          socket.close();
        } else {
          console.log('Packet sent successfully');
        }
      });

    } catch (error) {
      console.error('Test error:', error);
    }
  }

  public async debugServer(server: ServerConfig, guildId: string = 'unknown'): Promise<void> {
    console.log(`=== DEBUGGING SERVER ${server.ip}:${server.port} ===`);

    try {
      console.log('1. Testing info query...');
      const info = await this.getServerInfo(server, guildId);
      console.log('Info result:', info);

      if (!info) {
        console.log('Server is offline, stopping debug');
        return;
      }

      console.log('2. Testing players query...');
      const rawData = await this.query(server, 'c', guildId);

      if (rawData) {
        console.log(`Raw response length: ${rawData.length}`);
        console.log(`Raw response (hex): ${rawData.toString('hex')}`);
        console.log(`Raw response (first 50 bytes): ${rawData.subarray(0, Math.min(50, rawData.length)).toString('hex')}`);

        const players = this.parsePlayersResponse(rawData);
        console.log(`Parsed players: ${players.length}`);
      } else {
        console.log('No raw data received for players query');
      }

      console.log('3. Testing rules query...');
      const rules = await this.getServerRules(server, guildId);
      console.log('Rules count:', Object.keys(rules).length);

    } catch (error) {
      console.error('Debug error:', error);
    }

    console.log('=== DEBUG COMPLETE ===');
  }

  public async testAllOpcodes(
    server: ServerConfig,
    guildId: string = 'unknown'
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
        const startTime = Date.now();
        const data = await this.query(server, opcode.code, guildId);
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