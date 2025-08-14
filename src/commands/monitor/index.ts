import { SlashCommandBuilder, ChatInputCommandInteraction, ChannelType } from 'discord.js';
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
            .addChannelOption(option =>
                option
                    .setName('status_channel')
                    .setDescription('Channel for status updates (leave empty to auto-create)')
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(false)
            )
            .addChannelOption(option =>
                option
                    .setName('chart_channel')
                    .setDescription('Channel for daily charts (leave empty to auto-create)')
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(false)
            )
            .addBooleanOption(option =>
                option
                    .setName('create_voice_channels')
                    .setDescription('Auto-create voice channels for player count and server IP')
                    .setRequired(false)
            )
            .addBooleanOption(option =>
                option
                    .setName('enable_monitoring')
                    .setDescription('Enable monitoring after setup')
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