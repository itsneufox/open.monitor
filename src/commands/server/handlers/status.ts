import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { CustomClient } from '../../../types';
import { InputValidator } from '../../../utils/inputValidator';
import { getStatus, getRoleColor } from '../../../utils';

export async function handleStatus(
  interaction: ChatInputCommandInteraction,
  client: CustomClient
) {
  await interaction.deferReply();

  const fresh = interaction.options.getBoolean('fresh') || false;

  if (fresh) {
    const rateLimitCheck = InputValidator.checkCommandRateLimit(
      interaction.user.id,
      'server-status-fresh',
      2
    );

    if (!rateLimitCheck.allowed) {
      await interaction.editReply(
        `❌ Fresh status requests are limited to prevent rate limits. Please wait ${Math.ceil((rateLimitCheck.remainingTime || 0) / 1000)} seconds.\n\n` +
          `💡 **Tip:** Regular status checks (without \`fresh: true\`) are unlimited and show recent data.`
      );
      return;
    }
  }

  const servers = (await client.servers.get(interaction.guildId!)) || [];
  if (servers.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xff6b6b)
      .setTitle('❌ No Servers Configured')
      .setDescription('No servers have been configured for this guild.')
      .addFields(
        {
          name: 'Getting Started',
          value:
            'Use `/server add` to configure a SA:MP/open.mp server to monitor.',
        },
        {
          name: 'Example',
          value:
            'Just run `/server add` and fill out the form with your server details',
        }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const requestedServer = interaction.options.getString('server');
  let targetServer;

  if (requestedServer) {
    targetServer = servers.find(
      s => s.id === requestedServer || s.name === requestedServer
    );
    if (!targetServer) {
      await interaction.editReply(
        '❌ Server not found. Use `/server list` to see available servers.'
      );
      return;
    }
  } else {
    const intervalConfig = await client.intervals.get(interaction.guildId!);
    if (!intervalConfig?.activeServerId) {
      if (servers.length === 1) {
        targetServer = servers[0];
      } else {
        await interaction.editReply(
          '❌ No active server set and multiple servers available. Use `/server activate` to set an active server, or specify which server to check.'
        );
        return;
      }
    } else {
      targetServer = servers.find(s => s.id === intervalConfig.activeServerId);
      if (!targetServer) {
        await interaction.editReply(
          '❌ Active server not found. Use `/server activate` to set a valid server.'
        );
        return;
      }
    }
  }

  if (!targetServer) {
    await interaction.editReply('❌ Unable to determine target server.');
    return;
  }

  try {
    const color = getRoleColor(interaction.guild!);

    const embed = await getStatus(
      targetServer,
      color,
      interaction.guildId!,
      false,
      interaction.user.id,
      true
    );

    if (targetServer.name !== `${targetServer.ip}:${targetServer.port}`) {
      const currentTitle = embed.data.title || 'Server Status';
      embed.setTitle(`${currentTitle} - ${targetServer.name}`);
    }

    if (fresh) {
      embed.setFooter({
        text: `Fresh data requested • ${embed.data.footer?.text || 'Last updated'}`,
      });
    } else {
      embed.setFooter({
        text: `Cached data (use fresh:true for live data) • ${embed.data.footer?.text || 'Last updated'}`,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error getting server status:', error);

    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('❌ Error')
      .setDescription(
        `Failed to retrieve status for **${targetServer.name}** (${targetServer.ip}:${targetServer.port})\nThe server might be offline or unreachable.`
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}
