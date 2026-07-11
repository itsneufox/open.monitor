import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  ChannelType,
  VoiceChannel,
  TextChannel,
} from 'discord.js';
import { CustomClient, GuildConfig, getServerDataKey } from '../types';
import { getPlayerCount, getStatus, getRoleColor, getChart } from '../utils';
import { InputValidator } from '../utils/inputValidator';

export const data = new SlashCommandBuilder()
  .setName('update')
  .setDescription('Force immediate updates (Owner only)')
  .setDefaultMemberPermissions(null) // Hidden from non-admins
  .addSubcommand(subcommand =>
    subcommand
      .setName('status')
      .setDescription('Update status messages and embeds')
      .addStringOption(option =>
        option
          .setName('guild')
          .setDescription('Guild ID to update (leave empty for current guild)')
          .setRequired(false)
      )
      .addBooleanOption(option =>
        option
          .setName('all_guilds')
          .setDescription('Update all guilds with active monitoring')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('voices')
      .setDescription('Update all voice channel names')
      .addStringOption(option =>
        option
          .setName('guild')
          .setDescription('Guild ID to update (leave empty for current guild)')
          .setRequired(false)
      )
      .addBooleanOption(option =>
        option
          .setName('all_guilds')
          .setDescription('Update all guilds with voice channels')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('chart')
      .setDescription('Force refresh daily chart for active server')
      .addStringOption(option =>
        option
          .setName('guild')
          .setDescription(
            'Guild ID to refresh chart for (leave empty for current guild)'
          )
          .setRequired(false)
      )
      .addBooleanOption(option =>
        option
          .setName('all_guilds')
          .setDescription('Refresh charts for all guilds')
          .setRequired(false)
      )
  );

export const guildOnly = true;

export async function execute(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
): Promise<void> {
  if (interaction.user.id !== process.env.OWNER_ID) {
    await interaction.reply({
      content: '❌ This command is only available to the bot owner.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const subcommand = interaction.options.getSubcommand();
  const targetGuildId = interaction.options.getString('guild');
  const allGuilds = interaction.options.getBoolean('all_guilds') || false;

  try {
    switch (subcommand) {
      case 'status':
        await handleStatusUpdate(interaction, client, targetGuildId, allGuilds);
        break;
      case 'voices':
        await handleVoiceUpdate(interaction, client, targetGuildId, allGuilds);
        break;
      case 'chart':
        await handleChartUpdate(interaction, client, targetGuildId, allGuilds);
        break;
    }
  } catch (error) {
    console.error('Update command error:', error);

    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('❌ Update Failed')
      .setDescription('An error occurred while forcing the update')
      .addFields({
        name: 'Error',
        value: error instanceof Error ? error.message : 'Unknown error',
        inline: false,
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

async function handleStatusUpdate(
  interaction: ChatInputCommandInteraction,
  client: CustomClient,
  targetGuildId: string | null,
  allGuilds: boolean
): Promise<void> {
  let updatedGuilds = 0;
  let errors: string[] = [];

  if (allGuilds) {
    for (const [guildId, guildConfig] of client.guildConfigs.entries()) {
      if (
        guildConfig.interval?.enabled &&
        guildConfig.interval.activeServerId
      ) {
        try {
          await performGuildUpdate(client, guildId, guildConfig);
          updatedGuilds++;
        } catch (error) {
          const guild = client.guilds.cache.get(guildId);
          errors.push(`${guild?.name || guildId}: ${error}`);
        }
      }
    }

    const embed = new EmbedBuilder()
      .setColor(errors.length > 0 ? 0xff9500 : 0x00ff00)
      .setTitle('Force Update - All Guilds')
      .setDescription(
        `Updated ${updatedGuilds} guild(s) with active monitoring`
      )
      .addFields({
        name: 'Status',
        value:
          errors.length > 0
            ? `${updatedGuilds} successful, ${errors.length} errors`
            : 'All updates successful',
        inline: true,
      })
      .setTimestamp();

    if (errors.length > 0 && errors.length <= 5) {
      embed.addFields({
        name: 'Errors',
        value: errors.join('\n'),
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const guildId = targetGuildId || interaction.guildId!;
  const guildConfig = client.guildConfigs.get(guildId);

  if (!guildConfig?.interval?.enabled || !guildConfig.interval.activeServerId) {
    await interaction.editReply(
      `❌ No active monitoring configured for guild ${guildId}.`
    );
    return;
  }

  const activeServer = guildConfig.servers.find(
    s => s.id === guildConfig.interval!.activeServerId
  );

  if (!activeServer) {
    await interaction.editReply(
      `❌ Active server not found for guild ${guildId}.`
    );
    return;
  }

  await performGuildUpdate(client, guildId, guildConfig);

  const guild = client.guilds.cache.get(guildId);
  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle('Status Update Complete')
    .setDescription('Status has been updated immediately')
    .addFields(
      {
        name: 'Guild',
        value: guild?.name || 'Unknown',
        inline: true,
      },
      {
        name: 'Server',
        value: activeServer.name,
        inline: true,
      },
      {
        name: 'Address',
        value: `${activeServer.ip}:${activeServer.port}`,
        inline: true,
      }
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });

  console.log(
    `[Update] Status updated by ${interaction.user.tag} for guild ${guild?.name || guildId}`
  );
}

async function handleVoiceUpdate(
  interaction: ChatInputCommandInteraction,
  client: CustomClient,
  targetGuildId: string | null,
  allGuilds: boolean
): Promise<void> {
  let updatedGuilds = 0;
  let updatedChannels = 0;
  let errors: string[] = [];

  if (allGuilds) {
    for (const [guildId, guildConfig] of client.guildConfigs.entries()) {
      if (
        guildConfig.interval?.enabled &&
        guildConfig.interval.activeServerId &&
        (guildConfig.interval.playerCountChannel ||
          guildConfig.interval.serverIpChannel)
      ) {
        try {
          const channelsUpdated = await updateGuildVoiceChannels(
            client,
            guildId,
            guildConfig
          );
          updatedChannels += channelsUpdated;
          updatedGuilds++;
        } catch (error) {
          const guild = client.guilds.cache.get(guildId);
          errors.push(`${guild?.name || guildId}: ${error}`);
        }
      }
    }

    const embed = new EmbedBuilder()
      .setColor(errors.length > 0 ? 0xff9500 : 0x00ff00)
      .setTitle('Voice Update - All Guilds')
      .setDescription(
        `Updated ${updatedChannels} voice channel(s) across ${updatedGuilds} guild(s)`
      )
      .addFields({
        name: 'Status',
        value:
          errors.length > 0
            ? `${updatedGuilds} successful, ${errors.length} errors`
            : 'All updates successful',
        inline: true,
      })
      .setTimestamp();

    if (errors.length > 0 && errors.length <= 5) {
      embed.addFields({
        name: 'Errors',
        value: errors.join('\n'),
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const guildId = targetGuildId || interaction.guildId!;
  const guildConfig = client.guildConfigs.get(guildId);

  if (!guildConfig?.interval?.enabled || !guildConfig.interval.activeServerId) {
    await interaction.editReply(
      `❌ No active monitoring configured for guild ${guildId}.`
    );
    return;
  }

  const activeServer = guildConfig.servers.find(
    s => s.id === guildConfig.interval!.activeServerId
  );

  if (!activeServer) {
    await interaction.editReply(
      `❌ Active server not found for guild ${guildId}.`
    );
    return;
  }

  const channelsUpdated = await updateGuildVoiceChannels(
    client,
    guildId,
    guildConfig
  );

  const guild = client.guilds.cache.get(guildId);
  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle('Voice Update Complete')
    .setDescription(`Updated ${channelsUpdated} voice channel(s)`)
    .addFields(
      {
        name: 'Guild',
        value: guild?.name || 'Unknown',
        inline: true,
      },
      {
        name: 'Server',
        value: activeServer.name,
        inline: true,
      },
      {
        name: 'Channels Updated',
        value: channelsUpdated.toString(),
        inline: true,
      }
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });

  console.log(
    `[Update] Voice channels updated by ${interaction.user.tag} for guild ${guild?.name || guildId}`
  );
}

async function handleChartUpdate(
  interaction: ChatInputCommandInteraction,
  client: CustomClient,
  targetGuildId: string | null,
  allGuilds: boolean
): Promise<void> {
  let chartsGenerated = 0;
  let errors: string[] = [];

  if (allGuilds) {
    for (const [guildId, guildConfig] of client.guildConfigs.entries()) {
      if (
        guildConfig.interval?.enabled &&
        guildConfig.interval.chartChannel &&
        guildConfig.interval.activeServerId
      ) {
        try {
          await generateChartForGuild(client, guildId, guildConfig);
          chartsGenerated++;
        } catch (error) {
          const guild = client.guilds.cache.get(guildId);
          errors.push(`${guild?.name || guildId}: ${error}`);
        }
      }
    }

    const embed = new EmbedBuilder()
      .setColor(errors.length > 0 ? 0xff9500 : 0x00ff00)
      .setTitle('Chart Refresh - All Guilds')
      .setDescription(`Generated ${chartsGenerated} chart(s)`)
      .addFields({
        name: 'Status',
        value:
          errors.length > 0
            ? `${chartsGenerated} successful, ${errors.length} errors`
            : 'All charts generated successfully',
        inline: true,
      })
      .setTimestamp();

    if (errors.length > 0 && errors.length <= 5) {
      embed.addFields({
        name: 'Errors',
        value: errors.join('\n'),
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const guildId = targetGuildId || interaction.guildId!;
  const guildConfig = client.guildConfigs.get(guildId);

  if (!guildConfig?.interval?.enabled) {
    await interaction.editReply(
      `❌ No active monitoring configured for guild ${guildId}.`
    );
    return;
  }

  if (!guildConfig.interval.chartChannel) {
    await interaction.editReply(
      `❌ No chart channel configured for guild ${guildId}.`
    );
    return;
  }

  if (!guildConfig.interval.activeServerId) {
    await interaction.editReply(
      `❌ No active server configured for guild ${guildId}.`
    );
    return;
  }

  await generateChartForGuild(client, guildId, guildConfig);

  const guild = client.guilds.cache.get(guildId);
  const activeServer = guildConfig.servers.find(
    s => s.id === guildConfig.interval!.activeServerId
  );

  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle('Chart Refresh Complete')
    .setDescription('Chart has been regenerated and posted')
    .addFields(
      {
        name: 'Guild',
        value: guild?.name || 'Unknown',
        inline: true,
      },
      {
        name: 'Server',
        value: activeServer?.name || 'Unknown',
        inline: true,
      },
      {
        name: 'Channel',
        value: `<#${guildConfig.interval.chartChannel}>`,
        inline: true,
      }
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });

  console.log(
    `[Update] Chart refreshed by ${interaction.user.tag} for guild ${guild?.name || guildId}`
  );
}

// Helper functions

async function performGuildUpdate(
  client: CustomClient,
  guildId: string,
  guildConfig: GuildConfig
): Promise<void> {
  const { interval, servers } = guildConfig;

  if (!interval) {
    throw new Error('Interval configuration not found');
  }

  const activeServer = servers.find(
    (s: { id: string }) => s.id === interval.activeServerId
  );
  if (!activeServer) {
    throw new Error('Active server not found');
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    throw new Error('Guild not found');
  }

  const serverDataKey = getServerDataKey(guildId, activeServer.id);
  let onlineStats = await client.uptimes.get(serverDataKey);
  if (!onlineStats) {
    onlineStats = { uptime: 0, downtime: 0 };
  }

  let chartData = await client.maxPlayers.get(serverDataKey);
  if (!chartData) {
    chartData = {
      maxPlayersToday: 0,
      days: [],
      name: '',
      maxPlayers: 0,
    };
  }

  const info = await getPlayerCount(activeServer, guildId, true);

  if (info.playerCount > chartData.maxPlayersToday) {
    chartData.maxPlayersToday = info.playerCount;
  }
  chartData.name = info.name;
  chartData.maxPlayers = info.maxPlayers;

  await client.maxPlayers.set(serverDataKey, chartData);

  if (info.isOnline) {
    onlineStats.uptime++;
  } else {
    onlineStats.downtime++;
  }
  await client.uptimes.set(serverDataKey, onlineStats);

  if (interval.statusChannel) {
    const statusChannel = await client.channels
      .fetch(interval.statusChannel)
      .catch(() => null);

    if (statusChannel && 'send' in statusChannel) {
      const color = getRoleColor(guild);
      const theme = interval.statusTheme || 'classic';
      const serverEmbed = await getStatus(
        activeServer,
        color,
        guildId,
        true,
        theme,
        client
      );

      // Edit existing message or create new one
      if (interval.statusMessage) {
        try {
          const existingMsg = await statusChannel.messages.fetch(
            interval.statusMessage
          );
          await existingMsg.edit({ embeds: [serverEmbed] });
        } catch {
          const newMsg = await statusChannel.send({ embeds: [serverEmbed] });
          interval.statusMessage = newMsg.id;
          await client.intervals.set(guildId, interval);
        }
      } else {
        const newMsg = await statusChannel.send({ embeds: [serverEmbed] });
        interval.statusMessage = newMsg.id;
        await client.intervals.set(guildId, interval);
      }
    }
  }

  interval.next = Date.now() + 120000;
  await client.intervals.set(guildId, interval);

  client.guildConfigs.set(guildId, guildConfig);
}

async function updateGuildVoiceChannels(
  client: CustomClient,
  guildId: string,
  guildConfig: GuildConfig
): Promise<number> {
  const { interval, servers } = guildConfig;
  let channelsUpdated = 0;

  if (!interval) {
    throw new Error('Interval configuration not found');
  }
  const voiceStyle = interval.voiceChannelStyle || 'text';

  const activeServer = servers.find(
    (s: { id: string }) => s.id === interval.activeServerId
  );
  if (!activeServer) {
    throw new Error('Active server not found');
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    throw new Error('Guild not found');
  }

  const info = await getPlayerCount(activeServer, guildId, true);

  if (interval.playerCountChannel) {
    try {
      const playerCountChannel = await client.channels
        .fetch(interval.playerCountChannel)
        .catch(() => null);

      if (
        playerCountChannel &&
        playerCountChannel.type === ChannelType.GuildVoice
      ) {
        const channel = playerCountChannel as VoiceChannel;
        const newName = info.isOnline
          ? voiceStyle === 'emoji'
            ? `👥 ${info.playerCount}/${info.maxPlayers}`
            : `Players ${info.playerCount}/${info.maxPlayers}`
          : '❌ Server Offline';

        if (channel.name !== newName) {
          await channel.setName(newName);
          channelsUpdated++;
        }
      }
    } catch (error) {
      console.error('Failed to update player count channel:', error);
    }
  }

  if (interval.serverIpChannel) {
    try {
      const serverIpChannel = await client.channels
        .fetch(interval.serverIpChannel)
        .catch(() => null);

      if (serverIpChannel && serverIpChannel.type === ChannelType.GuildVoice) {
        const channel = serverIpChannel as VoiceChannel;
        const desiredName =
          voiceStyle === 'emoji'
            ? `🔗 ${activeServer.ip}:${activeServer.port}`
            : `IP: ${activeServer.ip}:${activeServer.port}`;
        const channelNameValidation =
          InputValidator.validateChannelName(desiredName);
        const newName =
          channelNameValidation.valid &&
          typeof channelNameValidation.sanitized === 'string'
            ? channelNameValidation.sanitized
            : desiredName;

        if (channel.name !== newName) {
          await channel.setName(newName);
          channelsUpdated++;
        }
      }
    } catch (error) {
      console.error('Failed to update server IP channel:', error);
    }
  }

  return channelsUpdated;
}

async function generateChartForGuild(
  client: CustomClient,
  guildId: string,
  guildConfig: GuildConfig
): Promise<void> {
  const { interval, servers } = guildConfig;

  if (!interval?.activeServerId) {
    throw new Error('No active server configured');
  }

  if (!interval.chartChannel) {
    throw new Error('No chart channel configured');
  }

  const activeServer = servers.find(
    (s: { id: string }) => s.id === interval?.activeServerId
  );
  if (!activeServer) {
    throw new Error('Active server not found');
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    throw new Error('Guild not found');
  }

  const serverDataKey = getServerDataKey(guildId, activeServer.id);
  const data = await client.maxPlayers.get(serverDataKey);

  if (!data || !data.days || data.days.length < 2) {
    throw new Error('Insufficient chart data (need at least 2 days)');
  }

  // For manual refresh, update today's data with current player count
  try {
    const currentInfo = await client.rateLimitManager.executeWithRetry(
      () => getPlayerCount(activeServer, guildId, true),
      2
    );

    const currentValue = currentInfo.isOnline ? currentInfo.playerCount : 0;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    const todayIndex = data.days.findIndex(day => {
      const dayDate = new Date(day.date);
      dayDate.setUTCHours(0, 0, 0, 0);
      return dayDate.getTime() === todayTimestamp;
    });

    if (todayIndex !== -1) {
      data.days[todayIndex]!.value = Math.max(
        data.days[todayIndex]!.value,
        currentValue
      );
      data.days[todayIndex]!.date = todayTimestamp;
    } else {
      data.days.push({
        value: currentValue,
        date: todayTimestamp,
      });
    }

    if (data.days.length > 30) {
      data.days = data.days.slice(-30);
    }

    await client.maxPlayers.set(serverDataKey, data);
    console.log(
      `Updated chart data with current player count: ${currentValue}`
    );
  } catch (error) {
    console.log(`Could not get current player count for refresh: ${error}`);
  }

  const chartChannel = (await client.channels.fetch(
    interval.chartChannel
  )) as TextChannel;
  if (!chartChannel) {
    throw new Error('Chart channel not found');
  }

  const color = getRoleColor(guild);
  const chart = await getChart(data, color);

  if (data.msg) {
    try {
      const oldMessage = await chartChannel.messages.fetch(data.msg);
      await oldMessage.delete();
      console.log(
        `Deleted old chart message for ${activeServer.name} in ${guild.name}`
      );
    } catch (error) {
      console.log(`Could not delete old chart message: ${error}`);
    }
  }

  const msg = await chartChannel.send({
    content: `**Daily Chart for ${activeServer.name}** (Refreshed)`,
    files: [chart],
  });

  data.msg = msg.id;
  await client.maxPlayers.set(serverDataKey, data);
}
