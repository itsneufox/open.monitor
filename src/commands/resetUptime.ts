import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { CustomClient, getServerDataKey } from '../types';

export const data = new SlashCommandBuilder()
  .setName('resetuptime')
  .setDescription(
    'Reset uptime/downtime statistics for a specific guild (Owner only)'
  )
  .addStringOption(option =>
    option
      .setName('guildid')
      .setDescription('The guild ID to reset uptime data for')
      .setRequired(true)
  )
  .addBooleanOption(option =>
    option
      .setName('confirm')
      .setDescription('Confirm you want to reset all uptime data')
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

  const guildId = interaction.options.getString('guildid', true);
  const confirm = interaction.options.getBoolean('confirm', true);

  if (!confirm) {
    await interaction.reply({
      content:
        '❌ You must set `confirm` to `True` to reset uptime statistics.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    // Verify guild exists
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      await interaction.editReply({
        content: `❌ Guild not found with ID: \`${guildId}\`\n\nMake sure the bot is in that guild.`,
      });
      return;
    }

    const servers = (await client.servers.get(guildId)) || [];

    if (servers.length === 0) {
      await interaction.editReply({
        content: '⚠️ No servers found in this guild.',
      });
      return;
    }

    let resetCount = 0;
    const errors: string[] = [];

    for (const server of servers) {
      try {
        const serverDataKey = getServerDataKey(guildId, server.id);

        // Reset uptime stats
        await client.uptimes.set(serverDataKey, {
          uptime: 0,
          downtime: 0,
          lastCheckTime: Date.now(),
        });

        resetCount++;
      } catch (error) {
        errors.push(`Failed to reset ${server.name}: ${error}`);
        console.error(`Error resetting uptime for ${server.name}:`, error);
      }
    }

    const embed = new EmbedBuilder()
      .setColor(errors.length > 0 ? 0xff9500 : 0x00ff00)
      .setTitle('🔄 Uptime Statistics Reset')
      .setDescription(
        `Successfully reset uptime statistics for **${resetCount}** server${resetCount !== 1 ? 's' : ''}.`
      )
      .addFields(
        {
          name: 'Total Servers',
          value: servers.length.toString(),
          inline: true,
        },
        {
          name: 'Successfully Reset',
          value: resetCount.toString(),
          inline: true,
        },
        {
          name: 'Errors',
          value: errors.length.toString(),
          inline: true,
        }
      )
      .setFooter({
        text: `Guild: ${guild.name} (${guildId}) • All servers will start tracking uptime from now.`,
      })
      .setTimestamp();

    if (errors.length > 0 && errors.length <= 5) {
      embed.addFields({
        name: 'Error Details',
        value: errors.join('\n').substring(0, 1024),
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });

    console.log(
      `[ResetUptime] ${interaction.user.tag} reset uptime for ${resetCount} servers in guild ${guild.name} (${guildId})`
    );
  } catch (error) {
    console.error('Reset uptime command error:', error);
    await interaction.editReply({
      content:
        '❌ An error occurred while resetting uptime statistics. Check the logs for details.',
    });
  }
}
