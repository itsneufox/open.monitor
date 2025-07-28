import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  TextChannel,
  VoiceChannel,
  MessageFlags,
  Channel,
  ChannelType,
} from 'discord.js';
import { CustomClient } from '../types';
import { getPlayerCount, getStatus, getRoleColor } from '../utils';
import { checkPermissionOrReply } from '../utils/permissions';

export const data = new SlashCommandBuilder()
  .setName('forceupdate')
  .setDescription('Force immediate server status update')
  .addStringOption(option =>
    option
      .setName('server')
      .setDescription('Which server to update (leave empty for active server)')
      .setRequired(false)
      .setAutocomplete(true)
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
): Promise<void> {
  // Check permissions first (before deferReply)
  if (!(await checkPermissionOrReply(interaction, client))) {
    return;
  }

  // Only defer if not already replied
  if (!interaction.replied && !interaction.deferred) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  try {
    // Get all servers for this guild
    const servers = (await client.servers.get(interaction.guildId!)) || [];
    if (servers.length === 0) {
      await interaction.editReply(
        '❌ No servers configured. Use `/server add` to add a server first.'
      );
      return;
    }

    // Get interval config to find active server
    const intervalConfig = await client.intervals.get(interaction.guildId!);
    if (!intervalConfig) {
      await interaction.editReply(
        '❌ No monitoring configuration found. Use `/monitor setup` to configure monitoring.'
      );
      return;
    }

    // Determine which server to update
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
      if (!intervalConfig.activeServerId) {
        await interaction.editReply(
          '❌ No active server set. Use `/server activate` to set an active server.'
        );
        return;
      }
      targetServer = servers.find(s => s.id === intervalConfig.activeServerId);
      if (!targetServer) {
        await interaction.editReply(
          '❌ Active server not found. Use `/server activate` to set a valid server.'
        );
        return;
      }
    }

    if (!intervalConfig.enabled) {
      await interaction.editReply(
        '❌ Monitoring is currently disabled. Enable it with `/monitor enable`.'
      );
      return;
    }

    await interaction.editReply(`**Force updating ${targetServer.name}...**`);

    // Get fresh server data with timeout and retry logic
    console.log(`Getting player count for ${targetServer.name}...`);
    const info = await client.rateLimitManager.executeWithRetry(
      () => getPlayerCount(targetServer),
      3,
      2000
    );

    console.log(
      `Server data received: ${info.isOnline ? 'Online' : 'Offline'} - ${info.playerCount}/${info.maxPlayers}`
    );

    let updatesSummary = '';
    let updatesCount = 0;

    // Update status channel (only if this is the active server)
    if (
      intervalConfig.activeServerId === targetServer.id &&
      intervalConfig.statusChannel
    ) {
      console.log('Updating status channel...');
      try {
        await client.rateLimitManager.executeWithRetry(async () => {
          const statusChannel = await client.channels.fetch(intervalConfig.statusChannel!) as TextChannel;
          const color = getRoleColor(interaction.guild!);
          const serverEmbed = await getStatus(targetServer, color);

          if (intervalConfig.statusMessage) {
            try {
              const existingMsg = await statusChannel.messages.fetch(intervalConfig.statusMessage);
              await existingMsg.edit({ embeds: [serverEmbed] });
              updatesSummary += '✅ Status embed updated\n';
              updatesCount++;
              console.log('Status embed updated');
            } catch (error) {
              console.log('Creating new status message...');
              const newMsg = await statusChannel.send({ embeds: [serverEmbed] });
              intervalConfig.statusMessage = newMsg.id;
              await client.intervals.set(interaction.guildId!, intervalConfig);
              updatesSummary += '✅ New status message sent\n';
              updatesCount++;
              console.log('New status message sent');
            }
          } else {
            console.log('Creating initial status message...');
            const newMsg = await statusChannel.send({ embeds: [serverEmbed] });
            intervalConfig.statusMessage = newMsg.id;
            await client.intervals.set(interaction.guildId!, intervalConfig);
            updatesSummary += '✅ Initial status message sent\n';
            updatesCount++;
            console.log('Initial status message sent');
          }
        }, 2);
      } catch (error) {
        updatesSummary += '❌ Failed to update status channel\n';
        console.error('Status channel update error:', error);
      }
    }

    // Update player count channel with high priority (only if this is the active server)
    if (
      intervalConfig.activeServerId === targetServer.id &&
      intervalConfig.playerCountChannel
    ) {
      console.log('Updating player count channel...');
      try {
        await client.rateLimitManager.queueChannelUpdate(
          intervalConfig.playerCountChannel,
          async () => {
            const playerCountChannel = await client.channels.fetch(intervalConfig.playerCountChannel!) as Channel;

            if (
              playerCountChannel &&
              (playerCountChannel.type === ChannelType.GuildVoice ||
                playerCountChannel.type === ChannelType.GuildText)
            ) {
              const channel = playerCountChannel as TextChannel | VoiceChannel;
              const newName = info.isOnline
                ? `Players: ${info.playerCount}/${info.maxPlayers}`
                : 'Server Offline';

              if (channel.name !== newName) {
                await channel.setName(newName);
                console.log('Player count channel updated');
              }
            }
          },
          'high', // High priority for force updates
          true    // Force the update even if recently updated
        );
        updatesSummary += '✅ Player count channel update queued\n';
        updatesCount++;
        console.log('Player count channel update queued');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage.includes('timeout') || errorMessage.includes('rate limit')) {
          updatesSummary += '⏰ Player count channel update queued (may be delayed due to rate limits)\n';
          console.warn('Player count channel update queued but may be delayed');
        } else {
          updatesSummary += '❌ Failed to queue player count channel update\n';
          console.error('Player count channel update error:', error);
        }
      }
    }

    // Update server IP channel with high priority (only if this is the active server)
    if (
      intervalConfig.activeServerId === targetServer.id &&
      intervalConfig.serverIpChannel
    ) {
      console.log('Updating server IP channel...');
      try {
        await client.rateLimitManager.queueChannelUpdate(
          intervalConfig.serverIpChannel,
          async () => {
            const serverIpChannel = await client.channels.fetch(intervalConfig.serverIpChannel!) as Channel;

            if (
              serverIpChannel &&
              (serverIpChannel.type === ChannelType.GuildVoice ||
                serverIpChannel.type === ChannelType.GuildText)
            ) {
              const channel = serverIpChannel as TextChannel | VoiceChannel;
              const newName = `Server ${targetServer.ip}:${targetServer.port}`;

              if (channel.name !== newName) {
                await channel.setName(newName);
                console.log('Server IP channel updated');
              }
            }
          },
          'high', // High priority for force updates
          true    // Force the update even if recently updated
        );
        updatesSummary += '✅ Server IP channel update queued\n';
        updatesCount++;
        console.log('Server IP channel update queued');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage.includes('timeout') || errorMessage.includes('rate limit')) {
          updatesSummary += '⏰ Server IP channel update queued (may be delayed due to rate limits)\n';
          console.warn('Server IP channel update queued but may be delayed');
        } else {
          updatesSummary += '❌ Failed to queue server IP channel update\n';
          console.error('Server IP channel update error:', error);
        }
      }
    }

    // Update the guild config cache with any changes
    let guildConfig = client.guildConfigs.get(interaction.guildId!) || {
      servers: [],
    };
    guildConfig.interval = intervalConfig;
    client.guildConfigs.set(interaction.guildId!, guildConfig);

    console.log('Creating result embed...');

    // Create result embed
    const resultEmbed = new EmbedBuilder()
      .setColor(info.isOnline ? 0x00ff00 : 0xff0000)
      .setTitle('Force Update Complete')
      .setDescription(
        `**${targetServer.name}**\n${targetServer.ip}:${targetServer.port}`
      )
      .addFields(
        {
          name: 'Server Status',
          value: info.isOnline ? '✅ Online' : '❌ Offline',
          inline: true,
        },
        {
          name: 'Players',
          value: `${info.playerCount}/${info.maxPlayers}`,
          inline: true,
        },
        {
          name: 'Updates Applied',
          value: updatesCount.toString(),
          inline: true,
        }
      )
      .setTimestamp();

    // Only show update summary if there were updates or failures
    if (updatesSummary.trim()) {
      resultEmbed.addFields({
        name: 'Update Summary',
        value: updatesSummary.trim(),
        inline: false,
      });
    }

    // Add note if no channels are configured
    if (
      !intervalConfig.statusChannel &&
      !intervalConfig.playerCountChannel &&
      !intervalConfig.serverIpChannel
    ) {
      resultEmbed.addFields({
        name: 'No Channels Configured',
        value:
          'Use `/monitor setup` to configure channels for automatic updates.',
        inline: false,
      });
    }

    // Add rate limit queue information
    const queueStats = client.rateLimitManager.getQueueStats();
    const activeQueues = Object.entries(queueStats).filter(([_, count]) => count > 0);

    if (activeQueues.length > 0) {
      const queueInfo = activeQueues
        .map(([channelId, count]) => `<#${channelId}>: ${count} queued`)
        .join('\n');

      resultEmbed.addFields({
        name: 'Rate Limit Queue Status',
        value: queueInfo,
        inline: false,
      });
    }

    console.log('Force update completed successfully');
    await interaction.editReply({ embeds: [resultEmbed] });
  } catch (error) {
    console.error('Error in force update:', error);

    try {
      if (interaction.deferred || interaction.replied) {
        const errorEmbed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('❌ Force Update Failed')
          .setDescription('An error occurred while force updating the server.')
          .addFields(
            {
              name: 'Error Details',
              value: error instanceof Error ? error.message : 'Unknown error occurred',
              inline: false,
            },
            {
              name: 'Troubleshooting',
              value:
                '• Check if the bot has proper permissions\n' +
                '• Verify the server is reachable\n' +
                '• Try again in a few moments',
              inline: false,
            }
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed] });
      }
    } catch (replyError) {
      console.error('Failed to send error reply:', replyError);
    }
  }
}