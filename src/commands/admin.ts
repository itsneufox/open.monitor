import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    MessageFlags,
} from 'discord.js';
import { CustomClient } from '../types';

export const data = new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Admin commands for bot management')
    .addSubcommand(subcommand =>
        subcommand
            .setName('activate-guild')
            .setDescription('Directly activate premium for a guild')
            .addStringOption(option =>
                option
                    .setName('guild_id')
                    .setDescription('The Discord guild ID to activate premium for')
                    .setRequired(true)
            )
            .addIntegerOption(option =>
                option
                    .setName('days')
                    .setDescription('Duration in days (default: 30)')
                    .setRequired(false)
                    .setMinValue(1)
                    .setMaxValue(365)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('deactivate-guild')
            .setDescription('Deactivate premium for a guild')
            .addStringOption(option =>
                option
                    .setName('guild_id')
                    .setDescription('The Discord guild ID to deactivate premium for')
                    .setRequired(true)
            )
    )

export async function execute(
    interaction: ChatInputCommandInteraction,
    client: CustomClient
): Promise<void> {
    // Check if user is bot owner
    if (interaction.user.id !== process.env.OWNER_ID) {
        await interaction.reply({
            content: '❌ This command is only available to the bot owner.',
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
        case 'activate-guild':
            await handleActivateGuild(interaction, client);
            break;
        case 'deactivate-guild':
            await handleDeactivateGuild(interaction, client);
            break;
    }
}


async function handleActivateGuild(
    interaction: ChatInputCommandInteraction,
    client: CustomClient
): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.options.getString('guild_id', true);
    const days = interaction.options.getInteger('days') || 30;

    try {
        // Validate guild ID format
        if (!/^\d{17,19}$/.test(guildId)) {
            await interaction.editReply('❌ Invalid guild ID format. Guild IDs should be 17-19 digits.');
            return;
        }

        // Check if guild exists in bot's cache
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            await interaction.editReply('❌ Guild not found. Make sure the bot is in that server.');
            return;
        }

        // Calculate premium expiration
        const premiumExpires = Date.now() + (days * 24 * 60 * 60 * 1000);

        // Get current interval config
        const intervalConfig = await client.intervals.get(guildId) || {
            enabled: false,
            next: Date.now(),
            statusMessage: null,
        };

        // Update with premium status
        const updatedConfig = {
            ...intervalConfig,
            isPremium: true,
            premiumExpires,
        };

        // Save to database
        await client.intervals.set(guildId, updatedConfig);

        // Update guild config cache
        let guildConfig = client.guildConfigs.get(guildId) || { servers: [] };
        guildConfig.interval = updatedConfig;
        client.guildConfigs.set(guildId, guildConfig);

        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('✅ Premium Activated Directly')
            .setDescription(`Premium has been activated for **${guild.name}**`)
            .addFields(
                {
                    name: 'Guild',
                    value: `${guild.name} (${guildId})`,
                    inline: true,
                },
                {
                    name: 'Duration',
                    value: `${days} days`,
                    inline: true,
                },
                {
                    name: 'Expires',
                    value: `<t:${Math.floor(premiumExpires / 1000)}:R>`,
                    inline: false,
                },
                {
                    name: 'Premium Features',
                    value: '• 3-minute monitoring intervals\n• Premium badge in all messages\n• Extended 90-day analytics\n• Multiple active servers (up to 5 simultaneously)',
                    inline: false,
                }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        console.log(
            `Premium activated directly for guild ${guild.name} (${guildId}) for ${days} days by ${interaction.user.tag}`
        );
    } catch (error) {
        console.error('Error activating premium for guild:', error);
        await interaction.editReply('❌ Failed to activate premium for guild.');
    }
}

async function handleDeactivateGuild(
    interaction: ChatInputCommandInteraction,
    client: CustomClient
): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.options.getString('guild_id', true);

    try {
        // Validate guild ID format
        if (!/^\d{17,19}$/.test(guildId)) {
            await interaction.editReply('❌ Invalid guild ID format. Guild IDs should be 17-19 digits.');
            return;
        }

        // Check if guild exists in bot's cache
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            await interaction.editReply('❌ Guild not found. Make sure the bot is in that server.');
            return;
        }

        // Get current interval config
        const intervalConfig = await client.intervals.get(guildId);
        if (!intervalConfig) {
            await interaction.editReply('❌ No configuration found for this guild.');
            return;
        }

        // Check if guild actually has premium
        if (!intervalConfig.isPremium) {
            await interaction.editReply('❌ This guild does not have premium activated.');
            return;
        }

        // Remove premium status
        const { premiumExpires, ...configWithoutPremium } = intervalConfig;
        const updatedConfig = {
            ...configWithoutPremium,
            isPremium: false,
        };

        // Save to database
        await client.intervals.set(guildId, updatedConfig);

        // Update guild config cache
        let guildConfig = client.guildConfigs.get(guildId) || { servers: [] };
        guildConfig.interval = updatedConfig;
        client.guildConfigs.set(guildId, guildConfig);

        const embed = new EmbedBuilder()
            .setColor(0xff6b6b)
            .setTitle('🗑️ Premium Deactivated')
            .setDescription(`Premium has been deactivated for **${guild.name}**`)
            .addFields(
                {
                    name: 'Guild',
                    value: `${guild.name} (${guildId})`,
                    inline: true,
                },
                {
                    name: 'Status',
                    value: 'Now using free tier features',
                    inline: true,
                },
                {
                    name: 'Free Tier Features',
                    value: '• 10-minute monitoring intervals\n• 30-day analytics\n• Single server monitoring',
                    inline: false,
                }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        console.log(
            `Premium deactivated for guild ${guild.name} (${guildId}) by ${interaction.user.tag}`
        );
    } catch (error) {
        console.error('Error deactivating premium for guild:', error);
        await interaction.editReply('❌ Failed to deactivate premium for guild.');
    }
}

