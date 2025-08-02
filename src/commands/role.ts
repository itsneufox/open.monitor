import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { CustomClient } from '../types';
import { InputValidator } from '../utils/inputValidator';

export const data = new SlashCommandBuilder()
  .setName('role')
  .setDescription('Manage bot permissions and roles')
  .addSubcommand(subcommand =>
    subcommand
      .setName('set')
      .setDescription('Set the role that can manage server monitoring')
      .addRoleOption(option =>
        option
          .setName('role')
          .setDescription('Role that can manage server settings')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('remove')
      .setDescription('Remove role requirement (Admin-only access)')
  )
  .addSubcommand(subcommand =>
    subcommand.setName('show').setDescription('Show current role configuration')
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'set':
      await handleSetRole(interaction, client);
      break;
    case 'remove':
      await handleRemoveRole(interaction, client);
      break;
    case 'show':
      await handleShowRole(interaction, client);
      break;
  }
}

async function handleSetRole(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
) {
  await interaction.deferReply();

  // Rate limiting
  const rateLimitCheck = InputValidator.checkCommandRateLimit(
    interaction.user.id, 
    'role-set', 
    3 // Max 3 role changes per minute
  );

  if (!rateLimitCheck.allowed) {
    await interaction.editReply(
      `❌ Please wait ${Math.ceil((rateLimitCheck.remainingTime || 0) / 1000)} seconds before changing roles again.`
    );
    return;
  }

  const roleOption = interaction.options.getRole('role', true);
  
  // Ensure we have a proper Role object, not APIRole
  const role = interaction.guild!.roles.cache.get(roleOption.id);
  if (!role) {
    await interaction.editReply('❌ Role not found in this server.');
    return;
  }

  // Validate role ID
  const roleValidation = InputValidator.validateDiscordId(role.id, 'role');
  if (!roleValidation.valid) {
    await interaction.editReply(`❌ Invalid role: ${roleValidation.error}`);
    return;
  }

  // Validate guild ID
  const guildValidation = InputValidator.validateDiscordId(interaction.guildId!, 'guild');
  if (!guildValidation.valid) {
    await interaction.editReply(`❌ Invalid guild context: ${guildValidation.error}`);
    return;
  }

  // Prevent setting @everyone or dangerous roles
  if (role.id === interaction.guildId || role.name === '@everyone') {
    await interaction.editReply('❌ Cannot set @everyone as management role for security reasons.');
    return;
  }

  // Check for managed roles (bots, integrations)
  if (role.managed) {
    await interaction.editReply('❌ Cannot set managed roles (bot roles, integration roles) as management role.');
    return;
  }

  // Check role position relative to bot's highest role
  const botMember = interaction.guild!.members.cache.get(client.user!.id);
  if (botMember) {
    const botHighestRole = botMember.roles.highest;
    if (role.position >= botHighestRole.position) {
      await interaction.editReply(
        '❌ Cannot set a role that is higher than or equal to my highest role. Please move my role higher in the role hierarchy.'
      );
      return;
    }
  }

  // Type guard to ensure we have PermissionsBitField
  const rolePermissions = role.permissions;
  if (typeof rolePermissions === 'string') {
    await interaction.editReply('❌ Unable to check role permissions. Please try again.');
    return;
  }

  // Warn about administrator permissions
  if (rolePermissions.has('Administrator')) {
    await interaction.editReply(
      '⚠️ **Warning:** This role has Administrator permissions.\n\n' +
      'Consider using a role with limited permissions for bot management instead.\n' +
      'Users with this role will have full access to all bot commands.\n\n' +
      'Continue anyway? React with ✅ to confirm or ❌ to cancel.'
    );

    try {
      const message = await interaction.fetchReply();
      await message.react('✅');
      await message.react('❌');

      const filter = (reaction: any, user: any) => {
        return ['✅', '❌'].includes(reaction.emoji.name) && user.id === interaction.user.id;
      };

      const collected = await message.awaitReactions({
        filter,
        max: 1,
        time: 30000,
        errors: ['time']
      });

      const reaction = collected.first();
      if (reaction?.emoji.name === '❌') {
        await interaction.editReply('❌ Role setup cancelled.');
        return;
      }
    } catch (error) {
      await interaction.editReply('❌ Role setup timed out. Please try again.');
      return;
    }
  }

  // Check for dangerous permissions
  const dangerousPermissions = [
    'ManageGuild',
    'ManageRoles', 
    'ManageChannels',
    'BanMembers',
    'KickMembers',
    'ManageMessages',
    'MentionEveryone'
  ] as const;

  const hasDangerousPerms = dangerousPermissions.some(perm => 
    rolePermissions.has(perm)
  );

  if (hasDangerousPerms && !rolePermissions.has('Administrator')) {
    const foundPerms = dangerousPermissions.filter(perm => 
      rolePermissions.has(perm)
    );
    
    await interaction.editReply(
      `⚠️ **Warning:** This role has potentially dangerous permissions:\n` +
      `${foundPerms.map(p => `• ${p}`).join('\n')}\n\n` +
      'Users with this role will be able to manage bot settings and may have elevated server permissions.\n' +
      'Consider creating a dedicated role with minimal permissions for bot management.'
    );
  }

  // Get or create interval config
  let intervalConfig = await client.intervals.get(interaction.guildId!);
  if (!intervalConfig) {
    intervalConfig = {
      enabled: false,
      next: Date.now(),
      statusMessage: null,
      managementRoleId: role.id,
    };
  } else {
    intervalConfig.managementRoleId = role.id;
  }

  // Validate the complete configuration
  const configValidation = InputValidator.validateGuildConfig(interaction.guildId!, intervalConfig);
  if (!configValidation.valid) {
    await interaction.editReply(
      `❌ Configuration validation failed:\n${configValidation.errors.join('\n')}`
    );
    return;
  }

  await client.intervals.set(interaction.guildId!, intervalConfig);

  // Update cache
  let guildConfig = client.guildConfigs.get(interaction.guildId!) || {
    servers: [],
  };
  guildConfig.interval = intervalConfig;
  client.guildConfigs.set(interaction.guildId!, guildConfig);

  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle('✅ Management Role Set')
    .setDescription(
      `Members with the **${role.name}** role can now manage server monitoring settings.`
    )
    .addFields(
      {
        name: 'Permissions Granted',
        value:
          'Users with this role can:\n• Add/remove servers (`/server`)\n• Configure monitoring (`/monitor`)\n• Force updates (`/forceupdate`)',
        inline: false,
      },
      {
        name: 'Public Commands',
        value:
          'Everyone can still use:\n• `/chart` - View player charts\n• `/server status` - Check server status\n• `/players` - View online players',
        inline: false,
      },
      {
        name: 'Admin Override',
        value:
          'Server administrators always have full access regardless of role settings.',
        inline: false,
      }
    )
    .setTimestamp();

  // Add role information - with safe property access
  const memberCount = role.members?.size ?? 0;
  const roleColor = role.hexColor ?? '#000000';
  
  embed.addFields(
    {
      name: 'Role Information',
      value: 
        `**Name:** ${role.name}\n` +
        `**ID:** \`${role.id}\`\n` +
        `**Members:** ${memberCount}\n` +
        `**Color:** ${roleColor}`,
      inline: true,
    },
    {
      name: 'Security Features',
      value:
        '• Role validation and permission checks\n• Rate limiting on role changes\n• Protection against dangerous role assignments',
      inline: true,
    }
  );

  await interaction.editReply({ embeds: [embed] });

  // Log successful role set
  console.log(`✅ Management role set to ${role.name} (${role.id}) by ${interaction.user.tag} in guild ${interaction.guild?.name}`);
}

async function handleRemoveRole(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
) {
  await interaction.deferReply();

  let intervalConfig = await client.intervals.get(interaction.guildId!);
  if (!intervalConfig || !intervalConfig.managementRoleId) {
    await interaction.editReply(
      'No management role is currently set. Only administrators can manage settings.'
    );
    return;
  }

  const roleName =
    interaction.guild!.roles.cache.get(intervalConfig.managementRoleId)?.name ||
    'Unknown Role';

  // Remove the managementRoleId property completely
  delete intervalConfig.managementRoleId;

  await client.intervals.set(interaction.guildId!, intervalConfig);

  // Update cache
  let guildConfig = client.guildConfigs.get(interaction.guildId!) || {
    servers: [],
  };
  guildConfig.interval = intervalConfig;
  client.guildConfigs.set(interaction.guildId!, guildConfig);

  const embed = new EmbedBuilder()
    .setColor(0xff6b6b)
    .setTitle('Management Role Removed')
    .setDescription(
      `The **${roleName}** role no longer has bot management permissions.`
    )
    .addFields(
      {
        name: 'Current Access',
        value: 'Only server administrators can now manage bot settings.',
        inline: false,
      },
      {
        name: 'Re-enable Role Access',
        value:
          'Use `/role set` if you want to grant permissions to a role again.',
        inline: false,
      }
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleShowRole(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
) {
  await interaction.deferReply();

  const intervalConfig = await client.intervals.get(interaction.guildId!);

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('Role Configuration')
    .setTimestamp();

  if (!intervalConfig?.managementRoleId) {
    embed.setDescription('**Admin-only access**').addFields(
      {
        name: 'Current Access',
        value: 'Only server administrators can manage bot settings.',
        inline: false,
      },
      {
        name: 'Public Access',
        value:
          'Everyone can use `/chart` and `/server status` to view server information.',
        inline: false,
      },
      {
        name: 'Add Role Access',
        value:
          'Use `/role set @YourRole` to allow a specific role to manage settings.',
        inline: false,
      }
    );
  } else {
    const role = interaction.guild!.roles.cache.get(
      intervalConfig.managementRoleId
    );

    embed
      .setDescription(
        `**Management role:** ${role ? role.toString() : '⚠️ Role not found (may have been deleted)'}`
      )
      .addFields(
        {
          name: 'Who Can Manage',
          value: `• Server administrators\n• Members with ${role ? role.toString() : 'the configured role (missing)'}`,
          inline: false,
        },
        {
          name: 'Management Commands',
          value:
            '• `/server` - Server management\n• `/monitor` - Monitoring setup\n• `/forceupdate` - Force updates',
          inline: false,
        },
        {
          name: 'Public Commands',
          value:
            '• `/chart` - View charts (everyone)\n• `/server status` - Check status (everyone)',
          inline: false,
        }
      );
  }

  await interaction.editReply({ embeds: [embed] });
}
