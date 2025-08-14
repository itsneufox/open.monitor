import { EmbedBuilder } from 'discord.js';
import { ServerConfig } from '../types';
import { getPlayerCount } from './getPlayerCount';

export async function getStatus(
  server: ServerConfig,
  color: number,
  guildId: string = 'unknown',
  isMonitoring: boolean = false
): Promise<EmbedBuilder> {
  const embed = new EmbedBuilder().setColor(color).setTimestamp();

  try {
    const playerInfo = await getPlayerCount(server, guildId, isMonitoring);

    if (!playerInfo.isOnline) {
      const errorMsg = playerInfo.error || 'Server is offline or unreachable';
      return embed
        .setTitle('Server Status')
        .setDescription(`**${server.name}**\n\`${server.ip}:${server.port}\`\n❌ ${errorMsg}`);
    }

    try {
      const { ServerMetadataCache } = await import('./serverCache');
      const metadata = await ServerMetadataCache.getMetadata(server, guildId, null as any);

      const statusTitle = metadata?.isOpenMP ? 'open.mp Server Status' : 'SA:MP Server Status';

      embed
        .setTitle(statusTitle)
        .setDescription(`**${playerInfo.name}**\n\`${server.ip}:${server.port}\``)
        .addFields(
          { name: 'Players', value: `${playerInfo.playerCount}/${playerInfo.maxPlayers}`, inline: true },
          { name: 'Status', value: '✅ Online', inline: true }
        );

      if (metadata) {
        embed.addFields(
          { name: 'Gamemode', value: metadata.gamemode || 'Unknown', inline: true },
          { name: 'Language', value: metadata.language || 'Unknown', inline: true },
          { name: 'Version', value: metadata.version, inline: true },
          { name: 'Password', value: '❓ Unknown', inline: true } // We don't query this anymore
        );

        if (metadata.banner) {
          embed.setImage(metadata.banner);
        }
        if (metadata.logo) {
          embed.setThumbnail(metadata.logo);
        }

        const cacheAge = Math.floor((Date.now() - metadata.lastUpdated) / (1000 * 60 * 60));
        embed.setFooter({
          text: `Server info cached ${cacheAge}h ago • Player count ${playerInfo.isCached ? 'cached' : 'live'}`
        });
      } else {
        // No metadata available yet, show basic info
        embed.addFields(
          { name: 'Gamemode', value: '❓ Loading...', inline: true },
          { name: 'Language', value: '❓ Loading...', inline: true },
          { name: 'Version', value: '❓ Loading...', inline: true },
          { name: 'Password', value: '❓ Unknown', inline: true }
        );

        embed.setFooter({
          text: `Player count ${playerInfo.isCached ? 'cached' : 'live'} • Loading server details...`
        });
      }

      return embed;
    } catch (metaError) {
      console.log('Could not get metadata, using basic status');

      embed
        .setTitle('Server Status')
        .setDescription(`**${playerInfo.name}**\n\`${server.ip}:${server.port}\``)
        .addFields(
          { name: 'Players', value: `${playerInfo.playerCount}/${playerInfo.maxPlayers}`, inline: true },
          { name: 'Status', value: '✅ Online', inline: true },
          { name: 'Gamemode', value: '❓ Unknown', inline: true },
          { name: 'Language', value: '❓ Unknown', inline: true },
          { name: 'Version', value: '❓ Unknown', inline: true },
          { name: 'Password', value: '❓ Unknown', inline: true }
        );

      return embed;
    }

  } catch (error) {
    console.error('Error getting server status:', error);
    return embed
      .setTitle('Server Status')
      .setDescription(`**${server.name}**\n\`${server.ip}:${server.port}\`\n❌ Bot experiencing issues - try again later`);
  }
}