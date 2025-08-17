import { EmbedBuilder } from 'discord.js';
import { ServerConfig } from '../types';
import { getPlayerCount } from './getPlayerCount';
import { SAMPQuery } from './sampQuery';

const sampQuery = new SAMPQuery();

export async function getStatus(
  server: ServerConfig,
  color: number,
  guildId: string = 'unknown',
  isMonitoring: boolean = false,
  userId?: string,
  isManualCommand: boolean = false
): Promise<EmbedBuilder> {
  const embed = new EmbedBuilder().setColor(color).setTimestamp();

  try {
    const playerInfo = await getPlayerCount(
      server,
      guildId,
      isMonitoring,
      isManualCommand,
      userId
    );

    
    if (playerInfo.error && playerInfo.error.includes('rate limit')) {
      embed
        .setTitle('Server Status (Rate Limited)')
        .setDescription(
          `**${playerInfo.name}**\n\`${server.ip}:${server.port}\``
        )
        .addFields(
          { name: 'Status', value: '⚠️ Rate Limited', inline: true },
          {
            name: 'Players',
            value: playerInfo.isCached
              ? `${playerInfo.playerCount}/${playerInfo.maxPlayers} (cached)`
              : 'Unknown',
            inline: true,
          },
          {
            name: 'Info',
            value:
              'Bot queries are rate limited. Using cached data if available.',
            inline: false,
          }
        );

      return embed;
    }

    if (!playerInfo.isOnline) {
      const errorMsg = playerInfo.error || 'Server is offline or unreachable';
      return embed
        .setTitle('Server Status')
        .setDescription(
          `**${server.name}**\n\`${server.ip}:${server.port}\`\n❌ ${errorMsg}`
        );
    }

    try {
      
      const metadata = await sampQuery.getServerMetadata(
        server,
        guildId,
        userId,
        isManualCommand
      );

      if (metadata) {
        const statusTitle = metadata.isOpenMP
          ? 'open.mp Server Status'
          : 'SA:MP Server Status';

        embed
          .setTitle(statusTitle)
          .setDescription(
            `**${metadata.hostname}**\n\`${server.ip}:${server.port}\``
          )
          .addFields(
            {
              name: 'Players',
              value: `${playerInfo.playerCount}/${metadata.maxPlayers}`,
              inline: true,
            },
            {
              name: 'Gamemode',
              value: metadata.gamemode || 'Unknown',
              inline: true,
            },
            {
              name: 'Language',
              value: metadata.language || 'Unknown',
              inline: true,
            },
            {
              name: 'Version',
              value: metadata.version || 'Unknown',
              inline: true,
            },
            { name: 'Password', value: 'No', inline: true }, 
            { name: 'Status', value: '✅ Online', inline: true }
          );

        if (metadata.banner) {
          embed.setImage(metadata.banner);
        }
        if (metadata.logo) {
          embed.setThumbnail(metadata.logo);
        }

        return embed;
      }
    } catch (metaError) {
      console.log('Could not get detailed metadata, trying cache...');
    }

    
    try {
      const { ServerMetadataCache } = await import('./serverCache');
      const metadata = await ServerMetadataCache.getMetadata(
        server,
        guildId,
        null as any
      );

      if (metadata) {
        const statusTitle = metadata.isOpenMP
          ? 'open.mp Server Status'
          : 'SA:MP Server Status';

        embed
          .setTitle(statusTitle)
          .setDescription(
            `**${metadata.hostname}**\n\`${server.ip}:${server.port}\``
          )
          .addFields(
            {
              name: 'Players',
              value: `${playerInfo.playerCount}/${metadata.maxPlayers}`,
              inline: true,
            },
            {
              name: 'Gamemode',
              value: metadata.gamemode || 'Unknown',
              inline: true,
            },
            {
              name: 'Language',
              value: metadata.language || 'Unknown',
              inline: true,
            },
            {
              name: 'Version',
              value: metadata.version || 'Unknown',
              inline: true,
            },
            { name: 'Password', value: 'No', inline: true },
            { name: 'Status', value: '✅ Online', inline: true }
          );

        if (metadata.banner) {
          embed.setImage(metadata.banner);
        }
        if (metadata.logo) {
          embed.setThumbnail(metadata.logo);
        }

        return embed;
      }
    } catch (cacheError) {
      console.log('Cache metadata also failed, using basic status');
    }

    
    embed
      .setTitle('Server Status')
      .setDescription(`**${playerInfo.name}**\n\`${server.ip}:${server.port}\``)
      .addFields(
        {
          name: 'Players',
          value: `${playerInfo.playerCount}/${playerInfo.maxPlayers}`,
          inline: true,
        },
        { name: 'Gamemode', value: 'Unknown', inline: true },
        { name: 'Language', value: 'Unknown', inline: true },
        { name: 'Version', value: 'Unknown', inline: true },
        { name: 'Password', value: 'Unknown', inline: true },
        { name: 'Status', value: '✅ Online', inline: true }
      );

    return embed;
  } catch (error) {
    console.error('Error getting server status:', error);
    return embed
      .setTitle('Server Status')
      .setDescription(
        `**${server.name}**\n\`${server.ip}:${server.port}\`\n❌ Bot experiencing issues - try again later`
      );
  }
}
