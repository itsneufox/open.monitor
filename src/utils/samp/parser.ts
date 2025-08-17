import * as iconv from 'iconv-lite';
import { SecurityValidator } from '../securityValidator';
import {
  SAMPInfo,
  SAMPPlayer,
  SAMPDetailedPlayer,
  SAMPRules,
  SAMPPing,
  OpenMPExtraInfo,
} from './types';

export class SAMPParser {
  static decodeString(buffer: Buffer): string {
    try {
      let decoded = buffer.toString('utf8');

      if (decoded.includes('�') || decoded.includes('\ufffd')) {
        const encodings = ['latin1', 'cp1252', 'iso-8859-1', 'cp850'];

        for (const encoding of encodings) {
          try {
            decoded = iconv.decode(buffer, encoding);
            if (!decoded.includes('�') && !decoded.includes('\ufffd')) {
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

  static parseInfoResponse(data: Buffer): SAMPInfo | null {
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

  static parseRulesResponse(data: Buffer): SAMPRules {
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

  static parsePlayersResponse(data: Buffer): SAMPPlayer[] {
    try {
      let offset = 11;

      const playerCount = data.readUInt16LE(offset);
      offset += 2;

      const players: SAMPPlayer[] = [];

      for (let i = 0; i < playerCount && offset < data.length; i++) {
        const nameLength = data.readUInt8(offset);
        offset += 1;

        const name = this.decodeString(
          data.subarray(offset, offset + nameLength)
        );
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

  static parseDetailedPlayersResponse(data: Buffer): SAMPDetailedPlayer[] {
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

  static parsePingResponse(
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

  static parseOpenMPExtraInfo(data: Buffer): OpenMPExtraInfo | null {
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
        if (
          lightBannerLength > 0 &&
          offset + lightBannerLength <= data.length
        ) {
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
}
