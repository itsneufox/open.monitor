import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { CustomClient } from '../../types';
import { checkPermissionOrReply } from '../../utils/permissions';
import { handleAdd } from './handlers/add';
import { handleList } from './handlers/list';
import { handleActivate } from './handlers/activate';
import { handleRemove } from './handlers/remove';
import { handleStatus } from './handlers/status';

export const data = new SlashCommandBuilder()
  .setName('server')
  .setDescription('Manage SA:MP/open.mp servers')
  .addSubcommand(subcommand =>
    subcommand.setName('add').setDescription('Add a new server')
  )
  .addSubcommand(subcommand =>
    subcommand.setName('list').setDescription('Show all configured servers')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('activate')
      .setDescription('Set which server to actively monitor')
      .addStringOption(option =>
        option
          .setName('server')
          .setDescription('Server to activate')
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('remove')
      .setDescription('Remove a server and all its data')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('status')
      .setDescription('Show current server status')
      .addStringOption(option =>
        option
          .setName('server')
          .setDescription(
            'Which server to check (leave empty for active server)'
          )
          .setRequired(false)
          .setAutocomplete(true)
      )
      .addBooleanOption(option =>
        option
          .setName('fresh')
          .setDescription('Get fresh data (bypasses cache, rate limited)')
          .setRequired(false)
      )
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand !== 'status' && subcommand !== 'list') {
    if (!(await checkPermissionOrReply(interaction, client))) {
      return;
    }
  }

  switch (subcommand) {
    case 'add':
      await handleAdd(interaction, client);
      break;
    case 'list':
      await handleList(interaction, client);
      break;
    case 'activate':
      await handleActivate(interaction, client);
      break;
    case 'remove':
      await handleRemove(interaction, client);
      break;
    case 'status':
      await handleStatus(interaction, client);
      break;
  }
}
