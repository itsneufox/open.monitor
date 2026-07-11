import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { CustomClient } from '../types';

export const data = new SlashCommandBuilder()
  .setName('reboot')
  .setDescription('Restart the bot (Owner only)')
  .setDefaultMemberPermissions(null); // Hidden from non-admins

export const guildOnly = true;

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

  const embed = new EmbedBuilder()
    .setColor(0xff9500)
    .setTitle('Bot Restarting...')
    .setDescription(
      'The bot is shutting down and will restart automatically.\n\n' +
        '**Note:** The bot must be running under a process manager (PM2, Docker, systemd, etc.) to restart automatically.'
    )
    .addFields(
      {
        name: 'Initiated By',
        value: `<@${interaction.user.id}>`,
        inline: true,
      },
      {
        name: 'Uptime Before Restart',
        value: `<t:${Math.floor((Date.now() - process.uptime() * 1000) / 1000)}:R>`,
        inline: true,
      }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

  console.log(
    `[Reboot] Bot restart initiated by ${interaction.user.tag} (${interaction.user.id})`
  );

  // Log to webhook if available
  try {
    const { WebhookLogger } = await import('../utils/webhookLogger');
    await WebhookLogger.warning({
      title: 'Bot Restarting',
      description: 'Bot shutdown initiated for restart',
      fields: [
        {
          name: 'Initiated By',
          value: `${interaction.user.tag} (<@${interaction.user.id}>)`,
          inline: true,
        },
        {
          name: 'Uptime',
          value: `${Math.floor(process.uptime() / 60)} minutes`,
          inline: true,
        },
      ],
    });
  } catch (error) {
    console.error('Failed to log reboot to webhook:', error);
  }

  // Give time for the message to send and webhook to log
  setTimeout(() => {
    console.log('[Reboot] Shutting down bot process...');
    client.destroy();
    process.exit(0);
  }, 2000);
}
