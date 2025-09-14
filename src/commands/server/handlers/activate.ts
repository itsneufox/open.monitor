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

  // Check if user has premium
  const isPremium = !!(intervalConfig?.isPremium &&
    intervalConfig.premiumExpires &&
    intervalConfig.premiumExpires > Date.now());
  if (!intervalConfig) {
    intervalConfig = {
      activeServerId: server.id, // Legacy support
      activeServerIds: [server.id], // New format
      enabled: false,
      next: Date.now(),
      statusMessage: null,
    };
  } else {
    if (isPremium) {
      // Premium: Add to active servers list (up to 5)
      if (!intervalConfig.activeServerIds) {
        intervalConfig.activeServerIds = [];
      }

      if (!intervalConfig.activeServerIds.includes(server.id)) {
        if (intervalConfig.activeServerIds.length >= 5) {
          await interaction.editReply(
            '❌ Premium users can have up to 5 active servers. Remove one first with `/server deactivate`.'
          );
          return;
        }
        intervalConfig.activeServerIds.push(server.id);
      }

      // Keep legacy field for backward compatibility
      intervalConfig.activeServerId = intervalConfig.activeServerIds[0]!;
    } else {
      // Free: Single server only - replace any existing active server
      intervalConfig.activeServerId = server.id;
      intervalConfig.activeServerIds = [server.id];
    }
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
