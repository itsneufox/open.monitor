import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { CustomClient } from '../../../types';
import { InputValidator } from '../../../utils/inputValidator';

export async function handleActivate(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
) {
  await interaction.deferReply();

  const serverToActivate = interaction.options.getString('server', true);
  const servers = (await client.servers.get(interaction.guildId!)) || [];

  if (servers.length === 0) {
    await interaction.editReply(
      'No servers configured. Use `/server add` to add a server first.'
    );
    return;
  }

  const server = servers.find(
    s => s.id === serverToActivate || s.name === serverToActivate
  );
  if (!server) {
    await interaction.editReply(
      'Server not found. Use `/server list` to see available servers.'
    );
    return;
  }

  let intervalConfig = await client.intervals.get(interaction.guildId!);
  if (!intervalConfig) {
    intervalConfig = {
      activeServerId: server.id,
      enabled: false,
      next: Date.now(),
      statusMessage: null,
    };
  } else {
    intervalConfig.activeServerId = server.id;
    intervalConfig.statusMessage = null;
  }

  await client.intervals.set(interaction.guildId!, intervalConfig);

  if (intervalConfig.serverIpChannel) {
    try {
      const serverIpChannel = await client.channels
        .fetch(intervalConfig.serverIpChannel)
        .catch(() => null);
      if (serverIpChannel && 'setName' in serverIpChannel) {
        const channelNameValidation = InputValidator.validateChannelName(
          `IP: ${server.ip}:${server.port}`
        );
        if (channelNameValidation.valid) {
          await (serverIpChannel as any).setName(
            channelNameValidation.sanitized
          );
        }
      }
    } catch (error) {
      console.error('Failed to update IP channel name:', error);
    }
  }

  let guildConfig = client.guildConfigs.get(interaction.guildId!) || {
    servers: [],
  };
  guildConfig.servers = servers;
  guildConfig.interval = intervalConfig;
  client.guildConfigs.set(interaction.guildId!, guildConfig);

  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle('Server Activated')
    .setDescription(`**${server.name}** is now the active server`)
    .addFields(
      {
        name: 'Server Address',
        value: `${server.ip}:${server.port}`,
        inline: true,
      },
      {
        name: 'Monitoring',
        value: intervalConfig.enabled ? 'Enabled' : 'Disabled',
        inline: true,
      },
      {
        name: 'Next Steps',
        value: intervalConfig.enabled
          ? 'Server monitoring is active!'
          : 'Use `/monitor setup` to configure monitoring',
        inline: false,
      }
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
