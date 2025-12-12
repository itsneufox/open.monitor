import {
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ChatInputCommandInteraction,
  ModalBuilder,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  ChannelSelectMenuInteraction,
  PermissionFlagsBits,
} from 'discord.js';
import { InputValidator } from '../utils/inputValidator';
import { hasManagementPermission } from '../utils/permissions';
import { SecurityValidator } from '../utils/securityValidator';
import { SAMPQuery } from '../utils/sampQuery';
import type { ServerConfig, IntervalConfig } from '../types/index';
import type { CustomClient } from '../types/index';

interface SetupData {
  ip: string;
  port: number;
  name: string;
  userId: string;
  guildId: string;
  statusChannelId?: string;
  chartChannelId?: string;
  playerCountChannelId?: string;
  serverIpChannelId?: string;
}

// Store temporary setup data (in-memory, expires after 5 minutes)
const setupSessions = new Map<string, { data: SetupData; expiresAt: number }>();

// Clean up expired sessions every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, session] of setupSessions.entries()) {
    if (now > session.expiresAt) {
      setupSessions.delete(key);
    }
  }
}, 60000);

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription(
    'Quick setup wizard - Configure your SAMP/open.mp server monitoring in one go'
  )
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
) {
  // Permission check
  const hasPermission = await hasManagementPermission(interaction, client);
  if (!hasPermission) {
    await interaction.reply({
      content:
        '❌ **Insufficient Permissions**\n\nYou need Administrator permissions or the configured management role to use this command.',
      flags: 64, // Ephemeral
    });
    return;
  }

  // Show the server details modal
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

export async function handleModalSubmit(
  interaction: ModalSubmitInteraction,
  _client: CustomClient
): Promise<void> {
  if (interaction.customId !== 'setup_modal') return;

  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId!;
  const userId = interaction.user.id;

  // Get input values
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
        content: '❌ **Invalid Port:** Port must be a number.',
      });
      return;
    }
  } else {
    ipInput = addressInput;
    port = 7777; // Default port
  }

  // Validate IP/Domain - using validateServerIP which validates IPv4 and rejects private ranges
  if (!SecurityValidator.validateServerIP(ipInput)) {
    await interaction.editReply({
      content:
        '❌ **Invalid IP/Domain:** Please use a valid public IPv4 address or domain name.',
    });
    return;
  }

  // Validate Port
  const portValidation = InputValidator.validatePort(port);
  if (!portValidation.valid) {
    await interaction.editReply({
      content: `❌ **Invalid Port:** ${portValidation.error}`,
    });
    return;
  }

  // Validate Server Name (if provided)
  if (nameInput) {
    const nameValidation = InputValidator.validateServerName(nameInput);
    if (!nameValidation.valid) {
      await interaction.editReply({
        content: `❌ **Invalid Server Name:** ${nameValidation.error}`,
      });
      return;
    }
  }

  // Security checks
  const banCheck = SecurityValidator.isIPBanned(`${ipInput}:${port}`);
  if (banCheck.banned) {
    await interaction.editReply({
      content: `❌ **Access Denied:** This server is banned. ${banCheck.reason ? `Reason: ${banCheck.reason}` : ''}`,
    });
    return;
  }

  // Rate limiting check
  const rateLimitCheck = InputValidator.checkCommandRateLimit(userId, 'setup');
  if (!rateLimitCheck.allowed) {
    await interaction.editReply({
      content: `Please wait ${Math.ceil((rateLimitCheck.remainingTime || 0) / 1000)} seconds before running setup again.`,
    });
    return;
  }

  // Test server connection
  const embed = new EmbedBuilder()
    .setColor(0xffaa00)
    .setDescription('Testing connection to server...');

  await interaction.editReply({ embeds: [embed] });

  try {
    const sampQuery = new SAMPQuery();
    const tempServerConfig: ServerConfig = {
      id: `${ipInput}:${port}`,
      name: '',
      ip: ipInput,
      port,
      addedAt: Date.now(),
      addedBy: userId,
    };
    const queryResult = await sampQuery.getServerInfo(
      tempServerConfig,
      guildId
    );

    if (!queryResult) {
      embed
        .setColor(0xff0000)
        .setDescription(
          `❌ **Connection Failed**\n\nUnable to connect to server. Please check that the server is online and query is enabled.`
        );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Use IP:PORT if no custom name provided
    const serverName = nameInput || `${ipInput}:${port}`;

    // Store setup data temporarily
    const sessionKey = `${guildId}_${userId}`;
    setupSessions.set(sessionKey, {
      data: {
        ip: ipInput,
        port,
        name: serverName,
        userId,
        guildId,
      },
      expiresAt: Date.now() + 300000, // 5 minutes
    });

    // Show channel selection UI
    embed
      .setColor(0x00ff00)
      .setTitle('✅ Server Connection Successful!')
      .setDescription(
        `**Server:** ${queryResult.hostname || 'Unknown'}\n` +
          `**Players:** ${queryResult.players || 0}/${queryResult.maxplayers || 0}\n` +
          `**Gamemode:** ${queryResult.gamemode || 'Unknown'}\n\n` +
          `**Next Step:** Select the channels where you want monitoring updates to appear.\n\n` +
          `**Required:**\n` +
          `- **Status Channel** - Where server status updates will be posted\n\n` +
          `**Optional:**\n` +
          `- **Chart Channel** - Daily player count charts\n` +
          `- **Player Count Channel** - Voice channel showing player count\n` +
          `- **Server IP Channel** - Voice channel showing server IP`
      );

    // Channel select menus
    const statusChannelSelect =
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('setup_status_channel')
          .setPlaceholder('Select Status Channel (Required)')
          .setChannelTypes(ChannelType.GuildText)
      );

    const chartChannelSelect =
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('setup_chart_channel')
          .setPlaceholder('Select Chart Channel (Optional)')
          .setChannelTypes(ChannelType.GuildText)
      );

    const playerCountChannelSelect =
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('setup_playercount_channel')
          .setPlaceholder('Select Player Count Voice Channel (Optional)')
          .setChannelTypes(ChannelType.GuildVoice)
      );

    const serverIpChannelSelect =
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('setup_serverip_channel')
          .setPlaceholder('Select Server IP Voice Channel (Optional)')
          .setChannelTypes(ChannelType.GuildVoice)
      );

    const completeButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('setup_complete')
        .setLabel('✅ Complete Setup')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('setup_cancel')
        .setLabel('❌ Cancel')
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.editReply({
      embeds: [embed],
      components: [
        statusChannelSelect,
        chartChannelSelect,
        playerCountChannelSelect,
        serverIpChannelSelect,
        completeButton,
      ],
    });
  } catch (error) {
    console.error('Setup error:', error);
    embed
      .setColor(0xff0000)
      .setDescription(
        `❌ **Setup Error**\n\n${error instanceof Error ? error.message : 'Unknown error occurred'}`
      );
    await interaction.editReply({ embeds: [embed] });
    return;
  }
}

export async function handleChannelSelect(
  interaction: ChannelSelectMenuInteraction
): Promise<void> {
  await interaction.deferUpdate();

  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const sessionKey = `${guildId}_${userId}`;

  // Retrieve setup session
  const session = setupSessions.get(sessionKey);
  if (!session) {
    return; // Session expired, user will get error on complete
  }

  // Update session with selected channel
  const selectedChannelId = interaction.values[0];
  if (!selectedChannelId) {
    return; // No channel selected
  }

  const customId = interaction.customId;

  if (customId === 'setup_status_channel') {
    session.data.statusChannelId = selectedChannelId;
  } else if (customId === 'setup_chart_channel') {
    session.data.chartChannelId = selectedChannelId;
  } else if (customId === 'setup_playercount_channel') {
    session.data.playerCountChannelId = selectedChannelId;
  } else if (customId === 'setup_serverip_channel') {
    session.data.serverIpChannelId = selectedChannelId;
  }

  // Update session
  setupSessions.set(sessionKey, session);
}

export async function handleSetupComplete(
  interaction: ButtonInteraction,
  client: CustomClient
): Promise<void> {
  await interaction.deferUpdate();

  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const sessionKey = `${guildId}_${userId}`;

  // Retrieve setup data
  const session = setupSessions.get(sessionKey);
  if (!session) {
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setDescription(
        '❌ **Setup session expired.** Reopen `/manage` and start the Setup Server wizard again.'
      );
    await interaction.editReply({ embeds: [embed], components: [] });
    return;
  }

  const { data: setupData } = session;

  // Get selected channels from session data
  const statusChannelId = setupData.statusChannelId;
  const chartChannelId = setupData.chartChannelId;
  const playerCountChannelId = setupData.playerCountChannelId;
  const serverIpChannelId = setupData.serverIpChannelId;

  // Validate required channel
  if (!statusChannelId) {
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setDescription(
        '❌ **Status Channel is required!** Please select a status channel and try again.'
      );
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Fetch channels and validate permissions
  try {
    const guild = interaction.guild!;
    const botMember = await guild.members.fetchMe();

    // Validate status channel
    const statusChannel = await guild.channels.fetch(statusChannelId);
    if (!statusChannel || !statusChannel.isTextBased()) {
      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription(
          '❌ **Status channel not found or is not a text channel.**'
        );
      await interaction.editReply({ embeds: [embed], components: [] });
      return;
    }

    const statusPerms = statusChannel.permissionsFor(botMember);
    if (!statusPerms?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription(
          `❌ **Missing permissions in ${statusChannel.toString()}**\n\nI need: View Channel, Send Messages, and Embed Links`
        );
      await interaction.editReply({ embeds: [embed], components: [] });
      return;
    }

    // Validate chart channel if provided
    if (chartChannelId) {
      const chartChannel = await guild.channels.fetch(chartChannelId);
      if (!chartChannel || !chartChannel.isTextBased()) {
        const embed = new EmbedBuilder()
          .setColor(0xff0000)
          .setDescription(
            '❌ **Chart channel not found or is not a text channel.**'
          );
        await interaction.editReply({ embeds: [embed], components: [] });
        return;
      }

      const chartPerms = chartChannel.permissionsFor(botMember);
      if (!chartPerms?.has(['ViewChannel', 'SendMessages', 'AttachFiles'])) {
        const embed = new EmbedBuilder()
          .setColor(0xff0000)
          .setDescription(
            `❌ **Missing permissions in ${chartChannel.toString()}**\n\nI need: View Channel, Send Messages, and Attach Files`
          );
        await interaction.editReply({ embeds: [embed], components: [] });
        return;
      }
    }

    // Validate player count channel if provided
    if (playerCountChannelId) {
      const playerCountChannel =
        await guild.channels.fetch(playerCountChannelId);
      if (!playerCountChannel || !playerCountChannel.isVoiceBased()) {
        const embed = new EmbedBuilder()
          .setColor(0xff0000)
          .setDescription(
            '❌ **Player count channel not found or is not a voice channel.**'
          );
        await interaction.editReply({ embeds: [embed], components: [] });
        return;
      }

      const playerPerms = playerCountChannel.permissionsFor(botMember);
      if (!playerPerms?.has(['ViewChannel', 'ManageChannels'])) {
        const embed = new EmbedBuilder()
          .setColor(0xff0000)
          .setDescription(
            `❌ **Missing permissions in ${playerCountChannel.toString()}**\n\nI need: View Channel and Manage Channels`
          );
        await interaction.editReply({ embeds: [embed], components: [] });
        return;
      }
    }

    // Validate server IP channel if provided
    if (serverIpChannelId) {
      const serverIpChannel = await guild.channels.fetch(serverIpChannelId);
      if (!serverIpChannel || !serverIpChannel.isVoiceBased()) {
        const embed = new EmbedBuilder()
          .setColor(0xff0000)
          .setDescription(
            '❌ **Server IP channel not found or is not a voice channel.**'
          );
        await interaction.editReply({ embeds: [embed], components: [] });
        return;
      }

      const ipPerms = serverIpChannel.permissionsFor(botMember);
      if (!ipPerms?.has(['ViewChannel', 'ManageChannels'])) {
        const embed = new EmbedBuilder()
          .setColor(0xff0000)
          .setDescription(
            `❌ **Missing permissions in ${serverIpChannel.toString()}**\n\nI need: View Channel and Manage Channels`
          );
        await interaction.editReply({ embeds: [embed], components: [] });
        return;
      }
    }
  } catch (error) {
    console.error('Channel validation error:', error);
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setDescription(
        `❌ **Failed to validate channels**\n\n${error instanceof Error ? error.message : 'Unknown error occurred'}`
      );
    await interaction.editReply({ embeds: [embed], components: [] });
    return;
  }

  try {
    // Save server configuration
    const serverId = `${setupData.ip}:${setupData.port}`;
    const serverConfig: ServerConfig = {
      id: serverId,
      name: setupData.name,
      ip: setupData.ip,
      port: setupData.port,
      addedAt: Date.now(),
      addedBy: setupData.userId,
    };

    const existingServers: ServerConfig[] =
      (await client.servers.get(guildId)) || [];
    const serverExists = existingServers.some(s => s.id === serverId);

    if (!serverExists) {
      existingServers.push(serverConfig);
      await client.servers.set(guildId, existingServers);
    }

    // Save monitoring configuration
    const config: IntervalConfig = (await client.intervals.get(guildId)) || {
      enabled: false,
      next: Date.now() + 120000,
      statusMessage: null,
      voiceChannelStyle: 'text',
    };
    if (!config.voiceChannelStyle) {
      config.voiceChannelStyle = 'text';
    }

    config.activeServerId = serverId;
    config.statusChannel = statusChannelId;
    if (chartChannelId) config.chartChannel = chartChannelId;
    if (playerCountChannelId) config.playerCountChannel = playerCountChannelId;
    if (serverIpChannelId) config.serverIpChannel = serverIpChannelId;
    config.enabled = true;
    config.next = Date.now() + 120000;

    await client.intervals.set(guildId, config);

    // Update in-memory cache
    let guildConfig = client.guildConfigs.get(guildId) || { servers: [] };
    guildConfig.servers = existingServers;
    guildConfig.interval = config;
    client.guildConfigs.set(guildId, guildConfig);

    // Clean up session
    setupSessions.delete(sessionKey);

    // Success message
    const successEmbed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('Setup Complete!')
      .setDescription(
        `Your server monitoring is now active!\n\n` +
          `**Server:** ${setupData.name}\n` +
          `**IP:** ${setupData.ip}:${setupData.port}\n\n` +
          `**Status Channel:** <#${statusChannelId}>\n` +
          (chartChannelId ? `**Chart Channel:** <#${chartChannelId}>\n` : '') +
          (playerCountChannelId
            ? `**Player Count Channel:** <#${playerCountChannelId}>\n`
            : '') +
          (serverIpChannelId
            ? `**Server IP Channel:** <#${serverIpChannelId}>\n`
            : '') +
          `\n✅ Monitoring updates will begin shortly!`
      )
      .setFooter({ text: 'Use /status to view your configuration' });

    await interaction.editReply({ embeds: [successEmbed], components: [] });
    return;
  } catch (error) {
    console.error('Setup completion error:', error);
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setDescription(
        `❌ **Setup Failed**\n\n${error instanceof Error ? error.message : 'Unknown error occurred'}`
      );
    await interaction.editReply({ embeds: [errorEmbed], components: [] });
    return;
  }
}

export async function handleSetupCancel(
  interaction: ButtonInteraction
): Promise<void> {
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const sessionKey = `${guildId}_${userId}`;

  setupSessions.delete(sessionKey);

  const embed = new EmbedBuilder()
    .setColor(0xff6600)
    .setDescription(
      '❌ **Setup cancelled.** Reopen `/manage` and start the Setup Server wizard when you are ready.'
    );

  await interaction.update({ embeds: [embed], components: [] });
}
