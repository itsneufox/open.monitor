import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { CustomClient } from '../../../types';

export async function handleEnable(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const intervalConfig = await client.intervals.get(interaction.guildId!);
  if (!intervalConfig) {
    await interaction.editReply(
      'No monitoring configuration found. Use `/monitor setup` first.'
    );
    return;
  }

  if (!intervalConfig.statusChannel) {
    await interaction.editReply(
      'No status channel configured. Use `/monitor setup` to configure monitoring.'
    );
    return;
  }

  if (intervalConfig.enabled) {
    await interaction.editReply('Monitoring is already enabled.');
    return;
  }

  intervalConfig.enabled = true;
  intervalConfig.next = Date.now();
  await client.intervals.set(interaction.guildId!, intervalConfig);

  let guildConfig = client.guildConfigs.get(interaction.guildId!) || {
    servers: [],
  };
  guildConfig.interval = intervalConfig;
  client.guildConfigs.set(interaction.guildId!, guildConfig);

  await interaction.editReply(
    '**Monitoring enabled!** Status updates will begin within 10 minutes.'
  );
}
