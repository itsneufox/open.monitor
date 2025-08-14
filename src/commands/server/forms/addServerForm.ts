import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
} from 'discord.js';

export function createAddServerModal(): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId('server_add_form')
    .setTitle('Add SA:MP/open.mp Server');

  const nameInput = new TextInputBuilder()
    .setCustomId('server_name')
    .setLabel('Server Name')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('My Awesome Server')
    .setRequired(true)
    .setMaxLength(64);

  const ipInput = new TextInputBuilder()
    .setCustomId('server_ip')
    .setLabel('Server IP Address or Domain')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('127.0.0.1 or server.example.com')
    .setRequired(true)
    .setMaxLength(253);

  const portInput = new TextInputBuilder()
    .setCustomId('server_port')
    .setLabel('Server Port')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('7777 (default)')
    .setRequired(false)
    .setMaxLength(5);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(ipInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(portInput)
  );

  return modal;
}

export interface ParsedServerForm {
  ip: string;
  port: number;
  name: string | null;
}

export function parseAddServerForm(interaction: ModalSubmitInteraction): ParsedServerForm | { error: string } {
  const name = interaction.fields.getTextInputValue('server_name').trim() || null;
  const ip = interaction.fields.getTextInputValue('server_ip').trim();
  const portInput = interaction.fields.getTextInputValue('server_port').trim();

  if (!ip) {
    return { error: 'IP address is required.' };
  }

  let port = 7777;
  if (portInput) {
    const parsedPort = parseInt(portInput);
    if (isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      return { error: 'Invalid port number. Please enter a number between 1 and 65535.' };
    }
    port = parsedPort;
  }

  return { ip, port, name };
}