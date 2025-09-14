import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { CustomClient } from '../../../types';

export async function handleDeactivate(
    interaction: ChatInputCommandInteraction,
    client: CustomClient
) {
    await interaction.deferReply();

    const serverToDeactivate = interaction.options.getString('server', true);
    const servers = (await client.servers.get(interaction.guildId!)) || [];

    if (servers.length === 0) {
        await interaction.editReply(
            'No servers configured. Use `/server add` to add a server first.'
        );
        return;
    }

    const server = servers.find(
        s => s.id === serverToDeactivate || s.name === serverToDeactivate
    );
    if (!server) {
        await interaction.editReply(
            'Server not found. Use `/server list` to see available servers.'
        );
        return;
    }

    let intervalConfig = await client.intervals.get(interaction.guildId!);
    if (!intervalConfig) {
        await interaction.editReply(
            'No monitoring configuration found. Use `/server activate` to set up monitoring first.'
        );
        return;
    }

    // Check if user has premium
    const isPremium = !!(intervalConfig.isPremium &&
        intervalConfig.premiumExpires &&
        intervalConfig.premiumExpires > Date.now());

    if (isPremium && intervalConfig.activeServerIds) {
        // Premium: Remove from active servers list
        const index = intervalConfig.activeServerIds.indexOf(server.id);
        if (index === -1) {
            await interaction.editReply(
                `**${server.name}** is not currently active. Use \`/server activate\` to activate it.`
            );
            return;
        }

        intervalConfig.activeServerIds.splice(index, 1);

        // Update legacy field
        if (intervalConfig.activeServerIds.length > 0) {
            intervalConfig.activeServerId = intervalConfig.activeServerIds[0]!;
        } else {
            delete intervalConfig.activeServerId;
        }
    } else {
        // Free or legacy: Single server system
        if (intervalConfig.activeServerId !== server.id) {
            await interaction.editReply(
                `**${server.name}** is not currently active. Use \`/server activate\` to activate it.`
            );
            return;
        }

        // Free users can't deactivate their only server - they need to activate a different one
        await interaction.editReply(
            `**${server.name}** is your only active server. Free users can only have one active server at a time.\n\nTo switch servers, use \`/server activate <other-server>\` to activate a different server instead.`
        );
        return;
    }

    // Clear status message since active servers changed
    intervalConfig.statusMessage = null;

    await client.intervals.set(interaction.guildId!, intervalConfig);

    let guildConfig = client.guildConfigs.get(interaction.guildId!) || { servers: [] };
    guildConfig.interval = intervalConfig;
    client.guildConfigs.set(interaction.guildId!, guildConfig);

    const embed = new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle('🔴 Server Deactivated')
        .setDescription(`**${server.name}** has been removed from active monitoring.`)
        .addFields(
            {
                name: 'Server',
                value: `\`${server.ip}:${server.port}\``,
                inline: true,
            },
            {
                name: 'Active Servers',
                value: intervalConfig.activeServerIds?.length ?
                    `${intervalConfig.activeServerIds.length} server(s) active` :
                    'No servers active',
                inline: true,
            }
        )
        .setTimestamp();

    if (isPremium) {
        embed.addFields({
            name: 'Premium Feature',
            value: 'You can activate up to 5 servers simultaneously. Use `/server activate` to add more.',
            inline: false,
        });
    } else {
        embed.addFields({
            name: 'Upgrade to Premium',
            value: 'Premium users can monitor up to 5 servers at once! Use `/premium features` to learn more.',
            inline: false,
        });
    }

    await interaction.editReply({ embeds: [embed] });

    console.log(
        `Server deactivated: ${server.name} (${server.ip}:${server.port}) in guild ${interaction.guild?.name} by ${interaction.user.tag}`
    );
}
