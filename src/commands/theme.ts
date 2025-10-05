import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { CustomClient } from '../types';
import { checkPermissionOrReply } from '../utils/permissions';

export const data = new SlashCommandBuilder()
  .setName('theme')
  .setDescription('Configure server status display theme')
  .addSubcommand(subcommand =>
    subcommand
      .setName('set')
      .setDescription('Set the status display theme')
      .addStringOption(option =>
        option
          .setName('style')
          .setDescription('Choose a theme style')
          .setRequired(true)
          .addChoices(
            { name: 'Classic - Basic server info only', value: 'classic' },
            {
              name: 'Detailed - Server info with player list',
              value: 'detailed',
            }
          )
      )
  )
  .addSubcommand(subcommand =>
    subcommand.setName('current').setDescription('Show current theme setting')
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'set') {
    if (!(await checkPermissionOrReply(interaction, client))) {
      return;
    }
  }

  switch (subcommand) {
    case 'set':
      await handleSet(interaction, client);
      break;
    case 'current':
      await handleCurrent(interaction, client);
      break;
  }
}

async function handleSet(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
) {
  await interaction.deferReply();

  const style = interaction.options.getString('style', true) as
    | 'classic'
    | 'detailed';

  let intervalConfig = await client.intervals.get(interaction.guildId!);

  if (!intervalConfig) {
    intervalConfig = {
      enabled: false,
      next: Date.now(),
      statusMessage: null,
      statusTheme: style,
    };
  } else {
    intervalConfig.statusTheme = style;
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
    .setTitle('✅ Theme Updated')
    .setDescription(`Status display theme has been set to **${style}**`)
    .addFields(
      {
        name: 'Classic Theme',
        value:
          '• Shows basic server information\n' +
          '• Players count, gamemode, version\n' +
          '• Compact and clean display',
        inline: true,
      },
      {
        name: 'Detailed Theme',
        value:
          '• All classic theme info\n' +
          '• **Plus player list with names & scores**\n' +
          '• More comprehensive view',
        inline: true,
      }
    )
    .addFields({
      name: 'Current Setting',
      value: `**${style === 'classic' ? '📋 Classic' : '📊 Detailed'}** theme is now active`,
      inline: false,
    })
    .setTimestamp();

  if (style === 'detailed') {
    embed.addFields({
      name: '💡 Note',
      value:
        'Player list will only show when:\n' +
        '• Server has 1-100 players online\n' +
        '• Player data is available from the server',
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });

  console.log(
    `✅ Theme set to ${style} for guild ${interaction.guild?.name} by ${interaction.user.tag}`
  );
}

async function handleCurrent(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
) {
  await interaction.deferReply();

  const intervalConfig = await client.intervals.get(interaction.guildId!);
  const currentTheme = intervalConfig?.statusTheme || 'classic';

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('Current Theme Setting')
    .setDescription(
      `Your server is currently using the **${currentTheme}** theme`
    )
    .addFields(
      {
        name: '📋 Classic Theme',
        value:
          currentTheme === 'classic'
            ? '✅ **Currently Active**\n' +
              'Shows basic server info: players, gamemode, version'
            : 'Shows basic server info: players, gamemode, version',
        inline: true,
      },
      {
        name: '📊 Detailed Theme',
        value:
          currentTheme === 'detailed'
            ? '✅ **Currently Active**\n' +
              'Shows server info + player list with names and scores'
            : 'Shows server info + player list with names and scores',
        inline: true,
      }
    )
    .addFields({
      name: 'Change Theme',
      value: 'Use `/theme set` to switch between themes',
      inline: false,
    })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
