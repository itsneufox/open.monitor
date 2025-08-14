import {
    ChatInputCommandInteraction,
    EmbedBuilder,
    MessageFlags,
    ChannelType,
    PermissionFlagsBits,
    TextChannel,
    VoiceChannel,
} from 'discord.js';
import { CustomClient } from '../../../types';
import { InputValidator } from '../../../utils/inputValidator';
import { getPlayerCount } from '../../../utils';

export async function handleSetup(
    interaction: ChatInputCommandInteraction,
    client: CustomClient
) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const rateLimitCheck = InputValidator.checkCommandRateLimit(
        interaction.user.id,
        'monitor-setup',
        2
    );

    if (!rateLimitCheck.allowed) {
        await interaction.editReply(
            `Please wait ${Math.ceil((rateLimitCheck.remainingTime || 0) / 1000)} seconds before setting up monitoring again.`
        );
        return;
    }

    const servers = (await client.servers.get(interaction.guildId!)) || [];
    if (servers.length === 0) {
        await interaction.editReply('No servers configured. Use `/server add` to add a server first.');
        return;
    }

    const intervalConfig = await client.intervals.get(interaction.guildId!);
    if (!intervalConfig?.activeServerId) {
        await interaction.editReply('No active server set. Use `/server activate` to set an active server first.');
        return;
    }

    const activeServer = servers.find(s => s.id === intervalConfig.activeServerId);
    if (!activeServer) {
        await interaction.editReply('Active server not found.');
        return;
    }

    const statusChannel = interaction.options.getChannel('status_channel') as TextChannel | null;
    const chartChannel = interaction.options.getChannel('chart_channel') as TextChannel | null;
    const playerCountChannel = interaction.options.getChannel('player_count_channel') as VoiceChannel | null;
    const serverIpChannel = interaction.options.getChannel('server_ip_channel') as VoiceChannel | null;
    const createVoiceChannels = interaction.options.getBoolean('create_voice_channels') ?? true;
    const autoCreateTextChannels = interaction.options.getBoolean('auto_create_text_channels') ?? true;
    const enableMonitoring = interaction.options.getBoolean('enable_monitoring') ?? true;

    const botMember = interaction.guild!.members.cache.get(client.user!.id);
    if (!botMember) {
        await interaction.editReply('Unable to find bot member in this guild.');
        return;
    }

    let finalStatusChannel = statusChannel;
    let finalChartChannel = chartChannel;
    let finalPlayerCountChannel = playerCountChannel;
    let finalServerIpChannel = serverIpChannel;
    const createdChannels: string[] = [];

    try {
        // Create/find category
        let monitorCategory = interaction.guild!.channels.cache.find(
            ch => ch.type === ChannelType.GuildCategory && ch.name === 'open.monitor'
        );
        if (!monitorCategory) {
            monitorCategory = await interaction.guild!.channels.create({
                name: 'open.monitor',
                type: ChannelType.GuildCategory,
            });
        }

        // Handle text channels
        if (autoCreateTextChannels && !finalStatusChannel) {
            finalStatusChannel = await interaction.guild!.channels.create({
                name: 'server-status',
                type: ChannelType.GuildText,
                parent: monitorCategory.id,
                topic: `Status updates for ${activeServer.name}`,
                permissionOverwrites: [
                    {
                        id: interaction.guild!.roles.everyone,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                        deny: [PermissionFlagsBits.SendMessages],
                    },
                    {
                        id: client.user!.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.EmbedLinks,
                            PermissionFlagsBits.ManageMessages,
                        ],
                    },
                ],
            });
            createdChannels.push(`#${finalStatusChannel.name}`);
        }

        if (autoCreateTextChannels && !finalChartChannel) {
            finalChartChannel = await interaction.guild!.channels.create({
                name: 'server-charts',
                type: ChannelType.GuildText,
                parent: monitorCategory.id,
                topic: `Daily player charts for ${activeServer.name}`,
                permissionOverwrites: [
                    {
                        id: interaction.guild!.roles.everyone,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                        deny: [PermissionFlagsBits.SendMessages],
                    },
                    {
                        id: client.user!.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.AttachFiles,
                            PermissionFlagsBits.ManageMessages,
                        ],
                    },
                ],
            });
            createdChannels.push(`#${finalChartChannel.name}`);
        }

        // Handle voice channels
        if (createVoiceChannels && !finalPlayerCountChannel) {
            finalPlayerCountChannel = await interaction.guild!.channels.create({
                name: 'Players: Checking...',
                type: ChannelType.GuildVoice,
                parent: monitorCategory.id,
                permissionOverwrites: [
                    {
                        id: interaction.guild!.roles.everyone,
                        deny: [PermissionFlagsBits.Connect],
                        allow: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: client.user!.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels],
                    },
                ],
            });
            createdChannels.push(`🔊 ${finalPlayerCountChannel.name}`);
        }

        if (createVoiceChannels && !finalServerIpChannel) {
            finalServerIpChannel = await interaction.guild!.channels.create({
                name: `IP: ${activeServer.ip}:${activeServer.port}`,
                type: ChannelType.GuildVoice,
                parent: monitorCategory.id,
                permissionOverwrites: [
                    {
                        id: interaction.guild!.roles.everyone,
                        deny: [PermissionFlagsBits.Connect],
                        allow: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: client.user!.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels],
                    },
                ],
            });
            createdChannels.push(`🔊 ${finalServerIpChannel.name}`);
        }

        // Validate voice channel permissions
        if (finalPlayerCountChannel) {
            const playerPerms = finalPlayerCountChannel.permissionsFor(botMember);
            if (!playerPerms?.has(['ViewChannel', 'ManageChannels'])) {
                await interaction.editReply(
                    `I need View Channel and Manage Channels permissions in voice channel ${finalPlayerCountChannel.toString()}`
                );
                return;
            }
        }

        if (finalServerIpChannel) {
            const ipPerms = finalServerIpChannel.permissionsFor(botMember);
            if (!ipPerms?.has(['ViewChannel', 'ManageChannels'])) {
                await interaction.editReply(
                    `I need View Channel and Manage Channels permissions in voice channel ${finalServerIpChannel.toString()}`
                );
                return;
            }
        }

        // Build the new config object
        const newConfig: any = {
            ...intervalConfig,
            statusChannel: finalStatusChannel?.id,
            chartChannel: finalChartChannel?.id,
            enabled: enableMonitoring,
            next: Date.now(),
            statusMessage: null,
        };
        if (finalPlayerCountChannel) newConfig.playerCountChannel = finalPlayerCountChannel.id;
        if (finalServerIpChannel) newConfig.serverIpChannel = finalServerIpChannel.id;

        await client.intervals.set(interaction.guildId!, newConfig);

        let guildConfig = client.guildConfigs.get(interaction.guildId!) || { servers: [] };
        guildConfig.interval = newConfig;
        client.guildConfigs.set(interaction.guildId!, guildConfig);

        // Update voice channel names
        if (finalPlayerCountChannel) {
            try {
                const info = await getPlayerCount(activeServer, interaction.guildId!, false);
                const newName = info.isOnline
                    ? `Players: ${info.playerCount}/${info.maxPlayers}`
                    : 'Players: Server Offline';
                await finalPlayerCountChannel.setName(newName);
            } catch {
                console.log('Could not update initial player count');
            }
        }

        if (finalServerIpChannel) {
            try {
                const channelNameValidation = InputValidator.validateChannelName(
                    `IP: ${activeServer.ip}:${activeServer.port}`
                );
                if (channelNameValidation.valid && typeof channelNameValidation.sanitized === 'string') {
                    await finalServerIpChannel.setName(channelNameValidation.sanitized);
                }
            } catch {
                console.log('Could not update server IP channel name');
            }
        }

        // Build embed
        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('Monitoring Setup Complete')
            .setDescription(`Monitoring configured for **${activeServer.name}**`)
            .addFields(
                { name: 'Status Channel', value: finalStatusChannel?.toString() || 'Not set', inline: true },
                { name: 'Chart Channel', value: finalChartChannel?.toString() || 'Not set', inline: true },
                { name: 'Monitoring', value: enableMonitoring ? 'Enabled' : 'Disabled', inline: true }
            )
            .setTimestamp();

        if (finalPlayerCountChannel) {
            embed.addFields({ name: 'Player Count', value: finalPlayerCountChannel.toString(), inline: true });
        }
        if (finalServerIpChannel) {
            embed.addFields({ name: 'Server IP', value: finalServerIpChannel.toString(), inline: true });
        }
        if (createdChannels.length > 0) {
            embed.addFields({ name: 'Created Channels', value: createdChannels.join('\n'), inline: false });
        }
        if (!createVoiceChannels && !finalPlayerCountChannel && !finalServerIpChannel) {
            embed.addFields({
                name: 'Voice Channels',
                value: 'No voice channels configured. You can add them later by running this command again.',
                inline: false,
            });
        }
        embed.addFields({
            name: 'What happens next?',
            value: enableMonitoring
                ? '• Status updates will start immediately\n• Daily charts at midnight\n• Voice channels update automatically'
                : 'Use `/monitor enable` to start monitoring',
            inline: false,
        });

        await interaction.editReply({ embeds: [embed] });
        console.log(`Monitoring setup completed by ${interaction.user.tag} in guild ${interaction.guild?.name}`);
    } catch (error) {
        console.error('Error setting up monitoring:', error);
        await interaction.editReply('An error occurred while setting up monitoring channels. Please check bot permissions.');
    }
}
