import {
  SlashCommandBuilder,
  ChannelType,
  ChatInputCommandInteraction,
  TextChannel,
  VoiceChannel,
  EmbedBuilder,
} from 'discord.js';
import { CustomClient } from '../types';
import { checkPermissionOrReply } from '../utils/permissions';
import { InputValidator } from '../utils/inputValidator';

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
          .setDescription('Voice/text channel to show player count (optional)')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice)
          .setRequired(false)
      )
      .addChannelOption(option =>
        option
          .setName('server_ip_channel')
          .setDescription('Voice/text channel to show server IP (optional)')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice)
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
  await interaction.deferReply();

  // Rate limiting
  const rateLimitCheck = InputValidator.checkCommandRateLimit(
    interaction.user.id,
    'monitor-setup',
    2 // Max 2 setups per minute
  );

  if (!rateLimitCheck.allowed) {
    await interaction.editReply(
      `❌ Please wait ${Math.ceil((rateLimitCheck.remainingTime || 0) / 1000)} seconds before setting up monitoring again.`
    );
    return;
  }

  // Validate guild ID
  const guildValidation = InputValidator.validateDiscordId(interaction.guildId!, 'guild');
  if (!guildValidation.valid) {
    await interaction.editReply(`❌ Invalid guild context: ${guildValidation.error}`);
    return;
  }

  // Check if server is configured
  const servers = (await client.servers.get(interaction.guildId!)) || [];
  if (servers.length === 0) {
    await interaction.editReply(
      '❌ No servers configured. Use `/server add` to add a server first.'
    );
    return;
  }

  // Check if active server is set
  const intervalConfig = await client.intervals.get(interaction.guildId!);
  if (!intervalConfig?.activeServerId) {
    await interaction.editReply(
      '❌ No active server set. Use `/server activate` to set an active server first.'
    );
    return;
  }

  const statusChannel = interaction.options.getChannel('status_channel') as TextChannel;
  const chartChannel = interaction.options.getChannel('chart_channel') as TextChannel | null;
  const playerCountChannel = interaction.options.getChannel('player_count_channel') as TextChannel | VoiceChannel | null;
  const serverIpChannel = interaction.options.getChannel('server_ip_channel') as TextChannel | VoiceChannel | null;

  // Validate all channel IDs
  const channelValidations = [
    { channel: statusChannel, name: 'status channel', required: true },
    { channel: chartChannel, name: 'chart channel', required: false },
    { channel: playerCountChannel, name: 'player count channel', required: false },
    { channel: serverIpChannel, name: 'server IP channel', required: false }
  ];

  for (const { channel, name, required } of channelValidations) {
    if (required && !channel) {
      await interaction.editReply(`❌ ${name} is required`);
      return;
    }

    if (channel) {
      const validation = InputValidator.validateDiscordId(channel.id, 'channel');
      if (!validation.valid) {
        await interaction.editReply(`❌ Invalid ${name}: ${validation.error}`);
        return;
      }
    }
  }

  // Check bot permissions
  const botMember = interaction.guild!.members.cache.get(client.user!.id);
  if (!botMember) {
    await interaction.editReply('❌ Unable to find bot member in this guild.');
    return;
  }

  // Validate permissions for status channel
  const statusPerms = statusChannel.permissionsFor(botMember);
  if (!statusPerms?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
    await interaction.editReply(
      `❌ I need View Channel, Send Messages, and Embed Links permissions in ${statusChannel.toString()}`
    );
    return;
  }

  // Validate permissions for chart channel
  if (chartChannel) {
    const chartPerms = chartChannel.permissionsFor(botMember);
    if (!chartPerms?.has(['ViewChannel', 'SendMessages', 'AttachFiles'])) {
      await interaction.editReply(
        `❌ I need View Channel, Send Messages, and Attach Files permissions in ${chartChannel.toString()}`
      );
      return;
    }
  }

  // Validate permissions for voice/text channels
  if (playerCountChannel) {
    const playerPerms = playerCountChannel.permissionsFor(botMember);
    if (!playerPerms?.has(['ViewChannel', 'ManageChannels'])) {
      await interaction.editReply(
        `❌ I need View Channel and Manage Channels permissions in ${playerCountChannel.toString()}`
      );
      return;
    }
  }

  if (serverIpChannel) {
    const ipPerms = serverIpChannel.permissionsFor(botMember);
    if (!ipPerms?.has(['ViewChannel', 'ManageChannels'])) {
      await interaction.editReply(
        `❌ I need View Channel and Manage Channels permissions in ${serverIpChannel.toString()}`
      );
      return;
    }
  }

  // Update interval config - build object properly to avoid undefined issues
  const newConfig = {
    ...intervalConfig,
    statusChannel: statusChannel.id,
    enabled: true,
    next: Date.now(),
    statusMessage: null,
  };

  // Only add optional channels if they exist
  if (chartChannel) {
    newConfig.chartChannel = chartChannel.id;
  }
  if (playerCountChannel) {
    newConfig.playerCountChannel = playerCountChannel.id;
  }
  if (serverIpChannel) {
    newConfig.serverIpChannel = serverIpChannel.id;
  }

  // Validate the complete configuration
  const configValidation = InputValidator.validateGuildConfig(interaction.guildId!, newConfig);
  if (!configValidation.valid) {
    await interaction.editReply(
      `❌ Configuration validation failed:\n${configValidation.errors.join('\n')}`
    );
    return;
  }

  await client.intervals.set(interaction.guildId!, newConfig);

  // Set initial channel names
  const activeServer = servers.find(s => s.id === intervalConfig.activeServerId);
  if (activeServer) {
    // Set IP channel name
    if (serverIpChannel) {
      try {
        const channelNameValidation = InputValidator.validateChannelName(`Server ${activeServer.ip}:${activeServer.port}`);
        if (channelNameValidation.valid) {
          await serverIpChannel.setName(channelNameValidation.sanitized!);
        }
      } catch (error) {
        console.error('Failed to set IP channel name:', error);
      }
    }

    // Set player count channel name
    if (playerCountChannel) {
      try {
        const channelNameValidation = InputValidator.validateChannelName('Players: Loading...');
        if (channelNameValidation.valid) {
          await playerCountChannel.setName(channelNameValidation.sanitized!);
        }
      } catch (error) {
        console.error('Failed to set player count channel name:', error);
      }
    }
  }

  // Update cache
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
      { name: 'Update Frequency', value: 'Every 3 minutes', inline: true },
      {
        name: 'Charts',
        value: chartChannel?.toString() || 'Not configured',
        inline: true,
      }
    )
    .setTimestamp();

  if (playerCountChannel) {
    embed.addFields({
      name: 'Player Count Display',
      value: playerCountChannel.toString(),
      inline: true,
    });
  }

  if (serverIpChannel) {
    embed.addFields({
      name: 'Server IP Display',
      value: serverIpChannel.toString(),
      inline: true,
    });
  }

  embed.addFields({
    name: 'What happens next?',
    value:
      '• Status updates will start immediately\n• Daily charts will be posted at midnight\n• Use `/monitor disable` to stop monitoring',
    inline: false,
  });

  // Add security notice
  embed.addFields({
    name: 'Security Features',
    value:
      '• All server queries are validated and rate limited\n• Channel updates are queued to respect Discord limits\n• Configuration is validated for security',
    inline: false,
  });

  await interaction.editReply({ embeds: [embed] });

  // Log successful setup
  console.log(`✅ Monitoring setup completed by ${interaction.user.tag} in guild ${interaction.guild?.name}`);
}

async function handleEnable(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
) {
  await interaction.deferReply();

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

  // Update cache
  let guildConfig = client.guildConfigs.get(interaction.guildId!) || {
    servers: [],
  };
  guildConfig.interval = intervalConfig;
  client.guildConfigs.set(interaction.guildId!, guildConfig);

  await interaction.editReply(
    '✅ **Monitoring enabled!** Status updates will begin within 3 minutes.'
  );
}

async function handleDisable(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
) {
  await interaction.deferReply();

  const intervalConfig = await client.intervals.get(interaction.guildId!);
  if (!intervalConfig || !intervalConfig.enabled) {
    await interaction.editReply('Monitoring is already disabled.');
    return;
  }

  intervalConfig.enabled = false;
  await client.intervals.set(interaction.guildId!, intervalConfig);

  // Update cache
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
  await interaction.deferReply();

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

    // Calculate next update time
    const nextUpdate = intervalConfig.next || Date.now();
    const timeUntilUpdate = Math.max(0, nextUpdate - Date.now());
    const nextUpdateText = timeUntilUpdate > 0
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
          name: 'Player Count Channel',
          value: intervalConfig.playerCountChannel
            ? `<#${intervalConfig.playerCountChannel}>`
            : 'Not set',
          inline: true,
        },
        {
          name: 'Server IP Channel',
          value: intervalConfig.serverIpChannel
            ? `<#${intervalConfig.serverIpChannel}>`
            : 'Not set',
          inline: true,
        }
      );

    // Add helpful info about updates
    embed.addFields({
      name: 'How to Get Fresh Data',
      value:
        '• **Automatic updates:** Every 10 minutes when monitoring is enabled\n' +
        '• **Manual check:** Use `/server status fresh:true` (rate limited)\n' +
        '• **Player data:** Use `/players` for current online players\n' +
        '• **Charts:** Use `/chart` for historical data',
      inline: false,
    });

    embed.addFields({
      name: 'Rate Limiting Protection',
      value:
        '• **Status updates:** Every 10 minutes automatically\n' +
        '• **Channel renames:** Max once per 10 minutes per channel\n' +
        '• **Charts:** Daily at midnight\n' +
        '• **Manual refreshes:** Limited to prevent Discord rate limits',
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}
