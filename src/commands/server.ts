import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { CustomClient, ServerConfig } from '../types';
import { SAMPQuery } from '../utils/sampQuery';
import { checkPermissionOrReply } from '../utils/permissions';

export const data = new SlashCommandBuilder()
  .setName('server')
  .setDescription('Manage SA:MP/open.mp servers')
  .addSubcommand(subcommand =>
    subcommand
      .setName('add')
      .setDescription('Add a server (automatically becomes active if first server)')
      .addStringOption(option =>
        option.setName('ip')
          .setDescription('Server IP address')
          .setRequired(true))
      .addIntegerOption(option =>
        option.setName('port')
          .setDescription('Server port (default: 7777)')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(65535))
      .addStringOption(option =>
        option.setName('name')
          .setDescription('Friendly name for this server')
          .setRequired(false)))
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('Show all configured servers'))
  .addSubcommand(subcommand =>
    subcommand
      .setName('activate')
      .setDescription('Set which server to actively monitor')
      .addStringOption(option =>
        option.setName('server')
          .setDescription('Server to activate')
          .setRequired(true)
          .setAutocomplete(true)))
  .addSubcommand(subcommand =>
    subcommand
      .setName('remove')
      .setDescription('Remove a server and all its data')
      .addStringOption(option =>
        option.setName('server')
          .setDescription('Server to remove')
          .setRequired(true)
          .setAutocomplete(true))
      .addBooleanOption(option =>
        option.setName('confirm')
          .setDescription('Confirm deletion')
          .setRequired(true)))
  .addSubcommand(subcommand =>
    subcommand
      .setName('status')
      .setDescription('Show current server status')
      .addStringOption(option =>
        option.setName('server')
          .setDescription('Which server to check (leave empty for active server)')
          .setRequired(false)
          .setAutocomplete(true)))

export async function execute(interaction: ChatInputCommandInteraction, client: CustomClient): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand !== 'status' && subcommand !== 'list') {
    if (!await checkPermissionOrReply(interaction, client)) {
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

async function handleAdd(interaction: ChatInputCommandInteraction, client: CustomClient) {
  await interaction.deferReply();
  
  const ip = interaction.options.getString('ip', true);
  const port = interaction.options.getInteger('port') || 7777;
  const name = interaction.options.getString('name');
  
  // Validate IP address format
  const ipRegex = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/;
  if (!ipRegex.test(ip)) {
    await interaction.editReply('❌ Invalid IP address format. Please provide a valid IPv4 address.');
    return;
  }
  
  // Validate IP octets
  const octets = ip.split('.').map(Number);
  if (octets.some(octet => octet < 0 || octet > 255)) {
    await interaction.editReply('❌ Invalid IP address. Each octet must be between 0 and 255.');
    return;
  }
  
  try {
    await interaction.editReply('🔍 Testing server connection...');
    
    // Test server connection
    const sampQuery = new SAMPQuery();
    const testResult = await sampQuery.getServerInfo({
      ip, port,
      id: '',
      name: '',
      addedAt: 0,
      addedBy: ''
    });
    
    // Create server configuration
    const serverId = `${ip}:${port}`;
    const serverName = name || testResult?.hostname || `${ip}:${port}`;
    
    const server: ServerConfig = {
      id: serverId,
      name: serverName,
      ip,
      port,
      addedAt: Date.now(),
      addedBy: interaction.user.id
    };
    
    // Get existing servers for this guild
    const existingServers = await client.servers.get(interaction.guildId!) || [];
    const isFirstServer = existingServers.length === 0;
    
    // Check if server already exists and update it, or add new one
    const existingIndex = existingServers.findIndex(s => s.id === serverId);
    if (existingIndex !== -1) {
      existingServers[existingIndex] = server;
    } else {
      existingServers.push(server);
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
          statusMessage: null
        };
      } else {
        intervalConfig.activeServerId = serverId;
        intervalConfig.statusMessage = null; // Reset status message for new server
      }
      
      await client.intervals.set(interaction.guildId!, intervalConfig);
    }
    
    // Update guild config cache
    let guildConfig = client.guildConfigs.get(interaction.guildId!) || { servers: [] };
    guildConfig.servers = existingServers;
    guildConfig.interval = intervalConfig;
    client.guildConfigs.set(interaction.guildId!, guildConfig);
    
    // Initialize server data in database
    const existingData = await client.maxPlayers.get(serverId);
    if (!existingData) {
      await client.maxPlayers.set(serverId, {
        maxPlayersToday: testResult?.players || 0,
        days: [],
        name: testResult?.hostname || serverName,
        maxPlayers: testResult?.maxplayers || 0
      });
    }
    
    // Prepare response message
    const embed = new EmbedBuilder()
      .setColor(testResult ? 0x00ff00 : 0xff6b6b)
      .setTitle(existingIndex !== -1 ? '✅ Server Updated' : '✅ Server Added')
      .setDescription(`**${serverName}**\n🌐 ${ip}:${port}`)
      .setTimestamp();
    
    if (testResult) {
      embed.addFields(
        { name: '📊 Status', value: '✅ Online', inline: true },
        { name: '👥 Players', value: `${testResult.players}/${testResult.maxplayers}`, inline: true },
        { name: '🎮 Gamemode', value: testResult.gamemode || 'Unknown', inline: true }
      );
    } else {
      embed.addFields(
        { name: '📊 Status', value: '⚠️ Offline or unreachable', inline: true }
      );
    }
    
    if (setAsActive) {
      embed.addFields(
        { name: '🎯 Active Server', value: 'This server is now being monitored', inline: false },
        { name: '💡 Next Steps', value: 'Use `/monitor setup` to configure monitoring channels', inline: false }
      );
    } else {
      embed.addFields(
        { name: '💡 Next Steps', value: 'Use `/server activate` to switch monitoring to this server', inline: false }
      );
    }
    
    await interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    console.error('Error adding server:', error);
    await interaction.editReply('❌ An error occurred while adding the server. Please check the IP and port and try again.');
  }
}

async function handleList(interaction: ChatInputCommandInteraction, client: CustomClient) {
  await interaction.deferReply();
  
  const servers = await client.servers.get(interaction.guildId!) || [];
  const intervalConfig = await client.intervals.get(interaction.guildId!);
  
  if (servers.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xff6b6b)
      .setTitle('📭 No Servers Configured')
      .setDescription('No servers have been added to this guild yet.')
      .addFields(
        { name: '💡 Getting Started', value: 'Use `/server add` to add your first server!' },
        { name: '📖 Example', value: '`/server add ip:127.0.0.1 port:7777 name:My Server`' }
      )
      .setTimestamp();
      
    await interaction.editReply({ embeds: [embed] });
    return;
  }
  
  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('🌐 Configured Servers')
    .setDescription(`Found ${servers.length} server${servers.length === 1 ? '' : 's'}`)
    .setTimestamp();
  
  for (const server of servers) {
    const isActive = intervalConfig?.activeServerId === server.id;
    const addedDate = new Date(server.addedAt).toLocaleDateString();
    
    embed.addFields({
      name: `${isActive ? '🟢' : '⚪'} ${server.name}`,
      value: `**Address:** ${server.ip}:${server.port}\n**Added:** ${addedDate}\n**Status:** ${isActive ? 'Active (Monitoring)' : 'Inactive'}`,
      inline: true
    });
  }
  
  if (intervalConfig?.activeServerId) {
    const activeServer = servers.find(s => s.id === intervalConfig.activeServerId);
    embed.setFooter({ text: `Currently monitoring: ${activeServer?.name || 'Unknown'}` });
  } else {
    embed.setFooter({ text: 'No active server set - use /server activate to choose one' });
  }
  
  await interaction.editReply({ embeds: [embed] });
}

async function handleActivate(interaction: ChatInputCommandInteraction, client: CustomClient) {
  await interaction.deferReply();
  
  const serverToActivate = interaction.options.getString('server', true);
  const servers = await client.servers.get(interaction.guildId!) || [];
  
  if (servers.length === 0) {
    await interaction.editReply('❌ No servers configured. Use `/server add` to add a server first.');
    return;
  }
  
  const server = servers.find(s => s.id === serverToActivate || s.name === serverToActivate);
  if (!server) {
    await interaction.editReply('❌ Server not found. Use `/server list` to see available servers.');
    return;
  }
  
  let intervalConfig = await client.intervals.get(interaction.guildId!);
  if (!intervalConfig) {
    intervalConfig = {
      activeServerId: server.id,
      enabled: false,
      next: Date.now(),
      statusMessage: null
    };
  } else {
    intervalConfig.activeServerId = server.id;
    intervalConfig.statusMessage = null; // Reset status message
  }
  
  await client.intervals.set(interaction.guildId!, intervalConfig);
  
  // Update cache
  let guildConfig = client.guildConfigs.get(interaction.guildId!) || { servers: [] };
  guildConfig.servers = servers;
  guildConfig.interval = intervalConfig;
  client.guildConfigs.set(interaction.guildId!, guildConfig);
  
  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle('🎯 Server Activated')
    .setDescription(`**${server.name}** is now the active server`)
    .addFields(
      { name: '🌐 Server Address', value: `${server.ip}:${server.port}`, inline: true },
      { name: '📊 Monitoring', value: intervalConfig.enabled ? 'Enabled' : 'Disabled', inline: true },
      { name: '💡 Next Steps', value: intervalConfig.enabled ? 'Server monitoring is active!' : 'Use `/monitor setup` to configure monitoring', inline: false }
    )
    .setTimestamp();
    
  await interaction.editReply({ embeds: [embed] });
}

async function handleRemove(interaction: ChatInputCommandInteraction, client: CustomClient) {
  await interaction.deferReply();
  
  const serverToDelete = interaction.options.getString('server', true);
  const confirm = interaction.options.getBoolean('confirm', true);
  
  if (!confirm) {
    await interaction.editReply('❌ Server deletion cancelled. Set confirm to `true` to proceed.');
    return;
  }
  
  const servers = await client.servers.get(interaction.guildId!) || [];
  if (servers.length === 0) {
    await interaction.editReply('❌ No servers are currently configured for this guild.');
    return;
  }
  
  // Find server to delete
  const serverIndex = servers.findIndex(s => s.id === serverToDelete || s.name === serverToDelete);
  if (serverIndex === -1) {
    await interaction.editReply('❌ Server not found. Use `/server list` to see available servers.');
    return;
  }
  
  const server = servers[serverIndex];
  
  try {
    // Get current data for summary
    const chartData = await client.maxPlayers.get(server.id);
    const uptimeData = await client.uptimes.get(server.id);
    const intervalConfig = await client.intervals.get(interaction.guildId!);
    
    // Check if this is the active server
    const isActiveServer = intervalConfig?.activeServerId === server.id;
    
    // Remove server from the list
    servers.splice(serverIndex, 1);
    await client.servers.set(interaction.guildId!, servers);
    
    // Remove all server-related data
    await client.maxPlayers.delete(server.id);
    await client.uptimes.delete(server.id);
    
    // If this was the active server, handle accordingly
    if (isActiveServer && intervalConfig) {
      if (servers.length > 0) {
        // Set first remaining server as active
        intervalConfig.activeServerId = servers[0].id;
        intervalConfig.statusMessage = null; // Reset status message
        await client.intervals.set(interaction.guildId!, intervalConfig);
      } else {
        // No servers left, disable monitoring
        intervalConfig.activeServerId = undefined;
        intervalConfig.enabled = false;
        intervalConfig.statusMessage = null;
        await client.intervals.set(interaction.guildId!, intervalConfig);
      }
    }
    
    // Update guild config cache
    let guildConfig = client.guildConfigs.get(interaction.guildId!) || { servers: [] };
    guildConfig.servers = servers;
    guildConfig.interval = intervalConfig;
    client.guildConfigs.set(interaction.guildId!, guildConfig);
    
    // Create summary embed
    const embed = new EmbedBuilder()
      .setColor(0xff6b6b)
      .setTitle('🗑️ Server Removed Successfully')
      .setDescription(`Removed **${server.name}** from monitoring`)
      .addFields(
        { name: '🌐 Server Address', value: `${server.ip}:${server.port}`, inline: true },
        { name: '📅 Added Date', value: new Date(server.addedAt).toLocaleDateString(), inline: true },
        { name: '👤 Added By', value: `<@${server.addedBy}>`, inline: true }
      )
      .setTimestamp();
    
    // Add data summary if available
    if (chartData) {
      embed.addFields(
        { name: '📈 Days Tracked', value: `${chartData.days?.length || 0} days`, inline: true },
        { name: '🔝 Peak Today', value: `${chartData.maxPlayersToday} players`, inline: true }
      );
    }
    
    if (uptimeData) {
      const totalChecks = uptimeData.uptime + uptimeData.downtime;
      const uptimePercentage = totalChecks > 0 ? ((uptimeData.uptime / totalChecks) * 100).toFixed(1) : '0';
      embed.addFields(
        { name: '⏱️ Uptime Statistics', value: `${uptimePercentage}% (${uptimeData.uptime}/${totalChecks} checks)`, inline: true }
      );
    }
    
    // Add status about remaining servers
    if (servers.length === 0) {
      embed.addFields(
        { name: '📊 Monitoring Status', value: '❌ Disabled (no servers remaining)', inline: false },
        { name: '💡 Next Steps', value: 'Use `/server add` to add a new server', inline: false }
      );
    } else if (isActiveServer) {
      const newActiveServer = servers[0];
      embed.addFields(
        { name: '📊 Monitoring Status', value: `✅ Switched to **${newActiveServer.name}**`, inline: false },
        { name: '💡 Active Server', value: `Now monitoring: ${newActiveServer.name} (${newActiveServer.ip}:${newActiveServer.port})`, inline: false }
      );
    } else {
      embed.addFields(
        { name: '📊 Monitoring Status', value: '✅ Continues with existing active server', inline: false },
        { name: '🔢 Remaining Servers', value: `${servers.length} server${servers.length === 1 ? '' : 's'} still configured`, inline: false }
      );
    }
    
    await interaction.editReply({ embeds: [embed] });
    
    console.log(`🗑️ Deleted server ${server.name} (${server.id}) for guild ${interaction.guild?.name}`);
    
  } catch (error) {
    console.error('Error deleting server config:', error);
    await interaction.editReply('❌ An error occurred while deleting the server configuration. Please try again.');
  }
}

async function handleStatus(interaction: ChatInputCommandInteraction, client: CustomClient) {
  await interaction.deferReply();
 
  // Get all servers for this guild
  const servers = await client.servers.get(interaction.guildId!) || [];
  if (servers.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xff6b6b)
      .setTitle('❌ No Servers Configured')
      .setDescription('No servers have been configured for this guild.')
      .addFields(
        { name: '💡 Getting Started', value: 'Use `/server add` to configure a SA:MP/open.mp server to monitor.' },
        { name: '📖 Example', value: '`/server add ip:127.0.0.1 port:7777 name:"My Server"`' }
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
    targetServer = servers.find(s => s.id === requestedServer || s.name === requestedServer);
    if (!targetServer) {
      await interaction.editReply('❌ Server not found. Use `/server list` to see available servers.');
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
        await interaction.editReply('❌ No active server set and multiple servers available. Use `/server activate` to set an active server, or specify which server to check.');
        return;
      }
    } else {
      targetServer = servers.find(s => s.id === intervalConfig.activeServerId);
      if (!targetServer) {
        await interaction.editReply('❌ Active server not found. Use `/server activate` to set a valid server.');
        return;
      }
    }
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
   
    await interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    console.error('Error getting server status:', error);
    
    // Create fallback embed
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('❌ Error')
      .setDescription(`Failed to retrieve status for **${targetServer.name}** (${targetServer.ip}:${targetServer.port})\nThe server might be offline or unreachable.`)
      .setTimestamp();
      
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}