import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction } from 'discord.js';
import { CustomClient, ChartData } from '../types';

export const data = new SlashCommandBuilder()
  .setName('testchart')
  .setDescription('Generate test data for chart testing (ADMIN ONLY)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction, client: CustomClient): Promise<void> {
  await interaction.deferReply();
  
  const servers = await client.servers.get(interaction.guildId!) || [];
  if (servers.length === 0) {
    await interaction.editReply('❌ No servers configured. Add a server first.');
    return;
  }
  
  const intervalConfig = await client.intervals.get(interaction.guildId!);
  if (!intervalConfig?.activeServerId) {
    await interaction.editReply('❌ No active server set.');
    return;
  }
  
  const activeServer = servers.find(s => s.id === intervalConfig.activeServerId);
  if (!activeServer) {
    await interaction.editReply('❌ Active server not found.');
    return;
  }
  
  // Generate 30 days of fake data
  const testData: ChartData = {
    maxPlayersToday: 150,
    name: activeServer.name,
    maxPlayers: 1000,
    days: []
  };
  
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  
  for (let i = 29; i >= 0; i--) {
    const date = now - (i * oneDayMs);
    const value = Math.floor(Math.random() * 200) + 50; // Random between 50-250
    
    testData.days.push({
      value: value,
      date: date
    });
  }
  
  // Save test data
  await client.maxPlayers.set(activeServer.id, testData);
  
  await interaction.editReply(`✅ Generated 30 days of test data for **${activeServer.name}**\n\n💡 Now try: \`/chart\``);
}