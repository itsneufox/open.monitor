import { Events, TextChannel, VoiceChannel, ChannelType } from 'discord.js';
import { getChart, getStatus, getPlayerCount, getRoleColor } from '../utils';
import { CustomClient, getServerDataKey } from '../types';
import { TimezoneHelper } from '../utils/timezoneHelper';
import { SAMPRateLimitManager } from '../utils/samp/rateLimitManager';

export const name = Events.ClientReady;
export const once = true;

export async function execute(client: CustomClient): Promise<void> {
  const isProduction = process.env.LOG_LEVEL === 'production';

  console.log(`Logged in as ${client.user!.tag}`);
  client.user!.setActivity('SA:MP/omp Servers', { type: 3 });

  try {
    await SAMPRateLimitManager.initialize(client);
    console.log('Advanced rate limiting system initialized');

    if (SAMPRateLimitManager.protection) {
      SAMPRateLimitManager.protection.clearAllCooldowns();
      console.log('Cleared startup server cooldowns');
    }
  } catch (error) {
    console.warn('Failed to initialize advanced rate limiting:', error);
  }

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


  // Premium monitoring (3 minutes)
  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      try {
        const guildConfig = client.guildConfigs.get(guild.id);
        const isPremium = !!(guildConfig?.interval?.isPremium &&
          guildConfig.interval.premiumExpires &&
          guildConfig.interval.premiumExpires > Date.now());

        if (isPremium) {
          await processGuildMonitoring(guild, client, isProduction);
        }
      } catch (error) {
        console.error(`Error processing premium guild ${guild.name}:`, error);
      }
    }
  }, 180000); // 3 minutes

  // Free monitoring (10 minutes)
  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      try {
        const guildConfig = client.guildConfigs.get(guild.id);
        const isPremium = !!(guildConfig?.interval?.isPremium &&
          guildConfig.interval.premiumExpires &&
          guildConfig.interval.premiumExpires > Date.now());

        if (!isPremium) {
          await processGuildMonitoring(guild, client, isProduction);
        }
      } catch (error) {
        console.error(`Error processing free guild ${guild.name}:`, error);
      }
    }
  }, 600000); // 10 minutes

  setInterval(() => {
    try {
      const { SecurityValidator } = require('../utils/securityValidator');
      const { ServerMetadataCache } = require('../utils/serverCache');
      SecurityValidator.cleanupOldEntries();
      ServerMetadataCache.cleanup();

      if (SAMPRateLimitManager.isInitialized) {
        SAMPRateLimitManager.optimizeCache();
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }, 3600000);

  if (!isProduction) {
    setInterval(() => {
      if (SAMPRateLimitManager.isInitialized) {
        const stats = SAMPRateLimitManager.getComprehensiveStats();
        if (stats.rateLimiting.totalLimiters > 0) {
          console.log('Rate limiting statistics:', {
            backend: stats.rateLimiting.backend,
            activeServers: stats.serverProtection.totalServers,
            circuitBreakers: stats.serverProtection.activeCircuitBreakers,
            cacheHitRate: Math.round(stats.cache.hitRate * 100) + '%',
          });
        }
      }
    }, 1800000);
  }

  console.log('Bot is ready with enhanced rate limiting protection!');
}

async function processGuildMonitoring(
  guild: any,
  client: CustomClient,
  isProduction: boolean
): Promise<void> {
  const guildConfig = client.guildConfigs.get(guild.id);
  if (!guildConfig?.interval?.enabled) return;

  const { interval, servers } = guildConfig;

  // Get active servers (support both old and new format)
  let activeServerIds: string[] = [];
  if (interval.activeServerIds && interval.activeServerIds.length > 0) {
    // New format: multiple active servers
    activeServerIds = interval.activeServerIds;
  } else if (interval.activeServerId) {
    // Legacy format: single active server
    activeServerIds = [interval.activeServerId];
  }

  if (activeServerIds.length === 0) return;

  const activeServers = servers.filter(s => activeServerIds.includes(s.id));
  if (activeServers.length === 0) return;

  const { SecurityValidator } = require('../utils/securityValidator');
  const now = Date.now();
  const statusUpdateDue = now >= (interval.next || 0);
  const voiceUpdateDue = now - (interval.lastVoiceUpdate || 0) >= 600000;

  if (!statusUpdateDue && !voiceUpdateDue) return;

  // Process each active server
  const serverResults: Array<{ server: any, info: any, canQuery: any }> = [];

  for (const activeServer of activeServers) {
    const canQuery = await SecurityValidator.canQueryIP(
      activeServer.ip,
      guild.id,
      true
    );

    if (!canQuery.allowed) {
      console.log(
        `Skipping monitoring for ${activeServer.ip}: ${canQuery.reason}`
      );
      continue;
    }

    const info = await getPlayerCount(activeServer, guild.id, true);

    await SecurityValidator.recordQuerySuccess(
      activeServer.ip,
      info.isOnline ? 1000 : 5000,
      guild.id
    );

    await updateChartData(
      client,
      guild.id,
      activeServer,
      info,
      interval,
      isProduction
    );
    await updateUptimeStats(client, guild.id, activeServer, info);

    serverResults.push({ server: activeServer, info, canQuery });
  }

  // Update status channel with all servers if due
  if (statusUpdateDue && interval.statusChannel && serverResults.length > 0) {
    await updateStatusChannel(
      client,
      guild,
      interval,
      serverResults,
      isProduction
    );
    interval.next = now + 300000;
  }

  // Update voice channels with total players from all active servers
  if (voiceUpdateDue && interval.playerCountChannel && serverResults.length > 0) {
    // Calculate total players from all active servers
    const totalPlayers = serverResults.reduce((sum, { info }) => {
      return sum + (info.isOnline ? info.players : 0);
    }, 0);

    const totalMaxPlayers = serverResults.reduce((sum, { info }) => {
      return sum + (info.isOnline ? info.maxPlayers : 0);
    }, 0);

    // Create combined info object for voice channel
    const combinedInfo = {
      ...serverResults[0]!.info,
      players: totalPlayers,
      maxPlayers: totalMaxPlayers,
      isOnline: serverResults.some(({ info }) => info.isOnline)
    };

    await updateVoiceChannels(client, guild, interval, combinedInfo, isProduction);
    interval.lastVoiceUpdate = now;
  }

  await client.intervals.set(guild.id, interval);
  client.guildConfigs.set(guild.id, guildConfig);
}

async function updateChartData(
  client: CustomClient,
  guildId: string,
  activeServer: any,
  info: any,
  interval: any,
  isProduction: boolean
): Promise<void> {
  const serverDataKey = getServerDataKey(guildId, activeServer.id);

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

  const currentDayStart = TimezoneHelper.getCurrentDayPeriodStart(
    activeServer.timezone,
    activeServer.dayResetHour
  );

  const lastDayTimestamp =
    chartData.days.length > 0
      ? chartData.days[chartData.days.length - 1]?.date ?? 0
      : 0;

  if (
    TimezoneHelper.isNewDayPeriod(
      lastDayTimestamp,
      activeServer.timezone,
      activeServer.dayResetHour
    )
  ) {
    if (chartData.maxPlayersToday > 0 || chartData.days.length === 0) {
      chartData.days.push({
        value: chartData.maxPlayersToday,
        date: currentDayStart.getTime(),
        timezone: activeServer.timezone,
        dayResetHour: activeServer.dayResetHour,
      });

      // Check premium status for data retention
      const intervalConfig = await client.intervals.get(guildId);
      const isPremium = !!(intervalConfig?.isPremium &&
        intervalConfig.premiumExpires &&
        intervalConfig.premiumExpires > Date.now());

      const maxDays = isPremium ? 90 : 30;
      if (chartData.days.length > maxDays) {
        chartData.days = chartData.days.slice(-maxDays);
      }

      if (interval.chartChannel && chartData.days.length >= 2) {
        try {
          const guildObj = client.guilds.cache.get(guildId);
          if (!guildObj) return;

          const chartChannel = (await client.channels
            .fetch(interval.chartChannel)
            .catch(() => null)) as TextChannel | null;

          if (chartChannel) {
            const color = getRoleColor(guildObj);
            const isPremium = !!(intervalConfig?.isPremium &&
              intervalConfig.premiumExpires &&
              intervalConfig.premiumExpires > Date.now());
            const chart = await getChart(chartData, color, isPremium);

            if (chartData.msg) {
              try {
                const oldMessage = await chartChannel.messages.fetch(
                  chartData.msg
                );
                await oldMessage.delete();
              } catch (error: any) {
                console.log(`Could not delete old chart message: ${error.message}`);
                // Clear the invalid message ID
                delete chartData.msg;
              }
            }

            const resetTimeStr = TimezoneHelper.formatDayResetTime(
              activeServer.dayResetHour
            );
            const msg = await chartChannel.send({
              content: `**Daily Chart for ${activeServer.name}** (Day resets at ${resetTimeStr})`,
              files: [chart],
            });

            chartData.msg = msg.id;
          }
        } catch (chartError) {
          console.error(`Failed to send chart:`, chartError);
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
}

async function updateUptimeStats(
  client: CustomClient,
  guildId: string,
  activeServer: any,
  info: any
): Promise<void> {
  const serverDataKey = getServerDataKey(guildId, activeServer.id);

  let onlineStats = await client.uptimes.get(serverDataKey);
  if (!onlineStats) {
    onlineStats = { uptime: 0, downtime: 0 };
  }

  if (info.isOnline) {
    onlineStats.uptime++;
  } else {
    onlineStats.downtime++;
  }

  await client.uptimes.set(serverDataKey, onlineStats);
}

async function updateStatusChannel(
  client: CustomClient,
  guild: any,
  interval: any,
  serverResults: Array<{ server: any, info: any, canQuery: any }>,
  isProduction: boolean
): Promise<void> {
  try {
    const statusChannel = (await client.channels
      .fetch(interval.statusChannel)
      .catch(() => null)) as TextChannel | null;

    if (!statusChannel) return;

    const color = getRoleColor(guild);
    const isPremium = !!(interval.isPremium &&
      interval.premiumExpires &&
      interval.premiumExpires > Date.now());

    // Create embeds for all servers
    const embeds = [];
    for (const { server, info } of serverResults) {
      const serverEmbed = await getStatus(server, color, guild.id, true, undefined, false, isPremium);
      embeds.push(serverEmbed);
    }

    let messageUpdated = false;

    if (interval.statusMessage) {
      try {
        const existingMsg = await statusChannel.messages.fetch(
          interval.statusMessage
        );
        await existingMsg.edit({ embeds });
        if (!isProduction) {
          console.log(`Updated status message in ${guild.name} (${serverResults.length} servers)`);
        }
        messageUpdated = true;
      } catch (error: any) {
        console.log(`Failed to edit status message in ${guild.name}: ${error.message}`);
        // Clear the invalid message ID so we create a new one
        interval.statusMessage = null;
      }
    }

    if (!messageUpdated) {
      try {
        const newMsg = await statusChannel.send({ embeds });
        interval.statusMessage = newMsg.id;
        if (!isProduction) {
          console.log(`Created new status message in ${guild.name} (${serverResults.length} servers)`);
        }
      } catch (sendError) {
        console.error(`Failed to send status message:`, sendError);
      }
    }
  } catch (error) {
    console.error(`Failed to update status channel for ${guild.name}:`, error);
  }
}

async function updateVoiceChannels(
  client: CustomClient,
  guild: any,
  interval: any,
  info: any,
  isProduction: boolean
): Promise<void> {
  if (!interval.playerCountChannel) return;

  try {
    const playerCountChannel = await client.channels
      .fetch(interval.playerCountChannel)
      .catch(() => null);

    if (
      playerCountChannel &&
      playerCountChannel.type === ChannelType.GuildVoice
    ) {
      const channel = playerCountChannel as VoiceChannel;

      let newName: string;

      if (info.error && info.error.includes('rate limit')) {
        if (info.isCached) {
          newName = `Players: ${info.playerCount}/${info.maxPlayers} (cached)`;
        } else {
          newName = 'Rate Limited';
        }
      } else if (info.isOnline) {
        newName = `Players: ${info.playerCount}/${info.maxPlayers}`;
      } else {
        newName = 'Server Offline';
      }

      if (channel.name !== newName) {
        try {
          await channel.setName(newName);
          if (!isProduction) {
            console.log(
              `Updated player count channel in ${guild.name}: ${newName} (10min cycle)`
            );
          }
        } catch (error: any) {
          if (error.code === 50013) {
            console.warn(
              `Missing permissions to update voice channel in ${guild.name}`
            );
          } else if (error.code === 429) {
            console.warn(
              `Rate limited updating voice channel in ${guild.name}`
            );
          }
        }
      }
    }
  } catch (error) {
    console.error(`Failed to update voice channel for ${guild.name}:`, error);
  }
}