import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { CustomClient } from '../types';

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

  const role = interaction.options.getRole('role', true);

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
          'Everyone can still use:\n• `/chart` - View player charts\n• `/server status` - Check server status',
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

  await interaction.editReply({ embeds: [embed] });
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
