import { Events, TextChannel, VoiceChannel, ChannelType } from 'discord.js';
import { getChart, getStatus, getPlayerCount, getRoleColor } from '../utils';
import { CustomClient, getServerDataKey } from '../types';

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

    const nextCheck = (await client.maxPlayers.get('next')) as number | undefined;
    if (!nextCheck) {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      await client.maxPlayers.set('next', tomorrow.getTime());
      if (!isProduction) {
        console.log(`Set next daily check to: ${tomorrow.toISOString()}`);
      }
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
            if (Date.now() < interval.next || !interval.activeServerId) continue;

      const activeServer = servers.find(
        s => s.id === interval.activeServerId
      );
      if (!activeServer) {
        if (!isProduction) {
          console.warn(
            `Active server ${interval.activeServerId} not found for guild ${guild.name}`
          );
        }
        continue;
      }

      interval.next = Date.now() + 300000;

      const serverDataKey = getServerDataKey(guild.id, activeServer.id);

      let onlineStats = await client.uptimes.get(serverDataKey);
      if (!onlineStats) {
        onlineStats = { uptime: 0, downtime: 0 };
      }

      let chartData = await client.maxPlayers.get(serverDataKey);
      if (!chartData) {
        chartData = {
          maxPlayersToday: 0,
          days: [],
          name: '',
          maxPlayers: 0,
        };
        await client.maxPlayers.set(serverDataKey, chartData);
      }

      const info = await client.rateLimitManager.executeWithRetry(
        () => getPlayerCount(activeServer, guild.id, true),
        3
      );

      if (info.playerCount > chartData.maxPlayersToday) {
        chartData.maxPlayersToday = info.playerCount;
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

      if (interval.statusChannel) {
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
                  console.log(`🔄 Updated status message in ${guild.name} (5min cycle)`);
                }
                messageUpdated = true;
              } catch (error) {
                if (!isProduction) {
                  console.log(
                    `Could not edit message ${interval.statusMessage} in ${guild.name}, creating new one`
                  );
                }
              }
            }

            if (!messageUpdated) {
              try {
                const newMsg = await statusChannel.send({
                  embeds: [serverEmbed],
                });
                interval.statusMessage = newMsg.id;
                await client.intervals.set(guild.id, interval);
                if (!isProduction) {
                  console.log(`Created new status message in ${guild.name}`);
                }
              } catch (sendError) {
                console.error(`Failed to send status message:`, sendError);
              }
            }
          }
        } catch (error) {
          console.error(
            `Failed to update status channel for ${guild.name}:`,
            error
          );
        }
      }
      const lastVoiceUpdate = interval.lastVoiceUpdate || 0;
      const timeSinceVoiceUpdate = Date.now() - lastVoiceUpdate;
      
      if (timeSinceVoiceUpdate >= 600000) {
        if (interval.playerCountChannel) {
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
                        `🔊 Updated player count channel in ${guild.name}: ${newName} (10min cycle)`
                      );
                    }
                  } catch (error: any) {
                    if (error.code === 50013) {
                      console.error(
                        `Missing permissions to update channel ${channel.name} in ${guild.name}`
                      );
                    } else if (error.status === 429) {
                      console.warn(
                        `Rate limited updating channel ${channel.name} in ${guild.name} - will retry later`
                      );
                    } else {
                      console.error(
                        `Error updating channel ${channel.name}:`,
                        error
                      );
                    }
                  }
                }
              }
            },
            statusChange ? 'high' : 'normal'
          );
        }
        interval.lastVoiceUpdate = Date.now();
        await client.intervals.set(guild.id, interval);
      }

      client.guildConfigs.set(guild.id, guildConfig);
    } catch (error) {
      console.error(`Error processing guild ${guild.name}:`, error);
    }
  }
}, 300000);

  function msUntilMidnight(): number {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setDate(midnight.getDate() + 1);
    midnight.setHours(0, 0, 0, 0);
    return midnight.getTime() - now.getTime();
  }

  setTimeout(async () => {
    await runDailyChartGeneration();

    setInterval(async () => {
      await runDailyChartGeneration();
    }, 86400000);
  }, msUntilMidnight());

  async function runDailyChartGeneration() {
    try {
      const nextCheck = (await client.maxPlayers.get('next')) as number;
      if (!nextCheck || Date.now() < nextCheck) return;

      if (!isProduction) {
        console.log('Starting daily chart generation...');
      }

      await client.maxPlayers.set('next', nextCheck + 86400000);

      let chartsGenerated = 0;

      for (const guild of client.guilds.cache.values()) {
        try {
          const guildConfig = client.guildConfigs.get(guild.id);
          if (
            !guildConfig?.interval?.enabled ||
            !guildConfig.interval.chartChannel
          )
            continue;

          const { interval, servers } = guildConfig;

          const activeServer = servers.find(
            s => s.id === interval.activeServerId
          );
          if (!activeServer) continue;

          const serverDataKey = getServerDataKey(guild.id, activeServer.id);
          const data = await client.maxPlayers.get(serverDataKey);
          if (!data || !data.days) continue;

          let chartValue = Math.max(data.maxPlayersToday, 0);

          if (chartValue === 0) {
            try {
              const currentInfo = await client.rateLimitManager.executeWithRetry(
                () => getPlayerCount(activeServer, guild.id, true),
                2
              );
              chartValue = currentInfo.isOnline ? currentInfo.playerCount : 0;
              if (!isProduction) {
                console.log(`Using current player count for chart: ${chartValue} players`);
              }
            } catch (error) {
              if (!isProduction) {
                console.log(`Could not get current player count for chart, using 0`);
              }
              chartValue = 0;
            }
          }

          const chartDataPoint = {
            value: chartValue,
            date: Date.now(),
          };

          data.days.push(chartDataPoint);

          if (data.days.length > 30) {
            data.days = data.days.slice(-30);
          }

          await client.maxPlayers.set(serverDataKey, data);

          if (data.days.length >= 2) {
            let chartChannel: TextChannel | null = null;
            if (interval.chartChannel) {
              chartChannel = (await client.channels
                .fetch(interval.chartChannel)
                .catch(() => null)) as TextChannel | null;
            }
            if (chartChannel) {
              try {
                const color = getRoleColor(guild);
                const chart = await getChart(data, color);

                if (data.msg) {
                  try {
                    const oldMessage = await chartChannel.messages.fetch(data.msg);
                    await oldMessage.delete();
                    if (!isProduction) {
                      console.log(`Deleted old chart message for ${activeServer.name} in ${guild.name}`);
                    }
                  } catch (error) {
                    if (!isProduction) {
                      console.log(`Could not delete old chart message for ${activeServer.name}: ${error}`);
                    }
                  }
                }

                const msg = await chartChannel.send({
                  content: `**Daily Chart for ${activeServer.name}**`,
                  files: [chart],
                });

                data.msg = msg.id;
                await client.maxPlayers.set(serverDataKey, data);

                chartsGenerated++;
                if (!isProduction) {
                  console.log(`Chart sent to ${guild.name} for ${activeServer.name} (value: ${chartValue})`);
                }
              } catch (chartError) {
                console.error(`Failed to send chart to ${guild.name}:`, chartError);
              }
            }
          }
        } catch (error) {
          console.error(`Error generating chart for guild ${guild.name}:`, error);
        }
      }

      if (isProduction && chartsGenerated > 0) {
        console.log(`Generated ${chartsGenerated} daily charts`);
      }

      setTimeout(async () => {
        for (const guild of client.guilds.cache.values()) {
          try {
            const guildConfig = client.guildConfigs.get(guild.id);
            if (!guildConfig?.interval?.activeServerId) continue;

            const activeServerId = guildConfig.interval.activeServerId;
            const serverDataKey = getServerDataKey(guild.id, activeServerId);
            const data = await client.maxPlayers.get(serverDataKey);
            if (!data) continue;

            data.maxPlayersToday = 0;
            await client.maxPlayers.set(serverDataKey, data);
          } catch (error) {
            console.error(`Error resetting daily data for guild ${guild.name}:`, error);
          }
        }
        if (!isProduction) {
          console.log('Reset daily player counts for new day');
        }
      }, 120000);
    } catch (error) {
      console.error('Error in daily chart generation:', error);
    }
  }

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