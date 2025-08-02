import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
} from 'discord.js';
import { CustomClient } from '../types';
import { getRoleColor, hasManagementPermission } from '../utils';

export const data = new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all available commands and their usage')
    .addStringOption(option =>
        option
            .setName('category')
            .setDescription('Show commands for a specific category')
            .setRequired(false)
            .addChoices(
                { name: 'Server Management', value: 'server' },
                { name: 'Monitoring', value: 'monitoring' },
                { name: 'Data & Charts', value: 'data' },
                { name: 'Configuration', value: 'config' },
                { name: 'Utility', value: 'utility' }
            )
    )
    .addStringOption(option =>
        option
            .setName('command')
            .setDescription('Get detailed help for a specific command')
            .setRequired(false)
            .addChoices(
                { name: '/server', value: 'server' },
                { name: '/monitor', value: 'monitor' },
                { name: '/chart', value: 'chart' },
                { name: '/players', value: 'players' },
                { name: '/role', value: 'role' },
                { name: '/help', value: 'help' },
                { name: '/debug', value: 'debug' },
                { name: '/cleanup', value: 'cleanup' }
            )
    );

interface CommandInfo {
    name: string;
    description: string;
    usage: string;
    examples: string[];
    permissions: string;
    category: string;
}

export async function execute(
    interaction: ChatInputCommandInteraction,
    client: CustomClient
): Promise<void> {
    await interaction.deferReply();

    const category = interaction.options.getString('category');
    const specificCommand = interaction.options.getString('command');
    const hasManagementPerms = await hasManagementPermission(interaction, client);
    const color = getRoleColor(interaction.guild!);

    // Define all commands with their information
    const commands: CommandInfo[] = [
        {
            name: '/server add',
            description: 'Add a new SA:MP/open.mp server to monitor',
            usage: '/server add ip:<address> [port:<number>] [name:<friendly_name>]',
            examples: [
                '/server add ip:127.0.0.1 port:7777',
                '/server add ip:server.example.com name:"My Server"',
                '/server add ip:192.168.1.100'
            ],
            permissions: 'Management Role or Administrator',
            category: 'server'
        },
        {
            name: '/server list',
            description: 'Show all configured servers for this guild',
            usage: '/server list',
            examples: ['/server list'],
            permissions: 'Everyone',
            category: 'server'
        },
        {
            name: '/server activate',
            description: 'Set which server to actively monitor',
            usage: '/server activate server:<server_name_or_id>',
            examples: [
                '/server activate server:My Server',
                '/server activate server:127.0.0.1:7777'
            ],
            permissions: 'Management Role or Administrator',
            category: 'server'
        },
        {
            name: '/server remove',
            description: 'Remove a server and all its data',
            usage: '/server remove server:<server_name_or_id> confirm:true',
            examples: [
                '/server remove server:My Server confirm:true',
                '/server remove server:127.0.0.1:7777 confirm:true'
            ],
            permissions: 'Management Role or Administrator',
            category: 'server'
        },
        {
            name: '/server status',
            description: 'Show current server status and information',
            usage: '/server status [server:<server>] [fresh:<true/false>]',
            examples: [
                '/server status',
                '/server status fresh:true',
                '/server status server:My Server fresh:true'
            ],
            permissions: 'Everyone',
            category: 'server'
        },
        {
            name: '/monitor setup',
            description: 'Quick setup wizard for server monitoring',
            usage: '/monitor setup status_channel:<channel> [chart_channel:<channel>] [player_count_channel:<channel>] [server_ip_channel:<channel>]',
            examples: [
                '/monitor setup status_channel:#server-status',
                '/monitor setup status_channel:#status chart_channel:#charts player_count_channel:Player Count'
            ],
            permissions: 'Management Role or Administrator',
            category: 'monitoring'
        },
        {
            name: '/monitor enable',
            description: 'Enable monitoring with current settings',
            usage: '/monitor enable',
            examples: ['/monitor enable'],
            permissions: 'Management Role or Administrator',
            category: 'monitoring'
        },
        {
            name: '/monitor disable',
            description: 'Disable server monitoring',
            usage: '/monitor disable',
            examples: ['/monitor disable'],
            permissions: 'Management Role or Administrator',
            category: 'monitoring'
        },
        {
            name: '/monitor status',
            description: 'Show current monitoring configuration',
            usage: '/monitor status',
            examples: ['/monitor status'],
            permissions: 'Everyone',
            category: 'monitoring'
        },
        {
            name: '/chart',
            description: 'Show player activity chart for the past 30 days',
            usage: '/chart [server:<server_name_or_id>]',
            examples: [
                '/chart',
                '/chart server:My Server',
                '/chart server:127.0.0.1:7777'
            ],
            permissions: 'Everyone',
            category: 'data'
        },
        {
            name: '/players',
            description: 'Show current online players for a server',
            usage: '/players [server:<server_name_or_id>]',
            examples: [
                '/players',
                '/players server:My Server',
                '/players server:127.0.0.1:7777'
            ],
            permissions: 'Everyone',
            category: 'data'
        },
        {
            name: '/role set',
            description: 'Set the role that can manage server monitoring',
            usage: '/role set role:<@role>',
            examples: [
                '/role set role:@Server Managers',
                '/role set role:@Moderators'
            ],
            permissions: 'Administrator Only',
            category: 'config'
        },
        {
            name: '/role remove',
            description: 'Remove role requirement (Admin-only access)',
            usage: '/role remove',
            examples: ['/role remove'],
            permissions: 'Administrator Only',
            category: 'config'
        },
        {
            name: '/role show',
            description: 'Show current role configuration',
            usage: '/role show',
            examples: ['/role show'],
            permissions: 'Everyone',
            category: 'config'
        },
        {
            name: '/help',
            description: 'Show this help message',
            usage: '/help [category:<category>] [command:<command>]',
            examples: [
                '/help',
                '/help category:server',
                '/help command:server'
            ],
            permissions: 'Everyone',
            category: 'utility'
        }
    ];

    // Add owner-only commands if user has owner permissions
    if (interaction.user.id === process.env.OWNER_ID) {
        commands.push(
            {
                name: '/debug',
                description: 'Show bot configuration and statistics',
                usage: '/debug',
                examples: ['/debug'],
                permissions: 'Bot Owner Only',
                category: 'utility'
            },
            {
                name: '/cleanup',
                description: 'Clean up old database data',
                usage: '/cleanup',
                examples: ['/cleanup'],
                permissions: 'Bot Owner Only',
                category: 'utility'
            },
            {
                name: '/forceupdate',
                description: 'Force an immediate status update',
                usage: '/forceupdate [guild:<guild_id>] [all_guilds:<true/false>]',
                examples: [
                    '/forceupdate',
                    '/forceupdate guild:123456789012345678',
                    '/forceupdate all_guilds:true'
                ],
                permissions: 'Bot Owner Only',
                category: 'utility'
            }
        );
    }

    // If specific command is requested, show detailed help
    if (specificCommand) {
        const command = commands.find(cmd => cmd.name.includes(`/${specificCommand}`));
        if (command) {
            const detailEmbed = new EmbedBuilder()
                .setColor(color)
                .setTitle(`📖 Command Help: ${command.name}`)
                .setDescription(command.description)
                .addFields(
                    {
                        name: '📝 Usage',
                        value: `\`${command.usage}\``,
                        inline: false,
                    },
                    {
                        name: '💡 Examples',
                        value: command.examples.map(ex => `\`${ex}\``).join('\n'),
                        inline: false,
                    },
                    {
                        name: '🔐 Required Permissions',
                        value: command.permissions,
                        inline: true,
                    },
                    {
                        name: '📂 Category',
                        value: getCategoryDisplayName(command.category),
                        inline: true,
                    }
                )
                .setFooter({ text: 'Use /help to see all commands' })
                .setTimestamp();

            await interaction.editReply({ embeds: [detailEmbed] });
            return;
        }
    }

    // Filter commands by category if specified
    let filteredCommands = commands;
    if (category) {
        filteredCommands = commands.filter(cmd => cmd.category === category);
    }

    // Group commands by category
    const categories = {
        server: filteredCommands.filter(cmd => cmd.category === 'server'),
        monitoring: filteredCommands.filter(cmd => cmd.category === 'monitoring'),
        data: filteredCommands.filter(cmd => cmd.category === 'data'),
        config: filteredCommands.filter(cmd => cmd.category === 'config'),
        utility: filteredCommands.filter(cmd => cmd.category === 'utility')
    };

    // Create embeds for each category
    const embeds: EmbedBuilder[] = [];

    // Overview embed (only if no specific category)
    if (!category) {
        const overviewEmbed = new EmbedBuilder()
            .setColor(color)
            .setTitle('🤖 SA:MP/open.mp Bot Help')
            .setDescription('A comprehensive Discord bot for monitoring SA:MP and open.mp servers with real-time updates, charts, and player tracking.')
            .addFields(
                {
                    name: '📊 Features',
                    value:
                        '• **Real-time monitoring** - Server status updates every 10 minutes\n' +
                        '• **Player tracking** - Live player counts and detailed player lists\n' +
                        '• **Historical charts** - 30-day player activity graphs\n' +
                        '• **Multi-server support** - Monitor multiple servers per Discord server\n' +
                        '• **Channel automation** - Auto-updating channel names with live data\n' +
                        '• **Security features** - Rate limiting, input validation, and permission control',
                    inline: false,
                },
                {
                    name: '🔧 Quick Start',
                    value:
                        '1️⃣ Add a server: `/server add ip:127.0.0.1 port:7777`\n' +
                        '2️⃣ Setup monitoring: `/monitor setup status_channel:#status`\n' +
                        '3️⃣ Check status: `/server status` or `/chart`\n' +
                        '4️⃣ View players: `/players`',
                    inline: false,
                },
                {
                    name: '📚 Command Categories',
                    value:
                        '**Server Management** - Add, remove, and configure servers\n' +
                        '**Monitoring** - Setup and control automated monitoring\n' +
                        '**Data & Charts** - View charts and player information\n' +
                        '**Configuration** - Manage bot permissions and settings\n' +
                        '**Utility** - Help and diagnostic commands',
                    inline: false,
                },
                {
                    name: '🔐 Permissions',
                    value: hasManagementPerms
                        ? '✅ You can use management commands'
                        : '❌ You can only use public commands\n💡 Ask an admin to set up role permissions with `/role set`',
                    inline: false,
                }
            )
            .setFooter({ text: 'Use the buttons below to navigate through command categories' })
            .setTimestamp();

        embeds.push(overviewEmbed);
    }

    // Category embeds
    Object.entries(categories).forEach(([categoryKey, categoryCommands]) => {
        if (categoryCommands.length === 0) return;

        const categoryEmbed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`📂 ${getCategoryDisplayName(categoryKey)} Commands`)
            .setDescription(getCategoryDescription(categoryKey))
            .setTimestamp();

        // Group commands into fields to avoid hitting field limits
        const commandsPerField = 4;
        for (let i = 0; i < categoryCommands.length; i += commandsPerField) {
            const commandGroup = categoryCommands.slice(i, i + commandsPerField);
            const fieldValue = commandGroup.map(cmd =>
                `**${cmd.name}**\n${cmd.description}\n*Permissions: ${cmd.permissions}*`
            ).join('\n\n');

            categoryEmbed.addFields({
                name: i === 0 ? 'Commands' : `Commands (continued)`,
                value: fieldValue,
                inline: false,
            });
        }

        embeds.push(categoryEmbed);
    });

    // If only one embed (specific category), show it directly
    if (embeds.length === 1) {
        await interaction.editReply({ embeds });
        return;
    }

    // Setup pagination for multiple embeds
    let currentPage = 0;

    const generateButtons = (page: number) => {
        return new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('help_first')
                    .setLabel('« Overview')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId('help_prev')
                    .setLabel('‹ Previous')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId('help_next')
                    .setLabel('Next ›')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page >= embeds.length - 1),
                new ButtonBuilder()
                    .setCustomId('help_last')
                    .setLabel('Last »')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page >= embeds.length - 1),
            );
    };

    // Send initial message
    const buttons = embeds.length > 1 ? generateButtons(currentPage) : undefined;
    const message = await interaction.editReply({
        embeds: [embeds[currentPage]!],
        components: buttons ? [buttons] : [],
    });

    // Setup button collector
    if (embeds.length > 1) {
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000, // 5 minutes
        });

        collector.on('collect', async (buttonInteraction) => {
            if (buttonInteraction.user.id !== interaction.user.id) {
                await buttonInteraction.reply({
                    content: 'Only the user who ran the command can use these buttons.',
                    ephemeral: true,
                });
                return;
            }

            switch (buttonInteraction.customId) {
                case 'help_first':
                    currentPage = 0;
                    break;
                case 'help_prev':
                    currentPage = Math.max(0, currentPage - 1);
                    break;
                case 'help_next':
                    currentPage = Math.min(embeds.length - 1, currentPage + 1);
                    break;
                case 'help_last':
                    currentPage = embeds.length - 1;
                    break;
            }

            const newButtons = generateButtons(currentPage);
            await buttonInteraction.update({
                embeds: [embeds[currentPage]!],
                components: [newButtons],
            });
        });

        collector.on('end', async () => {
            const disabledButtons = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('help_first')
                        .setLabel('« Overview')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('help_prev')
                        .setLabel('‹ Previous')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('help_next')
                        .setLabel('Next ›')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('help_last')
                        .setLabel('Last »')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                );

            try {
                await interaction.editReply({
                    components: [disabledButtons],
                });
            } catch (error) {
                // Message might have been deleted, ignore error
            }
        });
    }
}

function getCategoryDisplayName(category: string): string {
    const displayNames: Record<string, string> = {
        server: 'Server Management',
        monitoring: 'Monitoring',
        data: 'Data & Charts',
        config: 'Configuration',
        utility: 'Utility'
    };
    return displayNames[category] || category;
}

function getCategoryDescription(category: string): string {
    const descriptions: Record<string, string> = {
        server: 'Commands for adding, removing, and managing SA:MP/open.mp servers.',
        monitoring: 'Commands for setting up and controlling automated server monitoring.',
        data: 'Commands for viewing charts, player lists, and historical data.',
        config: 'Commands for managing bot permissions, roles, and configuration.',
        utility: 'Utility commands including help, debug, and maintenance tools.'
    };
    return descriptions[category] || 'Commands in this category.';
}