import {
  Events,
  Client,
  Guild,
  TextChannel,
  VoiceChannel,
  Message,
  EmbedBuilder,
  ChannelType,
} from 'discord.js';
import { getChart, getStatus, getPlayerCount, getRoleColor } from '../utils';
import {
  CustomClient,
  ChartData,
  UptimeStats,
  ServerConfig,
  IntervalConfig,
} from '../types';

export const name = Events.ClientReady;
export const once = true;

// Track channel updates to respect rate limits
const lastChannelUpdate = new Map<
  string,
  { time: number; count: number; online: boolean }
>();
const CHANNEL_UPDATE_INTERVAL = 600000; // 10 minutes

export async function execute(client: CustomClient): Promise<void> {
  console.log(`Logged in as ${client.user!.tag}`);
  client.user!.setActivity('SA:MP Servers', { type: 3 });

  // Load all guild configurations into memory
  try {
    for (const guild of client.guilds.cache.values()) {
      const servers = (await client.servers.get(guild.id)) || [];
      const interval = await client.intervals.get(guild.id);

      // Only set interval if it exists, otherwise leave it undefined
      const guildConfig = interval ? { servers, interval } : { servers };

      client.guildConfigs.set(guild.id, guildConfig);
      console.log(
        `Loaded config for guild: ${guild.name} (${guild.id}) - ${servers.length} server(s)`
      );
    }

    // Initialize max players next check time if not set
    const nextCheck = (await client.maxPlayers.get('next')) as
      | number
      | undefined;
    if (!nextCheck) {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      await client.maxPlayers.set('next', tomorrow.getTime());
      console.log(`Set next daily check to: ${tomorrow.toISOString()}`);
    }
  } catch (error) {
    console.error('Error loading guild configurations:', error);
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
        const activeServer = servers.find(
          s => s.id === interval.activeServerId
        );
        if (!activeServer) {
          console.warn(
            `Active server ${interval.activeServerId} not found for guild ${guild.name}`
          );
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
            maxPlayers: 0,
          };
          await client.maxPlayers.set(activeServer.id, chartData);
        }

        // Get current server info
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
          const statusChannel = (await client.channels
            .fetch(interval.statusChannel)
            .catch(() => null)) as TextChannel | null;
          if (statusChannel) {
            const color = getRoleColor(guild);
            const serverEmbed = await getStatus(activeServer, color);

            // Add server name to embed title
            if (activeServer.name !== activeServer.id) {
              const currentTitle = serverEmbed.data.title || 'Server Status';
              serverEmbed.setTitle(`${currentTitle} - ${activeServer.name}`);
            }

            let messageUpdated = false;

            // Try to edit existing message first
            if (interval.statusMessage) {
              try {
                const existingMsg = await statusChannel.messages.fetch(
                  interval.statusMessage
                );
                await existingMsg.edit({ embeds: [serverEmbed] });
                console.log(`Updated status message in ${guild.name}`);
                messageUpdated = true;
              } catch (error) {
                console.log(
                  `Could not edit message ${interval.statusMessage} in ${guild.name}, creating new one`
                );
              }
            }

            // If we couldn't edit, create a new message
            if (!messageUpdated) {
              try {
                const newMsg = await statusChannel.send({
                  embeds: [serverEmbed],
                });
                interval.statusMessage = newMsg.id;
                await client.intervals.set(guild.id, interval);
                console.log(`Created new status message in ${guild.name}`);
              } catch (sendError) {
                console.error(
                  `Failed to send status message to ${guild.name}:`,
                  sendError
                );
              }
            }
          }
        }

        // Handle player count channel updates with smart rate limiting
        if (interval.playerCountChannel) {
          const guildUpdateData = lastChannelUpdate.get(guild.id) || {
            time: 0,
            count: 0,
            online: true,
          };
          const timeSinceUpdate = Date.now() - guildUpdateData.time;

          // Smart update conditions
          const timeBasedUpdate = timeSinceUpdate > CHANNEL_UPDATE_INTERVAL;
          const significantChange =
            Math.abs(info.playerCount - guildUpdateData.count) >= 10;
          const statusChange = info.isOnline !== guildUpdateData.online;
          const majorMilestone =
            info.playerCount % 50 === 0 &&
            info.playerCount !== guildUpdateData.count;

          // Update if any condition is met
          if (
            timeBasedUpdate ||
            significantChange ||
            statusChange ||
            majorMilestone
          ) {
            try {
              const playerCountChannel = await client.channels
                .fetch(interval.playerCountChannel)
                .catch(() => null);
              if (
                playerCountChannel &&
                (playerCountChannel.type === ChannelType.GuildVoice ||
                  playerCountChannel.type === ChannelType.GuildText)
              ) {
                const channel = playerCountChannel as
                  | TextChannel
                  | VoiceChannel;
                const newName = info.isOnline
                  ? `Players: ${info.playerCount}/${info.maxPlayers}`
                  : 'Server Offline';

                if (channel.name !== newName) {
                  await Promise.race([
                    channel.setName(newName),
                    new Promise((_, reject) =>
                      setTimeout(
                        () => reject(new Error('Channel rename timeout')),
                        15000
                      )
                    ),
                  ]);

                  // Update tracking
                  lastChannelUpdate.set(guild.id, {
                    time: Date.now(),
                    count: info.playerCount,
                    online: info.isOnline,
                  });

                  const reason = timeBasedUpdate
                    ? 'time'
                    : significantChange
                      ? 'significant'
                      : statusChange
                        ? 'status'
                        : 'milestone';
                  console.log(
                    `Updated player count channel in ${guild.name}: ${newName} (reason: ${reason})`
                  );
                }
              }
            } catch (error: any) {
              if (error.message === 'Channel rename timeout') {
                console.warn(
                  `Player count channel update timed out (likely rate limited) for ${guild.name}`
                );
              } else if (error.code === 429) {
                console.warn(
                  `Rate limited on channel updates for ${guild.name}`
                );
              } else {
                console.error(
                  `Failed to update player count channel in ${guild.name}:`,
                  error
                );
              }
            }
          } else {
            console.log(
              `Skipping channel update for ${guild.name}: ${info.playerCount} players (last: ${guildUpdateData.count}, time since: ${Math.round(timeSinceUpdate / 1000 / 60)}min)`
            );
          }
        }

        // Update the guild config cache
        client.guildConfigs.set(guild.id, guildConfig);
      } catch (error) {
        console.error(`Error processing guild ${guild.name}:`, error);
      }
    }
  }, 180000); // 3 minutes

  // Set interval for daily chart generation (check every hour)
  setInterval(async () => {
    try {
      const nextCheck = (await client.maxPlayers.get('next')) as number;
      if (!nextCheck || Date.now() < nextCheck) return;

      console.log('Starting daily chart generation...');

      // Update next check time to next day
      await client.maxPlayers.set('next', nextCheck + 86400000);

      // Generate charts for all guilds with active servers
      for (const guild of client.guilds.cache.values()) {
        try {
          const guildConfig = client.guildConfigs.get(guild.id);
          if (
            !guildConfig?.interval?.enabled ||
            !guildConfig.interval.chartChannel
          )
            continue;

          const { interval, servers } = guildConfig;

          // Find active server
          const activeServer = servers.find(
            s => s.id === interval.activeServerId
          );
          if (!activeServer) continue;

          const data = await client.maxPlayers.get(activeServer.id);
          if (!data || !data.days) continue;

          // Add today's max player count to history
          const chartDataPoint = {
            value: Math.max(0, data.maxPlayersToday),
            date: Date.now(),
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
              chartChannel = (await client.channels
                .fetch(interval.chartChannel)
                .catch(() => null)) as TextChannel | null;
            }
            if (chartChannel) {
              const color = getRoleColor(guild);
              const chart = await getChart(data, color);

              const msg = await chartChannel.send({
                content: `**Daily Chart for ${activeServer.name}**`,
                files: [chart],
              });
              data.msg = msg.id;
              await client.maxPlayers.set(activeServer.id, data);

              console.log(
                `Chart sent to ${guild.name} for ${activeServer.name}`
              );
            }
          }
        } catch (error) {
          console.error(`Error generating chart for ${guild.name}:`, error);
        }
      }

      // Reset today's max player count after 2 minutes
      setTimeout(async () => {
        for (const guild of client.guilds.cache.values()) {
          try {
            const guildConfig = client.guildConfigs.get(guild.id);
            if (!guildConfig?.interval?.activeServerId) continue;

            const activeServerId = guildConfig.interval.activeServerId;
            const data = await client.maxPlayers.get(activeServerId);
            if (!data) continue;

            data.maxPlayersToday = 0;
            await client.maxPlayers.set(activeServerId, data);
          } catch (error) {
            console.error(
              `Error resetting daily data for ${guild.name}:`,
              error
            );
          }
        }
        console.log('Reset daily player counts for new day');
      }, 120000);
    } catch (error) {
      console.error('Error in daily chart generation:', error);
    }
  }, 3600000); // 1 hour

  console.log('Bot is ready and monitoring servers!');
}
