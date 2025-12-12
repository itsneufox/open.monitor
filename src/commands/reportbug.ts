import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('reportbug')
  .setDescription('Get the link to report bugs or request support');

export async function execute(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(0xff6b6b)
    .setTitle('Report a Bug or Request Support')
    .setDescription(
      'Thanks for helping improve open.monitor! Use the link below to open a GitHub issue. ' +
        'Please include:\n' +
        '- What happened and what you expected\n' +
        '- The commands you ran or buttons you pressed\n' +
        '- Relevant screenshots or log excerpts'
    )
    .addFields(
      {
        name: 'Why GitHub Issues?',
        value:
          'Issues let us track, triage, and resolve problems transparently. You can also upvote or follow existing reports.',
      },
      {
        name: 'Need Command Reference?',
        value: 'Run `/help` anytime for a quick command overview.',
      }
    )
    .setFooter({ text: 'Thank you for keeping the project healthy!' })
    .setTimestamp();

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Open GitHub Issues')
      .setStyle(ButtonStyle.Link)
      .setURL('https://github.com/itsneufox/open.monitor/issues'),
    new ButtonBuilder()
      .setLabel('View Documentation')
      .setStyle(ButtonStyle.Link)
      .setURL('https://github.com/itsneufox/open.monitor#readme')
  );

  await interaction.reply({
    embeds: [embed],
    components: [buttons],
    flags: MessageFlags.Ephemeral,
  });
}
