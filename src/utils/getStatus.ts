import { EmbedBuilder } from 'discord.js';
import { ServerConfig } from '../types';
import { SAMPQuery } from './sampQuery';

const sampQuery = new SAMPQuery();

export async function getStatus(server: ServerConfig, color: number): Promise<EmbedBuilder> {
  let statusTitle = 'Server Status';
  
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTimestamp();

  try {
    const info = await sampQuery.getServerInfo(server);
    
    if (!info) {
      embed
        .setTitle(statusTitle)
        .setDescription(`**${server.ip}:${server.port}**\n❌ Server is offline or unreachable`);
      return embed;
    }

    // Get server rules for version info
    const rules = await sampQuery.getServerRules(server);
    
    // Get version directly from server rules
    let detectedVersion = 'Unknown';
    if (rules.version) {
      detectedVersion = rules.version;
    } else if (rules.Ver) {
      detectedVersion = rules.Ver;
    } else if (rules.v) {
      detectedVersion = rules.v;
    }
    
    // Detect server type based on hostname, gamemode, or version
    const hostname = info.hostname.toLowerCase();
    const gamemode = info.gamemode.toLowerCase();
    
    if (hostname.includes('open.mp') || hostname.includes('openmp') || 
        gamemode.includes('open.mp') || gamemode.includes('openmp') ||
        detectedVersion.toLowerCase().includes('open.mp') ||
        info.maxplayers >= 1000) {
      statusTitle = '🔥 open.mp Server Status';
      if (detectedVersion === 'Unknown') {
        detectedVersion = 'open.mp';
      }
    } else {
      statusTitle = '🎮 SA:MP Server Status';
      if (detectedVersion === 'Unknown') {
        detectedVersion = 'SA:MP';
      }
    }

    embed.setTitle(statusTitle);

    // Get player list for smaller servers
    let playerList = '';
    if (info.players <= 100) {
      try {
        const players = await sampQuery.getPlayers(server);
        
        if (players.length > 0) {
          const displayPlayers = players.slice(0, 15);
          playerList = displayPlayers.map(player => 
            `${player.name} (Score: ${player.score})`
          ).join('\n');
          
          if (players.length > 15) {
            playerList += `\n... and ${players.length - 15} more players`;
          }
        } else {
          playerList = 'No players online';
        }
      } catch (error) {
        playerList = `${info.players} players online (names unavailable)`;
      }
    } else {
      playerList = `${info.players} players online (too many to list)`;
    }

    if (playerList.length > 1020) {
      playerList = playerList.substring(0, 1020) + '...';
    }

    embed
      .setDescription(`**${info.hostname}**\n${server.ip}:${server.port}`)
      .addFields(
        { name: '👥 Players', value: `${info.players}/${info.maxplayers}`, inline: true },
        { name: '🎮 Gamemode', value: info.gamemode || 'Unknown', inline: true },
        { name: '🌍 Language', value: info.language || 'Unknown', inline: true },
        { name: '📦 Version', value: detectedVersion, inline: true },
        { name: '🔒 Password', value: info.password ? 'Yes' : 'No', inline: true },
        { name: '📊 Status', value: '✅ Online', inline: true },
        { name: '👤 Players Online', value: playerList }
      );
    
    return embed;
  } catch (error) {
    console.error('Error getting server status:', error);
    embed
      .setTitle(statusTitle)
      .setDescription(`**${server.ip}:${server.port}**\n❌ Error querying server`);
    return embed;
  }
}