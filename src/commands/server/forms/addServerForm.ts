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

  const timezoneInput = new TextInputBuilder()
    .setCustomId('server_timezone')
    .setLabel('Server Timezone (GMT+X or GMT-X)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('GMT+0, GMT+2, GMT-5, etc.')
    .setRequired(true)
    .setMaxLength(10);

  const dayResetInput = new TextInputBuilder()
    .setCustomId('day_reset_hour')
    .setLabel('Daily Reset Hour (0-23, when new day starts)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('0 (midnight) or 5 (5 AM) or 12 (noon)')
    .setRequired(false)
    .setMaxLength(2);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(ipInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(portInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(timezoneInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(dayResetInput)
  );

  return modal;
}

export interface ParsedServerForm {
  ip: string;
  port: number;
  name: string | null;
  timezone: string;
  dayResetHour: number;
}

export function parseAddServerForm(interaction: ModalSubmitInteraction): ParsedServerForm | { error: string } {
  const name = interaction.fields.getTextInputValue('server_name').trim() || null;
  const ip = interaction.fields.getTextInputValue('server_ip').trim();
  const portInput = interaction.fields.getTextInputValue('server_port').trim();
  const timezone = interaction.fields.getTextInputValue('server_timezone').trim().toUpperCase();
  const dayResetInput = interaction.fields.getTextInputValue('day_reset_hour').trim();

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

  if (!timezone.startsWith('GMT')) {
    return { error: 'Timezone must be in GMT format (e.g., GMT+2, GMT-5, GMT+0).' };
  }

  const { TimezoneHelper } = require('../../../utils/timezoneHelper');
  if (!TimezoneHelper.validateGMT(timezone)) {
    return { error: 'Invalid GMT timezone. Use format GMT+X or GMT-X where X is between -12 and +14.' };
  }

  let dayResetHour = 0;
  if (dayResetInput) {
    const parsedHour = parseInt(dayResetInput);
    if (isNaN(parsedHour) || !TimezoneHelper.validateDayResetHour(parsedHour)) {
      return { error: 'Invalid day reset hour. Must be between 0 (midnight) and 23 (11 PM).' };
    }
    dayResetHour = parsedHour;
  }

  return { ip, port, name, timezone, dayResetHour };
}