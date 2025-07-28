import { EmbedBuilder } from 'discord.js';
import { ServerConfig } from '../types';
import { SAMPQuery } from './sampQuery';

const sampQuery = new SAMPQuery();

export async function getStatus(
  server: ServerConfig,
  color: number
): Promise<EmbedBuilder> {
  let statusTitle = 'Server Status';
  const embed = new EmbedBuilder().setColor(color).setTimestamp();

  try {
    const info = await sampQuery.getServerInfo(server);

    if (!info) {
      embed
        .setTitle(statusTitle)
        .setDescription(
          `**${server.ip}:${server.port}**\n❌ Server is offline or unreachable`
        );
      return embed;
    }

    // Definitive open.mp detection using 'o' opcode
    const isOpenMP = await sampQuery.isOpenMP(server);

    // Get server rules for additional version info
    const rules = await sampQuery.getServerRules(server);

    // Set title and version based on definitive detection
    let detectedVersion = 'Unknown';
    if (isOpenMP) {
      statusTitle = 'open.mp Server Status';
      detectedVersion = 'open.mp';
    } else {
      statusTitle = 'SA:MP Server Status';
      detectedVersion = 'SA:MP 0.3.7';

      // Try to get more specific SA:MP version from rules
      if (rules.version && rules.version !== 'omp') {
        detectedVersion = rules.version;
      } else if (rules.Ver && rules.Ver !== 'omp') {
        detectedVersion = rules.Ver;
      } else if (rules.v && rules.v !== 'omp') {
        detectedVersion = rules.v;
      }
    }

    embed.setTitle(statusTitle);

    // Get open.mp extra info for banners and logos
    if (isOpenMP) {
      try {
        const extraInfo = await sampQuery.getOpenMPExtraInfo(server);
        if (extraInfo) {
          // Set banner image (prefer dark banner, fallback to light banner)
          if (extraInfo.darkBanner) {
            embed.setImage(extraInfo.darkBanner);
          } else if (extraInfo.lightBanner) {
            embed.setImage(extraInfo.lightBanner);
          }

          // Set logo as thumbnail
          if (extraInfo.logo) {
            embed.setThumbnail(extraInfo.logo);
          }
        }
      } catch (error) {
        console.log('Could not fetch open.mp extra info:', error);
      }
    }

    // Clean description with server name and address
    embed.setDescription(`**${info.hostname}**\n\`${server.ip}:${server.port}\``);

    embed.addFields(
      {
        name: 'Players',
        value: `${info.players}/${info.maxplayers}`,
        inline: true,
      },
      { name: 'Gamemode', value: info.gamemode || 'Unknown', inline: true },
      { name: 'Language', value: info.language || 'Unknown', inline: true },
      { name: 'Version', value: detectedVersion, inline: true },
      { name: 'Password', value: info.password ? 'Yes' : 'No', inline: true },
      { name: 'Status', value: '✅ Online', inline: true }
    );

    return embed;
  } catch (error) {
    console.error('Error getting server status:', error);
    embed
      .setTitle(statusTitle)
      .setDescription(
        `**${server.ip}:${server.port}**\n❌ Error querying server`
      );
    return embed;
  }
}