import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  ChannelType,
  VoiceChannel,
} from 'discord.js';
import { CustomClient } from '../types';
import { getPlayerCount, getStatus, getRoleColor } from '../utils';
import { getServerDataKey } from '../types';
import { InputValidator } from '../utils/inputValidator';

export const data = new SlashCommandBuilder()
  .setName('forceupdate')
  .setDescription('Force an immediate status update (Owner only)')
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
  );

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
    if (subcommand === 'status') {
      await handleStatusUpdate(interaction, client, targetGuildId, allGuilds);
    } else if (subcommand === 'voices') {
      await handleVoiceUpdate(interaction, client, targetGuildId, allGuilds);
    }
  } catch (error) {
    console.error('Force update error:', error);

    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('❌ Force Update Failed')
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
      .setTitle('🔄 Force Update - All Guilds')
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

  if (
    !guildConfig?.interval?.enabled ||
    !guildConfig.interval.activeServerId
  ) {
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
    .setTitle('🔄 Status Update Complete')
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
    `Status update completed by ${interaction.user.tag} for guild ${guild?.name || guildId}`
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
        (guildConfig.interval.playerCountChannel || guildConfig.interval.serverIpChannel)
      ) {
        try {
          const channelsUpdated = await updateGuildVoiceChannels(client, guildId, guildConfig);
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
      .setTitle('🔊 Voice Update - All Guilds')
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

  if (
    !guildConfig?.interval?.enabled ||
    !guildConfig.interval.activeServerId
  ) {
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

  const channelsUpdated = await updateGuildVoiceChannels(client, guildId, guildConfig);

  const guild = client.guilds.cache.get(guildId);
  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle('🔊 Voice Update Complete')
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
    `Voice update completed by ${interaction.user.tag} for guild ${guild?.name || guildId}`
  );
}

async function updateGuildVoiceChannels(
  client: CustomClient,
  guildId: string,
  guildConfig: any
): Promise<number> {
  const { interval, servers } = guildConfig;
  let channelsUpdated = 0;

  const activeServer = servers.find(
    (s: any) => s.id === interval.activeServerId
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
          ? `👥 ${info.playerCount}/${info.maxPlayers}`
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

      if (
        serverIpChannel &&
        serverIpChannel.type === ChannelType.GuildVoice
      ) {
        const channel = serverIpChannel as VoiceChannel;
        const channelNameValidation = InputValidator.validateChannelName(
          `IP: ${activeServer.ip}:${activeServer.port}`
        );

        if (channelNameValidation.valid && typeof channelNameValidation.sanitized === 'string') {
          const newName = channelNameValidation.sanitized;
          if (channel.name !== newName) {
            await channel.setName(newName);
            channelsUpdated++;
          }
        }
      }
    } catch (error) {
      console.error('Failed to update server IP channel:', error);
    }
  }

  return channelsUpdated;
}

async function performGuildUpdate(
  client: CustomClient,
  guildId: string,
  guildConfig: any
): Promise<void> {
  const { interval, servers } = guildConfig;

  const activeServer = servers.find(
    (s: any) => s.id === interval.activeServerId
  );
  if (!activeServer) {
    throw new Error('Active server not found');
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    throw new Error('Guild not found');
  }

  let onlineStats = await client.uptimes.get(activeServer.id);
  if (!onlineStats) {
    onlineStats = { uptime: 0, downtime: 0 };
  }

  let chartData = await client.maxPlayers.get(getServerDataKey(guildId, activeServer.id));
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

  await client.maxPlayers.set(getServerDataKey(guildId, activeServer.id), chartData);

  if (info.isOnline) {
    onlineStats.uptime++;
  } else {
    onlineStats.downtime++;
  }
  const serverDataKey = getServerDataKey(guildId, activeServer.id);
  await client.uptimes.set(serverDataKey, onlineStats);

  if (interval.statusChannel) {
    const statusChannel = await client.channels
      .fetch(interval.statusChannel)
      .catch(() => null);

    if (statusChannel && 'send' in statusChannel) {
      const color = getRoleColor(guild);
      const serverEmbed = await getStatus(activeServer, color, guildId, true);

      if (interval.statusMessage) {
        try {
          const existingMsg = await statusChannel.messages.fetch(
            interval.statusMessage
          );
          await existingMsg.edit({ embeds: [serverEmbed] });
        } catch (error) {
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

  interval.next = Date.now() + 600000;
  await client.intervals.set(guildId, interval);

  client.guildConfigs.set(guildId, guildConfig);
}