import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { CustomClient } from '../types';
import { getPlayerCount, getStatus, getRoleColor } from '../utils';

export const data = new SlashCommandBuilder()
  .setName('forceupdate')
  .setDescription('Force an immediate status update (Owner only)')
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
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
): Promise<void> {
  if (interaction.user.id !== process.env.OWNER_ID) {
    await interaction.reply({
      content: '❌ This command is only available to the bot owner.',
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const targetGuildId = interaction.options.getString('guild');
  const allGuilds = interaction.options.getBoolean('all_guilds') || false;

  try {
    let updatedGuilds = 0;
    let errors: string[] = [];

    if (allGuilds) {
      // Force update all guilds with active monitoring
      for (const [guildId, guildConfig] of client.guildConfigs.entries()) {
        if (guildConfig.interval?.enabled && guildConfig.interval.activeServerId) {
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
        .setDescription(`Updated ${updatedGuilds} guild(s) with active monitoring`)
        .addFields({
          name: 'Status',
          value: errors.length > 0 
            ? `${updatedGuilds} successful, ${errors.length} errors`
            : 'All updates successful',
          inline: true
        })
        .setTimestamp();

      if (errors.length > 0 && errors.length <= 5) {
        embed.addFields({
          name: 'Errors',
          value: errors.join('\n'),
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Single guild update
    const guildId = targetGuildId || interaction.guildId!;
    const guildConfig = client.guildConfigs.get(guildId);
    
    if (!guildConfig?.interval?.enabled || !guildConfig.interval.activeServerId) {
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

    // Perform immediate update
    await performGuildUpdate(client, guildId, guildConfig);

    const guild = client.guilds.cache.get(guildId);
    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('🔄 Force Update Complete')
      .setDescription('Status has been updated immediately')
      .addFields(
        {
          name: 'Guild',
          value: guild?.name || 'Unknown',
          inline: true
        },
        {
          name: 'Server',
          value: activeServer.name,
          inline: true
        },
        {
          name: 'Address',
          value: `${activeServer.ip}:${activeServer.port}`,
          inline: true
        }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    console.log(`Force update completed by ${interaction.user.tag} for guild ${guild?.name || guildId}`);

  } catch (error) {
    console.error('Force update error:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('❌ Force Update Failed')
      .setDescription('An error occurred while forcing the update')
      .addFields({
        name: 'Error',
        value: error instanceof Error ? error.message : 'Unknown error',
        inline: false
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

// Function to perform the actual guild update
async function performGuildUpdate(client: CustomClient, guildId: string, guildConfig: any): Promise<void> {
  const { interval, servers } = guildConfig;
  
  // Find the active server
  const activeServer = servers.find((s: any) => s.id === interval.activeServerId);
  if (!activeServer) {
    throw new Error('Active server not found');
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    throw new Error('Guild not found');
  }

  // Get server uptime stats
  let onlineStats = await client.uptimes.get(activeServer.id);
  if (!onlineStats) {
    onlineStats = { uptime: 0, downtime: 0 };
  }

  // Get player count and update max players
  let chartData = await client.maxPlayers.get(activeServer.id);
  if (!chartData) {
    chartData = {
      maxPlayersToday: 0,
      days: [],
      name: '',
      maxPlayers: 0,
    };
  }

  // Get current server info
  const info = await getPlayerCount(activeServer, true);

  // Update chart data
  if (info.playerCount > chartData.maxPlayersToday) {
    chartData.maxPlayersToday = info.playerCount;
  }
  chartData.name = info.name;
  chartData.maxPlayers = info.maxPlayers;

  await client.maxPlayers.set(activeServer.id, chartData);

  // Update uptime stats
  if (info.isOnline) {
    onlineStats.uptime++;
  } else {
    onlineStats.downtime++;
  }
  await client.uptimes.set(activeServer.id, onlineStats);

  // Update status channel
  if (interval.statusChannel) {
    const statusChannel = await client.channels.fetch(interval.statusChannel).catch(() => null);
    
    if (statusChannel && 'send' in statusChannel) {
      const color = getRoleColor(guild);
      const serverEmbed = await getStatus(activeServer, color);

      // Try to edit existing message first
      if (interval.statusMessage) {
        try {
          const existingMsg = await statusChannel.messages.fetch(interval.statusMessage);
          await existingMsg.edit({ embeds: [serverEmbed] });
        } catch (error) {
          // Create new message if edit fails
          const newMsg = await statusChannel.send({ embeds: [serverEmbed] });
          interval.statusMessage = newMsg.id;
          await client.intervals.set(guildId, interval);
        }
      } else {
        // Create new message
        const newMsg = await statusChannel.send({ embeds: [serverEmbed] });
        interval.statusMessage = newMsg.id;
        await client.intervals.set(guildId, interval);
      }
    }
  }

  // Set next update time (reset to normal schedule)
  interval.next = Date.now() + 600000; // 10 minutes
  await client.intervals.set(guildId, interval);
  
  // Update cache
  client.guildConfigs.set(guildId, guildConfig);
}