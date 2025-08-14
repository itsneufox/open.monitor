import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { CustomClient } from '../../../types';

export async function handleDisable(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const intervalConfig = await client.intervals.get(interaction.guildId!);
  if (!intervalConfig || !intervalConfig.enabled) {
    await interaction.editReply('Monitoring is already disabled.');
    return;
  }

  intervalConfig.enabled = false;
  await client.intervals.set(interaction.guildId!, intervalConfig);

  let guildConfig = client.guildConfigs.get(interaction.guildId!) || {
    servers: [],
  };
  guildConfig.interval = intervalConfig;
  client.guildConfigs.set(interaction.guildId!, guildConfig);

  await interaction.editReply(
    '**Monitoring disabled.** Use `/monitor enable` to resume monitoring.'
  );
}