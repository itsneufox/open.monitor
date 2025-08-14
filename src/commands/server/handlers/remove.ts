import { ChatInputCommandInteraction, ModalSubmitInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { CustomClient } from '../../../types';
import { DatabaseCleaner } from '../../../utils/databaseCleaner';
import { getServerDataKey } from '../../../types';
import { InputValidator } from '../../../utils/inputValidator';
import { createRemoveServerModal, parseRemoveServerForm } from '../forms/removeServerForm';

export async function handleRemove(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
) {
  const servers = (await client.servers.get(interaction.guildId!)) || [];
  if (servers.length === 0) {
    await interaction.reply({
      content: 'No servers are currently configured for this guild.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const modal = createRemoveServerModal(servers);
  await interaction.showModal(modal);

  try {
    const modalSubmission = await interaction.awaitModalSubmit({
      time: 300000,
      filter: i => i.customId === 'server_remove_form' && i.user.id === interaction.user.id,
    });

    await handleRemoveFormSubmission(modalSubmission, client, servers);
  } catch (error) {
    console.log('Server remove form submission timed out');
  }
}

async function handleRemoveFormSubmission(
  interaction: ModalSubmitInteraction,
  client: CustomClient,
  servers: any[]
) {
  await interaction.deferReply();

  const formData = parseRemoveServerForm(interaction);
  if ('error' in formData) {
    await interaction.editReply(`${formData.error}`);
    return;
  }

  const { serverName, confirmText } = formData;

  if (confirmText.toLowerCase() !== 'delete') {
    await interaction.editReply('Server deletion cancelled. You must type "delete" exactly to confirm.');
    return;
  }

  const serverIndex = servers.findIndex(
    s => s.name.toLowerCase() === serverName.toLowerCase() || s.id === serverName
  );

  if (serverIndex === -1) {
    await interaction.editReply('Server not found. Please check the server name and try again.');
    return;
  }

  const server = servers[serverIndex];
  if (!server) {
    await interaction.editReply('Unable to locate server for deletion.');
    return;
  }

  try {
    const serverDataKey = getServerDataKey(interaction.guildId!, server.id);
    const chartData = await client.maxPlayers.get(serverDataKey);
    const uptimeData = await client.uptimes.get(serverDataKey);
    const intervalConfig = await client.intervals.get(interaction.guildId!);

    const isActiveServer = intervalConfig?.activeServerId === server.id;

    servers.splice(serverIndex, 1);
    await client.servers.set(interaction.guildId!, servers);

    const cleaner = new DatabaseCleaner(client);
    await cleaner.cleanupServer(interaction.guildId!, server.id);

    if (isActiveServer && intervalConfig) {
      if (servers.length > 0) {
        const newActiveServer = servers[0];
        if (newActiveServer) {
          intervalConfig.activeServerId = newActiveServer.id;
          intervalConfig.statusMessage = null;
          await client.intervals.set(interaction.guildId!, intervalConfig);

          if (intervalConfig.serverIpChannel) {
            try {
              const serverIpChannel = await client.channels
                .fetch(intervalConfig.serverIpChannel)
                .catch(() => null);
              if (serverIpChannel && 'setName' in serverIpChannel) {
                const channelNameValidation = InputValidator.validateChannelName(
                  `IP: ${newActiveServer.ip}:${newActiveServer.port}`
                );
                if (channelNameValidation.valid) {
                  await (serverIpChannel as any).setName(channelNameValidation.sanitized);
                }
              }
            } catch (error) {
              console.error('Failed to update IP channel name:', error);
            }
          }
        }
      } else {
        delete intervalConfig.activeServerId;
        intervalConfig.enabled = false;
        intervalConfig.statusMessage = null;
        await client.intervals.set(interaction.guildId!, intervalConfig);
      }
    }

    let guildConfig = client.guildConfigs.get(interaction.guildId!) || {
      servers: [],
    };
    guildConfig.servers = servers;
    if (intervalConfig) {
      guildConfig.interval = intervalConfig;
    }
    client.guildConfigs.set(interaction.guildId!, guildConfig);

    const embed = new EmbedBuilder()
      .setColor(0xff6b6b)
      .setTitle('Server Removed Successfully')
      .setDescription(
        `Removed **${server.name}** and cleaned up all associated data`
      )
      .addFields(
        {
          name: 'Server Address',
          value: `${server.ip}:${server.port}`,
          inline: true,
        },
        {
          name: 'Added Date',
          value: new Date(server.addedAt).toLocaleDateString(),
          inline: true,
        },
        { name: 'Added By', value: `<@${server.addedBy}>`, inline: true }
      )
      .setTimestamp();

    if (chartData) {
      embed.addFields(
        {
          name: 'Data Cleaned',
          value: `${chartData.days?.length || 0} days of chart data removed`,
          inline: true,
        },
        {
          name: 'Peak Today',
          value: `${chartData.maxPlayersToday} players (deleted)`,
          inline: true,
        }
      );
    }

    if (uptimeData) {
      const totalChecks = uptimeData.uptime + uptimeData.downtime;
      const uptimePercentage =
        totalChecks > 0
          ? ((uptimeData.uptime / totalChecks) * 100).toFixed(1)
          : '0';
      embed.addFields({
        name: 'Uptime Data Cleaned',
        value: `${uptimePercentage}% uptime data (${uptimeData.uptime}/${totalChecks} checks) removed`,
        inline: true,
      });
    }

    if (servers.length === 0) {
      embed.addFields(
        {
          name: 'Monitoring Status',
          value: 'Disabled (no servers remaining)',
          inline: false,
        },
        {
          name: 'Next Steps',
          value: 'Use `/server add` to add a new server',
          inline: false,
        }
      );
    } else if (isActiveServer) {
      const newActiveServer = servers[0];
      if (newActiveServer) {
        embed.addFields(
          {
            name: 'Monitoring Status',
            value: `Switched to **${newActiveServer.name}**`,
            inline: false,
          },
          {
            name: 'Active Server',
            value: `Now monitoring: ${newActiveServer.name} (${newActiveServer.ip}:${newActiveServer.port})`,
            inline: false,
          }
        );
      }
    } else {
      embed.addFields(
        {
          name: 'Monitoring Status',
          value: 'Continues with existing active server',
          inline: false,
        },
        {
          name: 'Remaining Servers',
          value: `${servers.length} server${servers.length === 1 ? '' : 's'} still configured`,
          inline: false,
        }
      );
    }

    embed.addFields({
      name: 'Database Cleanup',
      value:
        '• Chart data removed from database\n' +
        '• Uptime statistics removed\n' +
        '• All associated data cleaned up\n' +
        '• No orphaned data left behind',
      inline: false,
    });

    await interaction.editReply({ embeds: [embed] });

    console.log(
      `Deleted server ${server.name} (${server.id}) and cleaned up data for guild ${interaction.guild?.name}`
    );
  } catch (error) {
    console.error('Error deleting server config:', error);
    await interaction.editReply(
      'An error occurred while deleting the server configuration. Please try again.'
    );
  }
}