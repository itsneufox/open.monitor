import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { CustomClient, getServerDataKey } from '../types';

export const data = new SlashCommandBuilder()
  .setName('uptimestats')
  .setDescription('View raw uptime statistics for a server (Owner only)')
  .addStringOption(option =>
    option
      .setName('server')
      .setDescription('Server name or IP:port')
      .setRequired(true)
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
): Promise<void> {
  // Check if user is bot owner
  if (interaction.user.id !== process.env.OWNER_ID) {
    await interaction.reply({
      content: '❌ This command is only available to the bot owner.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const serverInput = interaction.options.getString('server', true);
    const servers = (await client.servers.get(interaction.guildId!)) || [];

    // Find server by name or IP:port
    const server = servers.find(
      s =>
        s.name.toLowerCase().includes(serverInput.toLowerCase()) ||
        `${s.ip}:${s.port}` === serverInput
    );

    if (!server) {
      await interaction.editReply({
        content: `❌ Server not found. Try using the exact name or IP:port format.`,
      });
      return;
    }

    const serverDataKey = getServerDataKey(interaction.guildId!, server.id);
    const uptimeStats = await client.uptimes.get(serverDataKey);

    if (!uptimeStats) {
      await interaction.editReply({
        content: `⚠️ No uptime data found for **${server.name}**.`,
      });
      return;
    }

    const totalChecks = uptimeStats.uptime + uptimeStats.downtime;
    const percentage =
      totalChecks > 0 ? (uptimeStats.uptime / totalChecks) * 100 : 0;

    const lastCheckDate = uptimeStats.lastCheckTime
      ? new Date(uptimeStats.lastCheckTime)
      : null;
    const timeSinceLastCheck = uptimeStats.lastCheckTime
      ? Date.now() - uptimeStats.lastCheckTime
      : null;

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(`📊 Uptime Statistics: ${server.name}`)
      .setDescription(`\`${server.ip}:${server.port}\``)
      .addFields(
        {
          name: '✅ Uptime Checks',
          value: uptimeStats.uptime.toString(),
          inline: true,
        },
        {
          name: '❌ Downtime Checks',
          value: uptimeStats.downtime.toString(),
          inline: true,
        },
        {
          name: '📈 Total Checks',
          value: totalChecks.toString(),
          inline: true,
        },
        {
          name: '📊 Uptime Percentage',
          value: `${percentage.toFixed(2)}%`,
          inline: true,
        },
        {
          name: '⏱️ Monitoring Duration',
          value: `~${Math.floor(totalChecks / 60)} hours (${totalChecks} minutes)`,
          inline: true,
        },
        {
          name: '🔍 Server Data Key',
          value: `\`${serverDataKey}\``,
          inline: false,
        }
      )
      .setTimestamp();

    if (lastCheckDate) {
      const minutesAgo = timeSinceLastCheck
        ? Math.floor(timeSinceLastCheck / 60000)
        : 0;
      embed.addFields({
        name: '🕐 Last Check',
        value: `<t:${Math.floor(lastCheckDate.getTime() / 1000)}:R> (${minutesAgo} minute${minutesAgo !== 1 ? 's' : ''} ago)`,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Uptime stats command error:', error);
    await interaction.editReply({
      content: '❌ An error occurred while fetching uptime statistics.',
    });
  }
}
