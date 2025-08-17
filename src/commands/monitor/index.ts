import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ChannelType,
} from 'discord.js';
import { CustomClient } from '../../types';
import { checkPermissionOrReply } from '../../utils/permissions';
import { handleSetup } from './handlers/setup';
import { handleEnable } from './handlers/enable';
import { handleDisable } from './handlers/disable';
import { handleStatus } from './handlers/status';

export const data = new SlashCommandBuilder()
  .setName('monitor')
  .setDescription('Configure server monitoring')
  .addSubcommand(subcommand =>
    subcommand
      .setName('setup')
      .setDescription('Setup monitoring channels')
      .addBooleanOption(option =>
        option
          .setName('auto_text_channels')
          .setDescription(
            'Automatically create text channels for status & charts (default: true)'
          )
          .setRequired(false)
      )
      .addBooleanOption(option =>
        option
          .setName('auto_voice_channels')
          .setDescription(
            'Automatically create voice channels for player count & server IP (default: true)'
          )
          .setRequired(false)
      )
      .addBooleanOption(option =>
        option
          .setName('create_category')
          .setDescription(
            'Create an "open.monitor" category for channels (default: true)'
          )
          .setRequired(false)
      )
      .addChannelOption(option =>
        option
          .setName('status_channel')
          .setDescription(
            'Channel for status updates (only if auto_text_channels is false)'
          )
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
      .addChannelOption(option =>
        option
          .setName('chart_channel')
          .setDescription(
            'Channel for daily charts (only if auto_text_channels is false)'
          )
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
      .addChannelOption(option =>
        option
          .setName('player_count_channel')
          .setDescription(
            'Voice channel for player count (only if auto_voice_channels is false)'
          )
          .addChannelTypes(ChannelType.GuildVoice)
          .setRequired(false)
      )
      .addChannelOption(option =>
        option
          .setName('server_ip_channel')
          .setDescription(
            'Voice channel for server IP (only if auto_voice_channels is false)'
          )
          .addChannelTypes(ChannelType.GuildVoice)
          .setRequired(false)
      )
      .addBooleanOption(option =>
        option
          .setName('enable_monitoring')
          .setDescription('Enable monitoring after setup (default: true)')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('enable')
      .setDescription('Enable monitoring with current settings')
  )
  .addSubcommand(subcommand =>
    subcommand.setName('disable').setDescription('Disable monitoring')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('status')
      .setDescription('Show current monitoring configuration')
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand !== 'status') {
    if (!(await checkPermissionOrReply(interaction, client))) {
      return;
    }
  }

  switch (subcommand) {
    case 'setup':
      await handleSetup(interaction, client);
      break;
    case 'enable':
      await handleEnable(interaction, client);
      break;
    case 'disable':
      await handleDisable(interaction, client);
      break;
    case 'status':
      await handleStatus(interaction, client);
      break;
  }
}
