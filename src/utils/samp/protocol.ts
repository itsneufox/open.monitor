import * as dgram from 'dgram';
import { ServerConfig } from '../../types';
import { SecurityValidator } from '../securityValidator';

export class SAMPProtocol {
  static createPacket(ip: string, port: number, opcode: string): Buffer {
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

  static createPingPacket(ip: string, port: number): Buffer {
    const basePacket = this.createPacket(ip, port, 'p');
    const packet = Buffer.alloc(15);

    basePacket.copy(packet, 0);

    for (let i = 0; i < 4; i++) {
      packet.writeUInt8(Math.floor(Math.random() * 256), 11 + i);
    }

    return packet;
  }

  static async query(
    server: ServerConfig,
    opcode: string,
    guildId: string,
    customPacket?: Buffer,
    isMonitoringCycle: boolean = false,
    isManualCommand: boolean = false
  ): Promise<Buffer | null> {
    if (!SecurityValidator.validateServerIP(server.ip)) {
      console.warn(`Blocked query to invalid IP: ${server.ip}`);
      return null;
    }
    if (isManualCommand) {
      console.log(`Manual query: ${server.ip}:${server.port} opcode:${opcode}`);
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
}
