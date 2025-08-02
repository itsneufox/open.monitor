import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { CustomClient } from '../types';

export const data = new SlashCommandBuilder()
  .setName('forceupdate')
  .setDescription('Force an immediate status update (Owner only)')
  .addStringOption(option =>
    option
      .setName('guild')
      .setDescription('Guild ID to update (leave empty for current guild)')
      .setRequired(false)
  )
  .addBooleanOption(option =>
    option
      .setName('all_guilds')
      .setDescription('Update all guilds with active monitoring')
      .setRequired(false)
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
): Promise<void> {
  if (interaction.user.id !== process.env.OWNER_ID) {
    await interaction.reply({
      content: '❌ This command is only available to the bot owner.',
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const targetGuildId = interaction.options.getString('guild');
  const allGuilds = interaction.options.getBoolean('all_guilds') || false;

  try {
    let updatedGuilds = 0;
    let errors: string[] = [];

    if (allGuilds) {
      // Force update all guilds with active monitoring
      for (const [guildId, guildConfig] of client.guildConfigs.entries()) {
        if (guildConfig.interval?.enabled && guildConfig.interval.activeServerId) {
          try {
            guildConfig.interval.next = Date.now();
            await client.intervals.set(guildId, guildConfig.interval);
            updatedGuilds++;
          } catch (error) {
            const guild = client.guilds.cache.get(guildId);
            errors.push(`${guild?.name || guildId}: ${error}`);
          }
        }
      }

      const embed = new EmbedBuilder()
        .setColor(errors.length > 0 ? 0xff9500 : 0x00ff00)
        .setTitle('🔄 Force Update - All Guilds')
        .setDescription(`Updated ${updatedGuilds} guild(s) with active monitoring`)
        .addFields({
          name: 'Status',
          value: errors.length > 0 
            ? `${updatedGuilds} successful, ${errors.length} errors`
            : 'All updates successful',
          inline: true
        })
        .setTimestamp();

      if (errors.length > 0 && errors.length <= 5) {
        embed.addFields({
          name: 'Errors',
          value: errors.join('\n'),
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Single guild update
    const guildId = targetGuildId || interaction.guildId!;
    const guildConfig = client.guildConfigs.get(guildId);
    
    if (!guildConfig?.interval?.enabled || !guildConfig.interval.activeServerId) {
      await interaction.editReply(
        `❌ No active monitoring configured for guild ${guildId}.`
      );
      return;
    }

    const activeServer = guildConfig.servers.find(
      s => s.id === guildConfig.interval!.activeServerId
    );

    if (!activeServer) {
      await interaction.editReply(
        `❌ Active server not found for guild ${guildId}.`
      );
      return;
    }

    // Force next update time to now
    guildConfig.interval.next = Date.now();
    await client.intervals.set(guildId, guildConfig.interval);
    client.guildConfigs.set(guildId, guildConfig);

    const guild = client.guilds.cache.get(guildId);
    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('🔄 Force Update Complete')
      .setDescription('Next automatic update will happen immediately')
      .addFields(
        {
          name: 'Guild',
          value: guild?.name || 'Unknown',
          inline: true
        },
        {
          name: 'Server',
          value: activeServer.name,
          inline: true
        },
        {
          name: 'Address',
          value: `${activeServer.ip}:${activeServer.port}`,
          inline: true
        }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    console.log(`Force update triggered by ${interaction.user.tag} for guild ${guild?.name || guildId}`);

  } catch (error) {
    console.error('Force update error:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('❌ Force Update Failed')
      .setDescription('An error occurred while forcing the update')
      .addFields({
        name: 'Error',
        value: error instanceof Error ? error.message : 'Unknown error',
        inline: false
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}