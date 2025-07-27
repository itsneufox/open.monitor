import * as dgram from 'dgram';
import { ServerConfig } from '../types';

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

interface SAMPFullInfo {
  info: SAMPInfo;
  rules: SAMPRules;
  players: SAMPPlayer[];
  detailedPlayers: SAMPDetailedPlayer[];
  ping: number;
}

export class SAMPQuery {
  private createPacket(ip: string, port: number, opcode: string): Buffer {
    // Create packet as described in the wiki documentation:
    // "SAMP" + IP octets + port bytes + OPCODE
    
    const ipOctets = ip.split('.').map(octet => parseInt(octet, 10));
    const portLow = port & 0xFF;
    const portHigh = (port >> 8) & 0xFF;
    
    const packet = Buffer.alloc(11);
    let offset = 0;
    
    // Write "SAMP"
    packet.write('SAMP', offset);
    offset += 4;
    
    // Write IP octets
    for (let i = 0; i < 4; i++) {
      packet.writeUInt8(ipOctets[i], offset + i);
    }
    offset += 4;
    
    // Write port bytes
    packet.writeUInt8(portLow, offset);
    packet.writeUInt8(portHigh, offset + 1);
    offset += 2;
    
    // Write opcode
    packet.writeUInt8(opcode.charCodeAt(0), offset);
    
    return packet;
  }

  private createPingPacket(ip: string, port: number): Buffer {
    // For ping (opcode 'p'), we need to send 4 pseudo-random bytes
    const basePacket = this.createPacket(ip, port, 'p');
    const packet = Buffer.alloc(15); // 11 base + 4 random bytes
    
    basePacket.copy(packet, 0);
    
    // Add 4 pseudo-random bytes
    for (let i = 0; i < 4; i++) {
      packet.writeUInt8(Math.floor(Math.random() * 256), 11 + i);
    }
    
    return packet;
  }

  // OPCODE 'i' - Server Information
  private parseInfoResponse(data: Buffer): SAMPInfo | null {
    try {
      let offset = 11; // Skip header
      
      // Byte 11: Password (0 or 1)
      const password = data.readUInt8(offset) === 1;
      offset += 1;
      
      // Bytes 12-13: Current players (2 bytes, little endian)
      const players = data.readUInt16LE(offset);
      offset += 2;
      
      // Bytes 14-15: Max players (2 bytes, little endian)
      const maxplayers = data.readUInt16LE(offset);
      offset += 2;
      
      // Bytes 16-19: Hostname length (4 bytes, little endian)
      const hostnameLength = data.readUInt32LE(offset);
      offset += 4;
      
      // Read hostname
      const hostname = data.subarray(offset, offset + hostnameLength).toString('utf8');
      offset += hostnameLength;
      
      // Read gamemode length (4 bytes, little endian)
      const gamemodeLength = data.readUInt32LE(offset);
      offset += 4;
      
      // Read gamemode
      const gamemode = data.subarray(offset, offset + gamemodeLength).toString('utf8');
      offset += gamemodeLength;
      
      // Read language length (4 bytes, little endian)
      const languageLength = data.readUInt32LE(offset);
      offset += 4;
      
      // Read language
      const language = data.subarray(offset, offset + languageLength).toString('utf8');
      
      return {
        password,
        players,
        maxplayers,
        hostname,
        gamemode,
        language
      };
    } catch (error) {
      console.error('Error parsing SA:MP info response:', error);
      return null;
    }
  }

  // OPCODE 'r' - Server Rules
  private parseRulesResponse(data: Buffer): SAMPRules {
    try {
      let offset = 11; // Skip header
      
      // Bytes 11-12: Rule count (2 bytes, little endian)
      const ruleCount = data.readUInt16LE(offset);
      offset += 2;
      
      const rules: SAMPRules = {};
      
      for (let i = 0; i < ruleCount && offset < data.length; i++) {
        // Byte 13: Rule name length (1 byte)
        const nameLength = data.readUInt8(offset);
        offset += 1;
        
        // Read rule name
        const ruleName = data.subarray(offset, offset + nameLength).toString('utf8');
        offset += nameLength;
        
        // Byte 15: Rule value length (1 byte)
        const valueLength = data.readUInt8(offset);
        offset += 1;
        
        // Read rule value
        const ruleValue = data.subarray(offset, offset + valueLength).toString('utf8');
        offset += valueLength;
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
      let offset = 11; // Skip header
      
      // Bytes 11-12: Player count (2 bytes, little endian)
      const playerCount = data.readUInt16LE(offset);
      offset += 2;
      
      const players: SAMPPlayer[] = [];
      
      for (let i = 0; i < playerCount && offset < data.length; i++) {
        // Byte 13: Player nickname length (1 byte)
        const nameLength = data.readUInt8(offset);
        offset += 1;
        
        // Read player nickname
        const name = data.subarray(offset, offset + nameLength).toString('utf8');
        offset += nameLength;
        
        // Bytes 15-18: Player score (4 bytes, little endian)
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
      let offset = 11; // Skip header
      
      // Bytes 11-12: Player count (2 bytes, little endian)
      const playerCount = data.readUInt16LE(offset);
      offset += 2;
      
      const players: SAMPDetailedPlayer[] = [];
      
      for (let i = 0; i < playerCount && offset < data.length; i++) {
        // Byte 13: Player ID (1 byte, values 0-255)
        const id = data.readUInt8(offset);
        offset += 1;
        
        // Byte 14: Player nickname length (1 byte)
        const nameLength = data.readUInt8(offset);
        offset += 1;
        
        // Read player nickname
        const name = data.subarray(offset, offset + nameLength).toString('utf8');
        offset += nameLength;
        
        // Bytes 16-19: Player score (4 bytes, little endian)
        const score = data.readInt32LE(offset);
        offset += 4;
        
        // Bytes 20-23: Player ping (4 bytes, little endian)
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
  private parsePingResponse(data: Buffer, sentSequence: number[]): SAMPPing | null {
    try {
      if (data.length < 15) return null;
      
      // Bytes 11-14: The same 4 pseudo-random numbers we sent
      const receivedSequence = [
        data.readUInt8(11),
        data.readUInt8(12),
        data.readUInt8(13),
        data.readUInt8(14)
      ];
      
      // Verify sequence matches what we sent
      const sequenceMatches = sentSequence.every((val, idx) => val === receivedSequence[idx]);
      
      return {
        time: Date.now(),
        sequence: receivedSequence
      };
    } catch (error) {
      console.error('Error parsing ping response:', error);
      return null;
    }
  }

  // Generic query method
  private async query(server: ServerConfig, opcode: string, customPacket?: Buffer): Promise<Buffer | null> {
    return new Promise((resolve) => {
      const socket = dgram.createSocket('udp4');
      const timeoutMs = 8000; // Longer timeout for detailed queries
      
      const timeout = setTimeout(() => {
        socket.close();
        resolve(null);
      }, timeoutMs);
      
      socket.on('message', (data) => {
        clearTimeout(timeout);
        socket.close();
        resolve(data);
      });
      
      socket.on('error', (error) => {
        clearTimeout(timeout);
        socket.close();
        console.error(`SA:MP query error (${opcode}):`, error);
        resolve(null);
      });
      
      const packet = customPacket || this.createPacket(server.ip, server.port, opcode);
      
      socket.send(packet, server.port, server.ip, (error) => {
        if (error) {
          clearTimeout(timeout);
          socket.close();
          console.error(`Failed to send SA:MP query (${opcode}):`, error);
          resolve(null);
        }
      });
    });
  }

  // Public methods for each opcode

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

  public async getDetailedPlayers(server: ServerConfig): Promise<SAMPDetailedPlayer[]> {
    const data = await this.query(server, 'd');
    return data ? this.parseDetailedPlayersResponse(data) : [];
  }

  public async getPing(server: ServerConfig): Promise<number> {
    const startTime = Date.now();
    const sentSequence = Array.from({ length: 4 }, () => Math.floor(Math.random() * 256));
    const pingPacket = this.createPingPacket(server.ip, server.port);
    
    // Override the random bytes with our sequence
    for (let i = 0; i < 4; i++) {
      pingPacket.writeUInt8(sentSequence[i], 11 + i);
    }
    
    const data = await this.query(server, 'p', pingPacket);
    
    if (!data) return -1;
    
    const endTime = Date.now();
    const pingData = this.parsePingResponse(data, sentSequence);
    
    return pingData ? endTime - startTime : -1;
  }

  // Comprehensive query method - gets all available data
  public async getFullServerInfo(server: ServerConfig): Promise<Partial<SAMPFullInfo>> {
    console.log(`🔍 Performing full SA:MP query for ${server.ip}:${server.port}`);
    
    const results: Partial<SAMPFullInfo> = {};
    
    // Get basic info (always try this first)
    const info = await this.getServerInfo(server);
    results.info = info === null ? undefined : info;
    if (!results.info) {
      console.log(`❌ Server ${server.ip}:${server.port} appears to be offline`);
      return results;
    }
    
    console.log(`✅ Basic info: ${results.info.hostname} (${results.info.players}/${results.info.maxplayers})`);
    
    // Get rules
    try {
      results.rules = await this.getServerRules(server);
      console.log(`✅ Rules: ${Object.keys(results.rules).length} rules retrieved`);
    } catch (error) {
      console.log(`⚠️ Rules query failed:`, error);
      results.rules = {};
    }
    
    // Get ping
    try {
      results.ping = await this.getPing(server);
      console.log(`✅ Ping: ${results.ping}ms`);
    } catch (error) {
      console.log(`⚠️ Ping query failed:`, error);
      results.ping = -1;
    }
    
    // Get player lists (try both methods)
    if (results.info.players > 0 && results.info.players <= 100) {
      try {
        results.players = await this.getPlayers(server);
        console.log(`✅ Basic players: ${results.players.length} players retrieved`);
        
        // Also try detailed players
        results.detailedPlayers = await this.getDetailedPlayers(server);
        console.log(`✅ Detailed players: ${results.detailedPlayers.length} players with ping info`);
      } catch (error) {
        console.log(`⚠️ Player list queries failed:`, error);
        results.players = [];
        results.detailedPlayers = [];
      }
    } else {
      console.log(`ℹ️ Skipping player lists (${results.info.players} players - too many or none)`);
      results.players = [];
      results.detailedPlayers = [];
    }
    
    return results;
  }

  // Utility method to test all opcodes
  public async testAllOpcodes(server: ServerConfig): Promise<void> {
    console.log(`🧪 Testing all SA:MP opcodes for ${server.ip}:${server.port}`);
    
    const opcodes = [
      { code: 'i', name: 'Information' },
      { code: 'r', name: 'Rules' },
      { code: 'c', name: 'Client List' },
      { code: 'd', name: 'Detailed Players' },
      { code: 'p', name: 'Ping' }
    ];
    
    for (const opcode of opcodes) {
      try {
        const startTime = Date.now();
        const data = await this.query(server, opcode.code);
        const endTime = Date.now();
        
        if (data) {
          console.log(`✅ ${opcode.name} (${opcode.code}): ${data.length} bytes in ${endTime - startTime}ms`);
        } else {
          console.log(`❌ ${opcode.name} (${opcode.code}): No response`);
        }
      } catch (error) {
        console.log(`❌ ${opcode.name} (${opcode.code}): Error -`, error);
      }
    }
  }
}

export type { SAMPInfo, SAMPPlayer, SAMPDetailedPlayer, SAMPRules, SAMPPing, SAMPFullInfo };