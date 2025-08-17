import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  MessageFlags,
  GuildMember,
} from 'discord.js';
import { CustomClient } from '../types';

export async function hasManagementPermission(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
): Promise<boolean> {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  const intervalConfig = await client.intervals.get(interaction.guildId!);
  if (!intervalConfig?.managementRoleId) {
    return false;
  }

  const member = interaction.member;
  if (!member) {
    return false;
  }

  if (member instanceof GuildMember) {
    return member.roles.cache.has(intervalConfig.managementRoleId);
  } else {
    return member.roles.includes(intervalConfig.managementRoleId);
  }
}

export async function checkPermissionOrReply(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
): Promise<boolean> {
  const hasPermission = await hasManagementPermission(interaction, client);

  if (!hasPermission) {
    const intervalConfig = await client.intervals.get(interaction.guildId!);

    let errorMessage = '❌ **Insufficient Permissions**\n\n';

    if (!intervalConfig?.managementRoleId) {
      errorMessage +=
        'Only server administrators can use this command.\n\nAn admin can use `/role set` to allow a specific role to manage the bot.';
    } else {
      const role = interaction.guild!.roles.cache.get(
        intervalConfig.managementRoleId
      );
      errorMessage += `You need one of the following to use this command:\n• Administrator permission\n• ${role ? role.toString() : 'The configured management role'}`;
    }

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'message',
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  return hasPermission;
}
