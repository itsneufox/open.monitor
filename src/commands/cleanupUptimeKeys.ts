import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { CustomClient } from '../types';

export const data = new SlashCommandBuilder()
  .setName('cleanupuptimekeys')
  .setDescription(
    'Find and clean up ALL uptime database keys for a guild (Owner only)'
  )
  .addStringOption(option =>
    option
      .setName('guildid')
      .setDescription('The guild ID to clean up')
      .setRequired(true)
  )
  .addBooleanOption(option =>
    option
      .setName('dryrun')
      .setDescription('Preview what will be deleted without actually deleting')
      .setRequired(false)
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
  const dryRun = interaction.options.getBoolean('dryrun') ?? true;

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

    // Get all keys from the uptimes database
    // Note: Keyv doesn't have a built-in way to list all keys
    // We need to scan for keys that start with the guild ID

    const keysToDelete: string[] = [];
    const keyDetails: Array<{ key: string; uptime: number; downtime: number }> =
      [];

    // We'll iterate through potential keys by checking current servers
    // and also check for old format keys
    const servers = (await client.servers.get(guildId)) || [];

    for (const server of servers) {
      const { getServerDataKey } = await import('../types');
      const correctKey = getServerDataKey(guildId, server.id);

      // Check if data exists with this key
      const data = await client.uptimes.get(correctKey);
      if (data) {
        keysToDelete.push(correctKey);
        keyDetails.push({
          key: correctKey,
          uptime: data.uptime || 0,
          downtime: data.downtime || 0,
        });
      }

      // Also check for potential old format keys
      // Old format might have been just server.id without guild prefix
      const oldFormatKey = server.id;
      const oldData = await client.uptimes.get(oldFormatKey);
      if (oldData) {
        keysToDelete.push(oldFormatKey);
        keyDetails.push({
          key: oldFormatKey,
          uptime: oldData.uptime || 0,
          downtime: oldData.downtime || 0,
        });
      }
    }

    if (keysToDelete.length === 0) {
      await interaction.editReply({
        content: `⚠️ No uptime keys found for guild \`${guild.name}\`.`,
      });
      return;
    }

    let deletedCount = 0;
    if (!dryRun) {
      for (const key of keysToDelete) {
        try {
          await client.uptimes.delete(key);
          deletedCount++;
        } catch (error) {
          console.error(`Error deleting key ${key}:`, error);
        }
      }
    }

    const embed = new EmbedBuilder()
      .setColor(dryRun ? 0x3498db : 0x00ff00)
      .setTitle(
        dryRun ? '🔍 Dry Run: Uptime Keys Found' : '🧹 Uptime Keys Deleted'
      )
      .setDescription(
        dryRun
          ? `Found **${keysToDelete.length}** uptime key(s) for guild **${guild.name}**.\n\nRun with \`dryrun:False\` to actually delete them.`
          : `Successfully deleted **${deletedCount}** uptime key(s) for guild **${guild.name}**.`
      )
      .setFooter({
        text: `Guild: ${guild.name} (${guildId})`,
      })
      .setTimestamp();

    // Show details of found keys (limit to first 10)
    const detailsText = keyDetails
      .slice(0, 10)
      .map(
        d =>
          `\`${d.key}\`\nUptime: ${d.uptime} | Downtime: ${d.downtime} | Total: ${d.uptime + d.downtime}`
      )
      .join('\n\n');

    if (detailsText) {
      embed.addFields({
        name: `Keys ${dryRun ? 'Found' : 'Deleted'}${keysToDelete.length > 10 ? ` (showing first 10 of ${keysToDelete.length})` : ''}`,
        value: detailsText.substring(0, 1024),
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });

    console.log(
      `[CleanupUptimeKeys] ${interaction.user.tag} ${dryRun ? 'scanned' : 'deleted'} ${keysToDelete.length} uptime keys for guild ${guild.name} (${guildId})`
    );
  } catch (error) {
    console.error('Cleanup uptime keys command error:', error);
    await interaction.editReply({
      content:
        '❌ An error occurred while cleaning up uptime keys. Check the logs for details.',
    });
  }
}
