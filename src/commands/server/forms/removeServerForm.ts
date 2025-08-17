import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
} from 'discord.js';

export function createRemoveServerModal(servers: any[]): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId('server_remove_form')
    .setTitle('Remove Server');

  const serverList = servers
    .map(s => `• ${s.name} (${s.ip}:${s.port})`)
    .join('\n');
  const placeholder = servers.length > 0 ? servers[0].name : 'Server Name';

  const availableServersInput = new TextInputBuilder()
    .setCustomId('available_servers')
    .setLabel('Available Servers (Read Only)')
    .setStyle(TextInputStyle.Paragraph)
    .setValue(serverList.slice(0, 4000))
    .setRequired(false);

  const serverInput = new TextInputBuilder()
    .setCustomId('server_name')
    .setLabel('Server Name to Remove')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(placeholder)
    .setRequired(true)
    .setMaxLength(64);

  const confirmInput = new TextInputBuilder()
    .setCustomId('confirm_delete')
    .setLabel('Type "delete" to confirm')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('delete')
    .setRequired(true)
    .setMaxLength(10);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      availableServersInput
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(serverInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(confirmInput)
  );

  return modal;
}

export interface ParsedRemoveServerForm {
  serverName: string;
  confirmText: string;
}

export function parseRemoveServerForm(
  interaction: ModalSubmitInteraction
): ParsedRemoveServerForm | { error: string } {
  const serverName = interaction.fields.getTextInputValue('server_name').trim();
  const confirmText = interaction.fields
    .getTextInputValue('confirm_delete')
    .trim();

  if (!serverName) {
    return { error: 'Server name is required.' };
  }

  if (!confirmText) {
    return { error: 'Confirmation text is required.' };
  }

  return { serverName, confirmText };
}
