import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} from 'discord.js';
import { CustomClient } from '../types';
import { getRoleColor } from '../utils';
import { SAMPQuery } from '../utils/sampQuery';

const sampQuery = new SAMPQuery();

export const data = new SlashCommandBuilder()
  .setName('players')
  .setDescription('Show online players for a server')
  .addStringOption(option =>
    option
      .setName('server')
      .setDescription(
        'Which server to show players for (leave empty for active server)'
      )
      .setRequired(false)
      .setAutocomplete(true)
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
): Promise<void> {
  await interaction.deferReply();

  if (!interaction.guildId) {
    await interaction.editReply(
      '❌ This command can only be used in a server.'
    );
    return;
  }

  console.log(`[players command] guildId: ${interaction.guildId}, user: ${interaction.user.tag}`);

  const servers = (await client.servers.get(interaction.guildId)) || [];
  if (servers.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xff6b6b)
      .setTitle('❌ No Servers Configured')
      .setDescription('No servers have been configured for this guild.')
      .addFields({
        name: 'Getting Started',
        value:
          'Use `/server add` to configure a SA:MP/open.mp server to monitor.',
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const requestedServer = interaction.options.getString('server');
  let targetServer;

  if (requestedServer) {
    targetServer = servers.find(
      s => s.id === requestedServer || s.name === requestedServer
    );
    if (!targetServer) {
      await interaction.editReply(
        '❌ Server not found. Use `/server list` to see available servers.'
      );
      return;
    }
  } else {
    const intervalConfig = await client.intervals.get(interaction.guildId);
    if (!intervalConfig?.activeServerId) {
      if (servers.length === 1) {
        targetServer = servers[0];
      } else {
        await interaction.editReply(
          '❌ No active server set and multiple servers available. Use `/server activate` to set an active server, or specify which server to show players for.'
        );
        return;
      }
    } else {
      targetServer = servers.find(s => s.id === intervalConfig.activeServerId);
      if (!targetServer) {
        await interaction.editReply(
          '❌ Active server not found. Use `/server activate` to set a valid server.'
        );
        return;
      }
    }
  }

  if (!targetServer) {
    await interaction.editReply('❌ Unable to determine target server.');
    return;
  }

  console.log(`[players command] Target server: ${targetServer.ip}:${targetServer.port}`);

  try {
    console.log(`Getting server info for ${targetServer.ip}:${targetServer.port}`);
    const info = await sampQuery.getServerInfo(targetServer, interaction.guildId);

    if (!info) {
      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ Server Offline')
        .setDescription(
          `**${targetServer.name}** is currently offline or unreachable.`
        )
        .setFooter({ text: `${targetServer.ip}:${targetServer.port}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const color = getRoleColor(interaction.guild!);

    if (info.players === 0) {
      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle('No Players Online')
        .setDescription(`**${targetServer.name}** has no players online.`)
        .addFields(
          {
            name: 'Server Capacity',
            value: `0/${info.maxplayers}`,
            inline: true,
          },
          { name: 'Gamemode', value: info.gamemode || 'Unknown', inline: true }
        )
        .setFooter({ text: `${targetServer.ip}:${targetServer.port}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (info.players > 100) {
      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle('Too Many Players')
        .setDescription(
          `**${targetServer.name}** has ${info.players} players online.`
        )
        .addFields({
          name: 'Player List Unavailable',
          value:
            'Server has too many players to display individual names. Player lists are only shown for servers with 100 or fewer players.',
          inline: false,
        })
        .setFooter({ text: `${targetServer.ip}:${targetServer.port}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    let players: Array<{ name: string; score: number; ping?: number }> = [];

    console.log(`Server has ${info.players} players, attempting to get player list...`);

    try {
      console.log('Trying detailed players query...');
      const detailedPlayers = await sampQuery.getDetailedPlayers(targetServer, interaction.guildId);
      console.log(`Detailed players response: ${detailedPlayers.length} players`);

      if (detailedPlayers.length > 0) {
        players = detailedPlayers.map(player => ({
          name: player.name,
          score: player.score,
          ping: player.ping,
        }));
        console.log(`Using detailed player data: ${players.length} players`);
      } else {
        console.log('Detailed query returned 0 players, trying basic query...');
        const basicPlayers = await sampQuery.getPlayers(targetServer, interaction.guildId);
        console.log(`Basic players response: ${basicPlayers.length} players`);

        players = basicPlayers.map(player => ({
          name: player.name,
          score: player.score,
        }));
        console.log(`Using basic player data: ${players.length} players`);
      }
    } catch (playerError) {
      console.error('Player list query error:', playerError);

      const embed = new EmbedBuilder()
        .setColor(0xff9500)
        .setTitle('⚠️ Player List Error')
        .setDescription(
          `**${targetServer.name}** has ${info.players} players online, but failed to retrieve player list.`
        )
        .addFields(
          {
            name: 'Server Info',
            value:
              `**Players:** ${info.players}/${info.maxplayers}\n` +
              `**Gamemode:** ${info.gamemode || 'Unknown'}\n` +
              `**Address:** \`${targetServer.ip}:${targetServer.port}\``,
            inline: false
          },
          {
            name: 'Error Details',
            value: playerError instanceof Error ? playerError.message : 'Unknown error',
            inline: false
          }
        )
        .setFooter({ text: `${targetServer.ip}:${targetServer.port}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (players.length === 0) {
      console.log(`No players returned from queries despite server showing ${info.players} players`);

      const embed = new EmbedBuilder()
        .setColor(0xff9500)
        .setTitle('⚠️ Player Names Unavailable')
        .setDescription(
          `**${targetServer.name}** reports ${info.players} players online, but player names could not be retrieved.`
        )
        .addFields(
          {
            name: 'Server Info',
            value:
              `**Players:** ${info.players}/${info.maxplayers}\n` +
              `**Gamemode:** ${info.gamemode || 'Unknown'}\n` +
              `**Address:** \`${targetServer.ip}:${targetServer.port}\``,
            inline: false
          },
          {
            name: 'Possible Reasons',
            value:
              '• Network connectivity issues\n' +
              '• Temporary server overload',
            inline: false
          }
        )
        .setFooter({
          text: `${targetServer.ip}:${targetServer.port} • This doesn't affect server monitoring`
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const playersPerPage = 20;
    const totalPages = Math.ceil(players.length / playersPerPage);
    let currentPage = 0;

    const generateEmbed = (page: number) => {
      const start = page * playersPerPage;
      const end = start + playersPerPage;
      const pageData = players.slice(start, end);

      const nameColumnWidth = 16;
      const scoreColumnWidth = 6;

      let playerTable = '```\n';
      playerTable += 'Name'.padEnd(nameColumnWidth) + ' Score\n';
      playerTable += '-'.repeat(nameColumnWidth + scoreColumnWidth + 1) + '\n';

      pageData.forEach(player => {
        const truncatedName = player.name.length > nameColumnWidth - 1
          ? player.name.substring(0, nameColumnWidth - 1)
          : player.name;

        const nameColumn = truncatedName.padEnd(nameColumnWidth);
        const scoreColumn = player.score.toString().padStart(scoreColumnWidth);

        playerTable += `${nameColumn}${scoreColumn}\n`;
      });

      playerTable += '```';

      return new EmbedBuilder()
        .setColor(color)
        .setTitle('Online Players')
        .setDescription(playerTable)
        .setFooter({
          text: totalPages > 1
            ? `Page ${page + 1}/${totalPages} • ${players.length} players • ${targetServer.ip}:${targetServer.port}`
            : `${players.length} players • ${targetServer.ip}:${targetServer.port}`,
        })
        .setTimestamp();
    };

    const generateButtons = (page: number) => {
      return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('players_first')
          .setLabel('« First')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId('players_prev')
          .setLabel('‹ Previous')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId('players_next')
          .setLabel('Next ›')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page >= totalPages - 1),
        new ButtonBuilder()
          .setCustomId('players_last')
          .setLabel('Last »')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages - 1)
      );
    };

    const embed = generateEmbed(currentPage);
    const buttons = totalPages > 1 ? generateButtons(currentPage) : undefined;

    const message = await interaction.editReply({
      embeds: [embed],
      components: buttons ? [buttons] : [],
    });

    if (totalPages > 1) {
      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300000,
      });

      collector.on('collect', async buttonInteraction => {
        if (buttonInteraction.user.id !== interaction.user.id) {
          await buttonInteraction.reply({
            content: 'Only the user who ran the command can use these buttons.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        switch (buttonInteraction.customId) {
          case 'players_first':
            currentPage = 0;
            break;
          case 'players_prev':
            currentPage = Math.max(0, currentPage - 1);
            break;
          case 'players_next':
            currentPage = Math.min(totalPages - 1, currentPage + 1);
            break;
          case 'players_last':
            currentPage = totalPages - 1;
            break;
        }

        const newEmbed = generateEmbed(currentPage);
        const newButtons = generateButtons(currentPage);

        await buttonInteraction.update({
          embeds: [newEmbed],
          components: [newButtons],
        });
      });

      collector.on('end', async () => {
        const disabledButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('players_first')
            .setLabel('« First')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId('players_prev')
            .setLabel('‹ Previous')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId('players_next')
            .setLabel('Next ›')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId('players_last')
            .setLabel('Last »')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        );

        try {
          await interaction.editReply({
            components: [disabledButtons],
          });
        } catch (error) {
          // Message might have been deleted, ignore error
        }
      });
    }
  } catch (error) {
    console.error('Error getting players:', error);

    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('❌ Error')
      .setDescription(
        `Failed to retrieve information for **${targetServer.name}**.`
      )
      .addFields({
        name: 'Error Details',
        value: error instanceof Error ? error.message : 'Unknown error',
        inline: false
      })
      .setFooter({ text: `${targetServer.ip}:${targetServer.port}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}