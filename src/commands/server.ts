import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { CustomClient, ServerConfig } from '../types';
import { SAMPQuery } from '../utils/sampQuery';
import { checkPermissionOrReply } from '../utils/permissions';
import { SecurityValidator } from '../utils/securityValidator';
import { InputValidator } from '../utils/inputValidator';
import { DatabaseCleaner } from '../utils/databaseCleaner';
import { getServerDataKey } from '../types';

export const data = new SlashCommandBuilder()
  .setName('server')
  .setDescription('Manage SA:MP/open.mp servers')
  .addSubcommand(subcommand =>
    subcommand
      .setName('add')
      .setDescription(
        'Add a server (automatically becomes active if first server)'
      )
      .addStringOption(option =>
        option
          .setName('ip')
          .setDescription('Server IP address or domain name')
          .setRequired(true)
      )
      .addIntegerOption(option =>
        option
          .setName('port')
          .setDescription('Server port (default: 7777)')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(65535)
      )
      .addStringOption(option =>
        option
          .setName('name')
          .setDescription('Friendly name for this server')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand.setName('list').setDescription('Show all configured servers')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('activate')
      .setDescription('Set which server to actively monitor')
      .addStringOption(option =>
        option
          .setName('server')
          .setDescription('Server to activate')
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('remove')
      .setDescription('Remove a server and all its data')
      .addStringOption(option =>
        option
          .setName('server')
          .setDescription('Server to remove')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addBooleanOption(option =>
        option
          .setName('confirm')
          .setDescription('Confirm deletion')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('status')
      .setDescription('Show current server status')
      .addStringOption(option =>
        option
          .setName('server')
          .setDescription(
            'Which server to check (leave empty for active server)'
          )
          .setRequired(false)
          .setAutocomplete(true)
      )
      .addBooleanOption(option =>
        option
          .setName('fresh')
          .setDescription('Get fresh data (bypasses cache, rate limited)')
          .setRequired(false)
      )
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand !== 'status' && subcommand !== 'list') {
    if (!(await checkPermissionOrReply(interaction, client))) {
      return;
    }
  }

  switch (subcommand) {
    case 'add':
      await handleAdd(interaction, client);
      break;
    case 'list':
      await handleList(interaction, client);
      break;
    case 'activate':
      await handleActivate(interaction, client);
      break;
    case 'remove':
      await handleRemove(interaction, client);
      break;
    case 'status':
      await handleStatus(interaction, client);
      break;
  }
}

async function handleAdd(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
) {
  await interaction.deferReply();

  // Rate limiting check
  const rateLimitCheck = InputValidator.checkCommandRateLimit(
    interaction.user.id,
    'server-add',
    3 // Max 3 server additions per minute
  );

  if (!rateLimitCheck.allowed) {
    await interaction.editReply(
      `❌ Too many server additions. Please wait ${Math.ceil((rateLimitCheck.remainingTime || 0) / 1000)} seconds.`
    );
    return;
  }

  const ip = interaction.options.getString('ip', true);
  const port = interaction.options.getInteger('port') || 7777;
  const name = interaction.options.getString('name');

  // Validate port
  const portValidation = InputValidator.validatePort(port);
  if (!portValidation.valid) {
    await interaction.editReply(`❌ ${portValidation.error}`);
    return;
  }

  // Validate server name if provided
  let serverName = name;
  if (name) {
    const nameValidation = InputValidator.validateServerName(name);
    if (!nameValidation.valid) {
      await interaction.editReply(
        `❌ Server name invalid: ${nameValidation.error}`
      );
      return;
    }
    serverName = nameValidation.sanitized!;
  }

  // Validate command option length
  const ipValidation = InputValidator.validateCommandOption(ip, 253); // Max domain length
  if (!ipValidation.valid) {
    await interaction.editReply(`❌ IP address invalid: ${ipValidation.error}`);
    return;
  }

  // Security validation
  if (!SecurityValidator.validateServerIP(ip)) {
    await interaction.editReply(
      '❌ Invalid or blocked IP address. Please use a valid public IPv4 address.\n\n' +
      '**Blocked ranges:**\n' +
      '• Private networks (10.x.x.x, 192.168.x.x, 172.16-31.x.x)\n' +
      '• Loopback (127.x.x.x) - only allowed in development\n' +
      '• Invalid ranges (0.x.x.x, 169.254.x.x, 224.x.x.x, 255.x.x.x)'
    );
    return;
  }

  // Validate IP address OR domain name
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const domainRegex =
    /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;

  const isValidIP = ipRegex.test(ip);
  const isValidDomain =
    domainRegex.test(ip) &&
    ip.includes('.') &&
    !ip.startsWith('.') &&
    !ip.endsWith('.');

  if (!isValidIP && !isValidDomain) {
    await interaction.editReply(
      '❌ Invalid address format. Please provide a valid IPv4 address (e.g., 192.168.1.100) or domain name (e.g., server.example.com).'
    );
    return;
  }

  // Validate IP octets only if it's an IP address
  if (isValidIP) {
    const octets = ip.split('.').map(Number);
    if (octets.some(octet => octet < 0 || octet > 255)) {
      await interaction.editReply(
        '❌ Invalid IP address. Each octet must be between 0 and 255.'
      );
      return;
    }
  }

  if (ip.startsWith('127.') || ip === '::1') {
    await interaction.editReply(
      '❌ Localhost addresses (127.x.x.x and ::1) are not allowed.'
    );
    return;
  }

  // Check rate limiting for this IP
  if (!SecurityValidator.canQueryIP(ip, interaction.guildId!)) {
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
    await interaction.editReply('🔍 Testing server connection...');

    // Test server connection
    const sampQuery = new SAMPQuery();
    const testResult = await sampQuery.getServerInfo({
      ip,
      port,
      id: '',
      name: '',
      addedAt: 0,
      addedBy: '',
    });

    // Create server configuration
    const serverId = `${ip}:${port}`;
    const finalServerName =
      serverName || testResult?.hostname || `${ip}:${port}`;

    // Validate the final server name (from server response)
    if (testResult?.hostname) {
      const hostnameValidation = InputValidator.validateServerName(
        testResult.hostname
      );
      if (hostnameValidation.valid) {
        // Use sanitized hostname if no custom name was provided
        if (!serverName) {
          serverName = hostnameValidation.sanitized!;
        }
      }
    }

    const server: ServerConfig = {
      id: serverId,
      name: finalServerName,
      ip,
      port,
      addedAt: Date.now(),
      addedBy: interaction.user.id,
    };

    // Get existing servers for this guild
    const existingServers =
      (await client.servers.get(interaction.guildId!)) || [];
    const isFirstServer = existingServers.length === 0;

    // Check if server already exists and update it, or add new one
    const existingIndex = existingServers.findIndex(s => s.id === serverId);
    if (existingIndex !== -1) {
      existingServers[existingIndex] = server;
    } else {
      existingServers.push(server);
    }

    // Validate we don't exceed server limit per guild
    if (existingServers.length > 10) {
      await interaction.editReply(
        '❌ Maximum of 10 servers per Discord server allowed. Remove a server first with `/server remove`.'
      );
      return;
    }

    // Save updated server list
    await client.servers.set(interaction.guildId!, existingServers);

    // If this is the first server OR no active server is set, make it active
    let intervalConfig = await client.intervals.get(interaction.guildId!);
    let setAsActive = isFirstServer;

    if (!isFirstServer && intervalConfig && !intervalConfig.activeServerId) {
      setAsActive = true; // No active server set, make this one active
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
        intervalConfig.statusMessage = null; // Reset status message for new server
      }

      await client.intervals.set(interaction.guildId!, intervalConfig);

      // Set IP channel name if configured
      if (intervalConfig.serverIpChannel) {
        try {
          const serverIpChannel = await client.channels
            .fetch(intervalConfig.serverIpChannel)
            .catch(() => null);
          if (serverIpChannel && 'setName' in serverIpChannel) {
            const channelNameValidation = InputValidator.validateChannelName(
              `Server ${ip}:${port}`
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
        name: testResult?.hostname || finalServerName,
        maxPlayers: testResult?.maxplayers || 0,
      });
    }

    // Prepare response message
    const embed = new EmbedBuilder()
      .setColor(testResult ? 0x00ff00 : 0xff6b6b)
      .setTitle(existingIndex !== -1 ? '✅ Server Updated' : '✅ Server Added')
      .setDescription(`**${finalServerName}**\n${ip}:${port}`)
      .setTimestamp();

    if (testResult) {
      embed.addFields(
        { name: 'Status', value: '✅ Online', inline: true },
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

      // Check if it's open.mp for additional info
      try {
        const isOpenMP = await sampQuery.isOpenMP({
          ip,
          port,
          id: serverId,
          name: finalServerName,
          addedAt: Date.now(),
          addedBy: interaction.user.id,
        });

        embed.addFields({
          name: 'Server Type',
          value: isOpenMP ? 'open.mp' : 'SA:MP',
          inline: true,
        });
      } catch (error) {
        // Ignore error, just won't show server type
        console.log('Could not detect server type:', error);
      }
    } else {
      embed.addFields({
        name: 'Status',
        value: '❌ Offline or unreachable',
        inline: true,
      });
    }

    if (setAsActive) {
      embed.addFields(
        {
          name: 'Active Server',
          value: 'This server is now being monitored',
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

    // Add security info if this is a new server
    if (existingIndex === -1) {
      embed.addFields({
        name: 'Security Info',
        value:
          `• Server validated and added to monitoring\n` +
          `• Rate limits: 12 queries/hour, 3 Discord servers max\n` +
          `• All queries are validated for security`,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });

    // Log successful addition
    console.log(
      `✅ Server added: ${finalServerName} (${ip}:${port}) by ${interaction.user.tag} in guild ${interaction.guild?.name}`
    );
  } catch (error) {
    console.error('Error adding server:', error);

    // Provide more specific error messages
    let errorMessage = '❌ An error occurred while adding the server.';

    if (error instanceof Error) {
      if (
        error.message.includes('timeout') ||
        error.message.includes('ETIMEDOUT')
      ) {
        errorMessage =
          '❌ Connection timeout. The server may be offline or the address/port is incorrect.';
      } else if (
        error.message.includes('ENOTFOUND') ||
        error.message.includes('getaddrinfo')
      ) {
        errorMessage =
          '❌ Unable to resolve the server address. Please check the IP/domain name.';
      } else if (error.message.includes('ECONNREFUSED')) {
        errorMessage =
          '❌ Connection refused. The server may be offline or not accepting connections on this port.';
      }
    }

    errorMessage += '\n\n**Troubleshooting:**\n';
    errorMessage += '• Verify the server IP address and port\n';
    errorMessage +=
      '• Ensure the server is online and accepting SA:MP queries\n';
    errorMessage += '• Check if the server has query enabled\n';
    errorMessage += '• Try again in a few moments';

    await interaction.editReply(errorMessage);
  }
}

async function handleList(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
) {
  await interaction.deferReply();

  const servers = (await client.servers.get(interaction.guildId!)) || [];
  const intervalConfig = await client.intervals.get(interaction.guildId!);

  if (servers.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xff6b6b)
      .setTitle('No Servers Configured')
      .setDescription('No servers have been added to this guild yet.')
      .addFields(
        {
          name: 'Getting Started',
          value: 'Use `/server add` to add your first server!',
        },
        {
          name: 'Example',
          value: '`/server add ip:127.0.0.1 port:7777 name:My Server`',
        }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('Configured Servers')
    .setDescription(
      `Found ${servers.length} server${servers.length === 1 ? '' : 's'}`
    )
    .setTimestamp();

  for (const server of servers) {
    const isActive = intervalConfig?.activeServerId === server.id;
    const addedDate = new Date(server.addedAt).toLocaleDateString();

    embed.addFields({
      name: `${isActive ? '🟢' : '⚪'} ${server.name}`,
      value: `**Address:** ${server.ip}:${server.port}\n**Added:** ${addedDate}\n**Status:** ${isActive ? 'Active (Monitoring)' : 'Inactive'}`,
      inline: true,
    });
  }

  if (intervalConfig?.activeServerId) {
    const activeServer = servers.find(
      s => s.id === intervalConfig.activeServerId
    );
    embed.setFooter({
      text: `Currently monitoring: ${activeServer?.name || 'Unknown'}`,
    });
  } else {
    embed.setFooter({
      text: 'No active server set - use /server activate to choose one',
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleActivate(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
) {
  await interaction.deferReply();

  const serverToActivate = interaction.options.getString('server', true);
  const servers = (await client.servers.get(interaction.guildId!)) || [];

  if (servers.length === 0) {
    await interaction.editReply(
      '❌ No servers configured. Use `/server add` to add a server first.'
    );
    return;
  }

  const server = servers.find(
    s => s.id === serverToActivate || s.name === serverToActivate
  );
  if (!server) {
    await interaction.editReply(
      '❌ Server not found. Use `/server list` to see available servers.'
    );
    return;
  }

  let intervalConfig = await client.intervals.get(interaction.guildId!);
  if (!intervalConfig) {
    intervalConfig = {
      activeServerId: server.id,
      enabled: false,
      next: Date.now(),
      statusMessage: null,
    };
  } else {
    intervalConfig.activeServerId = server.id;
    intervalConfig.statusMessage = null; // Reset status message
  }

  await client.intervals.set(interaction.guildId!, intervalConfig);

  // Update IP channel name if configured
  if (intervalConfig.serverIpChannel) {
    try {
      const serverIpChannel = await client.channels
        .fetch(intervalConfig.serverIpChannel)
        .catch(() => null);
      if (serverIpChannel && 'setName' in serverIpChannel) {
        await (serverIpChannel as any).setName(
          `Server ${server.ip}:${server.port}`
        );
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

  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle('✅ Server Activated')
    .setDescription(`**${server.name}** is now the active server`)
    .addFields(
      {
        name: 'Server Address',
        value: `${server.ip}:${server.port}`,
        inline: true,
      },
      {
        name: 'Monitoring',
        value: intervalConfig.enabled ? 'Enabled' : 'Disabled',
        inline: true,
      },
      {
        name: 'Next Steps',
        value: intervalConfig.enabled
          ? 'Server monitoring is active!'
          : 'Use `/monitor setup` to configure monitoring',
        inline: false,
      }
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleRemove(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
) {
  await interaction.deferReply();

  const serverToDelete = interaction.options.getString('server', true);
  const confirm = interaction.options.getBoolean('confirm', true);

  if (!confirm) {
    await interaction.editReply(
      '❌ Server deletion cancelled. Set confirm to `true` to proceed.'
    );
    return;
  }

  const servers = (await client.servers.get(interaction.guildId!)) || [];
  if (servers.length === 0) {
    await interaction.editReply(
      '❌ No servers are currently configured for this guild.'
    );
    return;
  }

  // Find server to delete
  const serverIndex = servers.findIndex(
    s => s.id === serverToDelete || s.name === serverToDelete
  );
  if (serverIndex === -1) {
    await interaction.editReply(
      '❌ Server not found. Use `/server list` to see available servers.'
    );
    return;
  }

  const server = servers[serverIndex];

  if (!server) {
    await interaction.editReply('❌ Unable to locate server for deletion.');
    return;
  }

  try {
    const serverDataKey = getServerDataKey(interaction.guildId!, server.id);
    // Get current data for summary before deletion
    const chartData = await client.maxPlayers.get(serverDataKey);
    const uptimeData = await client.uptimes.get(serverDataKey);
    const intervalConfig = await client.intervals.get(interaction.guildId!);

    // Check if this is the active server
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
        // Set first remaining server as active
        const newActiveServer = servers[0];
        if (newActiveServer) {
          intervalConfig.activeServerId = newActiveServer.id;
          intervalConfig.statusMessage = null; // Reset status message
          await client.intervals.set(interaction.guildId!, intervalConfig);

          // Update IP channel if configured
          if (intervalConfig.serverIpChannel) {
            try {
              const serverIpChannel = await client.channels
                .fetch(intervalConfig.serverIpChannel)
                .catch(() => null);
              if (serverIpChannel && 'setName' in serverIpChannel) {
                await (serverIpChannel as any).setName(
                  `Server ${newActiveServer.ip}:${newActiveServer.port}`
                );
              }
            } catch (error) {
              console.error('Failed to update IP channel name:', error);
            }
          }
        }
      } else {
        // No servers left, disable monitoring and clean up guild data
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

    // Create summary embed
    const embed = new EmbedBuilder()
      .setColor(0xff6b6b)
      .setTitle('✅ Server Removed Successfully')
      .setDescription(
        `Removed **${server.name}** and cleaned up all associated data`
      )
      .addFields(
        {
          name: 'Server Address',
          value: `${server.ip}:${server.port}`,
          inline: true,
        },
        {
          name: 'Added Date',
          value: new Date(server.addedAt).toLocaleDateString(),
          inline: true,
        },
        { name: 'Added By', value: `<@${server.addedBy}>`, inline: true }
      )
      .setTimestamp();

    // Add data summary if available
    if (chartData) {
      embed.addFields(
        {
          name: 'Data Cleaned',
          value: `${chartData.days?.length || 0} days of chart data removed`,
          inline: true,
        },
        {
          name: 'Peak Today',
          value: `${chartData.maxPlayersToday} players (deleted)`,
          inline: true,
        }
      );
    }

    if (uptimeData) {
      const totalChecks = uptimeData.uptime + uptimeData.downtime;
      const uptimePercentage =
        totalChecks > 0
          ? ((uptimeData.uptime / totalChecks) * 100).toFixed(1)
          : '0';
      embed.addFields({
        name: 'Uptime Data Cleaned',
        value: `${uptimePercentage}% uptime data (${uptimeData.uptime}/${totalChecks} checks) removed`,
        inline: true,
      });
    }

    // Add status about remaining servers
    if (servers.length === 0) {
      embed.addFields(
        {
          name: 'Monitoring Status',
          value: '❌ Disabled (no servers remaining)',
          inline: false,
        },
        {
          name: 'Next Steps',
          value: 'Use `/server add` to add a new server',
          inline: false,
        }
      );
    } else if (isActiveServer) {
      const newActiveServer = servers[0];
      if (newActiveServer) {
        embed.addFields(
          {
            name: 'Monitoring Status',
            value: `✅ Switched to **${newActiveServer.name}**`,
            inline: false,
          },
          {
            name: 'Active Server',
            value: `Now monitoring: ${newActiveServer.name} (${newActiveServer.ip}:${newActiveServer.port})`,
            inline: false,
          }
        );
      }
    } else {
      embed.addFields(
        {
          name: 'Monitoring Status',
          value: '✅ Continues with existing active server',
          inline: false,
        },
        {
          name: 'Remaining Servers',
          value: `${servers.length} server${servers.length === 1 ? '' : 's'} still configured`,
          inline: false,
        }
      );
    }

    // Add cleanup confirmation
    embed.addFields({
      name: '🧹 Database Cleanup',
      value:
        '• Chart data removed from database\n' +
        '• Uptime statistics removed\n' +
        '• All associated data cleaned up\n' +
        '• No orphaned data left behind',
      inline: false,
    });

    await interaction.editReply({ embeds: [embed] });

    console.log(
      `🗑️  Deleted server ${server.name} (${server.id}) and cleaned up data for guild ${interaction.guild?.name}`
    );
  } catch (error) {
    console.error('Error deleting server config:', error);
    await interaction.editReply(
      '❌ An error occurred while deleting the server configuration. Please try again.'
    );
  }
}

async function handleStatus(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
) {
  await interaction.deferReply();

  const fresh = interaction.options.getBoolean('fresh') || false;

  // Rate limit fresh requests per user
  if (fresh) {
    const rateLimitCheck = InputValidator.checkCommandRateLimit(
      interaction.user.id,
      'server-status-fresh',
      2 // Max 2 fresh requests per minute
    );

    if (!rateLimitCheck.allowed) {
      await interaction.editReply(
        `❌ Fresh status requests are limited to prevent rate limits. Please wait ${Math.ceil((rateLimitCheck.remainingTime || 0) / 1000)} seconds.\n\n` +
        `💡 **Tip:** Regular status checks (without \`fresh: true\`) are unlimited and show recent data.`
      );
      return;
    }
  }

  // Get all servers for this guild
  const servers = (await client.servers.get(interaction.guildId!)) || [];
  if (servers.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xff6b6b)
      .setTitle('❌ No Servers Configured')
      .setDescription('No servers have been configured for this guild.')
      .addFields(
        {
          name: 'Getting Started',
          value:
            'Use `/server add` to configure a SA:MP/open.mp server to monitor.',
        },
        {
          name: 'Example',
          value: '`/server add ip:127.0.0.1 port:7777 name:"My Server"`',
        }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Determine which server to check
  const requestedServer = interaction.options.getString('server');
  let targetServer;

  if (requestedServer) {
    // Find specific server by ID or name
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
    // Use active server
    const intervalConfig = await client.intervals.get(interaction.guildId!);
    if (!intervalConfig?.activeServerId) {
      if (servers.length === 1) {
        // If only one server, use it
        targetServer = servers[0];
      } else {
        await interaction.editReply(
          '❌ No active server set and multiple servers available. Use `/server activate` to set an active server, or specify which server to check.'
        );
        return;
      }
    } else {
      targetServer = servers.find(s => s.id === intervalConfig.activeServerId);
      if (!targetServer) {
        await interaction.editReply(
          '❌ Active server not found. Use `/server activate` to set a valid server.'
        );
        return;
      }
    }
  }

  if (!targetServer) {
    await interaction.editReply('❌ Unable to determine target server.');
    return;
  }

  try {
    // Import the getStatus and getRoleColor functions
    const { getStatus, getRoleColor } = await import('../utils');

    // Get role color for embed
    const color = getRoleColor(interaction.guild!);

    // Get and send status
    const embed = await getStatus(targetServer, color);

    // Add server name to embed title if it's different from detected name
    if (targetServer.name !== `${targetServer.ip}:${targetServer.port}`) {
      const currentTitle = embed.data.title || 'Server Status';
      embed.setTitle(`${currentTitle} - ${targetServer.name}`);
    }

    // Add refresh info if fresh data was requested
    if (fresh) {
      embed.setFooter({
        text: `Fresh data requested • ${embed.data.footer?.text || 'Last updated'}`,
      });
    } else {
      embed.setFooter({
        text: `Cached data (use fresh:true for live data) • ${embed.data.footer?.text || 'Last updated'}`,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error getting server status:', error);

    // Create fallback embed
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('❌ Error')
      .setDescription(
        `Failed to retrieve status for **${targetServer.name}** (${targetServer.ip}:${targetServer.port})\nThe server might be offline or unreachable.`
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}
