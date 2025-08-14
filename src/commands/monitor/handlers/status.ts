import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { CustomClient, ServerConfig } from '../../../types';

export async function handleStatus(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const servers = (await client.servers.get(interaction.guildId!)) || [];
  const intervalConfig = await client.intervals.get(interaction.guildId!);

  const embed = new EmbedBuilder()
    .setColor(intervalConfig?.enabled ? 0x00ff00 : 0xff6b6b)
    .setTitle('Monitoring Status')
    .setTimestamp();

  if (servers.length === 0) {
    embed.setDescription('No servers configured').addFields({
      name: 'Next Steps',
      value: 'Use `/server add` to add a server',
    });
  } else if (!intervalConfig?.activeServerId) {
    embed.setDescription('No active server set').addFields({
      name: 'Next Steps',
      value: 'Use `/server activate` to set an active server',
    });
  } else {
    const activeServer = servers.find(
      (s: ServerConfig) => s.id === intervalConfig.activeServerId
    );

    const nextUpdate = intervalConfig.next || Date.now();
    const timeUntilUpdate = Math.max(0, nextUpdate - Date.now());
    const nextUpdateText =
      timeUntilUpdate > 0
        ? `<t:${Math.floor(nextUpdate / 1000)}:R>`
        : 'Very soon';

    embed
      .setDescription(
        `**Status:** ${intervalConfig.enabled ? 'Active' : 'Disabled'}`
      )
      .addFields(
        {
          name: 'Active Server',
          value: activeServer?.name || 'Unknown',
          inline: true,
        },
        {
          name: 'Address',
          value: activeServer
            ? `${activeServer.ip}:${activeServer.port}`
            : 'Unknown',
          inline: true,
        },
        {
          name: 'Next Update',
          value: intervalConfig.enabled ? nextUpdateText : 'Disabled',
          inline: true,
        },
        {
          name: 'Status Channel',
          value: intervalConfig.statusChannel
            ? `<#${intervalConfig.statusChannel}>`
            : 'Not set',
          inline: true,
        },
        {
          name: 'Chart Channel',
          value: intervalConfig.chartChannel
            ? `<#${intervalConfig.chartChannel}>`
            : 'Not set',
          inline: true,
        },
        {
          name: 'Player Count Voice Channel',
          value: intervalConfig.playerCountChannel
            ? `<#${intervalConfig.playerCountChannel}>`
            : 'Not set',
          inline: true,
        },
        {
          name: 'Server IP Voice Channel',
          value: intervalConfig.serverIpChannel
            ? `<#${intervalConfig.serverIpChannel}>`
            : 'Not set',
          inline: true,
        }
      );

    embed.addFields({
      name: 'Update Schedule',
      value:
        'Status Updates: Every 10 minutes\nDaily Charts: Posted at midnight\nVoice Channels: Updated every 10 minutes',
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}