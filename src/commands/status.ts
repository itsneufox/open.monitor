import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { CustomClient, ServerConfig } from '../types';
import { InputValidator } from '../utils/inputValidator';
import { getStatus, getRoleColor } from '../utils';
import { getGuildServers } from '../utils/databaseReliability';

export const data = new SlashCommandBuilder()
  .setName('status')
  .setDescription('Show the current status of a monitored server')
  .setDMPermission(false)
  .addBooleanOption(option =>
    option
      .setName('fresh')
      .setDescription('Request a fresh query (limited to prevent spam)')
      .setRequired(false)
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
): Promise<void> {
  await interaction.deferReply();

  const fresh = interaction.options.getBoolean('fresh') ?? false;
  if (fresh) {
    const rateLimit = InputValidator.checkCommandRateLimit(
      interaction.user.id,
      'status-fresh',
      2
    );

    if (!rateLimit.allowed) {
      await interaction.editReply(
        `❌ Fresh status requests are rate limited. Please wait ${Math.ceil((rateLimit.remainingTime || 0) / 1000)} seconds.\n\nUse \`/status\` without \`fresh:true\` for quick checks.`
      );
      return;
    }
  }

  const guildId = interaction.guildId!;
  const servers = await getGuildServers(client, guildId);

  if (servers.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xff6b6b)
      .setTitle('No Servers Configured')
      .setDescription('Monitoring has not been set up in this server yet.')
      .addFields({
        name: 'Next Steps',
        value:
          '- Open `/manage` and select **Setup Server** to run the wizard\n' +
          '- Complete the prompts to configure your first server',
      })
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const intervalConfig = await client.intervals.get(guildId);
  const targetServer = resolveServer(servers, intervalConfig?.activeServerId);

  if (!targetServer) {
    const message =
      servers.length === 1
        ? '❌ Unable to determine the active server. Ask an admin to open `/manage`, run **Setup Server**, and finish the wizard.'
        : '❌ No active server is set. Ask an admin to open `/manage`, choose Manage Servers, and activate one.';
    await interaction.editReply(message);
    return;
  }

  try {
    const color = getRoleColor(interaction.guild!);
    const theme = intervalConfig?.statusTheme || 'classic';
    const embed = await getStatus(
      targetServer,
      color,
      guildId,
      fresh,
      theme,
      client
    );

    if (targetServer.name !== `${targetServer.ip}:${targetServer.port}`) {
      const currentTitle = embed.data.title || 'Server Status';
      embed.setTitle(`${currentTitle} - ${targetServer.name}`);
    }

    const footerBase = embed.data.footer?.text || 'Last update';
    embed.setFooter({
      text: fresh
        ? `Fresh data requested - ${footerBase}`
        : `Cached data (use fresh:true for new query) - ${footerBase}`,
    });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error fetching status:', error);
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('Unable to Retrieve Status')
      .setDescription(
        `Failed to get data for **${targetServer.name}** (${targetServer.ip}:${targetServer.port}). The server may be offline or blocking queries.`
      )
      .setTimestamp();
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

function resolveServer(
  servers: ServerConfig[],
  activeServerId: string | undefined
): ServerConfig | undefined {
  if (activeServerId) {
    return servers.find(server => server.id === activeServerId);
  }

  if (servers.length === 1) {
    return servers[0];
  }

  return undefined;
}
