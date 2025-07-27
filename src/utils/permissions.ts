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
  // Always allow administrators
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  // Check if a management role is set
  const intervalConfig = await client.intervals.get(interaction.guildId!);
  if (!intervalConfig?.managementRoleId) {
    // No role set, only admins can use
    return false;
  }

  // Check if user has the management role
  const member = interaction.member;
  if (!member) {
    return false;
  }

  // Handle both GuildMember and APIInteractionGuildMember types
  if (member instanceof GuildMember) {
    return member.roles.cache.has(intervalConfig.managementRoleId);
  } else {
    // APIInteractionGuildMember - roles is a string array
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

    await interaction.reply({
      content: errorMessage,
      flags: MessageFlags.Ephemeral,
    });
  }

  return hasPermission;
}
