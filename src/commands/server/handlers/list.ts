import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { CustomClient } from '../../../types';
import { TimezoneHelper } from '../../../utils/timezoneHelper';

export async function handleList(
    interaction: ChatInputCommandInteraction,
    client: CustomClient
) {
    await interaction.deferReply();

    const servers = (await client.servers.get(interaction.guildId!)) || [];
    const intervalConfig = await client.intervals.get(interaction.guildId!);

    if (servers.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(0xff6b6b)
            .setTitle('No Servers Configured')
            .setDescription('No servers have been added to this guild yet.')
            .addFields(
                {
                    name: 'Getting Started',
                    value: 'Use `/server add` to add your first server!',
                },
                {
                    name: 'Quick Setup',
                    value: 'Or use `/setup` for guided configuration',
                }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
    }

    const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle('Configured Servers')
        .setDescription(
            `Found ${servers.length} server${servers.length === 1 ? '' : 's'}`
        )
        .setTimestamp();

    for (const server of servers) {
        const isActive = intervalConfig?.activeServerId === server.id;
        const addedDate = new Date(server.addedAt).toLocaleDateString();

        embed.addFields({
            name: `${isActive ? '🟢' : '⚪'} ${server.name}`,
            value: `**Address:** ${server.ip}:${server.port}\n**Timezone:** ${server.timezone || 'GMT+0'}\n**Day Reset:** ${TimezoneHelper.formatDayResetTime(server.dayResetHour || 0)}\n**Added:** ${addedDate}\n**Status:** ${isActive ? 'Active (Monitoring)' : 'Inactive'}`,
            inline: true,
        });
    }

    if (intervalConfig?.activeServerId) {
        const activeServer = servers.find(
            s => s.id === intervalConfig.activeServerId
        );
        embed.setFooter({
            text: `Currently monitoring: ${activeServer?.name || 'Unknown'}`,
        });
    } else {
        embed.setFooter({
            text: 'No active server set - use /server activate to choose one',
        });
    }

    await interaction.editReply({ embeds: [embed] });
}