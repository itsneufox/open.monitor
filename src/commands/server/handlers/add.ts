import {
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { CustomClient, ServerConfig, getServerDataKey } from '../../../types';
import { InputValidator } from '../../../utils/inputValidator';
import { SAMPQuery } from '../../../utils/sampQuery';
import {
  createAddServerModal,
  parseAddServerForm,
} from '../forms/addServerForm';
import {
  validateServerInput,
  canQueryServer,
} from '../validators/serverValidation';
import { TimezoneHelper } from '../../../utils/timezoneHelper';

export async function handleAdd(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
) {
  const rateLimitCheck = InputValidator.checkCommandRateLimit(
    interaction.user.id,
    'server-add',
    3
  );

  if (!rateLimitCheck.allowed) {
    await interaction.reply({
      content: `Too many server additions. Please wait ${Math.ceil((rateLimitCheck.remainingTime || 0) / 1000)} seconds.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const modal = createAddServerModal();
  await interaction.showModal(modal);

  try {
    const modalSubmission = await interaction.awaitModalSubmit({
      time: 300000,
      filter: i =>
        i.customId === 'server_add_form' && i.user.id === interaction.user.id,
    });

    await handleAddFormSubmission(modalSubmission, client);
  } catch (error) {
    console.error('Server add form submission error:', error);
  }
}

async function handleAddFormSubmission(
  interaction: ModalSubmitInteraction,
  client: CustomClient
) {
  await interaction.deferReply();

  const formData = parseAddServerForm(interaction);
  if ('error' in formData) {
    await interaction.editReply(`❌ ${formData.error}`);
    return;
  }

  const { ip, port, name, timezone, dayResetHour } = formData;

  const validation = validateServerInput(
    ip,
    port,
    name,
    timezone,
    dayResetHour
  );
  if (!validation.valid) {
    await interaction.editReply(`❌ ${validation.error}`);
    return;
  }

  if (!canQueryServer(ip, interaction.guildId!)) {
    await interaction.editReply(
      '❌ Rate limit exceeded for this IP address. Please try again later.\n\n' +
        '**Rate limits:**\n' +
        '• Maximum 12 queries per hour per IP\n' +
        '• Maximum 3 different Discord servers per IP\n' +
        '• Minimum 30 seconds between queries'
    );
    return;
  }

  try {
    await interaction.editReply('🔄 Testing server connection...');

    const sampQuery = new SAMPQuery();
    const testResult = await sampQuery.getServerInfo(
      {
        ip,
        port,
        id: '',
        name: '',
        addedAt: 0,
        addedBy: '',
        timezone: 'GMT+0',
        dayResetHour: 0,
      },
      interaction.guildId!
    );

    const serverId = `${ip}:${port}`;
    const finalServerName =
      validation.sanitizedName || testResult?.hostname || `${ip}:${port}`;

    const server: ServerConfig = {
      id: serverId,
      name: finalServerName,
      ip,
      port,
      addedAt: Date.now(),
      addedBy: interaction.user.id,
      timezone,
      dayResetHour,
    };

    console.log(
      `📝 Attempting to save server for guild ${interaction.guildId}`
    );
    console.log(`📊 Server object:`, JSON.stringify(server, null, 2));

    const existingServers =
      (await client.servers.get(interaction.guildId!)) || [];
    console.log(`📦 Existing servers count: ${existingServers.length}`);

    const isFirstServer = existingServers.length === 0;

    const existingIndex = existingServers.findIndex(s => s.id === serverId);
    if (existingIndex !== -1) {
      existingServers[existingIndex] = server;
      console.log(`🔄 Updated existing server at index ${existingIndex}`);
    } else {
      existingServers.push(server);
      console.log(
        `➕ Added new server, total count: ${existingServers.length}`
      );
    }

    if (existingServers.length > 10) {
      await interaction.editReply(
        '❌ Maximum of 10 servers per Discord server allowed. Remove a server first with `/server remove`.'
      );
      return;
    }

    console.log(
      `💾 Saving ${existingServers.length} servers to database for guild ${interaction.guildId}...`
    );

    try {
      await client.servers.set(interaction.guildId!, existingServers);
      console.log(`✅ Database save completed`);
    } catch (saveError) {
      console.error('❌ Database save failed:', saveError);
      await interaction.editReply(
        '❌ Failed to save server to database. Please try again.'
      );
      return;
    }

    const verifyServers = await client.servers.get(interaction.guildId!);
    console.log(
      `🔍 Verification: Retrieved ${verifyServers?.length || 0} servers after save`
    );

    if (!verifyServers || verifyServers.length === 0) {
      console.error(
        '❌ Server save verification failed - no servers found after save'
      );
      await interaction.editReply(
        '❌ Server save verification failed. Please contact support.'
      );
      return;
    }

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
        };
      } else {
        intervalConfig.activeServerId = serverId;
        intervalConfig.statusMessage = null;
      }

      await client.intervals.set(interaction.guildId!, intervalConfig);
      console.log(`🎯 Set ${serverId} as active server`);

      if (intervalConfig.serverIpChannel) {
        try {
          const serverIpChannel = await client.channels
            .fetch(intervalConfig.serverIpChannel)
            .catch(() => null);
          if (serverIpChannel && 'setName' in serverIpChannel) {
            const channelNameValidation = InputValidator.validateChannelName(
              `IP: ${ip}:${port}`
            );
            if (channelNameValidation.valid) {
              await (serverIpChannel as any).setName(
                channelNameValidation.sanitized
              );
            }
          }
        } catch (error) {
          console.error('Failed to update IP channel name:', error);
        }
      }
    }

    let guildConfig = client.guildConfigs.get(interaction.guildId!) || {
      servers: [],
    };
    guildConfig.servers = existingServers;
    if (intervalConfig) {
      guildConfig.interval = intervalConfig;
    }
    client.guildConfigs.set(interaction.guildId!, guildConfig);
    console.log(`📋 Updated guild config cache`);

    const serverDataKey = getServerDataKey(interaction.guildId!, serverId);
    const existingData = await client.maxPlayers.get(serverDataKey);
    if (!existingData) {
      const currentDayStart = TimezoneHelper.getCurrentDayPeriodStart(
        timezone,
        dayResetHour
      );

      await client.maxPlayers.set(serverDataKey, {
        maxPlayersToday: testResult?.players || 0,
        days: [],
        name: testResult?.hostname || finalServerName,
        maxPlayers: testResult?.maxplayers || 0,
      });
      console.log(`📊 Initialized chart data for server`);
    }

    const embed = new EmbedBuilder()
      .setColor(testResult ? 0x00ff00 : 0xff6b6b)
      .setTitle(existingIndex !== -1 ? '🔄 Server Updated' : '✅ Server Added')
      .setDescription(`**${finalServerName}**\n${ip}:${port}`)
      .setTimestamp();

    if (testResult) {
      embed.addFields(
        { name: 'Status', value: '🟢 Online', inline: true },
        {
          name: 'Players',
          value: `${testResult.players}/${testResult.maxplayers}`,
          inline: true,
        },
        {
          name: 'Gamemode',
          value: testResult.gamemode || 'Unknown',
          inline: true,
        }
      );

      try {
        const isOpenMP = await sampQuery.isOpenMP(
          {
            ip,
            port,
            id: serverId,
            name: finalServerName,
            addedAt: Date.now(),
            addedBy: interaction.user.id,
            timezone,
            dayResetHour,
          },
          interaction.guildId!
        );

        embed.addFields({
          name: 'Server Type',
          value: isOpenMP ? 'open.mp' : 'SA:MP',
          inline: true,
        });
      } catch (error) {
        console.log('Could not detect server type');
      }
    } else {
      embed.addFields({
        name: 'Status',
        value: '🔴 Offline or unreachable',
        inline: true,
      });
    }

    embed.addFields(
      { name: 'Timezone', value: timezone, inline: true },
      {
        name: 'Day Reset',
        value: TimezoneHelper.formatDayResetTime(dayResetHour),
        inline: true,
      }
    );

    if (setAsActive) {
      embed.addFields(
        {
          name: 'Active Server',
          value: '🎯 This server is now being monitored',
          inline: false,
        },
        {
          name: 'Next Steps',
          value: 'Use `/monitor setup` to configure monitoring channels',
          inline: false,
        }
      );
    } else {
      embed.addFields({
        name: 'Next Steps',
        value: 'Use `/server activate` to switch monitoring to this server',
        inline: false,
      });
    }

    if (existingIndex === -1) {
      embed.addFields({
        name: 'Daily Tracking',
        value: TimezoneHelper.getDayPeriodDescription(timezone, dayResetHour),
        inline: false,
      });

      embed.addFields({
        name: 'Security Info',
        value:
          '• Server validated and added to monitoring\n' +
          '• Rate limits: 12 queries/hour, 3 Discord servers max\n' +
          '• All queries are validated for security',
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });

    console.log(
      `✅ Server added: ${finalServerName} (${ip}:${port}) by ${interaction.user.tag} in guild ${interaction.guild?.name}`
    );
  } catch (error) {
    console.error('❌ Error adding server:', error);

    let errorMessage = 'An error occurred while adding the server.';

    if (error instanceof Error) {
      if (
        error.message.includes('timeout') ||
        error.message.includes('ETIMEDOUT')
      ) {
        errorMessage =
          'Connection timeout. The server may be offline or the address/port is incorrect.';
      } else if (
        error.message.includes('ENOTFOUND') ||
        error.message.includes('getaddrinfo')
      ) {
        errorMessage =
          'Unable to resolve the server address. Please check the IP/domain name.';
      } else if (error.message.includes('ECONNREFUSED')) {
        errorMessage =
          'Connection refused. The server may be offline or not accepting connections on this port.';
      }
    }

    errorMessage += '\n\n**Troubleshooting:**\n';
    errorMessage += '• Verify the server IP address and port\n';
    errorMessage +=
      '• Ensure the server is online and accepting SA:MP queries\n';
    errorMessage += '• Check if the server has query enabled\n';
    errorMessage += '• Try again in a few moments';

    await interaction.editReply(`❌ ${errorMessage}`);
  }
}
