import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  TextChannel,
} from 'discord.js';
import { CustomClient } from '../types';
import { getChart, getRoleColor, getPlayerCount } from '../utils';
import { getServerDataKey } from '../types';

export const data = new SlashCommandBuilder()
  .setName('refreshchart')
  .setDescription('Force refresh daily chart for active server (Owner only)')
  .addStringOption(option =>
    option
      .setName('guild')
      .setDescription(
        'Guild ID to refresh chart for (leave empty for current guild)'
      )
      .setRequired(false)
  )
  .addBooleanOption(option =>
    option
      .setName('all_guilds')
      .setDescription('Refresh charts for all guilds')
      .setRequired(false)
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
): Promise<void> {
  if (interaction.user.id !== process.env.OWNER_ID) {
    await interaction.reply({
      content: '❌ This command is only available to the bot owner.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const targetGuildId = interaction.options.getString('guild');
  const allGuilds = interaction.options.getBoolean('all_guilds') || false;

  try {
    let chartsGenerated = 0;
    let errors: string[] = [];

    if (allGuilds) {
      for (const [guildId, guildConfig] of client.guildConfigs.entries()) {
        if (
          guildConfig.interval?.enabled &&
          guildConfig.interval.chartChannel &&
          guildConfig.interval.activeServerId
        ) {
          try {
            await generateChartForGuild(client, guildId, guildConfig);
            chartsGenerated++;
          } catch (error) {
            const guild = client.guilds.cache.get(guildId);
            errors.push(`${guild?.name || guildId}: ${error}`);
          }
        }
      }

      const embed = new EmbedBuilder()
        .setColor(errors.length > 0 ? 0xff9500 : 0x00ff00)
        .setTitle('🔄 Chart Refresh - All Guilds')
        .setDescription(`Generated ${chartsGenerated} chart(s)`)
        .addFields({
          name: 'Status',
          value:
            errors.length > 0
              ? `${chartsGenerated} successful, ${errors.length} errors`
              : 'All charts generated successfully',
          inline: true,
        })
        .setTimestamp();

      if (errors.length > 0 && errors.length <= 5) {
        embed.addFields({
          name: 'Errors',
          value: errors.join('\n'),
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const guildId = targetGuildId || interaction.guildId!;
    const guildConfig = client.guildConfigs.get(guildId);

    if (!guildConfig?.interval?.enabled) {
      await interaction.editReply(
        `❌ No active monitoring configured for guild ${guildId}.`
      );
      return;
    }

    if (!guildConfig.interval.chartChannel) {
      await interaction.editReply(
        `❌ No chart channel configured for guild ${guildId}.`
      );
      return;
    }

    if (!guildConfig.interval.activeServerId) {
      await interaction.editReply(
        `❌ No active server configured for guild ${guildId}.`
      );
      return;
    }

    await generateChartForGuild(client, guildId, guildConfig);

    const guild = client.guilds.cache.get(guildId);
    const activeServer = guildConfig.servers.find(
      s => s.id === guildConfig.interval!.activeServerId
    );

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('🔄 Chart Refresh Complete')
      .setDescription('Chart has been regenerated and posted')
      .addFields(
        {
          name: 'Guild',
          value: guild?.name || 'Unknown',
          inline: true,
        },
        {
          name: 'Server',
          value: activeServer?.name || 'Unknown',
          inline: true,
        },
        {
          name: 'Channel',
          value: `<#${guildConfig.interval.chartChannel}>`,
          inline: true,
        }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    console.log(
      `Chart refreshed by ${interaction.user.tag} for guild ${guild?.name || guildId}`
    );
  } catch (error) {
    console.error('Chart refresh error:', error);

    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('❌ Chart Refresh Failed')
      .setDescription('An error occurred while refreshing the chart')
      .addFields({
        name: 'Error',
        value: error instanceof Error ? error.message : 'Unknown error',
        inline: false,
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

async function generateChartForGuild(
  client: CustomClient,
  guildId: string,
  guildConfig: any
): Promise<void> {
  const { interval, servers } = guildConfig;

  if (!interval?.activeServerId) {
    throw new Error('No active server configured');
  }

  if (!interval.chartChannel) {
    throw new Error('No chart channel configured');
  }

  const activeServer = servers.find(
    (s: any) => s.id === interval.activeServerId
  );
  if (!activeServer) {
    throw new Error('Active server not found');
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    throw new Error('Guild not found');
  }

  const serverDataKey = getServerDataKey(guildId, activeServer.id);
  const data = await client.maxPlayers.get(serverDataKey);
  if (!data || !data.days || data.days.length < 2) {
    throw new Error('Insufficient chart data (need at least 2 days)');
  }

  try {
    const currentInfo = await executeWithRetry(
      () => getPlayerCount(activeServer, guildId, true),
      3,
      `chart_refresh_${guildId}`
    );

    const currentValue = currentInfo.isOnline ? currentInfo.playerCount : 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    const todayIndex = data.days.findIndex(day => {
      const dayDate = new Date(day.date);
      dayDate.setHours(0, 0, 0, 0);
      return dayDate.getTime() === todayTimestamp;
    });

    if (todayIndex !== -1) {
      data.days[todayIndex]!.value = Math.max(
        data.days[todayIndex]!.value,
        currentValue
      );
      data.days[todayIndex]!.date = Date.now();
    } else {
      data.days.push({
        value: currentValue,
        date: Date.now(),
        timezone: activeServer.timezone,
        dayResetHour: activeServer.dayResetHour,
      });
    }

    if (data.days.length > 30) {
      data.days = data.days.slice(-30);
    }

    await client.maxPlayers.set(serverDataKey, data);
    console.log(
      `Updated chart data with current player count: ${currentValue}`
    );
  } catch (error) {
    console.log(`Could not get current player count for refresh: ${error}`);
  }

  const chartChannel = (await client.channels.fetch(
    interval.chartChannel
  )) as TextChannel;
  if (!chartChannel) {
    throw new Error('Chart channel not found');
  }

  const color = getRoleColor(guild);
  const chart = await getChart(data, color);

  if (data.msg) {
    try {
      const oldMessage = await chartChannel.messages.fetch(data.msg);
      await oldMessage.delete();
      console.log(
        `Deleted old chart message for ${activeServer.name} in ${guild.name}`
      );
    } catch (error) {
      console.log(`Could not delete old chart message: ${error}`);
    }
  }

  const msg = await chartChannel.send({
    content: `**Daily Chart for ${activeServer.name}** (Refreshed)`,
    files: [chart],
  });

  data.msg = msg.id;
  await client.maxPlayers.set(serverDataKey, data);
}

async function executeWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  operationId?: string
): Promise<T> {
  let lastError: any;

  let circuitBreaker: any = null;
  try {
    const { CircuitBreaker } = await import(
      '../utils/rateLimit/circuitBreaker'
    );
    if (operationId) {
      circuitBreaker = new CircuitBreaker(operationId, {
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 300000,
      });
    }
  } catch (error) {}

  if (circuitBreaker?.isOpen()) {
    throw new Error(
      `Circuit breaker is open for ${operationId}. Retry after ${circuitBreaker.getRetryAfter()}ms`
    );
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      circuitBreaker?.recordSuccess();
      return result;
    } catch (error: any) {
      lastError = error;
      circuitBreaker?.recordFailure();

      if (error.code === 50013 || error.code === 50001) {
        throw error;
      }

      if (error.code === 429) {
        const retryAfter = error.retry_after ? error.retry_after * 1000 : 1000;
        console.warn(
          `Rate limited, waiting ${retryAfter}ms before retry ${attempt + 1}/${maxRetries}`
        );

        if (attempt < maxRetries) {
          await delay(retryAfter);
          continue;
        }
      }

      if (attempt === maxRetries) {
        break;
      }

      const baseDelay = Math.min(1000 * Math.pow(2, attempt), 30000);
      const jitter = Math.random() * 1000;
      await delay(baseDelay + jitter);
    }
  }

  throw lastError;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
