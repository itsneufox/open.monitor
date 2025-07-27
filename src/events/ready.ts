import { Events, TextChannel, } from 'discord.js';
import { getChart, getStatus, getPlayerCount, getRoleColor } from '../utils';
import { CustomClient } from '../types';

export const name = Events.ClientReady;
export const once = true;

export async function execute(client: CustomClient): Promise<void> {
  console.log(`✅ Logged in as ${client.user!.tag}`);
  client.user!.setActivity('SA:MP/open.mp Servers', { type: 3 }); // Watching activity
  
  // Load all guild configurations into memory
  try {
    for (const guild of client.guilds.cache.values()) {
      const serversData = await client.servers.get(guild.id);
      const servers = Array.isArray(serversData) ? serversData : [];
      const interval = await client.intervals.get(guild.id);
      
      client.guildConfigs.set(guild.id, { servers, interval });
      console.log(`📊 Loaded config for guild: ${guild.name} (${guild.id}) - ${servers.length} server(s)${serversData === undefined ? ' (was undefined)' : ''}`);
    }
    
    // Initialize max players next check time if not set
    const nextCheck = await client.maxPlayers.get('next') as number | undefined;
    if (!nextCheck) {
      // Set next check to midnight
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      
      await client.maxPlayers.set('next', tomorrow.getTime());
      console.log(`⏰ Set next daily check to: ${tomorrow.toISOString()}`);
    }
  } catch (error) {
    console.error('❌ Error loading guild configurations:', error);
  }
  
  // Set interval for status updates (every 3 minutes)
  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      try {
        const guildConfig = client.guildConfigs.get(guild.id);
        if (!guildConfig?.interval || !guildConfig.interval.enabled) continue;
        
        const { interval, servers } = guildConfig;
        if (Date.now() < interval.next || !interval.activeServerId) continue;
        
        // Find the active server
        const activeServer = servers.find(s => s.id === interval.activeServerId);
        if (!activeServer) {
          console.warn(`⚠️ Active server ${interval.activeServerId} not found for guild ${guild.name}`);
          continue;
        }
        
        // Update next check time (every 3 minutes)
        interval.next = Date.now() + 180000;
        
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
            maxPlayers: 0
          };
          await client.maxPlayers.set(activeServer.id, chartData);
        }
        
        // Pass ServerConfig directly as getPlayerCount expects ServerConfig
        const info = await getPlayerCount(activeServer);
        
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
        
        // Handle status channel updates
        if (interval.statusChannel) {
          const statusChannel = await client.channels.fetch(interval.statusChannel).catch(() => null) as TextChannel | null;
          if (statusChannel) {
            const color = getRoleColor(guild);
            const serverEmbed = await getStatus(activeServer, color);
            
            // Add server name to embed title
            if (activeServer.name !== activeServer.id) {
              const currentTitle = serverEmbed.data.title || 'Server Status';
              serverEmbed.setTitle(`${currentTitle} - ${activeServer.name}`);
            }
            
            // Try to edit existing message, or send new one if it doesn't exist
            if (interval.statusMessage) {
              try {
                const existingMsg = await statusChannel.messages.fetch(interval.statusMessage);
                await existingMsg.edit({ embeds: [serverEmbed] });
                console.log(`✏️ Updated status message in ${guild.name}`);
              } catch (error) {
                // Message doesn't exist anymore, send a new one
                console.log(`📝 Previous message not found, sending new one in ${guild.name}`);
                try {
                  const newMsg = await statusChannel.send({ embeds: [serverEmbed] });
                  interval.statusMessage = newMsg.id;
                  await client.intervals.set(guild.id, interval);
                } catch (sendError) {
                  console.error(`❌ Failed to send new status message to ${guild.name}:`, sendError);
                }
              }
            } else {
              // No previous message, send new one
              try {
                const newMsg = await statusChannel.send({ embeds: [serverEmbed] });
                interval.statusMessage = newMsg.id;
                await client.intervals.set(guild.id, interval);
                console.log(`📝 Sent initial status message to ${guild.name}`);
              } catch (error) {
                console.error(`❌ Failed to send initial status message to ${guild.name}:`, error);
              }
            }
          }
        }
        
        // Handle server IP channel updates
        if (interval.serverIpChannel) {
          const serverIpChannel = await client.channels.fetch(interval.serverIpChannel).catch(() => null);
          if (serverIpChannel && (serverIpChannel.type === 2 || serverIpChannel.type === 0)) { // Voice or Text channel
            try {
              const newName = info.isOnline 
                ? `🌐 ${activeServer.ip}:${activeServer.port}`
                : `🌐 ${activeServer.ip}:${activeServer.port} (Offline)`;
              
              if (serverIpChannel.name !== newName) {
                await serverIpChannel.setName(newName);
                console.log(`🌐 Updated server IP channel in ${guild.name}: ${newName}`);
              }
            } catch (error) {
              console.error(`❌ Failed to update server IP channel in ${guild.name}:`, error);
            }
          }
        }
        
        // Handle player count channel updates
        if (interval.playerCountChannel) {
          const playerCountChannel = await client.channels.fetch(interval.playerCountChannel).catch(() => null);
          if (playerCountChannel && (playerCountChannel.type === 2 || playerCountChannel.type === 0)) { // Voice or Text channel
            try {
              const newName = info.isOnline 
                ? `👥 Players: ${info.playerCount}/${info.maxPlayers}`
                : '👥 Server Offline';
              
              if (playerCountChannel.name !== newName) {
                await playerCountChannel.setName(newName);
                console.log(`👥 Updated player count channel in ${guild.name}: ${newName}`);
              }
            } catch (error) {
              console.error(`❌ Failed to update player count channel in ${guild.name}:`, error);
            }
          }
        }
        
        // Update the guild config cache
        client.guildConfigs.set(guild.id, guildConfig);
        
      } catch (error) {
        console.error(`❌ Error processing guild ${guild.name}:`, error);
      }
    }
  }, 180000); // 3 minutes
  
  // Set interval for daily chart generation (check every hour)
  setInterval(async () => {
    try {
      const nextCheck = await client.maxPlayers.get('next') as number;
      if (!nextCheck || Date.now() < nextCheck) return;
      
      console.log('📈 Starting daily chart generation...');
      
      // Update next check time to next day
      await client.maxPlayers.set('next', nextCheck + 86400000);
      
      // Generate charts for all guilds with active servers
      for (const guild of client.guilds.cache.values()) {
        try {
          const guildConfig = client.guildConfigs.get(guild.id);
          if (!guildConfig?.interval?.enabled || !guildConfig.interval.chartChannel) continue;
          
          const { interval, servers } = guildConfig;
          
          // Find active server
          const activeServer = servers.find(s => s.id === interval.activeServerId);
          if (!activeServer) continue;
          
          const data = await client.maxPlayers.get(activeServer.id);
          if (!data || !data.days) continue;
          
          // Add today's max player count to history
          const chartDataPoint = {
            value: Math.max(0, data.maxPlayersToday),
            date: Date.now()
          };
          
          if (chartDataPoint.value >= 0) {
            data.days.push(chartDataPoint);
          }
          
          // Keep only last 30 days
          if (data.days.length > 30) {
            data.days = data.days.slice(-30);
          }
          
          await client.maxPlayers.set(activeServer.id, data);
          
          // Send chart to chart channel only if we have enough data
          if (data.days.length >= 2) {
            let chartChannel: TextChannel | null = null;
            if (interval.chartChannel) {
              chartChannel = await client.channels.fetch(interval.chartChannel).catch(() => null) as TextChannel | null;
            }
            if (chartChannel) {
              const color = getRoleColor(guild);
              const chart = await getChart(data, color);
              
              const msg = await chartChannel.send({ 
                content: `📈 **Daily Chart for ${activeServer.name}**`,
                files: [chart] 
              });
              data.msg = msg.id;
              await client.maxPlayers.set(activeServer.id, data);
              
              console.log(`📊 Chart sent to ${guild.name} for ${activeServer.name}`);
            }
          }
          
        } catch (error) {
          console.error(`❌ Error generating chart for ${guild.name}:`, error);
        }
      }
      
      // Reset today's max player count after 2 minutes (to avoid race conditions)
      setTimeout(async () => {
        for (const guild of client.guilds.cache.values()) {
          try {
            const guildConfig = client.guildConfigs.get(guild.id);
            // Fix: Check if activeServerId exists before using it
            if (!guildConfig?.interval?.activeServerId) continue;
            
            const activeServerId = guildConfig.interval.activeServerId;
            const data = await client.maxPlayers.get(activeServerId);
            if (!data) continue;
            
            data.maxPlayersToday = 0; // Reset for new day
            await client.maxPlayers.set(activeServerId, data);
          } catch (error) {
            console.error(`❌ Error resetting daily data for ${guild.name}:`, error);
          }
        }
        console.log('🔄 Reset daily player counts for new day');
      }, 120000);
      
    } catch (error) {
      console.error('❌ Error in daily chart generation:', error);
    }
  }, 3600000); // 1 hour
  
  console.log('🚀 Bot is ready and monitoring servers!');
}