import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, TextChannel, VoiceChannel, MessageFlags, Channel, ChannelType } from 'discord.js';
import { CustomClient } from '../types';
import { getPlayerCount, getStatus, getRoleColor } from '../utils';
import { checkPermissionOrReply } from '../utils/permissions';

export const data = new SlashCommandBuilder()
  .setName('forceupdate')
  .setDescription('Force immediate server status update')
  .addStringOption(option =>
    option.setName('server')
      .setDescription('Which server to update (leave empty for active server)')
      .setRequired(false)
      .setAutocomplete(true));

export async function execute(interaction: ChatInputCommandInteraction, client: CustomClient): Promise<void> {
  // Check permissions first (before deferReply)
  if (!await checkPermissionOrReply(interaction, client)) {
    return;
  }
  
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  
  try {
    // Get all servers for this guild
    const servers = await client.servers.get(interaction.guildId!) || [];
    if (servers.length === 0) {
      await interaction.editReply('❌ No servers configured. Use `/server add` to add a server first.');
      return;
    }
    
    // Get interval config to find active server
    const intervalConfig = await client.intervals.get(interaction.guildId!);
    if (!intervalConfig) {
      await interaction.editReply('❌ No monitoring configuration found. Use `/monitor setup` to configure monitoring.');
      return;
    }
    
    // Determine which server to update
    const requestedServer = interaction.options.getString('server');
    let targetServer;
    
    if (requestedServer) {
      targetServer = servers.find(s => s.id === requestedServer || s.name === requestedServer);
      if (!targetServer) {
        await interaction.editReply('❌ Server not found. Use `/server list` to see available servers.');
        return;
      }
    } else {
      if (!intervalConfig.activeServerId) {
        await interaction.editReply('❌ No active server set. Use `/server activate` to set an active server.');
        return;
      }
      targetServer = servers.find(s => s.id === intervalConfig.activeServerId);
      if (!targetServer) {
        await interaction.editReply('❌ Active server not found. Use `/server activate` to set a valid server.');
        return;
      }
    }
    
    if (!intervalConfig.enabled) {
      await interaction.editReply('❌ Monitoring is currently disabled. Enable it with `/monitor enable`.');
      return;
    }
    
    await interaction.editReply(`🔄 **Force updating ${targetServer.name}...**`);
    
    // Get fresh server data with timeout
    console.log(`🔍 Getting player count for ${targetServer.name}...`);
    const info = await Promise.race([
      getPlayerCount(targetServer),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Server query timeout')), 10000))
    ]) as any;
    
    console.log(`📊 Server data received: ${info.isOnline ? 'Online' : 'Offline'} - ${info.playerCount}/${info.maxPlayers}`);
    
    let updatesSummary = '';
    let updatesCount = 0;
    
    // Update status channel (only if this is the active server)
    if (intervalConfig.activeServerId === targetServer.id && intervalConfig.statusChannel) {
      console.log('📝 Updating status channel...');
      try {
        const statusChannel = await Promise.race([
          client.channels.fetch(intervalConfig.statusChannel),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Channel fetch timeout')), 5000))
        ]) as Channel | null;
        
        if (statusChannel && statusChannel.type === ChannelType.GuildText) {
          const textChannel = statusChannel as TextChannel;
          const color = getRoleColor(interaction.guild!);
          const serverEmbed = await getStatus(targetServer, color);
          
          if (intervalConfig.statusMessage) {
            try {
              const existingMsg = await Promise.race([
                textChannel.messages.fetch(intervalConfig.statusMessage),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Message fetch timeout')), 5000))
              ]) as any;
              
              await existingMsg.edit({ embeds: [serverEmbed] });
              updatesSummary += '✅ Status embed updated\n';
              updatesCount++;
              console.log('✅ Status embed updated');
            } catch (error) {
              console.log('📝 Creating new status message...');
              const newMsg = await textChannel.send({ embeds: [serverEmbed] });
              intervalConfig.statusMessage = newMsg.id;
              await client.intervals.set(interaction.guildId!, intervalConfig);
              updatesSummary += '✅ New status message sent\n';
              updatesCount++;
              console.log('✅ New status message sent');
            }
          } else {
            console.log('📝 Creating initial status message...');
            const newMsg = await textChannel.send({ embeds: [serverEmbed] });
            intervalConfig.statusMessage = newMsg.id;
            await client.intervals.set(interaction.guildId!, intervalConfig);
            updatesSummary += '✅ Initial status message sent\n';
            updatesCount++;
            console.log('✅ Initial status message sent');
          }
        }
      } catch (error) {
        updatesSummary += '❌ Failed to update status channel\n';
        console.error('❌ Status channel update error:', error);
      }
    }
    
    // Update player count channel (only if this is the active server)
    if (intervalConfig.activeServerId === targetServer.id && intervalConfig.playerCountChannel) {
      console.log('👥 Updating player count channel...');
      try {
        const playerCountChannel = await Promise.race([
          client.channels.fetch(intervalConfig.playerCountChannel),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Channel fetch timeout')), 5000))
        ]) as Channel | null;
        
        if (playerCountChannel && (playerCountChannel.type === ChannelType.GuildVoice || playerCountChannel.type === ChannelType.GuildText)) {
          const channel = playerCountChannel as TextChannel | VoiceChannel;
          const newName = info.isOnline 
            ? `👥 Players: ${info.playerCount}/${info.maxPlayers}`
            : '👥 Server Offline';
          
          if (channel.name !== newName) {
            await Promise.race([
              channel.setName(newName),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Channel rename timeout')), 15000)) // Increased timeout
            ]);
            updatesSummary += '✅ Player count channel updated\n';
            updatesCount++;
            console.log('✅ Player count channel updated');
          } else {
            updatesSummary += 'ℹ️ Player count channel already up to date\n';
            console.log('ℹ️ Player count channel already up to date');
          }
        }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            if (errorMessage === 'Channel rename timeout') {
                updatesSummary += '⏰ Player count channel update timed out (Discord rate limit)\n';
                console.warn('⏰ Player count channel update timed out - likely rate limited');
            } else {
                updatesSummary += '❌ Failed to update player count channel\n';
                console.error('❌ Player count channel update error:', error);
            }
        }
    }
    
    // Update the guild config cache with any changes
    let guildConfig = client.guildConfigs.get(interaction.guildId!) || { servers: [] };
    guildConfig.interval = intervalConfig;
    client.guildConfigs.set(interaction.guildId!, guildConfig);
    
    console.log('📋 Creating result embed...');
    
    // Create result embed
    const resultEmbed = new EmbedBuilder()
      .setColor(info.isOnline ? 0x00ff00 : 0xff0000)
      .setTitle('🔄 Force Update Complete')
      .setDescription(`**${targetServer.name}**\n${targetServer.ip}:${targetServer.port}`)
      .addFields(
        { name: '📊 Server Status', value: info.isOnline ? '✅ Online' : '❌ Offline', inline: true },
        { name: '👥 Players', value: `${info.playerCount}/${info.maxPlayers}`, inline: true },
        { name: '🔄 Updates Applied', value: updatesCount.toString(), inline: true }
      )
      .setTimestamp();
    
    // Only show update summary if there were updates or failures
    if (updatesSummary.trim()) {
      resultEmbed.addFields({ name: '📋 Update Summary', value: updatesSummary.trim(), inline: false });
    }
    
    // Add note if no channels are configured
    if (!intervalConfig.statusChannel && !intervalConfig.playerCountChannel) {
      resultEmbed.addFields({ 
        name: '💡 No Channels Configured', 
        value: 'Use `/monitor setup` to configure channels for automatic updates.', 
        inline: false 
      });
    }
    
    console.log('✅ Force update completed successfully');
    await interaction.editReply({ embeds: [resultEmbed] });
    
  } catch (error) {
    console.error('❌ Error in force update:', error);
    
    try {
      await interaction.editReply('❌ An error occurred while force updating. Check the logs for details.');
    } catch (replyError) {
      console.error('❌ Failed to send error reply:', replyError);
    }
  }
}