import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import { CustomClient } from '../types';
import { getRoleColor, hasManagementPermission } from '../utils';

type Audience = 'public' | 'management' | 'owner' | 'utility';

interface CommandInfo {
  key: string;
  name: string;
  description: string;
  usage: string;
  examples: string[];
  permissions: string;
  audience: Audience;
}

const COMMANDS: CommandInfo[] = [
  {
    key: 'status',
    name: '/status',
    description: 'Show the current status of the active monitored server.',
    usage: '/status [fresh:true]',
    examples: ['/status', '/status fresh:true'],
    permissions: 'Everyone',
    audience: 'public',
  },
  {
    key: 'players',
    name: '/players',
    description: 'Display who is currently online on the active server.',
    usage: '/players',
    examples: ['/players'],
    permissions: 'Everyone',
    audience: 'public',
  },
  {
    key: 'chart',
    name: '/chart',
    description: 'Generate the 30-day player activity chart.',
    usage: '/chart',
    examples: ['/chart'],
    permissions: 'Everyone',
    audience: 'public',
  },
  {
    key: 'manage',
    name: '/manage',
    description: 'Open the management panel to tweak servers and channels.',
    usage: '/manage',
    examples: ['/manage'],
    permissions: 'Management role or Administrator',
    audience: 'management',
  },
  {
    key: 'update',
    name: '/update',
    description: 'Force a status or chart refresh across guilds.',
    usage: '/update target:status all_guilds:true',
    examples: ['/update target:status', '/update target:chart all_guilds:true'],
    permissions: 'Bot Owner',
    audience: 'owner',
  },
  {
    key: 'maintenance',
    name: '/maintenance',
    description: 'Clean old data or fix database entries.',
    usage: '/maintenance action:cleanup-data',
    examples: ['/maintenance action:cleanup-data'],
    permissions: 'Bot Owner',
    audience: 'owner',
  },
  {
    key: 'ban',
    name: '/ban',
    description: 'Manage IP bans for malicious servers.',
    usage: '/ban action:list',
    examples: [
      '/ban action:list',
      '/ban action:add address:1.1.1.1 reason:"malicious"',
    ],
    permissions: 'Bot Owner',
    audience: 'owner',
  },
  {
    key: 'reboot',
    name: '/reboot',
    description: 'Restart the bot process (requires external supervisor).',
    usage: '/reboot',
    examples: ['/reboot'],
    permissions: 'Bot Owner',
    audience: 'owner',
  },
  {
    key: 'debug',
    name: '/debug',
    description: 'Show diagnostics about guilds, servers, and cache.',
    usage: '/debug',
    examples: ['/debug'],
    permissions: 'Bot Owner',
    audience: 'owner',
  },
  {
    key: 'help',
    name: '/help',
    description: 'Display this help center or drill into a command.',
    usage: '/help command:status',
    examples: ['/help', '/help command:manage'],
    permissions: 'Everyone',
    audience: 'utility',
  },
  {
    key: 'reportbug',
    name: '/reportbug',
    description: 'Get the GitHub link to report bugs or suggest features.',
    usage: '/reportbug',
    examples: ['/reportbug'],
    permissions: 'Everyone',
    audience: 'utility',
  },
];

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Overview of public commands and management tools')
  .addStringOption(option => {
    option
      .setName('command')
      .setDescription('Show detailed help for a specific command')
      .setRequired(false);

    COMMANDS.forEach(cmd => {
      option.addChoices({ name: cmd.name, value: cmd.key });
    });

    return option;
  });

export async function execute(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const color = getRoleColor(interaction.guild!);
  const hasManagementPerms = await hasManagementPermission(interaction, client);
  const commandKey = interaction.options.getString('command');

  const linkRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Documentation')
      .setStyle(ButtonStyle.Link)
      .setURL('https://github.com/itsneufox/open.monitor#readme'),
    new ButtonBuilder()
      .setLabel('Report a Bug')
      .setStyle(ButtonStyle.Link)
      .setURL('https://github.com/itsneufox/open.monitor/issues')
  );

  if (commandKey) {
    const command = COMMANDS.find(cmd => cmd.key === commandKey);

    if (!command) {
      await interaction.editReply({
        content:
          'That command is no longer available. Run `/help` without options to see the latest list.',
      });
      return;
    }

    const detailEmbed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`Command Help: ${command.name}`)
      .setDescription(command.description)
      .addFields(
        { name: 'Usage', value: `\`${command.usage}\``, inline: false },
        {
          name: 'Examples',
          value: command.examples.map(example => `- \`${example}\``).join('\n'),
          inline: false,
        },
        {
          name: 'Required Permissions',
          value: command.permissions,
          inline: true,
        },
        {
          name: 'Audience',
          value: formatAudience(command.audience),
          inline: true,
        }
      )
      .setFooter({ text: 'Use /help to return to the overview.' })
      .setTimestamp();

    await interaction.editReply({
      embeds: [detailEmbed],
      components: [linkRow],
    });
    return;
  }

  const publicCommands = formatCommandList('public');
  const managementCommands = formatCommandList('management');
  const utilityCommands = formatCommandList('utility');

  const quickStart =
    '1. `/manage` → Setup Server – run the guided wizard\n' +
    '2. `/status` – verify the active server\n' +
    '3. `/players` & `/chart` – share data with your community\n' +
    '4. `/manage` – adjust channels, servers, and settings';

  const mainEmbed = new EmbedBuilder()
    .setColor(color)
    .setTitle('open.monitor Help Center')
    .setDescription(
      'Your dashboard for keeping SA:MP and open.mp communities online. ' +
        'Use the sections below to find the right command quickly.'
    )
    .addFields(
      { name: 'Quick Start', value: quickStart },
      { name: 'Public Commands', value: publicCommands },
      {
        name: 'Management Commands',
        value: hasManagementPerms
          ? managementCommands
          : `${managementCommands}\n\n_Only administrators or the configured management role can run these. Ask a staff member to set up monitoring for you._`,
      },
      {
        name: 'Utility Commands',
        value: utilityCommands,
      }
    )
    .setFooter({
      text: 'Need to report a bug? Use /reportbug or the button below.',
    })
    .setTimestamp();

  await interaction.editReply({ embeds: [mainEmbed], components: [linkRow] });
}

function formatCommandList(audience: Audience): string {
  const commands = COMMANDS.filter(cmd => cmd.audience === audience);
  if (commands.length === 0) return '-';
  return commands
    .map(cmd => `- **${cmd.name}** - ${cmd.description}`)
    .join('\n');
}

function formatAudience(audience: Audience): string {
  switch (audience) {
    case 'public':
      return 'Everyone';
    case 'management':
      return 'Management role / Administrator';
    case 'owner':
      return 'Bot Owner';
    default:
      return 'Everyone';
  }
}
