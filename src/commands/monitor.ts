import {
  SlashCommandBuilder,
  ChannelType,
  ChatInputCommandInteraction,
  TextChannel,
  VoiceChannel,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { CustomClient } from '../types';
import { checkPermissionOrReply } from '../utils/permissions';
import { InputValidator } from '../utils/inputValidator';
import { getPlayerCount } from '../utils';

export const data = new SlashCommandBuilder()
  .setName('monitor')
  .setDescription('Configure server monitoring')
  .addSubcommand(subcommand =>
    subcommand
      .setName('setup')
      .setDescription('Quick setup wizard for monitoring')
      .addChannelOption(option =>
        option
          .setName('status_channel')
          .setDescription('Channel for status updates (required)')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
      .addChannelOption(option =>
        option
          .setName('chart_channel')
          .setDescription('Channel for daily charts (optional)')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
      .addChannelOption(option =>
        option
          .setName('player_count_channel')
          .setDescription('Voice channel to show player count (optional)')
          .addChannelTypes(ChannelType.GuildVoice)
          .setRequired(false)
      )
      .addChannelOption(option =>
        option
          .setName('server_ip_channel')
          .setDescription('Voice channel to show server IP (optional)')
          .addChannelTypes(ChannelType.GuildVoice)
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('enable')
      .setDescription('Enable monitoring with current settings')
  )
  .addSubcommand(subcommand =>
    subcommand.setName('disable').setDescription('Disable monitoring')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('status')
      .setDescription('Show current monitoring configuration')
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  if (interaction.options.getSubcommand() !== 'status') {
    if (!(await checkPermissionOrReply(interaction, client))) {
      return;
    }
  }

  switch (subcommand) {
    case 'setup':
      await handleSetup(interaction, client);
      break;
    case 'enable':
      await handleEnable(interaction, client);
      break;
    case 'disable':
      await handleDisable(interaction, client);
      break;
    case 'status':
      await handleStatus(interaction, client);
      break;
  }
}

async function handleSetup(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const rateLimitCheck = InputValidator.checkCommandRateLimit(
    interaction.user.id,
    'monitor-setup',
    2
  );

  if (!rateLimitCheck.allowed) {
    await interaction.editReply(
      `❌ Please wait ${Math.ceil((rateLimitCheck.remainingTime || 0) / 1000)} seconds before setting up monitoring again.`
    );
    return;
  }

  const guildValidation = InputValidator.validateDiscordId(
    interaction.guildId!,
    'guild'
  );
  if (!guildValidation.valid) {
    await interaction.editReply(
      `❌ Invalid guild context: ${guildValidation.error}`
    );
    return;
  }

  const servers = (await client.servers.get(interaction.guildId!)) || [];
  if (servers.length === 0) {
    await interaction.editReply(
      '❌ No servers configured. Use `/server add` to add a server first.'
    );
    return;
  }

  const intervalConfig = await client.intervals.get(interaction.guildId!);
  if (!intervalConfig?.activeServerId) {
    await interaction.editReply(
      '❌ No active server set. Use `/server activate` to set an active server first.'
    );
    return;
  }

  const statusChannel = interaction.options.getChannel(
    'status_channel'
  ) as TextChannel;
  const chartChannel = interaction.options.getChannel(
    'chart_channel'
  ) as TextChannel | null;
  const playerCountChannel = interaction.options.getChannel(
    'player_count_channel'
  ) as VoiceChannel | null;
  const serverIpChannel = interaction.options.getChannel(
    'server_ip_channel'
  ) as VoiceChannel | null;

  const channelValidations = [
    { channel: statusChannel, name: 'status channel', required: true },
    { channel: chartChannel, name: 'chart channel', required: false },
    {
      channel: playerCountChannel,
      name: 'player count channel',
      required: false,
    },
    { channel: serverIpChannel, name: 'server IP channel', required: false },
  ];

  for (const { channel, name, required } of channelValidations) {
    if (required && !channel) {
      await interaction.editReply(`❌ ${name} is required`);
      return;
    }

    if (channel) {
      const validation = InputValidator.validateDiscordId(
        channel.id,
        'channel'
      );
      if (!validation.valid) {
        await interaction.editReply(`❌ Invalid ${name}: ${validation.error}`);
        return;
      }
    }
  }

  const botMember = interaction.guild!.members.cache.get(client.user!.id);
  if (!botMember) {
    await interaction.editReply('❌ Unable to find bot member in this guild.');
    return;
  }

  const statusPerms = statusChannel.permissionsFor(botMember);
  if (!statusPerms?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
    await interaction.editReply(
      `❌ I need View Channel, Send Messages, and Embed Links permissions in ${statusChannel.toString()}`
    );
    return;
  }

  if (chartChannel) {
    const chartPerms = chartChannel.permissionsFor(botMember);
    if (!chartPerms?.has(['ViewChannel', 'SendMessages', 'AttachFiles'])) {
      await interaction.editReply(
        `❌ I need View Channel, Send Messages, and Attach Files permissions in ${chartChannel.toString()}`
      );
      return;
    }
  }

  if (playerCountChannel) {
    const playerPerms = playerCountChannel.permissionsFor(botMember);
    if (!playerPerms?.has(['ViewChannel', 'ManageChannels'])) {
      await interaction.editReply(
        `❌ I need View Channel and Manage Channels permissions in voice channel ${playerCountChannel.toString()}`
      );
      return;
    }
  }

  if (serverIpChannel) {
    const ipPerms = serverIpChannel.permissionsFor(botMember);
    if (!ipPerms?.has(['ViewChannel', 'ManageChannels'])) {
      await interaction.editReply(
        `❌ I need View Channel and Manage Channels permissions in voice channel ${serverIpChannel.toString()}`
      );
      return;
    }
  }

  const newConfig = {
    ...intervalConfig,
    statusChannel: statusChannel.id,
    enabled: true,
    next: Date.now(),
    statusMessage: null,
  };

  if (chartChannel) {
    newConfig.chartChannel = chartChannel.id;
  }
  if (playerCountChannel) {
    newConfig.playerCountChannel = playerCountChannel.id;
  }
  if (serverIpChannel) {
    newConfig.serverIpChannel = serverIpChannel.id;
  }

  const configValidation = InputValidator.validateGuildConfig(
    interaction.guildId!,
    newConfig
  );
  if (!configValidation.valid) {
    await interaction.editReply(
      `❌ Configuration validation failed:\n${configValidation.errors.join('\n')}`
    );
    return;
  }

  await client.intervals.set(interaction.guildId!, newConfig);

  const activeServer = servers.find(
    s => s.id === intervalConfig.activeServerId
  );
  if (activeServer) {
    console.log(`🔄 Setting initial channel names for ${activeServer.name}...`);

    try {
      const info = await getPlayerCount(
        activeServer,
        interaction.guildId!,
        false
      );

      if (playerCountChannel) {
        try {
          const newName = info.isOnline
            ? `👥 ${info.playerCount}/${info.maxPlayers}`
            : '❌ Server Offline';

          await playerCountChannel.setName(newName);
          console.log(`✅ Set player count channel: ${newName}`);
        } catch (error) {
          console.error('Failed to set player count channel name:', error);
        }
      }

      if (serverIpChannel) {
        setTimeout(async () => {
          try {
            const serverAddress = `${activeServer.ip}:${activeServer.port}`;
            const newName = `🌐 ${serverAddress}`;

            await serverIpChannel.setName(newName);
            console.log(`✅ Set server IP channel: ${newName}`);
          } catch (error) {
            console.error('Failed to set IP channel name:', error);
          }
        }, 3000);
      }
    } catch (error) {
      console.error(
        'Failed to get server info for initial channel setup:',
        error
      );

      if (playerCountChannel) {
        try {
          await playerCountChannel.setName('👥 Checking...');
        } catch (error) {
          console.error('Failed to set fallback player count name:', error);
        }
      }

      if (serverIpChannel) {
        setTimeout(async () => {
          try {
            const serverAddress = `${activeServer.ip}:${activeServer.port}`;
            const newName = `🌐 ${serverAddress}`;

            await serverIpChannel.setName(newName);
          } catch (error) {
            console.error('Failed to set fallback IP channel name:', error);
          }
        }, 3000);
      }
    }
  }

  let guildConfig = client.guildConfigs.get(interaction.guildId!) || {
    servers: [],
  };
  guildConfig.interval = newConfig;
  client.guildConfigs.set(interaction.guildId!, guildConfig);

  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle('✅ Monitoring Setup Complete!')
    .setDescription(
      `Now monitoring **${activeServer?.name || 'Unknown Server'}**`
    )
    .addFields(
      { name: 'Status Updates', value: statusChannel.toString(), inline: true },
      { name: 'Update Frequency', value: 'Every 10 minutes', inline: true },
      {
        name: 'Charts',
        value: chartChannel?.toString() || 'Not configured',
        inline: true,
      }
    )
    .setTimestamp();

  if (playerCountChannel) {
    embed.addFields({
      name: 'Player Count (Voice)',
      value: `${playerCountChannel.toString()} - Updates every 10 minutes`,
      inline: true,
    });
  }

  if (serverIpChannel) {
    embed.addFields({
      name: 'Server IP (Voice)',
      value: `${serverIpChannel.toString()} - Set once during setup`,
      inline: true,
    });
  }

  embed.addFields({
    name: 'What happens next?',
    value:
      '• Status updates will start immediately\n• Daily charts will be posted at midnight\n• Voice channels will update automatically',
    inline: false,
  });

  await interaction.editReply({ embeds: [embed] });

  console.log(
    `✅ Monitoring setup completed by ${interaction.user.tag} in guild ${interaction.guild?.name}`
  );
}

async function handleEnable(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const intervalConfig = await client.intervals.get(interaction.guildId!);
  if (!intervalConfig) {
    await interaction.editReply(
      '❌ No monitoring configuration found. Use `/monitor setup` first.'
    );
    return;
  }

  if (!intervalConfig.statusChannel) {
    await interaction.editReply(
      '❌ No status channel configured. Use `/monitor setup` to configure monitoring.'
    );
    return;
  }

  if (intervalConfig.enabled) {
    await interaction.editReply('✅ Monitoring is already enabled.');
    return;
  }

  intervalConfig.enabled = true;
  intervalConfig.next = Date.now();
  await client.intervals.set(interaction.guildId!, intervalConfig);

  let guildConfig = client.guildConfigs.get(interaction.guildId!) || {
    servers: [],
  };
  guildConfig.interval = intervalConfig;
  client.guildConfigs.set(interaction.guildId!, guildConfig);

  await interaction.editReply(
    '✅ **Monitoring enabled!** Status updates will begin within 10 minutes.'
  );
}

async function handleDisable(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const intervalConfig = await client.intervals.get(interaction.guildId!);
  if (!intervalConfig || !intervalConfig.enabled) {
    await interaction.editReply('Monitoring is already disabled.');
    return;
  }

  intervalConfig.enabled = false;
  await client.intervals.set(interaction.guildId!, intervalConfig);

  let guildConfig = client.guildConfigs.get(interaction.guildId!) || {
    servers: [],
  };
  guildConfig.interval = intervalConfig;
  client.guildConfigs.set(interaction.guildId!, guildConfig);

  await interaction.editReply(
    '✅ **Monitoring disabled.** Use `/monitor enable` to resume monitoring.'
  );
}

async function handleStatus(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const servers = (await client.servers.get(interaction.guildId!)) || [];
  const intervalConfig = await client.intervals.get(interaction.guildId!);

  const embed = new EmbedBuilder()
    .setColor(intervalConfig?.enabled ? 0x00ff00 : 0xff6b6b)
    .setTitle('Monitoring Status')
    .setTimestamp();

  if (servers.length === 0) {
    embed.setDescription('❌ No servers configured').addFields({
      name: 'Next Steps',
      value: 'Use `/server add` to add a server',
    });
  } else if (!intervalConfig?.activeServerId) {
    embed.setDescription('⚠️ No active server set').addFields({
      name: 'Next Steps',
      value: 'Use `/server activate` to set an active server',
    });
  } else {
    const activeServer = servers.find(
      s => s.id === intervalConfig.activeServerId
    );

    const nextUpdate = intervalConfig.next || Date.now();
    const timeUntilUpdate = Math.max(0, nextUpdate - Date.now());
    const nextUpdateText =
      timeUntilUpdate > 0
        ? `<t:${Math.floor(nextUpdate / 1000)}:R>`
        : 'Very soon';

    embed
      .setDescription(
        `**Status:** ${intervalConfig.enabled ? '✅ Active' : '❌ Disabled'}`
      )
      .addFields(
        {
          name: 'Active Server',
          value: activeServer?.name || 'Unknown',
          inline: true,
        },
        {
          name: 'Address',
          value: activeServer
            ? `${activeServer.ip}:${activeServer.port}`
            : 'Unknown',
          inline: true,
        },
        {
          name: 'Next Update',
          value: intervalConfig.enabled ? nextUpdateText : 'Disabled',
          inline: true,
        },
        {
          name: 'Status Channel',
          value: intervalConfig.statusChannel
            ? `<#${intervalConfig.statusChannel}>`
            : 'Not set',
          inline: true,
        },
        {
          name: 'Chart Channel',
          value: intervalConfig.chartChannel
            ? `<#${intervalConfig.chartChannel}>`
            : 'Not set',
          inline: true,
        },
        {
          name: 'Player Count Voice Channel',
          value: intervalConfig.playerCountChannel
            ? `<#${intervalConfig.playerCountChannel}>`
            : 'Not set',
          inline: true,
        },
        {
          name: 'Server IP Voice Channel',
          value: intervalConfig.serverIpChannel
            ? `<#${intervalConfig.serverIpChannel}>`
            : 'Not set',
          inline: true,
        }
      );

    embed.addFields({
      name: 'Update Schedule',
      value:
        '• **Player Count:** Every 10 minutes\n• **Server IP:** Set once during setup\n• **Status changes:** Immediate when server goes offline',
      inline: false,
    });

    embed.addFields({
      name: 'Manual Commands',
      value:
        '• `/server status fresh:true` - Get current server data\n• `/players` - Show online players\n• `/chart` - View historical data',
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}
