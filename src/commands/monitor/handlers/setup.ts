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

    const autoTextChannels = interaction.options.getBoolean('auto_text_channels') ?? true;
    const autoVoiceChannels = interaction.options.getBoolean('auto_voice_channels') ?? true;
    const createCategory = interaction.options.getBoolean('create_category') ?? true;
    const enableMonitoring = interaction.options.getBoolean('enable_monitoring') ?? true;

    const manualStatusChannel = interaction.options.getChannel('status_channel') as TextChannel | null;
    const manualChartChannel = interaction.options.getChannel('chart_channel') as TextChannel | null;
    const manualPlayerCountChannel = interaction.options.getChannel('player_count_channel') as VoiceChannel | null;
    const manualServerIpChannel = interaction.options.getChannel('server_ip_channel') as VoiceChannel | null;

    if (!autoTextChannels && !manualStatusChannel) {
        await interaction.editReply('You must provide a status channel when auto_text_channels is disabled.');
        return;
    }

    if (!autoVoiceChannels && !manualPlayerCountChannel && !manualServerIpChannel) {
        await interaction.editReply('You must provide at least one voice channel when auto_voice_channels is disabled.');
        return;
    }

    const botMember = interaction.guild!.members.cache.get(client.user!.id);
    if (!botMember) {
        await interaction.editReply('Unable to find bot member in this guild.');
        return;
    }

    let finalStatusChannel: TextChannel | null = null;
    let finalChartChannel: TextChannel | null = null;
    let finalPlayerCountChannel: VoiceChannel | null = null;
    let finalServerIpChannel: VoiceChannel | null = null;
    const createdChannels: string[] = [];

    try {
        let categoryId: string | null = null;

        if (createCategory) {
            let monitorCategory = interaction.guild!.channels.cache.find(
                ch => ch.type === ChannelType.GuildCategory && ch.name === 'open.monitor'
            );
            if (!monitorCategory) {
                monitorCategory = await interaction.guild!.channels.create({
                    name: 'open.monitor',
                    type: ChannelType.GuildCategory,
                });
                createdChannels.push(`Category: ${monitorCategory.name}`);
            }
            categoryId = monitorCategory.id;
        }

        if (autoTextChannels) {
            const statusChannelOptions: any = {
                name: 'server-status',
                type: ChannelType.GuildText,
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
            };
            if (categoryId) {
                statusChannelOptions.parent = categoryId;
            }

            const createdStatusChannel = await interaction.guild!.channels.create(statusChannelOptions);
            finalStatusChannel = createdStatusChannel as TextChannel;
            createdChannels.push(`#${finalStatusChannel.name}`);

            const chartChannelOptions: any = {
                name: 'server-charts',
                type: ChannelType.GuildText,
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
            };
            if (categoryId) {
                chartChannelOptions.parent = categoryId;
            }

            const createdChartChannel = await interaction.guild!.channels.create(chartChannelOptions);
            finalChartChannel = createdChartChannel as TextChannel;
            createdChannels.push(`#${finalChartChannel.name}`);
        } else {
            finalStatusChannel = manualStatusChannel;
            finalChartChannel = manualChartChannel;
        }

        if (autoVoiceChannels) {
            const playerCountChannelOptions: any = {
                name: 'Players: Checking...',
                type: ChannelType.GuildVoice,
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
            };
            if (categoryId) {
                playerCountChannelOptions.parent = categoryId;
            }

            const createdPlayerCountChannel = await interaction.guild!.channels.create(playerCountChannelOptions);
            finalPlayerCountChannel = createdPlayerCountChannel as VoiceChannel;
            createdChannels.push(`Voice: ${finalPlayerCountChannel.name}`);

            const serverIpChannelOptions: any = {
                name: `IP: ${activeServer.ip}:${activeServer.port}`,
                type: ChannelType.GuildVoice,
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
            };
            if (categoryId) {
                serverIpChannelOptions.parent = categoryId;
            }

            const createdServerIpChannel = await interaction.guild!.channels.create(serverIpChannelOptions);
            finalServerIpChannel = createdServerIpChannel as VoiceChannel;
            createdChannels.push(`Voice: ${finalServerIpChannel.name}`);
        } else {
            finalPlayerCountChannel = manualPlayerCountChannel;
            finalServerIpChannel = manualServerIpChannel;
        }

        const channelsToCheck = [
            { channel: finalStatusChannel, perms: ['ViewChannel', 'SendMessages', 'EmbedLinks'] },
            { channel: finalChartChannel, perms: ['ViewChannel', 'SendMessages', 'AttachFiles'] },
            { channel: finalPlayerCountChannel, perms: ['ViewChannel', 'ManageChannels'] },
            { channel: finalServerIpChannel, perms: ['ViewChannel', 'ManageChannels'] },
        ];

        for (const { channel, perms } of channelsToCheck) {
            if (channel) {
                const channelPerms = channel.permissionsFor(botMember);
                if (!channelPerms?.has(perms as any)) {
                    await interaction.editReply(
                        `Missing permissions in ${channel.toString()}. Required: ${perms.join(', ')}`
                    );
                    return;
                }
            }
        }

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

        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('Monitoring Setup Complete')
            .setDescription(`Monitoring configured for **${activeServer.name}**`)
            .addFields(
                { name: 'Status Channel', value: finalStatusChannel?.toString() || 'Not configured', inline: true },
                { name: 'Chart Channel', value: finalChartChannel?.toString() || 'Not configured', inline: true },
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
            embed.addFields({ name: 'Created', value: createdChannels.join('\n'), inline: false });
        }

        embed.addFields({
            name: 'What happens next?',
            value: enableMonitoring
                ? 'Status updates start immediately\nDaily charts at midnight\nVoice channels update automatically'
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