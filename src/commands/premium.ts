import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    MessageFlags,
} from 'discord.js';
import { CustomClient } from '../types';

export const data = new SlashCommandBuilder()
    .setName('premium')
    .setDescription('Manage premium features for your server')
    .addSubcommand(subcommand =>
        subcommand
            .setName('status')
            .setDescription('Check your current premium status')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('features')
            .setDescription('View all premium features')
    );

export async function execute(
    interaction: ChatInputCommandInteraction,
    client: CustomClient
): Promise<void> {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
        case 'status':
            await handleStatus(interaction, client);
            break;
        case 'features':
            await handleFeatures(interaction, client);
            break;
    }
}

async function handleStatus(
    interaction: ChatInputCommandInteraction,
    client: CustomClient
): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!interaction.guildId) {
        await interaction.editReply('This command can only be used in a server.');
        return;
    }

    const intervalConfig = await client.intervals.get(interaction.guildId);
    const isPremium = !!(intervalConfig?.isPremium &&
        intervalConfig.premiumExpires &&
        intervalConfig.premiumExpires > Date.now());

    const embed = new EmbedBuilder()
        .setColor(isPremium ? 0xffd700 : 0x808080)
        .setTitle('Premium Status')
        .setDescription(
            isPremium
                ? `✨ **Premium Active**\nExpires: <t:${Math.floor(intervalConfig!.premiumExpires! / 1000)}:R>`
                : '❌ **Free Tier**\nNo premium subscription active'
        )
        .addFields({
            name: 'Current Features',
            value: isPremium
                ? '• 3-minute monitoring intervals\n• Premium badge in all messages\n• Extended 90-day analytics\n• Multiple server support (up to 5)'
                : '• 10-minute monitoring intervals\n• 30-day analytics\n• Single server monitoring',
            inline: false,
        })
        .setTimestamp();

    if (!isPremium) {
        embed.addFields({
            name: 'Upgrade to Premium',
            value: 'Donate to get an activation code and unlock premium features!',
            inline: false,
        });
    }

    await interaction.editReply({ embeds: [embed] });
}


async function handleFeatures(
    interaction: ChatInputCommandInteraction,
    client: CustomClient
): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const embed = new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle('✨ Premium Features')
        .setDescription('Unlock the full potential of open.monitor with premium!')
        .addFields(
            {
                name: '🚀 Faster Monitoring',
                value: '3-minute intervals instead of 10 minutes for real-time updates',
                inline: false,
            },
            {
                name: '📊 Extended Analytics',
                value: '90-day chart history instead of 30 days for better insights',
                inline: false,
            },
            {
                name: '🖥️ Multiple Active Servers',
                value: 'Monitor up to 5 servers simultaneously (free users limited to 1)',
                inline: false,
            },
            {
                name: '🎨 Premium Badge',
                value: 'Special premium indicator in all status messages and charts',
                inline: false,
            },
        )
        .addFields({
            name: 'How to Get Premium',
            value: 'Contact the bot owner to activate premium for your server!',
            inline: false,
        })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}
