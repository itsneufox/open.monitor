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
import { getRoleColor } from '../utils';
import { SAMPQuery } from '../utils/sampQuery';

const sampQuery = new SAMPQuery();

export const data = new SlashCommandBuilder()
    .setName('players')
    .setDescription('Show online players for a server')
    .addStringOption(option =>
        option
            .setName('server')
            .setDescription(
                'Which server to show players for (leave empty for active server)'
            )
            .setRequired(false)
            .setAutocomplete(true)
    );

export async function execute(
    interaction: ChatInputCommandInteraction,
    client: CustomClient
): Promise<void> {
    await interaction.deferReply();

    if (!interaction.guildId) {
        await interaction.editReply(
            '❌ This command can only be used in a server.'
        );
        return;
    }

    // Get all servers for this guild
    const servers = (await client.servers.get(interaction.guildId)) || [];
    if (servers.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(0xff6b6b)
            .setTitle('❌ No Servers Configured')
            .setDescription('No servers have been configured for this guild.')
            .addFields({
                name: 'Getting Started',
                value:
                    'Use `/server add` to configure a SA:MP/open.mp server to monitor.',
            })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
    }

    // Determine which server to show players for
    const requestedServer = interaction.options.getString('server');
    let targetServer;

    if (requestedServer) {
        targetServer = servers.find(
            s => s.id === requestedServer || s.name === requestedServer
        );
        if (!targetServer) {
            await interaction.editReply(
                '❌ Server not found. Use `/server list` to see available servers.'
            );
            return;
        }
    } else {
        const intervalConfig = await client.intervals.get(interaction.guildId);
        if (!intervalConfig?.activeServerId) {
            if (servers.length === 1) {
                targetServer = servers[0];
            } else {
                await interaction.editReply(
                    '❌ No active server set and multiple servers available. Use `/server activate` to set an active server, or specify which server to show players for.'
                );
                return;
            }
        } else {
            targetServer = servers.find(s => s.id === intervalConfig.activeServerId);
            if (!targetServer) {
                await interaction.editReply(
                    '❌ Active server not found. Use `/server activate` to set a valid server.'
                );
                return;
            }
        }
    }

    if (!targetServer) {
        await interaction.editReply('❌ Unable to determine target server.');
        return;
    }

    try {
        // Get server info first
        const info = await sampQuery.getServerInfo(targetServer);

        if (!info) {
            const embed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('❌ Server Offline')
                .setDescription(
                    `**${targetServer.name}** is currently offline or unreachable.`
                )
                .setFooter({ text: `${targetServer.ip}:${targetServer.port}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        const color = getRoleColor(interaction.guild!);

        if (info.players === 0) {
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle('No Players Online')
                .setDescription(`**${targetServer.name}** has no players online.`)
                .addFields(
                    { name: 'Server Capacity', value: `0/${info.maxplayers}`, inline: true },
                    { name: 'Gamemode', value: info.gamemode || 'Unknown', inline: true }
                )
                .setFooter({ text: `${targetServer.ip}:${targetServer.port}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        if (info.players > 100) {
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle('Too Many Players')
                .setDescription(`**${targetServer.name}** has ${info.players} players online.`)
                .addFields({
                    name: 'Player List Unavailable',
                    value: 'Server has too many players to display individual names. Player lists are only shown for servers with 100 or fewer players.',
                    inline: false,
                })
                .setFooter({ text: `${targetServer.ip}:${targetServer.port}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Get player list
        let players: Array<{ id: number, name: string, score: number }> = [];

        try {
            players = await sampQuery.getDetailedPlayers(targetServer);

            if (players.length === 0) {
                // Fallback to basic player list if detailed fails
                const basicPlayers = await sampQuery.getPlayers(targetServer);
                players = basicPlayers.map((player, index) => ({
                    id: index,
                    name: player.name,
                    score: player.score
                }));
            }
        } catch (error) {
            const embed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('❌ Error')
                .setDescription(
                    `Failed to retrieve player list for **${targetServer.name}**.`
                )
                .setFooter({ text: `${targetServer.ip}:${targetServer.port}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        if (players.length === 0) {
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle('Unable to Retrieve Players')
                .setDescription(`**${targetServer.name}** shows ${info.players} players but player names could not be retrieved.`)
                .setFooter({ text: `${targetServer.ip}:${targetServer.port}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Sort players by ID
        const sortedPlayers = players.sort((a, b) => a.id - b.id);

        // Pagination setup
        const playersPerPage = 20;
        const totalPages = Math.ceil(sortedPlayers.length / playersPerPage);
        let currentPage = 0;

        const generateEmbed = (page: number) => {
            const start = page * playersPerPage;
            const end = start + playersPerPage;
            const pageData = sortedPlayers.slice(start, end);

            // Clean formatting with aligned IDs
            const playerList = pageData
                .map(player => `\`[${player.id.toString().padStart(2, ' ')}]\` ${player.name} (${player.score})`)
                .join('\n');

            return new EmbedBuilder()
                .setColor(color)
                .setTitle('Online Players')
                .setDescription(
                    `**${targetServer.name}**\n\`${targetServer.ip}:${targetServer.port}\``
                )
                .addFields(
                    {
                        name: 'Server Info',
                        value: `${info.players}/${info.maxplayers} players • ${info.gamemode || 'Unknown'} gamemode`,
                        inline: false,
                    },
                    {
                        name: `Players (Page ${page + 1}/${totalPages})`,
                        value: playerList,
                        inline: false,
                    }
                )
                .setFooter({
                    text: `Showing ${start + 1}-${Math.min(end, sortedPlayers.length)} of ${sortedPlayers.length} players • Sorted by ID`,
                })
                .setTimestamp();
        };

        const generateButtons = (page: number) => {
            return new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('players_first')
                        .setLabel('« First')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId('players_prev')
                        .setLabel('‹ Previous')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId('players_next')
                        .setLabel('Next ›')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page >= totalPages - 1),
                    new ButtonBuilder()
                        .setCustomId('players_last')
                        .setLabel('Last »')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page >= totalPages - 1),
                );
        };

        // Send initial message
        const embed = generateEmbed(currentPage);
        const buttons = totalPages > 1 ? generateButtons(currentPage) : undefined;

        const message = await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : [],
        });

        // Only add button collector if there are multiple pages
        if (totalPages > 1) {
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
                    case 'players_first':
                        currentPage = 0;
                        break;
                    case 'players_prev':
                        currentPage = Math.max(0, currentPage - 1);
                        break;
                    case 'players_next':
                        currentPage = Math.min(totalPages - 1, currentPage + 1);
                        break;
                    case 'players_last':
                        currentPage = totalPages - 1;
                        break;
                }

                const newEmbed = generateEmbed(currentPage);
                const newButtons = generateButtons(currentPage);

                await buttonInteraction.update({
                    embeds: [newEmbed],
                    components: [newButtons],
                });
            });

            collector.on('end', async () => {
                // Disable all buttons when collector expires
                const disabledButtons = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('players_first')
                            .setLabel('« First')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('players_prev')
                            .setLabel('‹ Previous')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('players_next')
                            .setLabel('Next ›')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('players_last')
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
    } catch (error) {
        console.error('Error getting players:', error);

        const errorEmbed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('❌ Error')
            .setDescription(
                `Failed to retrieve player list for **${targetServer.name}**.`
            )
            .setFooter({ text: `${targetServer.ip}:${targetServer.port}` })
            .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed] });
    }
}