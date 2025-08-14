import { Events, TextChannel, VoiceChannel, ChannelType } from 'discord.js';
import { getChart, getStatus, getPlayerCount, getRoleColor } from '../utils';
import { CustomClient, getServerDataKey } from '../types';
import { TimezoneHelper } from '../utils/timezoneHelper';

export const name = Events.ClientReady;
export const once = true;

const lastChannelUpdate = new Map<string, { time: number; count: number; online: boolean }>();

export async function execute(client: CustomClient): Promise<void> {
  const isProduction = process.env.LOG_LEVEL === 'production';

  console.log(`Logged in as ${client.user!.tag}`);
  client.user!.setActivity('SA:MP/omp Servers', { type: 3 });

  try {
    let totalServers = 0;
    let totalGuilds = 0;

    for (const guild of client.guilds.cache.values()) {
      const servers = (await client.servers.get(guild.id)) || [];
      const interval = await client.intervals.get(guild.id);

      const guildConfig = interval ? { servers, interval } : { servers };
      client.guildConfigs.set(guild.id, guildConfig);
      totalServers += servers.length;
      totalGuilds++;

      if (!isProduction) {
        console.log(
          `Loaded config for guild: ${guild.name} (${guild.id}) - ${servers.length} server(s)`
        );
      }
    }

    if (isProduction) {
      console.log(
        `Loaded configurations: ${totalGuilds} guilds, ${totalServers} servers`
      );
    }
  } catch (error) {
    console.error('Error loading guild configurations:', error);
  }

  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      try {
        const guildConfig = client.guildConfigs.get(guild.id);
        if (!guildConfig?.interval || !guildConfig.interval.enabled) continue;

        const { interval, servers } = guildConfig;
        const now = Date.now();

        if (!interval.activeServerId) continue;

        const activeServer = servers.find(s => s.id === interval.activeServerId);
        if (!activeServer) continue;

        const { SecurityValidator } = require('../utils/securityValidator');
        const banStatus = SecurityValidator.isIPBanned(activeServer.ip);
        if (banStatus.banned) {
          console.log(`Skipping monitoring for banned IP: ${activeServer.ip} - ${banStatus.reason}`);
          continue;
        }

        const statusUpdateDue = now >= (interval.next || 0);

        const lastVoiceUpdate = interval.lastVoiceUpdate || 0;
        const voiceUpdateDue = now - lastVoiceUpdate >= 600000;

        if (!statusUpdateDue && !voiceUpdateDue) continue;

        const serverDataKey = getServerDataKey(guild.id, activeServer.id);

        let onlineStats = await client.uptimes.get(serverDataKey);
        if (!onlineStats) {
          onlineStats = { uptime: 0, downtime: 0 };
        }

        let chartData = await client.maxPlayers.get(serverDataKey);
        if (!chartData) {
          const currentDayStart = TimezoneHelper.getCurrentDayPeriodStart(
            activeServer.timezone, 
            activeServer.dayResetHour
          );
          
          chartData = {
            maxPlayersToday: 0,
            days: [],
            name: activeServer.name,
            maxPlayers: 0,
          };
          await client.maxPlayers.set(serverDataKey, chartData);
        }

        const info = await client.rateLimitManager.executeWithRetry(
          () => getPlayerCount(activeServer, guild.id, true),
          3
        );

        const currentDayStart = TimezoneHelper.getCurrentDayPeriodStart(
          activeServer.timezone, 
          activeServer.dayResetHour
        );

        const lastDayTimestamp = chartData.days.length > 0 ? chartData.days[chartData.days.length - 1]!.date : 0;
        
        if (TimezoneHelper.isNewDayPeriod(lastDayTimestamp, activeServer.timezone, activeServer.dayResetHour)) {
          if (chartData.maxPlayersToday > 0 || chartData.days.length === 0) {
            chartData.days.push({
              value: chartData.maxPlayersToday,
              date: currentDayStart.getTime(),
              timezone: activeServer.timezone,
              dayResetHour: activeServer.dayResetHour,
            });

            if (chartData.days.length > 30) {
              chartData.days = chartData.days.slice(-30);
            }

            if (interval.chartChannel && chartData.days.length >= 2) {
              try {
                const chartChannel = await client.channels
                  .fetch(interval.chartChannel)
                  .catch(() => null) as TextChannel | null;
                
                if (chartChannel) {
                  const color = getRoleColor(guild);
                  const chart = await getChart(chartData, color);

                  if (chartData.msg) {
                    try {
                      const oldMessage = await chartChannel.messages.fetch(chartData.msg);
                      await oldMessage.delete();
                    } catch (error) {
                      console.log(`Could not delete old chart message: ${error}`);
                    }
                  }

                  const resetTimeStr = TimezoneHelper.formatDayResetTime(activeServer.dayResetHour);
                  const msg = await chartChannel.send({
                    content: `**Daily Chart for ${activeServer.name}** (Day resets at ${resetTimeStr})`,
                    files: [chart],
                  });

                  chartData.msg = msg.id;
                }
              } catch (chartError) {
                console.error(`Failed to send chart to ${guild.name}:`, chartError);
              }
            }
          }

          chartData.maxPlayersToday = info.playerCount;
        } else {
          if (info.playerCount > chartData.maxPlayersToday) {
            chartData.maxPlayersToday = info.playerCount;
          }
        }

        chartData.name = info.name;
        chartData.maxPlayers = info.maxPlayers;
        await client.maxPlayers.set(serverDataKey, chartData);

        if (info.isOnline) {
          onlineStats.uptime++;
        } else {
          onlineStats.downtime++;
        }
        await client.uptimes.set(serverDataKey, onlineStats);

        if (statusUpdateDue && interval.statusChannel) {
          try {
            const statusChannel = (await client.channels
              .fetch(interval.statusChannel)
              .catch(() => null)) as TextChannel | null;

            if (statusChannel) {
              const color = getRoleColor(guild);
              const serverEmbed = await getStatus(
                activeServer,
                color,
                guild.id,
                true
              );

              let messageUpdated = false;

              if (interval.statusMessage) {
                try {
                  const existingMsg = await statusChannel.messages.fetch(
                    interval.statusMessage
                  );
                  await existingMsg.edit({ embeds: [serverEmbed] });
                  if (!isProduction) {
                    console.log(`Updated status message in ${guild.name} (5min cycle)`);
                  }
                  messageUpdated = true;
                } catch (error) {
                }
              }

              if (!messageUpdated) {
                try {
                  const newMsg = await statusChannel.send({ embeds: [serverEmbed] });
                  interval.statusMessage = newMsg.id;
                  if (!isProduction) {
                    console.log(`Created new status message in ${guild.name}`);
                  }
                } catch (sendError) {
                  console.error(`Failed to send status message:`, sendError);
                }
              }
            }
          } catch (error) {
            console.error(`Failed to update status channel for ${guild.name}:`, error);
          }

          interval.next = now + 300000;
        }

        if (voiceUpdateDue && interval.playerCountChannel) {
          const guildUpdateData = lastChannelUpdate.get(guild.id) || {
            time: 0,
            count: 0,
            online: true,
          };

          const statusChange = info.isOnline !== guildUpdateData.online;

          await client.rateLimitManager.queueChannelUpdate(
            interval.playerCountChannel,
            async () => {
              const playerCountChannel = await client.channels
                .fetch(interval.playerCountChannel!)
                .catch(() => null);

              if (
                playerCountChannel &&
                playerCountChannel.type === ChannelType.GuildVoice
              ) {
                const channel = playerCountChannel as VoiceChannel;
                const newName = info.isOnline
                  ? `👥 ${info.playerCount}/${info.maxPlayers}`
                  : '❌ Server Offline';

                if (channel.name !== newName) {
                  try {
                    await channel.setName(newName);

                    lastChannelUpdate.set(guild.id, {
                      time: Date.now(),
                      count: info.playerCount,
                      online: info.isOnline,
                    });

                    if (!isProduction) {
                      console.log(
                        `Updated player count channel in ${guild.name}: ${newName} (10min cycle)`
                      );
                    }
                  } catch (error: any) {
                  }
                }
              }
            },
            statusChange ? 'high' : 'normal'
          );

          interval.lastVoiceUpdate = now;
        }

        await client.intervals.set(guild.id, interval);
        client.guildConfigs.set(guild.id, guildConfig);

      } catch (error) {
        console.error(`Error processing guild ${guild.name}:`, error);
      }
    }
  }, 60000);

  if (!isProduction) {
    setInterval(() => {
      const queueStats = client.rateLimitManager.getQueueStats();
      const activeQueues = Object.entries(queueStats).filter(
        ([_, stats]) => (stats as any).size > 0
      );

      if (activeQueues.length > 0) {
        console.log('Rate limit queue statistics:', activeQueues);
      }
    }, 1800000);
  }

  console.log('Bot is ready and monitoring servers!');
}