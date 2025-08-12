import { EmbedBuilder } from 'discord.js';
import { ServerConfig } from '../types';
import { SAMPQuery } from './sampQuery';

const sampQuery = new SAMPQuery();

export async function getStatus(
  server: ServerConfig,
  color: number,
  guildId: string = 'unknown',
  isMonitoring: boolean = false
): Promise<EmbedBuilder> {
  let statusTitle = 'Server Status';
  const embed = new EmbedBuilder().setColor(color).setTimestamp();

  try {
    const info = await sampQuery.getServerInfo(server, guildId, isMonitoring);
    if (!info) {
      embed
        .setTitle(statusTitle)
        .setDescription(
          `**${server.ip}:${server.port}**\n❌ Server is offline or unreachable`
        );
      return embed;
    }

    const isOpenMP = await sampQuery.isOpenMP(server, guildId, isMonitoring);
    const rules = await sampQuery.getServerRules(server, guildId, isMonitoring);

    let detectedVersion = 'Unknown';
    let serverType = 'Unknown';

    if (isOpenMP) {
      statusTitle = 'open.mp Server Status';
      serverType = 'open.mp';

      if (rules.version) {
        if (rules.version.includes('omp ') || rules.version.includes('open.mp')) {
          detectedVersion = rules.version;
        } else {
          detectedVersion = `open.mp ${rules.version}`;
        }
      } else if (rules.allowed_clients) {
        detectedVersion = 'open.mp';
      } else {
        detectedVersion = 'open.mp';
      }
    } else {
      statusTitle = 'SA:MP Server Status';
      serverType = 'SA:MP';

      if (rules.version && !rules.version.includes('omp')) {
        if (rules.version.includes('SA:MP') || rules.version.includes('0.3')) {
          detectedVersion = rules.version;
        } else {
          detectedVersion = `SA:MP ${rules.version}`;
        }
      } else if (rules.Ver && !rules.Ver.includes('omp')) {
        detectedVersion = rules.Ver.includes('SA:MP') ? rules.Ver : `SA:MP ${rules.Ver}`;
      } else if (rules.v && !rules.v.includes('omp')) {
        detectedVersion = rules.v.includes('SA:MP') ? rules.v : `SA:MP ${rules.v}`;
      } else {
        detectedVersion = 'SA:MP 0.3.7';
      }
    }

    embed.setTitle(statusTitle);

    if (isOpenMP) {
      try {
        const extraInfo = await sampQuery.getOpenMPExtraInfo(
          server,
          guildId,
          isMonitoring
        );
        if (extraInfo) {
          if (extraInfo.darkBanner) {
            embed.setImage(extraInfo.darkBanner);
          } else if (extraInfo.lightBanner) {
            embed.setImage(extraInfo.lightBanner);
          }

          if (extraInfo.logo) {
            embed.setThumbnail(extraInfo.logo);
          }
        }
      } catch (error) {
        console.log('Could not fetch open.mp extra info:', error);
      }
    }

    embed.setDescription(
      `**${info.hostname}**\n\`${server.ip}:${server.port}\``
    );

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