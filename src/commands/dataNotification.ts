import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    MessageFlags,
    TextChannel,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    ButtonInteraction,
} from 'discord.js';
import { CustomClient } from '../types';

interface NotificationText {
    title: string;
    description: string;
    dataRecovery: {
        name: string;
        value: string;
    };
    guildInfo: {
        name: string;
        value: string;
    };
    movingForward: {
        name: string;
        value: string;
    };
    footer: string;
    buttons: {
        english: string;
        portuguese: string;
        spanish: string;
    };
}

const translations: Record<string, NotificationText> = {
    en: {
        title: '⚠️ Important: Database Issue Notice',
        description: 'Due to a recent database issue, all monitoring data collected before **August 10th** has been lost.',
        dataRecovery: {
            name: '📊 Data Recovery',
            value:
                'If you have a recent chart screenshot and would like your historical data restored:\n' +
                '• Send the latest chart image to [GitHub Issues](https://github.com/itsneufox/open.monitor/issues)\n' +
                '• Include your server name or this guild ID in the message\n' +
                '• Data will be manually restored when possible',
        },
        guildInfo: {
            name: '📋 This Guild ID',
            value: '**Guild ID:** `{guildId}`',
        },
        movingForward: {
            name: '🔄 Moving Forward',
            value: 'New data collection continues normally. I am very sorry for this issue.',
        },
        footer: 'This message will auto-delete in 24 hours',
        buttons: {
            english: 'English',
            portuguese: 'Português',
            spanish: 'Español',
        },
    },
    pt: {
        title: '⚠️ Importante: Aviso de Problema na Base de Dados',
        description: 'Devido a um problema recente na base de dados, todos os dados de monitoramento coletados antes de **10 de Agosto** foram perdidos.',
        dataRecovery: {
            name: '📊 Recuperação de Dados',
            value:
                'Se você tem uma captura de tela do gráfico recente e gostaria de restaurar seus dados históricos:\n' +
                '• Envie a imagem do gráfico mais recente para [GitHub Issues](https://github.com/itsneufox/open.monitor/issues)\n' +
                '• Inclua o nome do seu servidor ou este ID da guild na mensagem\n' +
                '• Os dados serão restaurados manualmente quando possível',
        },
        guildInfo: {
            name: '📋 ID desta Guild',
            value: '**ID da Guild:** `{guildId}`',
        },
        movingForward: {
            name: '🔄 Seguindo em Frente',
            value: 'A nova coleta de dados continua normalmente. Peço muito desculpas por este problema.',
        },
        footer: 'Esta mensagem será auto-deletada em 24 horas',
        buttons: {
            english: 'English',
            portuguese: 'Português',
            spanish: 'Español',
        },
    },
    es: {
        title: '⚠️ Importante: Aviso de Problema en la Base de Datos',
        description: 'Debido a un problema reciente en la base de datos, todos los datos de monitoreo recopilados antes del **10 de Agosto** se han perdido.',
        dataRecovery: {
            name: '📊 Recuperación de Datos',
            value:
                'Si tienes una captura de pantalla del gráfico reciente y te gustaría restaurar tus datos históricos:\n' +
                '• Envía la imagen del gráfico más reciente a [GitHub Issues](https://github.com/itsneufox/open.monitor/issues)\n' +
                '• Incluye el nombre de tu servidor o este ID del guild en el mensaje\n' +
                '• Los datos serán restaurados manualmente cuando sea posible',
        },
        guildInfo: {
            name: '📋 ID de este Guild',
            value: '**ID del Guild:** `{guildId}`',
        },
        movingForward: {
            name: '🔄 Siguiendo Adelante',
            value: 'La nueva recopilación de datos continúa normalmente. Lamento mucho este problema.',
        },
        footer: 'Este mensaje se auto-eliminará en 24 horas',
        buttons: {
            english: 'English',
            portuguese: 'Português',
            spanish: 'Español',
        },
    },
};

function getTranslation(language: string): NotificationText {
    return translations[language] ?? translations['en']!;
}

export const data = new SlashCommandBuilder()
    .setName('senddata-notification')
    .setDescription('Send data loss notification to all guilds (Owner only)')
    .addStringOption(option =>
        option
            .setName('language')
            .setDescription('Default language for notifications')
            .addChoices(
                { name: 'English', value: 'en' },
                { name: 'Português', value: 'pt' },
                { name: 'Español', value: 'es' }
            )
            .setRequired(false)
    )
    .addBooleanOption(option =>
        option
            .setName('force')
            .setDescription('Force send even if already sent before')
            .setRequired(false)
    );

export async function execute(
    interaction: ChatInputCommandInteraction,
    client: CustomClient
): Promise<void> {
    if (interaction.user.id !== process.env.OWNER_ID) {
        await interaction.reply({
            content: 'This command is only available to the bot owner.',
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const defaultLanguage = (interaction.options.getString('language') as 'en' | 'pt' | 'es') || 'en';
    const force = interaction.options.getBoolean('force') || false;

    let sentCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let resetCount = 0;

    for (const [guildId, guildConfig] of client.guildConfigs.entries()) {
        try {
            const intervalConfig = guildConfig.interval;

            // Skip if already sent and not forcing
            if (intervalConfig?.dataLossNotificationSent && !force) {
                skippedCount++;
                continue;
            }

            if (!intervalConfig?.statusChannel) {
                skippedCount++;
                continue;
            }

            const statusChannel = await client.channels
                .fetch(intervalConfig.statusChannel)
                .catch(() => null) as TextChannel | null;

            if (!statusChannel) {
                skippedCount++;
                continue;
            }

            // Reset the flag if forcing
            if (force && intervalConfig?.dataLossNotificationSent) {
                intervalConfig.dataLossNotificationSent = false;
                await client.intervals.set(guildId, intervalConfig);
                resetCount++;
            }

            const language = intervalConfig.preferredLanguage || defaultLanguage;
            const message = await sendNotificationMessage(statusChannel, guildId, language, client);

            if (message) {
                // Set auto-delete timeout
                setTimeout(async () => {
                    try {
                        await message.delete();
                    } catch (error) {
                        console.log(`Could not auto-delete notification message in guild ${guildId}`);
                    }
                }, 24 * 60 * 60 * 1000);
            }

            // Mark as sent
            if (!intervalConfig) {
                const newConfig = {
                    enabled: false,
                    next: Date.now(),
                    statusMessage: null,
                    dataLossNotificationSent: true,
                    preferredLanguage: language,
                };
                await client.intervals.set(guildId, newConfig);
                guildConfig.interval = newConfig;
            } else {
                intervalConfig.dataLossNotificationSent = true;
                intervalConfig.preferredLanguage = language;
                await client.intervals.set(guildId, intervalConfig);
            }

            client.guildConfigs.set(guildId, guildConfig);
            sentCount++;

        } catch (error) {
            console.error(`Failed to send notification to guild ${guildId}:`, error);
            errorCount++;
        }
    }

    const resultEmbed = new EmbedBuilder()
        .setColor(errorCount > 0 ? 0xff9500 : 0x00ff00)
        .setTitle('📢 Data Loss Notification Results')
        .addFields(
            { name: 'Sent Successfully', value: sentCount.toString(), inline: true },
            { name: 'Skipped', value: skippedCount.toString(), inline: true },
            { name: 'Errors', value: errorCount.toString(), inline: true },
            { name: 'Default Language', value: defaultLanguage.toUpperCase(), inline: true },
        )
        .setTimestamp();

    if (force && resetCount > 0) {
        resultEmbed.addFields({
            name: 'Force Reset',
            value: `Reset ${resetCount} guild(s) notification flags`,
            inline: true,
        });
    }

    await interaction.editReply({ embeds: [resultEmbed] });
}

async function sendNotificationMessage(
    channel: TextChannel,
    guildId: string,
    language: string,
    client: CustomClient
) {
    const text = getTranslation(language);

    const embed = createNotificationEmbed(text, guildId);
    const buttons = createLanguageButtons(text);

    const message = await channel.send({
        embeds: [embed],
        components: [buttons],
    });

    const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 24 * 60 * 60 * 1000,
    });

    collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
        // Only handle language change buttons (no delete button)
        const newLanguage = buttonInteraction.customId.replace('lang_', '') as 'en' | 'pt' | 'es';
        const newText = getTranslation(newLanguage);
        const newEmbed = createNotificationEmbed(newText, guildId);
        const newButtons = createLanguageButtons(newText);

        await buttonInteraction.update({
            embeds: [newEmbed],
            components: [newButtons],
        });

        try {
            const guildConfig = client.guildConfigs.get(guildId);
            if (guildConfig?.interval) {
                guildConfig.interval.preferredLanguage = newLanguage;
                await client.intervals.set(guildId, guildConfig.interval);
                client.guildConfigs.set(guildId, guildConfig);
            }
        } catch (error) {
            console.error('Failed to update guild language preference:', error);
        }
    });

    collector.on('end', () => {
        const disabledButtons = createLanguageButtons(getTranslation(language), true);
        message.edit({ components: [disabledButtons] }).catch(() => { });
    });

    return message;
}

function createNotificationEmbed(text: NotificationText, guildId: string): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle(text.title)
        .setDescription(text.description)
        .addFields(
            {
                name: text.dataRecovery.name,
                value: text.dataRecovery.value,
                inline: false,
            },
            {
                name: text.guildInfo.name,
                value: text.guildInfo.value.replace('{guildId}', guildId),
                inline: false,
            },
            {
                name: text.movingForward.name,
                value: text.movingForward.value,
                inline: false,
            }
        )
        .setFooter({ text: text.footer })
        .setTimestamp();
}

function createLanguageButtons(text: NotificationText, disabled = false): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('lang_en')
            .setLabel(text.buttons.english)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🇺🇸')
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('lang_pt')
            .setLabel(text.buttons.portuguese)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🇧🇷')
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('lang_es')
            .setLabel(text.buttons.spanish)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🇪🇸')
            .setDisabled(disabled)
    );
}