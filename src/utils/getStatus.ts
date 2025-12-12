import { EmbedBuilder } from 'discord.js';
import { ServerConfig } from '../types';
import { SAMPQuery } from './sampQuery';

const sampQuery = new SAMPQuery();

export async function getStatus(
  server: ServerConfig,
  color: number,
  guildId: string = 'unknown',
  isMonitoring: boolean = false,
  theme: 'classic' | 'detailed' = 'classic',
  client?: {
    uptimes: {
      get: (key: string) => Promise<{
        uptime: number;
        downtime: number;
      } | null>;
    };
  }
): Promise<EmbedBuilder> {
  let statusTitle = 'Server Status';
  const embed = new EmbedBuilder().setColor(color).setTimestamp();

  try {
    // Check if server is banned first
    const { SecurityValidator } = await import('./securityValidator');
    const serverAddress = `${server.ip}:${server.port}`;
    const banCheck = SecurityValidator.isIPBanned(serverAddress);

    if (banCheck.banned) {
      embed
        .setTitle(statusTitle)
        .setDescription(
          `**${server.ip}:${server.port}**\nBanned: ${banCheck.reason || 'Server is banned'}`
        );
      return embed;
    }

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

    if (isOpenMP) {
      statusTitle = 'open.mp Server Status';

      if (rules.version) {
        if (
          rules.version.includes('omp ') ||
          rules.version.includes('open.mp')
        ) {
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

      if (rules.version && !rules.version.includes('omp')) {
        if (rules.version.includes('SA:MP') || rules.version.includes('0.3')) {
          detectedVersion = rules.version;
        } else {
          detectedVersion = `SA:MP ${rules.version}`;
        }
      } else if (rules.Ver && !rules.Ver.includes('omp')) {
        detectedVersion = rules.Ver.includes('SA:MP')
          ? rules.Ver
          : `SA:MP ${rules.Ver}`;
      } else if (rules.v && !rules.v.includes('omp')) {
        detectedVersion = rules.v.includes('SA:MP')
          ? rules.v
          : `SA:MP ${rules.v}`;
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

    // Get uptime data if available
    let uptimeDisplay = '✅ Online';
    if (client?.uptimes) {
      try {
        const { getServerDataKey } = await import('../types');
        const serverDataKey = getServerDataKey(guildId, server.id);
        const uptimeStats = await client.uptimes.get(serverDataKey);

        if (
          uptimeStats &&
          (uptimeStats.uptime > 0 || uptimeStats.downtime > 0)
        ) {
          const totalChecks = uptimeStats.uptime + uptimeStats.downtime;
          const percentage = (uptimeStats.uptime / totalChecks) * 100;

          let emoji = '⚪';
          if (percentage >= 95) {
            emoji = '🟢';
          }

          uptimeDisplay = `${emoji} ${percentage.toFixed(2)}%`;
        }
      } catch (error) {
        // If uptime fetch fails, just show online status
        console.log('Could not fetch uptime data:', error);
      }
    }

    // Format website URL if available
    let websiteUrl = 'N/A';
    if (rules.weburl && typeof rules.weburl === 'string') {
      const url = rules.weburl.trim();
      if (url) {
        websiteUrl = url.startsWith('http') ? url : `https://${url}`;
      }
    }

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
      { name: 'Uptime', value: uptimeDisplay, inline: true }
    );

    // Add website URL if available
    if (websiteUrl !== 'N/A') {
      embed.addFields({
        name: 'Website',
        value: websiteUrl,
        inline: true,
      });
    }

    // Add player list if detailed theme is enabled
    if (theme === 'detailed' && info.players > 0 && info.players <= 100) {
      try {
        let players: Array<{ name: string; score: number; ping?: number }> = [];

        // Try detailed query first, then fall back to basic query
        try {
          const detailedPlayers = await sampQuery.getDetailedPlayers(
            server,
            guildId
          );
          if (detailedPlayers.length > 0) {
            players = detailedPlayers.map(player => ({
              name: player.name,
              score: player.score,
              ping: player.ping,
            }));
          } else {
            // Detailed query returned 0 players, try basic query
            const basicPlayers = await sampQuery.getPlayers(server, guildId);
            players = basicPlayers.map(player => ({
              name: player.name,
              score: player.score,
            }));
          }
        } catch {
          // Fallback to basic query on error
          try {
            const basicPlayers = await sampQuery.getPlayers(server, guildId);
            players = basicPlayers.map(player => ({
              name: player.name,
              score: player.score,
            }));
          } catch {
            // Both queries failed, skip player list
          }
        }

        if (players.length > 0) {
          // Show only first 20 players to keep embed compact
          const displayPlayers = players.slice(0, 20);
          const nameColumnWidth = 16;
          const scoreColumnWidth = 6;

          let playerTable = '```\n';
          playerTable += 'Name'.padEnd(nameColumnWidth) + ' Score\n';
          playerTable +=
            '-'.repeat(nameColumnWidth + scoreColumnWidth + 1) + '\n';

          displayPlayers.forEach(player => {
            const truncatedName =
              player.name.length > nameColumnWidth - 1
                ? player.name.substring(0, nameColumnWidth - 1)
                : player.name;

            const nameColumn = truncatedName.padEnd(nameColumnWidth);
            const scoreColumn = player.score
              .toString()
              .padStart(scoreColumnWidth);

            playerTable += `${nameColumn}${scoreColumn}\n`;
          });

          playerTable += '```';

          const playerListTitle =
            players.length > 20
              ? `Online Players (showing 20/${players.length})`
              : 'Online Players';

          embed.addFields({
            name: playerListTitle,
            value: playerTable,
            inline: false,
          });

          if (players.length > 20) {
            embed.addFields({
              name: 'View All Players',
              value: 'Use `/players` to see the complete player list',
              inline: false,
            });
          }
        }
      } catch (playerError) {
        console.log(
          'Could not fetch player list for detailed theme:',
          playerError
        );
        // Don't add player list if there's an error, just continue with basic info
      }
    } else if (theme === 'detailed' && info.players > 100) {
      embed.addFields({
        name: 'Player List',
        value: `Too many players (${info.players}) to display. Use \`/players\` command.`,
        inline: false,
      });
    }

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
