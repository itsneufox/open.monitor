import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { getChart, getRoleColor } from '../utils';
import { CustomClient, ChartData } from '../types';

export const data = new SlashCommandBuilder()
  .setName('chart')
  .setDescription('Shows a chart of player activity for the past 30 days')
  .addStringOption(option =>
    option.setName('server')
      .setDescription('Which server to show chart for (leave empty for active server)')
      .setRequired(false)
      .setAutocomplete(true));

export async function execute(interaction: ChatInputCommandInteraction, client: CustomClient): Promise<void> {
  await interaction.deferReply();
  
  // Get server info
  if (!interaction.guildId) {
    await interaction.editReply('❌ This command can only be used in a server.');
    return;
  }
  
  // Get all servers for this guild
  const servers = await client.servers.get(interaction.guildId) || [];
  if (servers.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xff6b6b)
      .setTitle('❌ No Servers Configured')
      .setDescription('No servers have been configured for this guild.')
      .addFields(
        { name: '💡 Getting Started', value: 'Use `/server add` to configure a SA:MP/open.mp server to monitor.' }
      )
      .setTimestamp();
      
    await interaction.editReply({ embeds: [embed] });
    return;
  }
  
  // Determine which server to show chart for
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
    const intervalConfig = await client.intervals.get(interaction.guildId);
    if (!intervalConfig?.activeServerId) {
      if (servers.length === 1) {
        // If only one server, use it
        targetServer = servers[0];
      } else {
        await interaction.editReply('❌ No active server set and multiple servers available. Use `/server activate` to set an active server, or specify which server to show chart for.');
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
    // Get chart data using server ID
    const chartData = await client.maxPlayers.get(targetServer.id) as ChartData | undefined;
    
    if (!chartData || !chartData.days || chartData.days.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle('📊 No Data Available')
        .setDescription(`No player data has been collected for **${targetServer.name}** yet.`)
        .addFields(
          { name: '⏱️ Data Collection', value: 'The bot collects player data every 3 minutes when monitoring is enabled.', inline: false },
          { name: '💡 Enable Monitoring', value: 'Use `/monitor setup` to start collecting data automatically.', inline: false }
        )
        .setFooter({ text: `Server: ${targetServer.ip}:${targetServer.port}` })
        .setTimestamp();
        
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    
    if (chartData.days.length < 2) {
      const embed = new EmbedBuilder()
        .setColor(0xff9500)
        .setTitle('📊 Insufficient Data')
        .setDescription(`Only **${chartData.days.length} day** of data available for **${targetServer.name}**.`)
        .addFields(
          { name: '📈 Chart Requirements', value: 'At least 2 days of data are needed to generate a meaningful chart.', inline: false },
          { name: '⏳ Please Wait', value: 'Check back tomorrow for your first chart!', inline: false }
        )
        .setFooter({ text: `Server: ${targetServer.ip}:${targetServer.port}` })
        .setTimestamp();
        
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    
    // Calculate statistics
    const values = chartData.days.map(d => d.value);
    const overallMax = Math.max(...values);
    const overallMin = Math.min(...values);
    const averagePlayers = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    const dayCount = chartData.days.length;
    
    // Calculate trend (comparing last 7 days to previous 7 days)
    let trendText = 'No trend data';
    if (dayCount >= 14) {
      const recent7 = values.slice(-7);
      const previous7 = values.slice(-14, -7);
      const recentAvg = recent7.reduce((a, b) => a + b, 0) / 7;
      const previousAvg = previous7.reduce((a, b) => a + b, 0) / 7;
      const trendPercent = ((recentAvg - previousAvg) / previousAvg * 100);
      
      if (Math.abs(trendPercent) < 5) {
        trendText = '📊 Stable';
      } else if (trendPercent > 0) {
        trendText = `📈 Growing (+${trendPercent.toFixed(1)}%)`;
      } else {
        trendText = `📉 Declining (${trendPercent.toFixed(1)}%)`;
      }
    }
    
    // Get role color for chart
    const color = getRoleColor(interaction.guild!);
    
    // Generate chart
    const chart = await getChart(chartData, color);
    
    // Create rich embed
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`📈 Player Activity Analysis`)
      .setDescription(`**${targetServer.name}**\n\`${targetServer.ip}:${targetServer.port}\``)
      .addFields(
        { name: '📊 Data Period', value: `${dayCount} days`, inline: true },
        { name: '👥 Today\'s Peak', value: `${chartData.maxPlayersToday} players`, inline: true },
        { name: '🎯 Server Capacity', value: `${chartData.maxPlayers} players`, inline: true },
        { name: '🔝 Highest Peak', value: `${overallMax} players`, inline: true },
        { name: '📉 Lowest Point', value: `${overallMin} players`, inline: true },
        { name: '📊 Average Daily Peak', value: `${averagePlayers} players`, inline: true },
        { name: '📈 Recent Trend', value: trendText, inline: false }
      )
      .setImage('attachment://player-chart.png')
      .setFooter({ 
        text: `Data collected every 3 minutes • Last updated`, 
        iconURL: interaction.guild?.iconURL() || undefined 
      })
      .setTimestamp();
    
    // Add capacity utilization
    const utilizationPercent = ((averagePlayers / chartData.maxPlayers) * 100).toFixed(1);
    embed.addFields({ 
      name: '⚡ Server Utilization', 
      value: `${utilizationPercent}% average capacity`, 
      inline: true 
    });
    
    // Add peak time analysis if we have enough data
    if (dayCount >= 7) {
      const recentDays = chartData.days.slice(-7);
      const recentMax = Math.max(...recentDays.map(d => d.value));
      const peakDay = recentDays.find(d => d.value === recentMax);
      const dayName = peakDay ? new Date(peakDay.date).toLocaleDateString('en-US', { weekday: 'long' }) : 'Unknown';
      
      embed.addFields({ 
        name: '🏆 Best Day This Week', 
        value: `${dayName}: ${recentMax} players`, 
        inline: true 
      });
    }
    
    await interaction.editReply({ 
      embeds: [embed],
      files: [chart] 
    });
    
  } catch (error) {
    console.error('Error generating chart:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('❌ Chart Generation Failed')
      .setDescription(`Failed to generate chart for **${targetServer.name}**.`)
      .addFields(
        { name: '🔧 Possible Causes', value: '• Chart service temporarily unavailable\n• Invalid data in database\n• Network connectivity issues', inline: false },
        { name: '💡 Try Again', value: 'Please try again in a few moments.', inline: false }
      )
      .setFooter({ text: `Server: ${targetServer.ip}:${targetServer.port}` })
      .setTimestamp();
      
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}