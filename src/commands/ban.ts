import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { CustomClient } from '../types';

interface BannedIP {
  ip: string;
  reason: string;
  failures: number;
  bannedAt: number;
}

export const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Manage IP address bans (Owner only)')
  .addSubcommand(subcommand =>
    subcommand
      .setName('ip')
      .setDescription('Ban a specific IP address')
      .addStringOption(option =>
        option
          .setName('address')
          .setDescription('IP address to ban')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('reason')
          .setDescription('Reason for banning')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('unban')
      .setDescription('Unban a specific IP address')
      .addStringOption(option =>
        option
          .setName('address')
          .setDescription('IP address to unban')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('List all banned IP addresses')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('clear')
      .setDescription('Clear all banned IP addresses')
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
): Promise<void> {
  if (interaction.user.id !== process.env.OWNER_ID) {
    await interaction.reply({
      content: 'This command is only available to the bot owner.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'ip':
      await handleBanIP(interaction);
      break;
    case 'unban':
      await handleUnbanIP(interaction);
      break;
    case 'list':
      await handleListBanned(interaction);
      break;
    case 'clear':
      await handleClearBanned(interaction);
      break;
  }
}

async function handleBanIP(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const ipAddress = interaction.options.getString('address', true);
  const reason = interaction.options.getString('reason') || 'Manually banned by owner';

  try {
    const { SecurityValidator } = require('../utils/securityValidator');
    const result = SecurityValidator.banIP(ipAddress, reason);

    const embed = new EmbedBuilder()
      .setColor(result.success ? 0xff6b6b : 0xff9500)
      .setTitle(result.success ? 'IP Banned' : 'Ban Failed')
      .addFields({
        name: 'IP Address',
        value: `\`${ipAddress}\``,
        inline: true,
      })
      .setTimestamp();

    if (result.success) {
      embed.addFields(
        {
          name: 'Status',
          value: 'IP has been banned and will not be queried',
          inline: false,
        },
        {
          name: 'Reason',
          value: reason,
          inline: false,
        }
      );
    } else {
      embed.addFields({
        name: 'Error',
        value: result.error || 'IP is already banned',
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply('Error accessing security validator.');
  }
}

async function handleUnbanIP(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const ipAddress = interaction.options.getString('address', true);

  try {
    const { SecurityValidator } = require('../utils/securityValidator');
    const result = SecurityValidator.unbanIP(ipAddress);

    const embed = new EmbedBuilder()
      .setColor(result.success ? 0x00ff00 : 0xff6b6b)
      .setTitle(result.success ? 'IP Unbanned' : 'Unban Failed')
      .addFields({
        name: 'IP Address',
        value: `\`${ipAddress}\``,
        inline: true,
      })
      .setTimestamp();

    if (result.success) {
      embed.addFields(
        {
          name: 'Status',
          value: 'IP has been unbanned and can be queried again',
          inline: false,
        },
        {
          name: 'Previous Ban Reason',
          value: result.previousReason || 'Unknown',
          inline: false,
        }
      );
    } else {
      embed.addFields({
        name: 'Error',
        value: result.error || 'IP was not banned',
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply('Error accessing security validator.');
  }
}

async function handleListBanned(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const { SecurityValidator } = require('../utils/securityValidator');
    const bannedIPs: BannedIP[] = SecurityValidator.getBannedIPs();

    const embed = new EmbedBuilder()
      .setColor(bannedIPs.length > 0 ? 0xff6b6b : 0x00ff00)
      .setTitle(`Banned IP Addresses (${bannedIPs.length})`)
      .setTimestamp();

    if (bannedIPs.length === 0) {
      embed.setDescription('No IP addresses are currently banned.');
    } else {
      const bannedList = bannedIPs
        .map((ban: BannedIP) => {
          const timeSinceBan = Math.floor((Date.now() - ban.bannedAt) / 1000 / 60);
          return `**${ban.ip}**\nReason: ${ban.reason}\nBanned: ${timeSinceBan}m ago\nFailures: ${ban.failures}`;
        })
        .join('\n\n');

      if (bannedList.length > 4096) {
        embed.setDescription(`Too many banned IPs to display. Total: ${bannedIPs.length}`);
        embed.addFields({
          name: 'Recent Bans',
          value: bannedIPs.slice(0, 5).map((ban: BannedIP) => `${ban.ip} - ${ban.reason}`).join('\n'),
          inline: false,
        });
      } else {
        embed.setDescription(bannedList);
      }
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply('Error fetching banned IP list.');
  }
}

async function handleClearBanned(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const { SecurityValidator } = require('../utils/securityValidator');
    const count = SecurityValidator.clearAllBans();

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('All Bans Cleared')
      .setDescription(`Unbanned ${count} IP address${count === 1 ? '' : 'es'}`)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply('Error clearing banned IPs.');
  }
}