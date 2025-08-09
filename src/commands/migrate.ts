import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    MessageFlags,
} from 'discord.js';
import { CustomClient, getServerDataKey } from '../types';

interface LegacyChartData {
    maxPlayersToday: number;
    days: Array<{ value: number; date: number }>;
    name: string;
    maxPlayers: number;
    msg?: string;
}

interface LegacyUptimeStats {
    uptime: number;
    downtime: number;
}

export const data = new SlashCommandBuilder()
    .setName('migrate')
    .setDescription('Migrate data to new guild-specific format (Owner only)')
    .addBooleanOption(option =>
        option
            .setName('dry_run')
            .setDescription('Preview what would be migrated without making changes')
            .setRequired(false)
    )
    .addBooleanOption(option =>
        option
            .setName('force')
            .setDescription('Force migration even if new data already exists')
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

    const dryRun = interaction.options.getBoolean('dry_run') || false;
    const force = interaction.options.getBoolean('force') || false;

    try {
        const guilds = client.guilds.cache;
        console.log(`Starting migration for ${guilds.size} guilds (dry run: ${dryRun})`);

        let totalServersFound = 0;
        let totalMigrated = 0;
        let totalSkipped = 0;
        let totalErrors = 0;
        const migrationLog: string[] = [];

        for (const [guildId, guild] of guilds) {
            migrationLog.push(`\n**${guild.name}** (${guildId})`);

            try {
                const guildServers = (await client.servers.get(guildId)) || [];
                if (guildServers.length === 0) {
                    migrationLog.push(`  No servers configured`);
                    continue;
                }

                migrationLog.push(`  Found ${guildServers.length} server(s)`);
                totalServersFound += guildServers.length;

                for (const server of guildServers) {
                    const oldKey = server.id;
                    const newKey = getServerDataKey(guildId, server.id);

                    migrationLog.push(`    **${server.name}** (${server.id})`);
                    migrationLog.push(`      Old key: \`${oldKey}\``);
                    migrationLog.push(`      New key: \`${newKey}\``);

                    try {
                        const oldChartData = await client.maxPlayers.get(oldKey) as LegacyChartData | undefined;
                        const existingNewChartData = await client.maxPlayers.get(newKey);

                        if (oldChartData && (!existingNewChartData || force)) {
                            if (!dryRun) {
                                if (existingNewChartData && force) {
                                    const mergedData = { ...oldChartData };
                                    if (existingNewChartData.days && oldChartData.days) {
                                        const allDays = [...existingNewChartData.days, ...oldChartData.days];
                                        const uniqueDays = allDays.filter((day, index, self) =>
                                            index === self.findIndex(d =>
                                                Math.abs(d.date - day.date) < 86400000
                                            )
                                        );
                                        uniqueDays.sort((a, b) => a.date - b.date);
                                        mergedData.days = uniqueDays.slice(-30); // Keep last 30 days
                                    }
                                    await client.maxPlayers.set(newKey, mergedData);
                                    migrationLog.push(`      ✅ Merged chart data (${mergedData.days?.length || 0} days)`);
                                } else {
                                    await client.maxPlayers.set(newKey, oldChartData);
                                    migrationLog.push(`      ✅ Migrated chart data (${oldChartData.days?.length || 0} days)`);
                                }

                                // Delete old data
                                await client.maxPlayers.delete(oldKey);
                                migrationLog.push(`      🗑️ Deleted old chart data`);
                            } else {
                                migrationLog.push(`      📋 Would migrate chart data (${oldChartData.days?.length || 0} days)`);
                            }
                            totalMigrated++;
                        } else if (oldChartData && existingNewChartData) {
                            migrationLog.push(`      ⚠️ New chart data exists, skipping (use force:true to merge)`);
                            totalSkipped++;
                        } else {
                            migrationLog.push(`      ❌ No old chart data found`);
                        }

                        // Check uptime data
                        const oldUptimeData = await client.uptimes.get(oldKey) as LegacyUptimeStats | undefined;
                        const existingNewUptimeData = await client.uptimes.get(newKey);

                        if (oldUptimeData && (!existingNewUptimeData || force)) {
                            if (!dryRun) {
                                if (existingNewUptimeData && force) {
                                    // Merge uptime data
                                    const mergedUptime = {
                                        uptime: existingNewUptimeData.uptime + oldUptimeData.uptime,
                                        downtime: existingNewUptimeData.downtime + oldUptimeData.downtime,
                                    };
                                    await client.uptimes.set(newKey, mergedUptime);
                                    migrationLog.push(`      ✅ Merged uptime data`);
                                } else {
                                    await client.uptimes.set(newKey, oldUptimeData);
                                    migrationLog.push(`      ✅ Migrated uptime data`);
                                }

                                // Delete old uptime data
                                await client.uptimes.delete(oldKey);
                                migrationLog.push(`      🗑️ Deleted old uptime data`);
                            } else {
                                migrationLog.push(`      📋 Would migrate uptime data`);
                            }
                        } else if (oldUptimeData && existingNewUptimeData) {
                            migrationLog.push(`      ⚠️ New uptime data exists, skipping (use force:true to merge)`);
                        } else {
                            migrationLog.push(`      ❌ No old uptime data found`);
                        }

                    } catch (serverError) {
                        migrationLog.push(`      ❌ Error: ${serverError}`);
                        totalErrors++;
                    }
                }

            } catch (guildError) {
                migrationLog.push(`  ❌ Guild error: ${guildError}`);
                totalErrors++;
            }
        }

        // Create summary embed
        const embed = new EmbedBuilder()
            .setColor(totalErrors > 0 ? 0xff9500 : dryRun ? 0x3498db : 0x00ff00)
            .setTitle(`${dryRun ? '📋 Migration Preview' : '✅ Migration Complete'}`)
            .setDescription(
                dryRun
                    ? 'This shows what would be migrated. Use `dry_run: false` to perform actual migration.'
                    : 'Data migration has been completed successfully.'
            )
            .addFields(
                {
                    name: '📊 Statistics',
                    value:
                        `**Guilds processed:** ${guilds.size}\n` +
                        `**Servers found:** ${totalServersFound}\n` +
                        `**Successfully migrated:** ${totalMigrated}\n` +
                        `**Skipped (data exists):** ${totalSkipped}\n` +
                        `**Errors:** ${totalErrors}`,
                    inline: false,
                }
            )
            .setTimestamp();

        if (totalErrors === 0 && !dryRun) {
            embed.addFields({
                name: '🎉 Success',
                value: 'All data has been successfully migrated to the new guild-specific format!',
                inline: false,
            });
        } else if (totalErrors > 0) {
            embed.addFields({
                name: '⚠️ Warnings',
                value: `Migration completed with ${totalErrors} error(s). Check the detailed log below.`,
                inline: false,
            });
        }

        if (dryRun) {
            embed.addFields({
                name: '🚀 Next Steps',
                value: 'Run `/migrate dry_run:false` to perform the actual migration.',
                inline: false,
            });
        }

        // Split log into chunks for Discord's message limit
        const logChunks = [];
        let currentChunk = '';

        for (const line of migrationLog) {
            if (currentChunk.length + line.length > 1900) { // Leave room for formatting
                logChunks.push(currentChunk);
                currentChunk = line;
            } else {
                currentChunk += '\n' + line;
            }
        }
        if (currentChunk) logChunks.push(currentChunk);

        // Send initial response
        await interaction.editReply({ embeds: [embed] });

        for (let i = 0; i < logChunks.length; i++) {
            const logEmbed = new EmbedBuilder()
                .setColor(0x95a5a6)
                .setTitle(`Migration Log (${i + 1}/${logChunks.length})`)
                .setDescription(`\`\`\`${logChunks[i]}\`\`\``)
                .setTimestamp();

            await interaction.followUp({
                embeds: [logEmbed],
                flags: MessageFlags.Ephemeral
            });
        }

        console.log(`Migration ${dryRun ? 'preview' : 'completed'}: ${totalMigrated} migrated, ${totalSkipped} skipped, ${totalErrors} errors`);

    } catch (error) {
        console.error('Migration failed:', error);

        const errorEmbed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('❌ Migration Failed')
            .setDescription('An error occurred during the migration process.')
            .addFields({
                name: 'Error Details',
                value: error instanceof Error ? error.message : 'Unknown error',
                inline: false,
            })
            .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed] });
    }
}