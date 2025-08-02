import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { CustomClient } from '../types';
import { DatabaseCleaner } from '../utils/databaseCleaner';

export const data = new SlashCommandBuilder()
  .setName('cleanup')
  .setDescription('Clean up old database data (Owner only)');

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

  try {
    const cleaner = new DatabaseCleaner(client);
    const result = await cleaner.runPeriodicCleanup();
    
    const embed = new EmbedBuilder()
      .setColor(result.errors.length > 0 ? 0xff9500 : 0x00ff00)
      .setTitle('🧹 Database Cleanup Complete')
      .setDescription(result.summary)
      .addFields({
        name: 'Errors',
        value: result.errors.length.toString(),
        inline: true
      })
      .setTimestamp();

    if (result.errors.length > 0 && result.errors.length <= 5) {
      embed.addFields({
        name: 'Error Details',
        value: result.errors.join('\n'),
        inline: false
      });
    }

    await interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    console.error('Cleanup command error:', error);
    await interaction.editReply('❌ An error occurred during cleanup.');
  }
}