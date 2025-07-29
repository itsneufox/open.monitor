import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { CustomClient } from '../types';

export const data = new SlashCommandBuilder()
  .setName('debug')
  .setDescription('Show bot configuration and statistics (Owner only)');

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

  try {
    const guildConfig = client.guildConfigs.get(interaction.guildId!);
    const servers = guildConfig?.servers || [];
    const interval = guildConfig?.interval;

    let totalGuilds = 0;
    let totalServers = 0;
    let activeMonitoring = 0;
    const guildList: string[] = [];

    for (const [guildId, config] of client.guildConfigs.entries()) {
      totalGuilds++;
      totalServers += config.servers.length;
      if (config.interval?.enabled) {
        activeMonitoring++;
      }

      const guild = client.guilds.cache.get(guildId);
      const guildName = guild?.name || 'Unknown Guild';
      const memberCount = guild?.memberCount || 0;
      
      guildList.push(
        `**${guildName}** (${memberCount} members)\n` +
        `   └ ID: \`${guildId}\`\n` +
        `   └ Servers: ${config.servers.length}\n` +
        `   └ Status: ${config.interval?.enabled ? '🟢 Monitoring' : '⚪ Inactive'}\n` +
        `   └ Owner: ${guild?.ownerId ? `<@${guild.ownerId}>` : 'Unknown'}`
      );
    }

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('🔧 Bot Owner Debug Panel')
      .setDescription(`Debug info for ${client.user?.tag}`)
      .setTimestamp();

    embed.addFields(
      {
        name: '📊 Global Statistics',
        value: 
          `**Total Guilds:** ${totalGuilds}\n` +
          `**Total Servers:** ${totalServers}\n` +
          `**Active Monitoring:** ${activeMonitoring} guilds\n` +
          `**Bot Uptime:** <t:${Math.floor((Date.now() - (process.uptime() * 1000)) / 1000)}:R>\n` +
          `**Memory Usage:** ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB\n` +
          `**Node.js Version:** ${process.version}\n` +
          `**Environment:** ${process.env.NODE_ENV || 'development'}`,
        inline: false,
      }
    );

    if (interaction.guildId) {
      const activeServer = interval?.activeServerId 
        ? servers.find(s => s.id === interval.activeServerId)
        : null;

      embed.addFields(
        {
          name: '🏠 Current Guild Information',
          value: 
            `**Guild:** ${interaction.guild?.name}\n` +
            `**Guild ID:** \`${interaction.guildId}\`\n` +
            `**Members:** ${interaction.guild?.memberCount || 0}\n` +
            `**Owner:** <@${interaction.guild?.ownerId}>\n` +
            `**Servers Configured:** ${servers.length}\n` +
            `**Monitoring:** ${interval?.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
            `**Active Server:** ${activeServer?.name || 'None'}\n` +
            `**Next Update:** ${interval?.next ? `<t:${Math.floor(interval.next / 1000)}:R>` : 'N/A'}`,
          inline: false,
        }
      );

      if (servers.length > 0) {
        const serverList = servers.map((server) => {
          const isActive = interval?.activeServerId === server.id;
          const addedBy = client.users.cache.get(server.addedBy);
          return `${isActive ? '🟢' : '⚪'} **${server.name}** (\`${server.id}\`)\n` +
                 `   └ Address: \`${server.ip}:${server.port}\`\n` +
                 `   └ Added: <t:${Math.floor(server.addedAt / 1000)}:R>\n` +
                 `   └ By: ${addedBy?.tag || `Unknown (${server.addedBy})`}`;
        }).join('\n\n');

        if (serverList.length > 1024) {
          const chunks = [];
          let currentChunk = '';
          const serverEntries = servers.map((server) => {
            const isActive = interval?.activeServerId === server.id;
            return `${isActive ? '🟢' : '⚪'} **${server.name}** (\`${server.ip}:${server.port}\`)`;
          });

          for (const entry of serverEntries) {
            if (currentChunk.length + entry.length > 1020) {
              chunks.push(currentChunk);
              currentChunk = entry;
            } else {
              currentChunk += (currentChunk ? '\n' : '') + entry;
            }
          }
          if (currentChunk) chunks.push(currentChunk);

          chunks.forEach((chunk, index) => {
            embed.addFields({
              name: index === 0 ? '🖥️ Configured Servers' : `🖥️ Servers (continued ${index + 1})`,
              value: chunk,
              inline: false,
            });
          });
        } else {
          embed.addFields({
            name: '🖥️ Configured Servers',
            value: serverList,
            inline: false,
          });
        }
      }

      if (interval) {
        const channels = [];
        
        if (interval.statusChannel) {
          const channel = client.channels.cache.get(interval.statusChannel);
          channels.push(`**Status:** ${channel ? `<#${interval.statusChannel}>` : '❌ Missing'} (\`${interval.statusChannel}\`)`);
        }
        
        if (interval.chartChannel) {
          const channel = client.channels.cache.get(interval.chartChannel);
          channels.push(`**Charts:** ${channel ? `<#${interval.chartChannel}>` : '❌ Missing'} (\`${interval.chartChannel}\`)`);
        }
        
        if (interval.playerCountChannel) {
          const channel = client.channels.cache.get(interval.playerCountChannel);
          channels.push(`**Player Count:** ${channel ? `<#${interval.playerCountChannel}>` : '❌ Missing'} (\`${interval.playerCountChannel}\`)`);
        }
        
        if (interval.serverIpChannel) {
          const channel = client.channels.cache.get(interval.serverIpChannel);
          channels.push(`**Server IP:** ${channel ? `<#${interval.serverIpChannel}>` : '❌ Missing'} (\`${interval.serverIpChannel}\`)`);
        }

        if (channels.length > 0) {
          embed.addFields({
            name: '📺 Monitoring Channels',
            value: channels.join('\n'),
            inline: false,
          });
        }

        if (interval.managementRoleId) {
          const role = interaction.guild?.roles.cache.get(interval.managementRoleId);
          embed.addFields({
            name: '👥 Management Role',
            value: `${role ? role.toString() : '❌ Missing'} (\`${interval.managementRoleId}\`)`,
            inline: true,
          });
        }
      }
    }

    const queueStats = client.rateLimitManager.getQueueStats();
    if (Object.keys(queueStats).length > 0) {
      const queueInfo = Object.entries(queueStats)
        .map(([channelId, count]) => {
          const channel = client.channels.cache.get(channelId);
          const channelName = channel ? `<#${channelId}>` : `Unknown Channel`;
          return `${channelName} (\`${channelId}\`): ${count} queued`;
        })
        .join('\n');
      
      embed.addFields({
        name: '⏳ Rate Limit Queues',
        value: queueInfo,
        inline: false,
      });
    } else {
      embed.addFields({
        name: '⏳ Rate Limit Queues',
        value: 'No active queues',
        inline: false,
      });
    }

    if (guildList.length > 0) {
      const guildOverview = guildList.join('\n\n');
      
      if (guildOverview.length > 1024) {
        let currentField = '';
        let fieldIndex = 1;
        
        for (const guildInfo of guildList) {
          if (currentField.length + guildInfo.length > 1020) {
            embed.addFields({
              name: fieldIndex === 1 ? '🌐 All Guilds Overview' : `🌐 Guilds (continued ${fieldIndex})`,
              value: currentField,
              inline: false,
            });
            currentField = guildInfo;
            fieldIndex++;
          } else {
            currentField += (currentField ? '\n\n' : '') + guildInfo;
          }
        }
        
        if (currentField) {
          embed.addFields({
            name: fieldIndex === 1 ? '🌐 All Guilds Overview' : `🌐 Guilds (continued ${fieldIndex})`,
            value: currentField,
            inline: false,
          });
        }
      } else {
        embed.addFields({
          name: '🌐 All Guilds Overview',
          value: guildOverview,
          inline: false,
        });
      }
    }

    try {
      let totalChartEntries = 0;
      let totalUptimeEntries = 0;
      
      for (const [guildId, config] of client.guildConfigs.entries()) {
        for (const server of config.servers) {
          try {
            const chartData = await client.maxPlayers.get(server.id);
            const uptimeData = await client.uptimes.get(server.id);
            
            if (chartData?.days) totalChartEntries += chartData.days.length;
            if (uptimeData) totalUptimeEntries++;
          } catch (error) {
            // Skip errors for individual servers
          }
        }
      }
      
      embed.addFields({
        name: '💾 Database Statistics',
        value: 
          `**Chart Data Points:** ${totalChartEntries}\n` +
          `**Uptime Records:** ${totalUptimeEntries}\n` +
          `**Database URL:** \`${process.env.DATABASE_URL?.split('@')[1] || 'Not configured'}\``,
        inline: false,
      });
    } catch (error) {
      embed.addFields({
        name: '💾 Database Statistics',
        value: 'Error fetching database statistics',
        inline: false,
      });
    }

    const footerOptions: { text: string; iconURL?: string } = {
      text: `Owner Debug Panel • Process ID: ${process.pid} • Discord.js v${require('discord.js').version}`
    };
    
    const botAvatarURL = client.user?.displayAvatarURL();
    if (botAvatarURL) {
      footerOptions.iconURL = botAvatarURL;
    }
    
    embed.setFooter(footerOptions);

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in debug command:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('❌ Debug Command Error')
      .setDescription('An error occurred while fetching debug information.')
      .addFields({
        name: 'Error Details',
        value: error instanceof Error ? error.message : 'Unknown error',
        inline: false,
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}