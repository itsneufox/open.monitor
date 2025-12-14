import { Events, Interaction, MessageFlags } from 'discord.js';
import { CustomClient } from '../types';

export const name = Events.InteractionCreate;
export const once = false;

export async function execute(
  interaction: Interaction,
  client: CustomClient
): Promise<void> {
  // Handle chat input commands
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) {
      console.warn(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction, client);
    } catch (error) {
      console.error(
        `Error executing command ${interaction.commandName}:`,
        error
      );

      const errorMessage = 'There was an error while executing this command!';

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: errorMessage,
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content: errorMessage,
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (followUpError) {
        console.error('Failed to send error message to user:', followUpError);
      }
    }
    return;
  }

  // Handle modal submissions
  if (interaction.isModalSubmit()) {
    try {
      if (interaction.customId.startsWith('owner_')) {
        const ownerPanel = await import('../owner/ownerPanel');
        if (ownerPanel.handleOwnerModal) {
          await ownerPanel.handleOwnerModal(interaction, client);
        }
      } else if (interaction.customId === 'setup_modal') {
        const setupCommand = await import('../features/setupWizard');
        if (setupCommand.handleModalSubmit) {
          await setupCommand.handleModalSubmit(interaction, client);
        }
      } else if (interaction.customId === 'manage_add_server_modal') {
        const manageCommand = await import('../commands/manage');
        if (manageCommand.handleAddServerModal) {
          await manageCommand.handleAddServerModal(interaction, client);
        }
      } else if (interaction.customId === 'interval_modal') {
        const manageCommand = await import('../commands/manage');
        if (manageCommand.handleIntervalModal) {
          await manageCommand.handleIntervalModal(interaction, client);
        }
      } else if (interaction.customId === 'images_banner_modal') {
        const manageCommand = await import('../commands/manage');
        if (manageCommand.handleBannerModal) {
          await manageCommand.handleBannerModal(interaction, client);
        }
      } else if (interaction.customId === 'images_logo_modal') {
        const manageCommand = await import('../commands/manage');
        if (manageCommand.handleLogoModal) {
          await manageCommand.handleLogoModal(interaction, client);
        }
      }
    } catch (error) {
      console.error('Error handling modal submission:', error);
    }
    return;
  }

  // Handle channel select menus
  if (interaction.isChannelSelectMenu()) {
    try {
      const setupCommand = await import('../features/setupWizard');

      if (
        interaction.customId.startsWith('setup_') &&
        setupCommand.handleChannelSelect
      ) {
        await setupCommand.handleChannelSelect(interaction);
      }
    } catch (error) {
      console.error('Error handling channel select:', error);
    }
    return;
  }

  // Handle select menus (string, role, etc.)
  if (interaction.isAnySelectMenu()) {
    try {
      if (interaction.customId.startsWith('owner_')) {
        if (!interaction.isStringSelectMenu()) {
          return;
        }
        const ownerPanel = await import('../owner/ownerPanel');
        if (ownerPanel.handleOwnerSelectMenu) {
          await ownerPanel.handleOwnerSelectMenu(interaction, client);
        }
      } else if (interaction.customId.startsWith('manage_')) {
        const manageCommand = await import('../commands/manage');
        if (manageCommand.handleManageSelectMenu) {
          await manageCommand.handleManageSelectMenu(interaction, client);
        }
      }
    } catch (error) {
      console.error('Error handling string select menu:', error);
    }
    return;
  }

  // Handle button interactions
  if (interaction.isButton()) {
    try {
      // Handle owner panel buttons
      if (interaction.customId.startsWith('owner_')) {
        const ownerPanel = await import('../owner/ownerPanel');

        if (
          interaction.customId === 'owner_reboot_confirm' ||
          interaction.customId === 'owner_reboot_cancel'
        ) {
          await ownerPanel.handleOwnerRebootButton(interaction, client);
        } else {
          await ownerPanel.handleOwnerButton(interaction, client);
        }
        return;
      }

      // Handle admin panel buttons
      if (interaction.customId.startsWith('manage_')) {
        const manageCommand = await import('../commands/manage');
        if (manageCommand.handleManageButton) {
          await manageCommand.handleManageButton(interaction, client);
        }
        return;
      }

      // Handle setup buttons
      const setupCommand = await import('../features/setupWizard');

      if (
        interaction.customId === 'setup_complete' &&
        setupCommand.handleSetupComplete
      ) {
        await setupCommand.handleSetupComplete(interaction, client);
      } else if (
        interaction.customId === 'setup_cancel' &&
        setupCommand.handleSetupCancel
      ) {
        await setupCommand.handleSetupCancel(interaction);
      }
    } catch (error) {
      console.error('Error handling button interaction:', error);
    }
    return;
  }
}
