import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { CustomClient, getServerDataKey } from '../types';
import { DatabaseCleaner } from '../utils/databaseCleaner';

export const data = new SlashCommandBuilder()
  .setName('maintenance')
  .setDescription('Database maintenance utilities (Owner only)')
  .setDefaultMemberPermissions(null) // Hidden from non-admins
  .addSubcommand(subcommand =>
    subcommand
      .setName('cleanup-data')
      .setDescription('Clean up old database data')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('cleanup-keys')
      .setDescription('Find and clean up ALL uptime database keys for a guild')
      .addStringOption(option =>
        option
          .setName('guildid')
          .setDescription('The guild ID to clean up')
          .setRequired(true)
      )
      .addBooleanOption(option =>
        option
          .setName('dryrun')
          .setDescription(
            'Preview what will be deleted without actually deleting'
          )
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('reset-uptime')
      .setDescription('Reset uptime/downtime statistics for a specific guild')
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
      )
  );

export const guildOnly = '1409643885726138380'; // Owner guild only

export async function execute(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
): Promise<void> {
  // Owner-only check
  if (interaction.user.id !== process.env.OWNER_ID) {
    await interaction.reply({
      content: '❌ This command is only available to the bot owner.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  try {
    switch (subcommand) {
      case 'cleanup-data':
        await handleCleanupData(interaction, client);
        break;
      case 'cleanup-keys':
        await handleCleanupKeys(interaction, client);
        break;
      case 'reset-uptime':
        await handleResetUptime(interaction, client);
        break;
    }
  } catch (error) {
    console.error('Maintenance command error:', error);
    await interaction.editReply(
      '❌ An error occurred during maintenance operation.'
    );
  }
}

async function handleCleanupData(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const cleaner = new DatabaseCleaner(client);
    const result = await cleaner.runPeriodicCleanup();

    const embed = new EmbedBuilder()
      .setColor(result.errors.length > 0 ? 0xff9500 : 0x00ff00)
      .setTitle('Database Cleanup Complete')
      .setDescription(result.summary)
      .addFields({
        name: 'Errors',
        value: result.errors.length.toString(),
        inline: true,
      })
      .setTimestamp();

    if (result.errors.length > 0 && result.errors.length <= 5) {
      embed.addFields({
        name: 'Error Details',
        value: result.errors.join('\n'),
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Cleanup data error:', error);
    await interaction.editReply('❌ An error occurred during data cleanup.');
  }
}

async function handleCleanupKeys(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
): Promise<void> {
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

    const keysToDelete: string[] = [];
    const keyDetails: Array<{ key: string; uptime: number; downtime: number }> =
      [];

    // Get servers and check for uptime keys
    const servers = (await client.servers.get(guildId)) || [];

    for (const server of servers) {
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
        content: `No uptime keys found for guild \`${guild.name}\`.`,
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
      .setTitle(dryRun ? 'Dry Run: Uptime Keys Found' : 'Uptime Keys Deleted')
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
      `[Maintenance] ${interaction.user.tag} ${dryRun ? 'scanned' : 'deleted'} ${keysToDelete.length} uptime keys for guild ${guild.name} (${guildId})`
    );
  } catch (error) {
    console.error('Cleanup keys error:', error);
    await interaction.editReply({
      content:
        '❌ An error occurred while cleaning up uptime keys. Check the logs for details.',
    });
  }
}

async function handleResetUptime(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
): Promise<void> {
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
        content: 'No servers found in this guild.',
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
      .setTitle('Uptime Statistics Reset')
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
        text: `Guild: ${guild.name} (${guildId}) - All servers will start tracking uptime from now.`,
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
      `[Maintenance] ${interaction.user.tag} reset uptime for ${resetCount} servers in guild ${guild.name} (${guildId})`
    );
  } catch (error) {
    console.error('Reset uptime error:', error);
    await interaction.editReply({
      content:
        '❌ An error occurred while resetting uptime statistics. Check the logs for details.',
    });
  }
}
