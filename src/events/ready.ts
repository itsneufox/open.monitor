import { Events, TextChannel, VoiceChannel, ChannelType } from 'discord.js';
import {
  getChart,
  getStatus,
  getPlayerCount,
  getRoleColor,
  InputValidator,
} from '../utils';
import { CustomClient, getServerDataKey } from '../types';

export const name = Events.ClientReady;
export const once = true;

const lastChannelUpdate = new Map<
  string,
  { time: number; count: number; online: boolean }
>();

export async function execute(client: CustomClient): Promise<void> {
  const isProduction = process.env.LOG_LEVEL === 'production';

  console.log(`Logged in as ${client.user!.tag}`);
  client.user!.setActivity('SA:MP/omp Servers', { type: 3 });

  try {
    let totalServers = 0;
    let totalGuilds = 0;
    let monitoringEnabled = 0;
    let totalPlayers = 0;
    let totalMaxPlayers = 0;
    let onlineServers = 0;
    let offlineServers = 0;
    let classicTheme = 0;
    let detailedTheme = 0;

    // Import utilities
    const { SAMPQuery } = await import('../utils/sampQuery');
    const { SecurityValidator } = await import('../utils/securityValidator');
    const sampQuery = new SAMPQuery();

    for (const guild of client.guilds.cache.values()) {
      const servers = (await client.servers.get(guild.id)) || [];
      const interval = await client.intervals.get(guild.id);

      const guildConfig = interval ? { servers, interval } : { servers };
      client.guildConfigs.set(guild.id, guildConfig);
      totalServers += servers.length;
      totalGuilds++;

      if (interval?.enabled) {
        monitoringEnabled++;
      }

      if (interval?.statusTheme === 'detailed') {
        detailedTheme++;
      } else {
        classicTheme++;
      }

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

    // Count banned servers
    const bannedServers = SecurityValidator.getBannedServersCount();

    // Get quick player count from active servers (limited to prevent slow startup)
    const playerCheckPromises: Promise<void>[] = [];
    let checkedServers = 0;
    const maxChecks = 10; // Limit initial checks to keep startup fast

    for (const guild of client.guilds.cache.values()) {
      if (checkedServers >= maxChecks) break;

      const servers = (await client.servers.get(guild.id)) || [];
      const interval = await client.intervals.get(guild.id);

      if (interval?.activeServerId && interval.enabled) {
        const activeServer = servers.find(
          s => s.id === interval.activeServerId
        );
        if (activeServer) {
          checkedServers++;
          playerCheckPromises.push(
            (async () => {
              try {
                const info = await sampQuery.getServerInfo(
                  activeServer,
                  guild.id,
                  false
                );
                if (info) {
                  totalPlayers += info.players;
                  totalMaxPlayers += info.maxplayers;
                  onlineServers++;
                } else {
                  offlineServers++;
                }
              } catch {
                offlineServers++;
              }
            })()
          );
        }
      }
    }

    // Wait for player counts with timeout
    await Promise.race([
      Promise.allSettled(playerCheckPromises),
      new Promise(resolve => setTimeout(resolve, 5000)), // 5s timeout
    ]);

    const nextCheck = (await client.maxPlayers.get('next')) as
      | number
      | undefined;
    if (!nextCheck) {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      tomorrow.setUTCHours(0, 0, 0, 0);

      await client.maxPlayers.set('next', tomorrow.getTime());
      if (!isProduction) {
        console.log(`Set next daily check to: ${tomorrow.toISOString()}`);
      }
    }

    // Check bot downtime
    const currentTime = Date.now();
    const lastBotShutdown = (await client.maxPlayers.get(
      'bot_last_shutdown'
    )) as number | undefined;
    const lastBotStartup = (await client.maxPlayers.get('bot_last_startup')) as
      | number
      | undefined;
    let botDowntimeMs = 0;
    let botDowntimeStr: string | undefined;

    if (lastBotShutdown) {
      // We have a graceful shutdown timestamp - use it (most accurate)
      botDowntimeMs = currentTime - lastBotShutdown;
      const downtimeMinutes = Math.floor(botDowntimeMs / 60000);
      const downtimeSeconds = Math.floor((botDowntimeMs % 60000) / 1000);

      if (downtimeMinutes >= 60) {
        const hours = Math.floor(downtimeMinutes / 60);
        const mins = downtimeMinutes % 60;
        botDowntimeStr = `${hours}h ${mins}m`;
      } else if (downtimeMinutes > 0) {
        botDowntimeStr = `${downtimeMinutes}m ${downtimeSeconds}s`;
      } else {
        botDowntimeStr = `${downtimeSeconds}s`;
      }

      if (!isProduction) {
        console.log(`Bot was down for: ${botDowntimeStr}`);
      }
    } else {
      // No graceful shutdown timestamp - check server monitoring data for most recent check
      let mostRecentCheckTime = 0;

      for (const guild of client.guilds.cache.values()) {
        const guildConfig = client.guildConfigs.get(guild.id);
        if (!guildConfig?.interval?.activeServerId) continue;

        const activeServerId = guildConfig.interval.activeServerId;
        const serverDataKey = getServerDataKey(guild.id, activeServerId);
        const uptimeStats = await client.uptimes.get(serverDataKey);

        if (
          uptimeStats?.lastCheckTime &&
          uptimeStats.lastCheckTime > mostRecentCheckTime
        ) {
          mostRecentCheckTime = uptimeStats.lastCheckTime;
        }
      }

      // Use the most recent check time from any server (more accurate than bot startup)
      const timestampToUse = mostRecentCheckTime || lastBotStartup;

      if (timestampToUse) {
        botDowntimeMs = currentTime - timestampToUse;
        const downtimeMinutes = Math.floor(botDowntimeMs / 60000);
        const downtimeSeconds = Math.floor((botDowntimeMs % 60000) / 1000);

        if (downtimeMinutes >= 60) {
          const hours = Math.floor(downtimeMinutes / 60);
          const mins = downtimeMinutes % 60;
          botDowntimeStr = `${hours}h ${mins}m (unexpected shutdown)`;
        } else if (downtimeMinutes > 0) {
          botDowntimeStr = `${downtimeMinutes}m ${downtimeSeconds}s (unexpected shutdown)`;
        } else if (downtimeSeconds > 30) {
          // Only show if > 30s to avoid showing quick restarts
          botDowntimeStr = `${downtimeSeconds}s (unexpected shutdown)`;
        }

        if (!isProduction) {
          const source = mostRecentCheckTime
            ? 'server monitoring data'
            : 'last startup time';
          console.log(
            `Bot was down for: ${botDowntimeStr || 'less than 30s'} (estimated from ${source})`
          );
        }
      }
    }

    // Save current startup time for next restart
    await client.maxPlayers.set('bot_last_startup', currentTime);
    // Clear shutdown timestamp after using it
    if (lastBotShutdown) {
      await client.maxPlayers.delete('bot_last_shutdown');
    }

    // Log bot startup to webhook with detailed info
    const { WebhookLogger } = await import('../utils/webhookLogger');
    const fields: Array<{ name: string; value: string; inline?: boolean }> = [
      { name: 'Discord Guilds', value: `${totalGuilds}`, inline: true },
      { name: 'Configured Servers', value: `${totalServers}`, inline: true },
      {
        name: 'Monitoring Active',
        value: `${monitoringEnabled}/${totalGuilds}`,
        inline: true,
      },
    ];

    // Add bot downtime if it exists
    if (botDowntimeStr) {
      fields.push({
        name: 'Bot Downtime',
        value: botDowntimeStr,
        inline: true,
      });
    }

    // Add player stats if we checked any servers
    if (checkedServers > 0) {
      fields.push(
        {
          name: 'Active Servers Checked',
          value: `${checkedServers} (${onlineServers} online, ${offlineServers} offline)`,
          inline: true,
        },
        {
          name: 'Total Players Online',
          value: `${totalPlayers}/${totalMaxPlayers}`,
          inline: true,
        }
      );
    }

    // Add banned servers count
    if (bannedServers > 0) {
      fields.push({
        name: 'Banned Servers',
        value: `${bannedServers}`,
        inline: true,
      });
    }

    // Add theme statistics
    fields.push({
      name: 'Theme Usage',
      value: `Classic: ${classicTheme}\nDetailed: ${detailedTheme}`,
      inline: true,
    });

    WebhookLogger.success({
      title: 'Bot Started',
      description: `${client.user!.tag} is now online and monitoring servers`,
      fields,
    });
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
        const voiceStyle = interval.voiceChannelStyle || 'text';

        if (!interval.activeServerId) continue;

        const activeServer = servers.find(
          s => s.id === interval.activeServerId
        );
        if (!activeServer) continue;

        const { SecurityValidator } = await import(
          '../utils/securityValidator'
        );
        const banStatus = SecurityValidator.isIPBanned(activeServer.ip);

        const statusUpdateDue = now >= (interval.next || 0);

        const lastVoiceUpdate = interval.lastVoiceUpdate || 0;
        const voiceUpdateDue = now - lastVoiceUpdate >= 120000;

        if (!statusUpdateDue && !voiceUpdateDue) continue;

        // If banned, update channels to show ban status then skip querying
        if (banStatus.banned) {
          console.log(
            `Updating banned server status: ${activeServer.ip} - ${banStatus.reason}`
          );

          if (statusUpdateDue && interval.statusChannel) {
            try {
              const statusChannel = (await client.channels
                .fetch(interval.statusChannel)
                .catch(() => null)) as TextChannel | null;

              if (statusChannel) {
                const color = getRoleColor(guild);
                const theme = interval.statusTheme || 'classic';
                const serverEmbed = await getStatus(
                  activeServer,
                  color,
                  guild.id,
                  true,
                  theme,
                  client
                );

                // Edit existing message or create new one
                let messageUpdated = false;

                if (interval.statusMessage) {
                  try {
                    const existingMsg = await statusChannel.messages.fetch(
                      interval.statusMessage
                    );
                    await existingMsg.edit({ embeds: [serverEmbed] });
                    if (!isProduction) {
                      console.log(
                        `Updated banned server status in ${guild.name}`
                      );
                    }
                    messageUpdated = true;
                  } catch {
                    // Message might have been deleted, create new one
                  }
                }

                if (!messageUpdated) {
                  try {
                    const newMsg = await statusChannel.send({
                      embeds: [serverEmbed],
                    });
                    interval.statusMessage = newMsg.id;
                    await client.intervals.set(guild.id, interval);
                    client.guildConfigs.set(guild.id, guildConfig);
                    if (!isProduction) {
                      console.log(
                        `Created new banned server status in ${guild.name}`
                      );
                    }
                  } catch (sendError: unknown) {
                    // Check for permission errors
                    const error = sendError as {
                      code?: number;
                      status?: number;
                    };
                    if (error?.code === 50001 || error?.status === 403) {
                      console.error(
                        `Missing permissions for status channel in ${guild.name}. Disabling monitoring.`
                      );
                      interval.enabled = false;
                      await client.intervals.set(guild.id, interval);
                      client.guildConfigs.set(guild.id, guildConfig);
                    } else {
                      console.error(
                        `Failed to send banned server status:`,
                        sendError
                      );
                    }
                  }
                }
              }
            } catch (error) {
              console.error(
                `Failed to update banned server status for ${guild.name}:`,
                error
              );
            }

            const intervalMinutes = interval.updateIntervalMinutes || 2;
            interval.next = now + intervalMinutes * 60000;
          }

          if (voiceUpdateDue && interval.playerCountChannel) {
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
                  const banReason = banStatus.reason || 'Server is banned';
                  const newName =
                    banReason.length > 90
                      ? `Banned ${banReason.substring(0, 84)}...`
                      : `Banned ${banReason}`;

                  if (channel.name !== newName) {
                    try {
                      await channel.setName(newName);

                      lastChannelUpdate.set(guild.id, {
                        time: Date.now(),
                        count: 0,
                        online: false,
                      });

                      if (!isProduction) {
                        console.log(
                          `Updated banned server voice channel in ${guild.name}: ${newName}`
                        );
                      }
                    } catch {}
                  }
                }
              },
              'high'
            );

            interval.lastVoiceUpdate = now;
          }

          // Update IP channel to hide IP when banned
          if (voiceUpdateDue && interval.serverIpChannel) {
            await client.rateLimitManager.queueChannelUpdate(
              interval.serverIpChannel,
              async () => {
                const serverIpChannel = await client.channels
                  .fetch(interval.serverIpChannel!)
                  .catch(() => null);

                if (
                  serverIpChannel &&
                  serverIpChannel.type === ChannelType.GuildVoice
                ) {
                  const channel = serverIpChannel as VoiceChannel;
                  const newName = 'Server Banned';

                  if (channel.name !== newName) {
                    try {
                      await channel.setName(newName);

                      if (!isProduction) {
                        console.log(
                          `Updated banned server IP channel in ${guild.name}: ${newName}`
                        );
                      }
                    } catch {}
                  }
                }
              },
              'low'
            );
          }

          await client.intervals.set(guild.id, interval);
          client.guildConfigs.set(guild.id, guildConfig);
          continue;
        }

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

        // Check if there was a significant gap since last check (bot was down)
        // Only count this check if the gap is reasonable (< ~3 minutes)
        const currentTime = Date.now();
        const lastCheck = onlineStats.lastCheckTime || 0;
        const timeSinceLastCheck = currentTime - lastCheck;
        const maxAcceptableGap = 180000; // ~3 minutes
        const hasExistingData =
          onlineStats.uptime > 0 || onlineStats.downtime > 0;

        // Only increment uptime/downtime if:
        // 1. This is truly the first check (no existing data) OR
        // 2. The gap since last check is reasonable (bot wasn't down)
        // Skip counting if this is existing data without lastCheckTime (first check after update)
        if (lastCheck === 0 && !hasExistingData) {
          // Brand new server - count this first check
          if (info.isOnline) {
            onlineStats.uptime++;
          } else {
            onlineStats.downtime++;
          }
        } else if (lastCheck > 0 && timeSinceLastCheck <= maxAcceptableGap) {
          // Normal check - gap is reasonable
          if (info.isOnline) {
            onlineStats.uptime++;
          } else {
            onlineStats.downtime++;
          }
        } else {
          // Bot was down for a significant period - skip counting this as server downtime
          if (!isProduction) {
            const reason =
              lastCheck === 0
                ? 'first check after bot update with existing data'
                : `bot downtime gap of ${Math.round(timeSinceLastCheck / 1000)}s`;
            console.log(
              `Skipping uptime/downtime count for ${activeServer.name} in ${guild.name} - ${reason}`
            );
          }
        }

        onlineStats.lastCheckTime = currentTime;
        await client.uptimes.set(serverDataKey, onlineStats);

        if (statusUpdateDue && interval.statusChannel) {
          try {
            const statusChannel = (await client.channels
              .fetch(interval.statusChannel)
              .catch(() => null)) as TextChannel | null;

            if (statusChannel) {
              const color = getRoleColor(guild);
              const theme = interval.statusTheme || 'classic';
              const serverEmbed = await getStatus(
                activeServer,
                color,
                guild.id,
                true,
                theme,
                client
              );

              // Edit existing message or create new one
              let messageUpdated = false;

              if (interval.statusMessage) {
                try {
                  const existingMsg = await statusChannel.messages.fetch(
                    interval.statusMessage
                  );
                  await existingMsg.edit({ embeds: [serverEmbed] });
                  if (!isProduction) {
                    console.log(
                      `Updated status message in ${guild.name} (2min cycle)`
                    );
                  }
                  messageUpdated = true;
                } catch {
                  // Message might have been deleted, create new one
                }
              }

              if (!messageUpdated) {
                try {
                  const newMsg = await statusChannel.send({
                    embeds: [serverEmbed],
                  });
                  interval.statusMessage = newMsg.id;
                  await client.intervals.set(guild.id, interval);
                  client.guildConfigs.set(guild.id, guildConfig);
                  if (!isProduction) {
                    console.log(`Created new status message in ${guild.name}`);
                  }
                } catch (sendError: unknown) {
                  // Check for permission errors
                  const error = sendError as {
                    code?: number;
                    status?: number;
                  };
                  if (error?.code === 50001 || error?.status === 403) {
                    console.error(
                      `Missing permissions for status channel in ${guild.name}. Disabling monitoring.`
                    );
                    interval.enabled = false;
                    await client.intervals.set(guild.id, interval);
                    client.guildConfigs.set(guild.id, guildConfig);
                  } else {
                    console.error(`Failed to send status message:`, sendError);
                  }
                }
              }
            }
          } catch (error) {
            console.error(
              `Failed to update status channel for ${guild.name}:`,
              error
            );
          }

          const intervalMinutes = interval.updateIntervalMinutes || 2;
          interval.next = now + intervalMinutes * 60000;
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
                let newName: string;

                if (info.isOnline) {
                  newName =
                    voiceStyle === 'emoji'
                      ? `👥 ${info.playerCount}/${info.maxPlayers}`
                      : `Players ${info.playerCount}/${info.maxPlayers}`;
                } else if (info.error) {
                  const baseError =
                    info.error.length > 90
                      ? `${info.error.substring(0, 84)}...`
                      : info.error;
                  newName = `Error ${baseError}`;
                } else {
                  newName = '❌ Server Offline';
                }

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
                        `Updated player count channel in ${guild.name}: ${newName} (2min cycle)`
                      );
                    }
                  } catch {}
                }
              }
            },
            statusChange ? 'high' : 'normal'
          );

          interval.lastVoiceUpdate = now;
        }

        if (voiceUpdateDue && interval.serverIpChannel) {
          await client.rateLimitManager.queueChannelUpdate(
            interval.serverIpChannel,
            async () => {
              const serverIpChannel = await client.channels
                .fetch(interval.serverIpChannel!)
                .catch(() => null);

              if (
                serverIpChannel &&
                serverIpChannel.type === ChannelType.GuildVoice
              ) {
                const channel = serverIpChannel as VoiceChannel;
                const desiredName =
                  voiceStyle === 'emoji'
                    ? `🔗 ${activeServer.ip}:${activeServer.port}`
                    : `IP: ${activeServer.ip}:${activeServer.port}`;
                const validation =
                  InputValidator.validateChannelName(desiredName);
                const newName =
                  validation.valid && typeof validation.sanitized === 'string'
                    ? validation.sanitized
                    : desiredName;

                if (channel.name !== newName) {
                  try {
                    await channel.setName(newName);
                    if (!isProduction) {
                      console.log(
                        `Updated server IP channel in ${guild.name}: ${newName}`
                      );
                    }
                  } catch {}
                }
              }
            },
            'low'
          );
        }

        await client.intervals.set(guild.id, interval);
        client.guildConfigs.set(guild.id, guildConfig);
      } catch (error) {
        console.error(`Error processing guild ${guild.name}:`, error);
      }
    }
  }, 120000); // 2 minutes - reduced from 1 min to avoid server-side rate limiting

  function msUntilMidnight(): number {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setUTCDate(midnight.getUTCDate() + 1);
    midnight.setUTCHours(0, 0, 0, 0);
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
              const currentInfo =
                await client.rateLimitManager.executeWithRetry(
                  () => getPlayerCount(activeServer, guild.id, true),
                  2
                );
              chartValue = currentInfo.isOnline ? currentInfo.playerCount : 0;
              if (!isProduction) {
                console.log(
                  `Using current player count for chart: ${chartValue} players`
                );
              }
            } catch {
              if (!isProduction) {
                console.log(
                  `Could not get current player count for chart, using 0`
                );
              }
              chartValue = 0;
            }
          }

          // Create UTC midnight timestamp for the current day
          const now = new Date();
          const utcMidnight = new Date(now);
          utcMidnight.setUTCHours(0, 0, 0, 0);

          const chartDataPoint = {
            value: chartValue,
            date: utcMidnight.getTime(),
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
                    const oldMessage = await chartChannel.messages.fetch(
                      data.msg
                    );
                    await oldMessage.delete();
                    if (!isProduction) {
                      console.log(
                        `Deleted old chart message for ${activeServer.name} in ${guild.name}`
                      );
                    }
                  } catch (error) {
                    if (!isProduction) {
                      console.log(
                        `Could not delete old chart message for ${activeServer.name}: ${error}`
                      );
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
                  console.log(
                    `Chart sent to ${guild.name} for ${activeServer.name} (value: ${chartValue})`
                  );
                }
              } catch (chartError: unknown) {
                // Check for permission errors
                const error = chartError as { code?: number; status?: number };
                if (error?.code === 50001 || error?.status === 403) {
                  console.error(
                    `Missing permissions for chart channel in ${guild.name}. Disabling chart generation for this guild.`
                  );
                  // Clear chart channel to prevent future attempts
                  const guildConfig = client.guildConfigs.get(guild.id);
                  if (guildConfig?.interval) {
                    delete guildConfig.interval.chartChannel;
                    await client.intervals.set(guild.id, guildConfig.interval);
                  }
                } else {
                  console.error(
                    `Failed to send chart to ${guild.name}:`,
                    chartError
                  );
                }
              }
            }
          }
        } catch (error) {
          console.error(
            `Error generating chart for guild ${guild.name}:`,
            error
          );
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
            console.error(
              `Error resetting daily data for guild ${guild.name}:`,
              error
            );
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
        ([_, stats]) => (stats as { size: number }).size > 0
      );

      if (activeQueues.length > 0) {
        console.log('Rate limit queue statistics:', activeQueues);
      }
    }, 1800000);
  }

  console.log('Bot is ready and monitoring servers!');
}
