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

  const statusChannel = interaction.options.getChannel(
    'status_channel'
  ) as TextChannel;
  const chartChannel = interaction.options.getChannel(
    'chart_channel'
  ) as TextChannel | null;
  const playerCountChannel = interaction.options.getChannel(
    'player_count_channel'
  ) as TextChannel | VoiceChannel | null;
  const serverIpChannel = interaction.options.getChannel(
    'server_ip_channel'
  ) as TextChannel | VoiceChannel | null;

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

  await client.intervals.set(interaction.guildId!, newConfig);

  // Set initial channel names
  const activeServer = servers.find(
    s => s.id === intervalConfig.activeServerId
  );
  if (activeServer) {
    // Set IP channel name
    if (serverIpChannel) {
      try {
        await serverIpChannel.setName(
          `Server ${activeServer.ip}:${activeServer.port}`
        );
      } catch (error) {
        console.error('Failed to set IP channel name:', error);
      }
    }

    // Set player count channel name
    if (playerCountChannel) {
      try {
        await playerCountChannel.setName('Players: Loading...');
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

  await interaction.editReply({ embeds: [embed] });
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
  }

  await interaction.editReply({ embeds: [embed] });
}
