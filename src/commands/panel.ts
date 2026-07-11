import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  GuildTextBasedChannel,
} from 'discord.js';
import { CustomClient } from '../types';

export const data = new SlashCommandBuilder()
  .setName('panel')
  .setDescription(
    'Create a persistent admin control panel message (Owner only)'
  )
  .setDefaultMemberPermissions(null)
  .setDMPermission(false);

export const guildOnly = true;

export async function execute(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
): Promise<void> {
  // Owner-only check
  if (interaction.user.id !== process.env.OWNER_ID) {
    await interaction.reply({
      content: 'This command is only available to the bot owner.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const totalGuilds = client.guilds.cache.size;
  const totalServers = Array.from(client.guildConfigs.values()).reduce(
    (acc, config) => acc + config.servers.length,
    0
  );

  const embed = new EmbedBuilder()
    .setColor(0xff6b35)
    .setTitle('Owner Control Panel')
    .setDescription(
      'Bot owner controls - Use the buttons below for maintenance and management.\n\n' +
        'This panel provides quick access to all owner-only functions.'
    )
    .addFields(
      {
        name: 'Bot Operations',
        value:
          '**Update** - Force status/chart updates\n' +
          '**Maintenance** - Database cleanup\n' +
          '**Reboot** - Restart the bot',
        inline: true,
      },
      {
        name: 'Management',
        value:
          '**Ban** - Manage IP bans\n' + '**Debug** - View bot diagnostics',
        inline: true,
      }
    )
    .addFields({
      name: 'Bot Status',
      value:
        `Guilds: ${totalGuilds}\n` +
        `Total Servers: ${totalServers}\n` +
        `Uptime: <t:${Math.floor((Date.now() - process.uptime() * 1000) / 1000)}:R>`,
      inline: false,
    })
    .setFooter({ text: 'Owner-only controls' })
    .setTimestamp();

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('owner_update')
      .setLabel('Update')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('owner_maintenance')
      .setLabel('Maintenance')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('owner_ban')
      .setLabel('Ban Management')
      .setStyle(ButtonStyle.Danger)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('owner_debug')
      .setLabel('Debug')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('owner_reboot')
      .setLabel('Reboot Bot')
      .setStyle(ButtonStyle.Danger)
  );

  // Send the panel to the current channel
  await interaction.reply({
    content:
      'Owner control panel created! This message will remain interactive.',
    flags: MessageFlags.Ephemeral,
  });

  const channel = interaction.channel;
  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    await interaction.followUp({
      content: 'Please run this command from a text channel to post the panel.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const textChannel = channel as GuildTextBasedChannel;
  await textChannel.send({
    embeds: [embed],
    components: [row1, row2],
  });
}
