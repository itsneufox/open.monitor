import { Guild, GuildMember } from 'discord.js';

export function getRoleColor(guild: Guild): number {
  // Get bot's highest role color or default to blue
  const botMember: GuildMember | undefined = guild.members.cache.get(guild.client.user.id);
  if (!botMember) return 0x3498db; // Blue as default
  
  const botRoles = botMember.roles.cache
    .filter(role => role.color !== 0)
    .sort((a, b) => b.position - a.position);
  
  if (botRoles.size === 0) return 0x3498db; // Blue as default
  return botRoles.first()!.color;
}