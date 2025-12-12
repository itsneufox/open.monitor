import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  AnySelectMenuInteraction,
  StringSelectMenuInteraction,
  RoleSelectMenuInteraction,
  PermissionFlagsBits,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalSubmitInteraction,
} from 'discord.js';
import { CustomClient } from '../types';
import { hasManagementPermission } from '../utils/permissions';

export const data = new SlashCommandBuilder()
  .setName('manage')
  .setDescription('Server monitoring management panel')
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
): Promise<void> {
  // Defer reply immediately to prevent timeout
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Permission check
  const hasPermission = await hasManagementPermission(interaction, client);
  if (!hasPermission) {
    await interaction.editReply({
      content:
        '❌ **Insufficient Permissions**\n\nYou need Administrator permissions or the configured management role to use this command.',
    });
    return;
  }

  await showManagePanel(interaction, client);
}

export async function showManagePanel(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  client: CustomClient
): Promise<void> {
  const guildId = interaction.guildId!;
  const servers = (await client.servers.get(guildId)) || [];
  const intervalConfig = await client.intervals.get(guildId);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Management Panel')
    .setDescription('Manage your SA:MP/open.mp server monitoring configuration')
    .setTimestamp();

  // Status overview
  const activeServer = servers.find(
    s => s.id === intervalConfig?.activeServerId
  );

  embed.addFields(
    {
      name: 'Current Status',
      value:
        `**Monitoring:** ${intervalConfig?.enabled ? 'Enabled' : 'Disabled'}\n` +
        `**Servers Configured:** ${servers.length}/10\n` +
        `**Active Server:** ${activeServer?.name || 'None'}`,
      inline: true,
    },
    {
      name: 'Channels',
      value:
        `**Status:** ${intervalConfig?.statusChannel ? 'Set' : 'Not Set'}\n` +
        `**Chart:** ${intervalConfig?.chartChannel ? 'Set' : 'Not Set'}\n` +
        `**Voice Channels:** ${intervalConfig?.playerCountChannel || intervalConfig?.serverIpChannel ? 'Set' : 'Not Set'}`,
      inline: true,
    }
  );

  // Add theme and role info
  const theme = intervalConfig?.statusTheme || 'classic';
  const roleId = intervalConfig?.managementRoleId;
  const role = roleId ? interaction.guild?.roles.cache.get(roleId) : null;

  embed.addFields({
    name: 'Settings',
    value:
      `**Theme:** ${theme === 'classic' ? 'Classic' : 'Detailed'}\n` +
      `**Management Role:** ${role ? role.toString() : 'Admin Only'}`,
    inline: false,
  });

  // Create buttons
  const setupRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('manage_setup')
      .setLabel('Setup Server')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('manage_servers')
      .setLabel('Manage Servers')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(servers.length === 0),
    new ButtonBuilder()
      .setCustomId('manage_monitoring')
      .setLabel('Monitoring')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!intervalConfig?.activeServerId)
  );

  const settingsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('manage_role')
      .setLabel('Permissions')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('manage_theme')
      .setLabel('Theme')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('manage_status')
      .setLabel('View Status')
      .setStyle(ButtonStyle.Secondary)
  );

  if (interaction instanceof ChatInputCommandInteraction) {
    // If deferred, use editReply instead of reply
    if (interaction.deferred) {
      await interaction.editReply({
        embeds: [embed],
        components: [setupRow, settingsRow],
      });
    } else {
      await interaction.reply({
        embeds: [embed],
        components: [setupRow, settingsRow],
        flags: MessageFlags.Ephemeral,
      });
    }
  } else {
    await interaction.update({
      embeds: [embed],
      components: [setupRow, settingsRow],
    });
  }
}

export async function handleManageButton(
  interaction: ButtonInteraction,
  client: CustomClient
): Promise<void> {
  const customId = interaction.customId;

  switch (customId) {
    case 'manage_setup':
      await handleSetupButton(interaction, client);
      break;
    case 'manage_servers':
      await handleServersButton(interaction, client);
      break;
    case 'manage_monitoring':
      await handleMonitoringButton(interaction, client);
      break;
    case 'manage_role':
      await handleRoleButton(interaction, client);
      break;
    case 'manage_theme':
      await handleThemeButton(interaction, client);
      break;
    case 'manage_status':
      await handleStatusButton(interaction, client);
      break;
    case 'manage_back':
      await showManagePanel(interaction, client);
      break;
    // Server management
    case 'manage_server_add':
      await handleServerAddButton(interaction, client);
      break;
    case 'manage_server_activate':
      await handleServerActivateButton(interaction, client);
      break;
    case 'manage_server_remove':
      await handleServerRemoveButton(interaction, client);
      break;
    // Monitoring
    case 'manage_monitor_toggle':
      await handleMonitorToggleButton(interaction, client);
      break;
    case 'manage_monitor_channels':
      await handleMonitorChannelsButton(interaction, client);
      break;
    case 'manage_voice_style':
      await handleVoiceStyleToggleButton(interaction, client);
      break;
    // Role management
    case 'manage_role_set':
      await handleRoleSetButton(interaction);
      break;
    case 'manage_role_remove':
      await handleRoleRemoveButton(interaction, client);
      break;
    // Theme
    case 'manage_theme_classic':
      await handleThemeSetButton(interaction, client, 'classic');
      break;
    case 'manage_theme_detailed':
      await handleThemeSetButton(interaction, client, 'detailed');
      break;
    default:
      break;
  }
}

async function handleSetupButton(
  interaction: ButtonInteraction,
  _client: CustomClient
): Promise<void> {
  // Show the setup modal directly from the button interaction
  const modal = new ModalBuilder()
    .setCustomId('setup_modal')
    .setTitle('Server Monitoring Setup');

  const addressInput = new TextInputBuilder()
    .setCustomId('server_address')
    .setLabel('Server Address')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., 51.178.146.245:7777 or play.example.com')
    .setRequired(true)
    .setMaxLength(260);

  const nameInput = new TextInputBuilder()
    .setCustomId('server_name')
    .setLabel('Server Name (Optional)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Defaults to IP:PORT if not provided')
    .setRequired(false)
    .setMaxLength(64);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(addressInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput)
  );

  await interaction.showModal(modal);
}

async function handleServersButton(
  interaction: ButtonInteraction,
  client: CustomClient
): Promise<void> {
  const servers = (await client.servers.get(interaction.guildId!)) || [];
  const intervalConfig = await client.intervals.get(interaction.guildId!);

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('Server Management')
    .setDescription(
      `You have ${servers.length} server${servers.length === 1 ? '' : 's'} configured.`
    )
    .setTimestamp();

  // List servers
  for (const server of servers) {
    const isActive = intervalConfig?.activeServerId === server.id;
    embed.addFields({
      name: `${isActive ? '* ' : '- '}${server.name}`,
      value: `**Address:** ${server.ip}:${server.port}\n**Status:** ${isActive ? 'Active' : 'Inactive'}`,
      inline: true,
    });
  }

  // Create server management buttons
  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('manage_server_add')
      .setLabel('Add Server')
      .setStyle(ButtonStyle.Success)
      .setDisabled(servers.length >= 10),
    new ButtonBuilder()
      .setCustomId('manage_server_activate')
      .setLabel('Activate Server')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(servers.length === 0),
    new ButtonBuilder()
      .setCustomId('manage_server_remove')
      .setLabel('Remove Server')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(servers.length === 0)
  );

  const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('manage_back')
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.update({
    embeds: [embed],
    components: [actionRow, backRow],
  });
}

async function handleMonitoringButton(
  interaction: ButtonInteraction,
  client: CustomClient
): Promise<void> {
  await renderMonitoringPanel(interaction, client, false);
}

async function renderMonitoringPanel(
  interaction: ButtonInteraction,
  client: CustomClient,
  editExisting: boolean
): Promise<void> {
  const intervalConfig = await client.intervals.get(interaction.guildId!);
  const servers = (await client.servers.get(interaction.guildId!)) || [];
  const activeServer = servers.find(
    s => s.id === intervalConfig?.activeServerId
  );
  const voiceStyle = intervalConfig?.voiceChannelStyle || 'text';
  const voiceStyleLabel =
    voiceStyle === 'emoji' ? 'Emoji labels (👥 / 🔗)' : 'Text labels';

  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle('Monitoring Configuration')
    .setTimestamp();

  if (!activeServer) {
    embed.setDescription('No active server configured.');
  } else {
    const nextUpdate = intervalConfig?.next || Date.now();
    const nextUpdateText = intervalConfig?.enabled
      ? `<t:${Math.floor(nextUpdate / 1000)}:R>`
      : 'Disabled';

    embed.setDescription(
      `**Active Server:** ${activeServer.name}\n` +
        `**Address:** ${activeServer.ip}:${activeServer.port}\n` +
        `**Status:** ${intervalConfig?.enabled ? 'Enabled' : 'Disabled'}\n` +
        `**Next Update:** ${nextUpdateText}`
    );

    embed.addFields(
      {
        name: 'Configured Channels',
        value:
          `**Status:** ${intervalConfig?.statusChannel ? `<#${intervalConfig.statusChannel}>` : 'Not set'}\n` +
          `**Chart:** ${intervalConfig?.chartChannel ? `<#${intervalConfig.chartChannel}>` : 'Not set'}\n` +
          `**Player Count:** ${intervalConfig?.playerCountChannel ? `<#${intervalConfig.playerCountChannel}>` : 'Not set'}\n` +
          `**Server IP:** ${intervalConfig?.serverIpChannel ? `<#${intervalConfig.serverIpChannel}>` : 'Not set'}`,
        inline: false,
      },
      {
        name: 'Voice Channel Style',
        value: voiceStyleLabel,
        inline: false,
      }
    );
  }

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('manage_monitor_toggle')
      .setLabel(intervalConfig?.enabled ? 'Disable' : 'Enable')
      .setStyle(
        intervalConfig?.enabled ? ButtonStyle.Danger : ButtonStyle.Success
      )
      .setDisabled(!activeServer),
    new ButtonBuilder()
      .setCustomId('manage_monitor_channels')
      .setLabel('Configure Channels')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!activeServer),
    new ButtonBuilder()
      .setCustomId('manage_voice_style')
      .setLabel(voiceStyle === 'emoji' ? 'Use Text Labels' : 'Use Emoji Labels')
      .setStyle(ButtonStyle.Secondary)
  );

  const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('manage_back')
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary)
  );

  if (editExisting && (interaction.deferred || interaction.replied)) {
    await interaction.editReply({
      embeds: [embed],
      components: [actionRow, backRow],
    });
  } else if (editExisting) {
    await interaction.message.edit({
      embeds: [embed],
      components: [actionRow, backRow],
    });
  } else {
    await interaction.update({
      embeds: [embed],
      components: [actionRow, backRow],
    });
  }
}

async function handleRoleButton(
  interaction: ButtonInteraction,
  client: CustomClient
): Promise<void> {
  await renderRolePanel(interaction, client, false);
}

async function renderRolePanel(
  interaction: ButtonInteraction,
  client: CustomClient,
  editExisting: boolean
): Promise<void> {
  const intervalConfig = await client.intervals.get(interaction.guildId!);
  const roleId = intervalConfig?.managementRoleId;
  const role = roleId ? interaction.guild?.roles.cache.get(roleId) : null;

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle('Permission Management')
    .setDescription(
      role
        ? `**Management Role:** ${role.toString()}\n\nMembers with this role can manage server monitoring settings.`
        : '**Management Role:** Not set\n\nOnly administrators can manage settings.'
    )
    .setTimestamp();

  embed.addFields(
    {
      name: 'Management Commands',
      value:
        '- `/manage` - Management panel\n' +
        '- Setup Wizard (inside `/manage`)\n' +
        '- Server management',
      inline: true,
    },
    {
      name: 'Public Commands',
      value:
        '- `/chart` - View charts\n' +
        '- `/players` - View players\n' +
        '- `/server status` - Check status',
      inline: true,
    }
  );

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('manage_role_set')
      .setLabel(role ? 'Change Role' : 'Set Role')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('manage_role_remove')
      .setLabel('Remove Role')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!role)
  );

  const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('manage_back')
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary)
  );

  if (editExisting && (interaction.deferred || interaction.replied)) {
    await interaction.editReply({
      embeds: [embed],
      components: [actionRow, backRow],
    });
  } else if (editExisting) {
    await interaction.message.edit({
      embeds: [embed],
      components: [actionRow, backRow],
    });
  } else {
    await interaction.update({
      embeds: [embed],
      components: [actionRow, backRow],
    });
  }
}

async function handleThemeButton(
  interaction: ButtonInteraction,
  client: CustomClient
): Promise<void> {
  await renderThemePanel(interaction, client, false);
}

async function renderThemePanel(
  interaction: ButtonInteraction,
  client: CustomClient,
  editExisting: boolean
): Promise<void> {
  const intervalConfig = await client.intervals.get(interaction.guildId!);
  const currentTheme = intervalConfig?.statusTheme || 'classic';

  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle('Theme Settings')
    .setDescription(
      `**Current Theme:** ${currentTheme === 'classic' ? 'Classic' : 'Detailed'}`
    )
    .addFields(
      {
        name: 'Classic Theme',
        value:
          (currentTheme === 'classic' ? '**Active**\n' : '') +
          'Shows basic server info: players, gamemode, version',
        inline: true,
      },
      {
        name: 'Detailed Theme',
        value:
          (currentTheme === 'detailed' ? '**Active**\n' : '') +
          'Shows server info + player list with names and scores',
        inline: true,
      }
    )
    .setTimestamp();

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('manage_theme_classic')
      .setLabel('Classic')
      .setStyle(
        currentTheme === 'classic' ? ButtonStyle.Success : ButtonStyle.Secondary
      )
      .setDisabled(currentTheme === 'classic'),
    new ButtonBuilder()
      .setCustomId('manage_theme_detailed')
      .setLabel('Detailed')
      .setStyle(
        currentTheme === 'detailed'
          ? ButtonStyle.Success
          : ButtonStyle.Secondary
      )
      .setDisabled(currentTheme === 'detailed')
  );

  const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('manage_back')
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary)
  );

  if (editExisting && (interaction.deferred || interaction.replied)) {
    await interaction.editReply({
      embeds: [embed],
      components: [actionRow, backRow],
    });
  } else if (editExisting) {
    await interaction.message.edit({
      embeds: [embed],
      components: [actionRow, backRow],
    });
  } else {
    await interaction.update({
      embeds: [embed],
      components: [actionRow, backRow],
    });
  }
}

async function handleStatusButton(
  interaction: ButtonInteraction,
  client: CustomClient
): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('Detailed Status')
    .setDescription('Loading status information...')
    .setTimestamp();

  await interaction.update({
    embeds: [embed],
    components: [],
  });

  // Get full status
  const servers = (await client.servers.get(interaction.guildId!)) || [];
  const intervalConfig = await client.intervals.get(interaction.guildId!);

  const statusEmbed = new EmbedBuilder()
    .setColor(intervalConfig?.enabled ? 0x00ff00 : 0xff6b6b)
    .setTitle('Monitoring Status')
    .setTimestamp();

  if (servers.length === 0) {
    statusEmbed.setDescription('No servers configured').addFields({
      name: 'Next Steps',
      value: 'Click the button below to return and use **Setup Server**',
    });
  } else if (!intervalConfig?.activeServerId) {
    statusEmbed.setDescription('No active server set').addFields({
      name: 'Next Steps',
      value: 'Click the button below to return and use **Manage Servers**',
    });
  } else {
    const activeServer = servers.find(
      s => s.id === intervalConfig.activeServerId
    );

    statusEmbed
      .setDescription(
        `**Status:** ${intervalConfig.enabled ? 'Active' : 'Disabled'}`
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
          name: 'Voice Channels',
          value:
            (intervalConfig.playerCountChannel
              ? `Player Count: <#${intervalConfig.playerCountChannel}>\n`
              : '') +
            (intervalConfig.serverIpChannel
              ? `Server IP: <#${intervalConfig.serverIpChannel}>`
              : 'Not set'),
          inline: true,
        }
      );
  }

  const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('manage_back')
      .setLabel('Back to Management Panel')
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.editReply({
    embeds: [statusEmbed],
    components: [backRow],
  });
}

// Server Management Handlers

async function handleServerAddButton(
  interaction: ButtonInteraction,
  _client: CustomClient
): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId('manage_add_server_modal')
    .setTitle('Add Server');

  const addressInput = new TextInputBuilder()
    .setCustomId('server_address')
    .setLabel('Server Address')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., 51.178.146.245:7777 or play.example.com')
    .setRequired(true)
    .setMaxLength(260);

  const nameInput = new TextInputBuilder()
    .setCustomId('server_name')
    .setLabel('Server Name (Optional)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Defaults to IP:PORT if not provided')
    .setRequired(false)
    .setMaxLength(64);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(addressInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput)
  );

  await interaction.showModal(modal);
}

async function handleServerActivateButton(
  interaction: ButtonInteraction,
  client: CustomClient
): Promise<void> {
  const servers = (await client.servers.get(interaction.guildId!)) || [];

  if (servers.length === 0) {
    await interaction.reply({
      content: 'No servers configured to activate.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('manage_activate_select')
    .setPlaceholder('Select a server to activate')
    .addOptions(
      servers.map(server => ({
        label: server.name,
        value: server.id,
        description: `${server.ip}:${server.port}`,
      }))
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    selectMenu
  );

  await interaction.reply({
    content: 'Choose which server to activate for monitoring:',
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleServerRemoveButton(
  interaction: ButtonInteraction,
  client: CustomClient
): Promise<void> {
  const servers = (await client.servers.get(interaction.guildId!)) || [];

  if (servers.length === 0) {
    await interaction.reply({
      content: 'No servers configured to remove.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('manage_remove_select')
    .setPlaceholder('Select a server to remove')
    .addOptions(
      servers.map(server => ({
        label: server.name,
        value: server.id,
        description: `${server.ip}:${server.port}`,
      }))
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    selectMenu
  );

  await interaction.reply({
    content: 'Choose which server to remove (this will delete all data):',
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

// Monitoring Handlers

async function handleMonitorToggleButton(
  interaction: ButtonInteraction,
  client: CustomClient
): Promise<void> {
  await interaction.deferUpdate();

  let intervalConfig = await client.intervals.get(interaction.guildId!);

  if (!intervalConfig) {
    await interaction.followUp({
      content:
        'No monitoring configuration found. Please complete the setup wizard first.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  intervalConfig.enabled = !intervalConfig.enabled;
  if (intervalConfig.enabled) {
    intervalConfig.next = Date.now() + 120000;
  }

  await client.intervals.set(interaction.guildId!, intervalConfig);

  // Update cache
  let guildConfig = client.guildConfigs.get(interaction.guildId!) || {
    servers: [],
  };
  guildConfig.interval = intervalConfig;
  client.guildConfigs.set(interaction.guildId!, guildConfig);

  await interaction.followUp({
    content: `Monitoring ${intervalConfig.enabled ? 'enabled' : 'disabled'} successfully.`,
    flags: MessageFlags.Ephemeral,
  });

  // Refresh the monitoring panel
  await handleMonitoringButton(interaction, client);
}

async function handleMonitorChannelsButton(
  interaction: ButtonInteraction,
  _client: CustomClient
): Promise<void> {
  await interaction.reply({
    content:
      'Use the **Setup Server** button in `/manage` to rerun the setup wizard and select your channels.',
    flags: MessageFlags.Ephemeral,
  });
}

async function handleVoiceStyleToggleButton(
  interaction: ButtonInteraction,
  client: CustomClient
): Promise<void> {
  let intervalConfig = await client.intervals.get(interaction.guildId!);

  if (!intervalConfig) {
    intervalConfig = {
      enabled: false,
      next: Date.now(),
      statusMessage: null,
      voiceChannelStyle: 'text',
    };
  }

  const currentStyle =
    intervalConfig.voiceChannelStyle === 'emoji' ? 'emoji' : 'text';
  const nextStyle = currentStyle === 'emoji' ? 'text' : 'emoji';

  intervalConfig.voiceChannelStyle = nextStyle;
  await client.intervals.set(interaction.guildId!, intervalConfig);

  let guildConfig = client.guildConfigs.get(interaction.guildId!) || {
    servers: [],
  };
  guildConfig.interval = intervalConfig;
  client.guildConfigs.set(interaction.guildId!, guildConfig);

  await handleMonitoringButton(interaction, client);

  await interaction.followUp({
    content:
      nextStyle === 'emoji'
        ? 'Voice channel labels will now use emoji icons (👥 / 🔗).'
        : 'Voice channel labels will now use text labels.',
    flags: MessageFlags.Ephemeral,
  });
}

// Role Management Handlers

async function handleRoleSetButton(
  interaction: ButtonInteraction
): Promise<void> {
  const selectMenu = new RoleSelectMenuBuilder()
    .setCustomId('manage_role_select')
    .setPlaceholder('Select a role to grant management access')
    .setMinValues(1)
    .setMaxValues(1);

  const row = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
    selectMenu
  );

  await interaction.reply({
    content: 'Choose which role should manage monitoring settings:',
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleRoleRemoveButton(
  interaction: ButtonInteraction,
  client: CustomClient
): Promise<void> {
  await interaction.deferUpdate();

  let intervalConfig = await client.intervals.get(interaction.guildId!);
  if (!intervalConfig || !intervalConfig.managementRoleId) {
    await interaction.followUp({
      content: 'No management role is currently set.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  delete intervalConfig.managementRoleId;
  await client.intervals.set(interaction.guildId!, intervalConfig);

  // Update cache
  let guildConfig = client.guildConfigs.get(interaction.guildId!) || {
    servers: [],
  };
  guildConfig.interval = intervalConfig;
  client.guildConfigs.set(interaction.guildId!, guildConfig);

  await interaction.followUp({
    content:
      'Management role removed. Only administrators can now manage settings.',
    flags: MessageFlags.Ephemeral,
  });

  // Refresh the role panel
  await renderRolePanel(interaction, client, true);
}

async function handleRoleSelect(
  interaction: RoleSelectMenuInteraction,
  client: CustomClient
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.update({
      content: 'Unable to set role outside of a guild.',
      components: [],
    });
    return;
  }

  const selectedRoleId = interaction.values[0];
  const role = selectedRoleId
    ? interaction.guild?.roles.cache.get(selectedRoleId)
    : null;

  if (!role) {
    await interaction.update({
      content: 'Selected role is no longer available.',
      components: [],
    });
    return;
  }

  let intervalConfig = await client.intervals.get(interaction.guildId);
  if (!intervalConfig) {
    intervalConfig = {
      enabled: false,
      next: Date.now(),
      statusMessage: null,
      managementRoleId: role.id,
      voiceChannelStyle: 'text',
    };
  } else {
    intervalConfig.managementRoleId = role.id;
  }

  await client.intervals.set(interaction.guildId, intervalConfig);

  let guildConfig = client.guildConfigs.get(interaction.guildId) || {
    servers: [],
  };
  guildConfig.interval = intervalConfig;
  client.guildConfigs.set(interaction.guildId, guildConfig);

  await interaction.update({
    content: `Management role set to ${role.toString()}.`,
    components: [],
  });
}

// Theme Handlers

async function handleThemeSetButton(
  interaction: ButtonInteraction,
  client: CustomClient,
  theme: 'classic' | 'detailed'
): Promise<void> {
  await interaction.deferUpdate();

  let intervalConfig = await client.intervals.get(interaction.guildId!);

  if (!intervalConfig) {
    intervalConfig = {
      enabled: false,
      next: Date.now(),
      statusMessage: null,
      statusTheme: theme,
      voiceChannelStyle: 'text',
    };
  } else {
    intervalConfig.statusTheme = theme;
  }

  await client.intervals.set(interaction.guildId!, intervalConfig);

  // Update cache
  let guildConfig = client.guildConfigs.get(interaction.guildId!) || {
    servers: [],
  };
  guildConfig.interval = intervalConfig;
  client.guildConfigs.set(interaction.guildId!, guildConfig);

  await interaction.followUp({
    content: `Theme changed to ${theme}.`,
    flags: MessageFlags.Ephemeral,
  });

  // Refresh the theme panel
  await renderThemePanel(interaction, client, true);
}

// Select Menu Handlers

export async function handleManageSelectMenu(
  interaction: AnySelectMenuInteraction,
  client: CustomClient
): Promise<void> {
  const customId = interaction.customId;

  if (customId === 'manage_role_select' && interaction.isRoleSelectMenu()) {
    await handleRoleSelect(interaction, client);
    return;
  }

  if (!interaction.isStringSelectMenu()) {
    return;
  }

  const selectedValue = interaction.values[0];
  if (!selectedValue) return;

  switch (customId) {
    case 'manage_activate_select':
      await handleServerActivateSelect(interaction, client, selectedValue);
      break;
    case 'manage_remove_select':
      await handleServerRemoveSelect(interaction, client, selectedValue);
      break;
  }
}

async function handleServerActivateSelect(
  interaction: StringSelectMenuInteraction,
  client: CustomClient,
  serverId: string
): Promise<void> {
  await interaction.deferUpdate();

  const servers = (await client.servers.get(interaction.guildId!)) || [];
  const server = servers.find(s => s.id === serverId);

  if (!server) {
    await interaction.followUp({
      content: 'Server not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  let intervalConfig = await client.intervals.get(interaction.guildId!);
  if (!intervalConfig) {
    intervalConfig = {
      activeServerId: server.id,
      enabled: false,
      next: Date.now(),
      statusMessage: null,
      voiceChannelStyle: 'text',
    };
  } else {
    intervalConfig.activeServerId = server.id;
    intervalConfig.statusMessage = null;
  }

  await client.intervals.set(interaction.guildId!, intervalConfig);

  // Update IP channel name if configured
  if (intervalConfig.serverIpChannel) {
    try {
      const serverIpChannel = await client.channels
        .fetch(intervalConfig.serverIpChannel)
        .catch(() => null);
      if (serverIpChannel && 'setName' in serverIpChannel) {
        await (
          serverIpChannel as { setName: (name: string) => Promise<unknown> }
        ).setName(`IP: ${server.ip}:${server.port}`);
      }
    } catch (error) {
      console.error('Failed to update IP channel name:', error);
    }
  }

  // Update cache
  let guildConfig = client.guildConfigs.get(interaction.guildId!) || {
    servers: [],
  };
  guildConfig.servers = servers;
  guildConfig.interval = intervalConfig;
  client.guildConfigs.set(interaction.guildId!, guildConfig);

  await interaction.editReply({
    content: `Server **${server.name}** is now active for monitoring.`,
    components: [],
  });
}

async function handleServerRemoveSelect(
  interaction: StringSelectMenuInteraction,
  client: CustomClient,
  serverId: string
): Promise<void> {
  await interaction.deferUpdate();

  const servers = (await client.servers.get(interaction.guildId!)) || [];
  const serverIndex = servers.findIndex(s => s.id === serverId);

  if (serverIndex === -1) {
    await interaction.followUp({
      content: 'Server not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const server = servers[serverIndex];
  if (!server) return;

  try {
    const { DatabaseCleaner } = await import('../utils/databaseCleaner');
    const intervalConfig = await client.intervals.get(interaction.guildId!);
    const isActiveServer = intervalConfig?.activeServerId === server.id;

    // Remove server from the list
    servers.splice(serverIndex, 1);
    await client.servers.set(interaction.guildId!, servers);

    // Clean up all database data for this server
    const cleaner = new DatabaseCleaner(client);
    await cleaner.cleanupServer(interaction.guildId!, server.id);

    // If this was the active server, handle accordingly
    if (isActiveServer && intervalConfig) {
      if (servers.length > 0) {
        const newActiveServer = servers[0];
        if (newActiveServer) {
          intervalConfig.activeServerId = newActiveServer.id;
          intervalConfig.statusMessage = null;
          await client.intervals.set(interaction.guildId!, intervalConfig);
        }
      } else {
        delete intervalConfig.activeServerId;
        intervalConfig.enabled = false;
        intervalConfig.statusMessage = null;
        await client.intervals.set(interaction.guildId!, intervalConfig);
      }
    }

    // Update guild config cache
    let guildConfig = client.guildConfigs.get(interaction.guildId!) || {
      servers: [],
    };
    guildConfig.servers = servers;
    if (intervalConfig) {
      guildConfig.interval = intervalConfig;
    }
    client.guildConfigs.set(interaction.guildId!, guildConfig);

    await interaction.editReply({
      content: `Server **${server.name}** removed successfully.`,
      components: [],
    });
  } catch (error) {
    console.error('Error removing server:', error);
    await interaction.followUp({
      content: 'An error occurred while removing the server.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

// Modal Handlers

export async function handleAddServerModal(
  interaction: ModalSubmitInteraction,
  client: CustomClient
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const addressInput = interaction.fields
    .getTextInputValue('server_address')
    .trim();
  const nameInput = interaction.fields.getTextInputValue('server_name').trim();

  // Parse address - support both "IP:PORT" and "IP" (default port 7777)
  let ipInput: string;
  let port: number;

  if (addressInput.includes(':')) {
    const parts = addressInput.split(':');
    ipInput = parts[0]!.trim();
    const portString = parts[1]!.trim();
    port = parseInt(portString, 10);

    if (isNaN(port)) {
      await interaction.editReply({
        content: 'Invalid Port: Port must be a number.',
      });
      return;
    }
  } else {
    ipInput = addressInput;
    port = 7777; // Default port
  }

  // Import validation and query utilities
  const { SecurityValidator } = await import('../utils/securityValidator');
  const { InputValidator } = await import('../utils/inputValidator');
  const { SAMPQuery } = await import('../utils/sampQuery');
  const { getServerDataKey } = await import('../types');

  // Validate IP/Domain
  if (!SecurityValidator.validateServerIP(ipInput)) {
    await interaction.editReply({
      content:
        'Invalid IP/Domain: Please use a valid public IPv4 address or domain name.',
    });
    return;
  }

  // Validate Port
  const portValidation = InputValidator.validatePort(port);
  if (!portValidation.valid) {
    await interaction.editReply({
      content: `Invalid Port: ${portValidation.error}`,
    });
    return;
  }

  // Validate Server Name (if provided)
  if (nameInput) {
    const nameValidation = InputValidator.validateServerName(nameInput);
    if (!nameValidation.valid) {
      await interaction.editReply({
        content: `Invalid Server Name: ${nameValidation.error}`,
      });
      return;
    }
  }

  // Check if server is banned
  const serverAddress = `${ipInput}:${port}`;
  const banCheck = SecurityValidator.isIPBanned(serverAddress);
  if (banCheck.banned) {
    await interaction.editReply({
      content: `This server cannot be monitored.\n\nReason: ${banCheck.reason || 'Server is banned'}`,
    });
    return;
  }

  try {
    await interaction.editReply('Testing connection to server...');

    // Test server connection
    const sampQuery = new SAMPQuery();
    const testResult = await sampQuery.getServerInfo(
      {
        ip: ipInput,
        port,
        id: '',
        name: '',
        addedAt: 0,
        addedBy: '',
      },
      interaction.guildId!
    );

    const serverId = `${ipInput}:${port}`;
    const finalServerName = nameInput || `${ipInput}:${port}`;

    const server = {
      id: serverId,
      name: finalServerName,
      ip: ipInput,
      port,
      addedAt: Date.now(),
      addedBy: interaction.user.id,
    };

    // Get existing servers for this guild
    const existingServers =
      (await client.servers.get(interaction.guildId!)) || [];
    const isFirstServer = existingServers.length === 0;

    // Check if server already exists
    const existingIndex = existingServers.findIndex(s => s.id === serverId);
    if (existingIndex !== -1) {
      existingServers[existingIndex] = server;
    } else {
      existingServers.push(server);
    }

    // Validate server limit
    if (existingServers.length > 10) {
      await interaction.editReply(
        'Maximum of 10 servers per Discord server allowed. Remove a server first.'
      );
      return;
    }

    // Save updated server list
    await client.servers.set(interaction.guildId!, existingServers);

    // If this is the first server OR no active server is set, make it active
    let intervalConfig = await client.intervals.get(interaction.guildId!);
    let setAsActive = isFirstServer;

    if (!isFirstServer && intervalConfig && !intervalConfig.activeServerId) {
      setAsActive = true;
    }

    if (setAsActive) {
      if (!intervalConfig) {
        intervalConfig = {
          activeServerId: serverId,
          enabled: false,
          next: Date.now(),
          statusMessage: null,
          voiceChannelStyle: 'text',
        };
      } else {
        intervalConfig.activeServerId = serverId;
        intervalConfig.statusMessage = null;
      }

      await client.intervals.set(interaction.guildId!, intervalConfig);
    }

    // Update guild config cache
    let guildConfig = client.guildConfigs.get(interaction.guildId!) || {
      servers: [],
    };
    guildConfig.servers = existingServers;
    if (intervalConfig) {
      guildConfig.interval = intervalConfig;
    }
    client.guildConfigs.set(interaction.guildId!, guildConfig);

    // Initialize server data in database
    const serverDataKey = getServerDataKey(interaction.guildId!, serverId);
    const existingData = await client.maxPlayers.get(serverDataKey);
    if (!existingData) {
      await client.maxPlayers.set(serverDataKey, {
        maxPlayersToday: testResult?.players || 0,
        days: [],
        name: finalServerName,
        maxPlayers: testResult?.maxplayers || 0,
      });
    }

    await interaction.editReply(
      `Server **${finalServerName}** added successfully!\n` +
        `Status: ${testResult ? 'Online' : 'Offline'}\n` +
        (testResult
          ? `Players: ${testResult.players}/${testResult.maxplayers}`
          : '') +
        (setAsActive ? '\n\nThis server is now active for monitoring.' : '')
    );
  } catch (error) {
    console.error('Error adding server:', error);
    await interaction.editReply(
      'An error occurred while adding the server. The server may be offline or unreachable.'
    );
  }
}
