import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  type InteractionReplyOptions,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { CustomClient } from '../types';

export async function handleOwnerButton(
  interaction: ButtonInteraction,
  _client: CustomClient
): Promise<void> {
  if (!(await ensureOwner(interaction))) return;

  switch (interaction.customId) {
    case 'owner_update':
      await handleUpdateButton(interaction);
      break;
    case 'owner_maintenance':
      await handleMaintenanceButton(interaction);
      break;
    case 'owner_ban':
      await handleBanButton(interaction);
      break;
    case 'owner_debug':
      await handleDebugButton(interaction);
      break;
    case 'owner_reboot':
      await handleRebootButton(interaction);
      break;
    case 'owner_back':
      await interaction.update({
        content: 'Returned to main panel.',
        components: [],
      });
      break;
  }
}

export async function handleOwnerSelectMenu(
  interaction: StringSelectMenuInteraction,
  client: CustomClient
): Promise<void> {
  if (!(await ensureOwner(interaction))) return;

  const value = interaction.values[0];
  if (!value) return;

  switch (interaction.customId) {
    case 'owner_update_select':
      await handleUpdateSelect(interaction, client, value);
      break;
    case 'owner_maintenance_select':
      await handleMaintenanceSelect(interaction, client, value);
      break;
    case 'owner_ban_select':
      await handleBanSelect(interaction, client, value);
      break;
    case 'owner_debug_select':
      await handleDebugSelect(interaction, client, value);
      break;
  }
}

export async function handleOwnerModal(
  interaction: ModalSubmitInteraction,
  client: CustomClient
): Promise<void> {
  if (!(await ensureOwner(interaction))) return;

  switch (interaction.customId) {
    case 'owner_cleanup_keys_modal':
      await handleCleanupKeysModal(interaction, client);
      break;
    case 'owner_reset_uptime_modal':
      await handleResetUptimeModal(interaction, client);
      break;
    case 'owner_ban_ip_modal':
      await handleBanIpModal(interaction, client);
      break;
    case 'owner_unban_ip_modal':
      await handleUnbanIpModal(interaction, client);
      break;
    case 'owner_debug_uptime_modal':
      await handleDebugUptimeModal(interaction, client);
      break;
  }
}

export async function handleOwnerRebootButton(
  interaction: ButtonInteraction,
  client: CustomClient
): Promise<void> {
  if (!(await ensureOwner(interaction))) return;

  if (interaction.customId === 'owner_reboot_confirm') {
    const rebootCommand = await import('../commands/reboot');
    await rebootCommand.execute(
      interaction as unknown as ChatInputCommandInteraction,
      client
    );
  } else if (interaction.customId === 'owner_reboot_cancel') {
    await interaction.update({
      content: 'Reboot cancelled.',
      embeds: [],
      components: [],
    });
  }
}

async function ensureOwner<
  T extends {
    user: { id: string };
    reply: (options: InteractionReplyOptions) => Promise<unknown>;
  },
>(interaction: T): Promise<boolean> {
  if (interaction.user.id === process.env.OWNER_ID) {
    return true;
  }

  await interaction.reply({
    content: 'Only the bot owner can use these controls.',
    flags: MessageFlags.Ephemeral,
  });
  return false;
}

async function handleUpdateButton(interaction: ButtonInteraction) {
  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('Force Update')
    .setDescription('Choose what to update:')
    .setTimestamp();

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('owner_update_select')
    .setPlaceholder('Select update type')
    .addOptions(
      {
        label: 'Update Status (Current Guild)',
        value: 'status_current',
        description: 'Update status messages for current guild',
      },
      {
        label: 'Update Status (All Guilds)',
        value: 'status_all',
        description: 'Update status messages for all guilds',
      },
      {
        label: 'Update Chart (Current Guild)',
        value: 'chart_current',
        description: 'Refresh chart for current guild',
      },
      {
        label: 'Update Chart (All Guilds)',
        value: 'chart_all',
        description: 'Refresh charts for all guilds',
      }
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    selectMenu
  );

  await interaction.reply({
    embeds: [embed],
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleMaintenanceButton(interaction: ButtonInteraction) {
  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle('Database Maintenance')
    .setDescription('Choose maintenance operation:')
    .setTimestamp();

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('owner_maintenance_select')
    .setPlaceholder('Select maintenance operation')
    .addOptions(
      {
        label: 'Cleanup Old Data',
        value: 'cleanup_data',
        description: 'Remove old chart data (30+ days)',
      },
      {
        label: 'Cleanup Uptime Keys',
        value: 'cleanup_keys',
        description: 'Clean up uptime database keys for a guild',
      },
      {
        label: 'Reset Uptime',
        value: 'reset_uptime',
        description: 'Reset uptime statistics for a server',
      }
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    selectMenu
  );

  await interaction.reply({
    embeds: [embed],
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleBanButton(interaction: ButtonInteraction) {
  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('IP Ban Management')
    .setDescription('Choose ban operation:')
    .setTimestamp();

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('owner_ban_select')
    .setPlaceholder('Select ban operation')
    .addOptions(
      {
        label: 'Ban IP Address',
        value: 'ban_ip',
        description: 'Ban a specific IP address',
      },
      {
        label: 'Unban IP Address',
        value: 'unban_ip',
        description: 'Remove an IP from ban list',
      },
      {
        label: 'List Banned IPs',
        value: 'list_bans',
        description: 'View all banned IP addresses',
      },
      {
        label: 'Clear All Bans',
        value: 'clear_bans',
        description: 'Remove all IP bans',
      }
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    selectMenu
  );

  await interaction.reply({
    embeds: [embed],
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleDebugButton(interaction: ButtonInteraction) {
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle('Debug & Diagnostics')
    .setDescription('Choose debug option:')
    .setTimestamp();

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('owner_debug_select')
    .setPlaceholder('Select debug option')
    .addOptions(
      {
        label: 'Bot Overview',
        value: 'overview',
        description: 'Full bot statistics and configuration',
      },
      {
        label: 'Server Uptime Stats',
        value: 'uptime',
        description: 'View raw uptime data for a server',
      }
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    selectMenu
  );

  await interaction.reply({
    embeds: [embed],
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleRebootButton(interaction: ButtonInteraction) {
  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('Reboot Confirmation')
    .setDescription(
      '**Warning:** This will restart the bot process.\n\n' +
        'The bot must be running under a process manager (PM2, Docker, systemd) to restart automatically.\n\n' +
        'Are you sure you want to proceed?'
    )
    .setTimestamp();

  const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('owner_reboot_confirm')
      .setLabel('Confirm Reboot')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('owner_reboot_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply({
    embeds: [embed],
    components: [confirmRow],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleUpdateSelect(
  interaction: StringSelectMenuInteraction,
  client: CustomClient,
  value: string
) {
  await interaction.deferUpdate();
  const updateCommand = await import('../commands/update');

  const mockInteraction = {
    ...interaction,
    options: {
      getSubcommand: () => (value.startsWith('status') ? 'status' : 'chart'),
      getString: () => null,
      getBoolean: (name: string) =>
        name === 'all_guilds' ? value.endsWith('_all') : false,
    },
    reply: async (
      ...args: Parameters<StringSelectMenuInteraction['followUp']>
    ) => interaction.followUp(...args),
    deferReply: async () => {},
    editReply: async (
      ...args: Parameters<StringSelectMenuInteraction['followUp']>
    ) => interaction.followUp(...args),
  } as unknown as ChatInputCommandInteraction;

  await updateCommand.execute(mockInteraction, client);
}

async function handleMaintenanceSelect(
  interaction: StringSelectMenuInteraction,
  client: CustomClient,
  value: string
) {
  if (value === 'cleanup_data') {
    await interaction.deferUpdate();
    const maintenanceCommand = await import('../commands/maintenance');

    const mockInteraction = {
      ...interaction,
      options: {
        getSubcommand: () => 'cleanup-data',
        getString: () => null,
        getBoolean: () => false,
      },
      reply: async (
        ...args: Parameters<StringSelectMenuInteraction['followUp']>
      ) => interaction.followUp(...args),
      deferReply: async () => {},
      editReply: async (
        ...args: Parameters<StringSelectMenuInteraction['followUp']>
      ) => interaction.followUp(...args),
    } as unknown as ChatInputCommandInteraction;

    await maintenanceCommand.execute(mockInteraction, client);
    return;
  }

  if (value === 'cleanup_keys') {
    const modal = new ModalBuilder()
      .setCustomId('owner_cleanup_keys_modal')
      .setTitle('Cleanup Uptime Keys');

    const guildIdInput = new TextInputBuilder()
      .setCustomId('guild_id')
      .setLabel('Guild ID')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter guild ID to clean up')
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(guildIdInput)
    );
    await interaction.showModal(modal);
    return;
  }

  if (value === 'reset_uptime') {
    const modal = new ModalBuilder()
      .setCustomId('owner_reset_uptime_modal')
      .setTitle('Reset Uptime Statistics');

    const guildIdInput = new TextInputBuilder()
      .setCustomId('guild_id')
      .setLabel('Guild ID')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter guild ID')
      .setRequired(true);

    const serverInput = new TextInputBuilder()
      .setCustomId('server')
      .setLabel('Server (IP:PORT)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g., 51.178.146.245:7777')
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(guildIdInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(serverInput)
    );
    await interaction.showModal(modal);
  }
}

async function handleBanSelect(
  interaction: StringSelectMenuInteraction,
  client: CustomClient,
  value: string
) {
  if (value === 'ban_ip') {
    const modal = new ModalBuilder()
      .setCustomId('owner_ban_ip_modal')
      .setTitle('Ban IP Address');

    const ipInput = new TextInputBuilder()
      .setCustomId('ip_address')
      .setLabel('IP Address')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g., 51.178.146.245:7777')
      .setRequired(true);

    const reasonInput = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Ban Reason')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Reason for banning this IP')
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(ipInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput)
    );
    await interaction.showModal(modal);
    return;
  }

  if (value === 'unban_ip') {
    const modal = new ModalBuilder()
      .setCustomId('owner_unban_ip_modal')
      .setTitle('Unban IP Address');

    const ipInput = new TextInputBuilder()
      .setCustomId('ip_address')
      .setLabel('IP Address')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g., 51.178.146.245:7777')
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(ipInput)
    );
    await interaction.showModal(modal);
    return;
  }

  await interaction.deferUpdate();
  const banCommand = await import('../commands/ban');

  const mockInteraction = {
    ...interaction,
    options: {
      getSubcommand: () => (value === 'list_bans' ? 'list' : 'clear'),
      getString: () => null,
    },
    reply: async (
      ...args: Parameters<StringSelectMenuInteraction['followUp']>
    ) => interaction.followUp(...args),
    deferReply: async () => {},
    editReply: async (
      ...args: Parameters<StringSelectMenuInteraction['followUp']>
    ) => interaction.followUp(...args),
  } as unknown as ChatInputCommandInteraction;

  await banCommand.execute(mockInteraction, client);
}

async function handleDebugSelect(
  interaction: StringSelectMenuInteraction,
  client: CustomClient,
  value: string
) {
  if (value === 'overview') {
    await interaction.deferUpdate();
    const debugCommand = await import('../commands/debug');

    const mockInteraction = {
      ...interaction,
      options: {
        getSubcommand: () => 'overview',
        getString: () => null,
      },
      reply: async (
        ...args: Parameters<StringSelectMenuInteraction['followUp']>
      ) => interaction.followUp(...args),
      deferReply: async () => {},
      editReply: async (
        ...args: Parameters<StringSelectMenuInteraction['followUp']>
      ) => interaction.followUp(...args),
    } as unknown as ChatInputCommandInteraction;

    await debugCommand.execute(mockInteraction, client);
    return;
  }

  if (value === 'uptime') {
    const modal = new ModalBuilder()
      .setCustomId('owner_debug_uptime_modal')
      .setTitle('Server Uptime Stats');

    const serverInput = new TextInputBuilder()
      .setCustomId('server')
      .setLabel('Server Name or IP:PORT')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g., My Server or 51.178.146.245:7777')
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(serverInput)
    );
    await interaction.showModal(modal);
  }
}

async function handleCleanupKeysModal(
  interaction: ModalSubmitInteraction,
  client: CustomClient
) {
  await interaction.deferReply({ ephemeral: true });
  const guildId = interaction.fields.getTextInputValue('guild_id');
  const maintenanceCommand = await import('../commands/maintenance');

  const mockInteraction = {
    ...interaction,
    options: {
      getSubcommand: () => 'cleanup-keys',
      getString: (name: string) => (name === 'guildid' ? guildId : null),
      getBoolean: () => true,
    },
    deferReply: async () => {},
    editReply: async (
      ...args: Parameters<ModalSubmitInteraction['editReply']>
    ) => interaction.editReply(...args),
  } as unknown as ChatInputCommandInteraction;

  await maintenanceCommand.execute(mockInteraction, client);
}

async function handleResetUptimeModal(
  interaction: ModalSubmitInteraction,
  client: CustomClient
) {
  await interaction.deferReply({ ephemeral: true });
  const guildId = interaction.fields.getTextInputValue('guild_id');
  const server = interaction.fields.getTextInputValue('server');
  const maintenanceCommand = await import('../commands/maintenance');

  const mockInteraction = {
    ...interaction,
    guildId,
    options: {
      getSubcommand: () => 'reset-uptime',
      getString: (name: string) => (name === 'server' ? server : null),
      getBoolean: () => true,
    },
    deferReply: async () => {},
    editReply: async (
      ...args: Parameters<ModalSubmitInteraction['editReply']>
    ) => interaction.editReply(...args),
  } as unknown as ChatInputCommandInteraction;

  await maintenanceCommand.execute(mockInteraction, client);
}

async function handleBanIpModal(
  interaction: ModalSubmitInteraction,
  client: CustomClient
) {
  await interaction.deferReply({ ephemeral: true });
  const ipAddress = interaction.fields.getTextInputValue('ip_address');
  const reason = interaction.fields.getTextInputValue('reason');
  const banCommand = await import('../commands/ban');

  const mockInteraction = {
    ...interaction,
    options: {
      getSubcommand: () => 'ip',
      getString: (name: string) => {
        if (name === 'address') return ipAddress;
        if (name === 'reason') return reason;
        return null;
      },
    },
    deferReply: async () => {},
    editReply: async (
      ...args: Parameters<ModalSubmitInteraction['editReply']>
    ) => interaction.editReply(...args),
  } as unknown as ChatInputCommandInteraction;

  await banCommand.execute(mockInteraction, client);
}

async function handleUnbanIpModal(
  interaction: ModalSubmitInteraction,
  client: CustomClient
) {
  await interaction.deferReply({ ephemeral: true });
  const ipAddress = interaction.fields.getTextInputValue('ip_address');
  const banCommand = await import('../commands/ban');

  const mockInteraction = {
    ...interaction,
    options: {
      getSubcommand: () => 'unban',
      getString: (name: string) => (name === 'address' ? ipAddress : null),
    },
    deferReply: async () => {},
    editReply: async (
      ...args: Parameters<ModalSubmitInteraction['editReply']>
    ) => interaction.editReply(...args),
  } as unknown as ChatInputCommandInteraction;

  await banCommand.execute(mockInteraction, client);
}

async function handleDebugUptimeModal(
  interaction: ModalSubmitInteraction,
  client: CustomClient
) {
  await interaction.deferReply({ ephemeral: true });
  const server = interaction.fields.getTextInputValue('server');
  const debugCommand = await import('../commands/debug');

  const mockInteraction = {
    ...interaction,
    options: {
      getSubcommand: () => 'uptime',
      getString: (name: string) => (name === 'server' ? server : null),
    },
    deferReply: async () => {},
    editReply: async (
      ...args: Parameters<ModalSubmitInteraction['editReply']>
    ) => interaction.editReply(...args),
  } as unknown as ChatInputCommandInteraction;

  await debugCommand.execute(mockInteraction, client);
}
