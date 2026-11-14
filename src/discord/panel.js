import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} from 'discord.js';

import {
  spawners,
  panelData,
  ticketData,
  saveJSON,
  formatPrice,
  priceText
} from './context.js';
import { setPanelData } from './context.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

let discordClient = null;

export function bindPanelClient(client) {
  discordClient = client;
}

export function createSpawnerPanel() {
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '# 🛒 • SPAWNER TRADING • 💰\n' +
      '*TRADE (yayk Clan Spawner Trading)*\n' +
      '||*Only Trusted Trader, Faire Preise 💜*||'
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**Insgesamt abgeschlossene Trades:** \`${ticketData.completed}\``
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  if (spawners.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('*Aktuell sind keine Spawner eingetragen.*')
    );
  }

  for (const spawner of spawners) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${spawner.emoji || '🔹'} ${spawner.name}-Spawner\n` +
        `🛒 **Ankaufspreise:** \`${priceText(spawner.ankauf)}\`\n` +
        `💰 **Verkaufspreise:** \`${priceText(spawner.verkauf)}\``
      )
    );

    container.addSeparatorComponents(new SeparatorBuilder());
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '-# Preise werden und können jederzeit durch das TRADE Team geändert'
    )
  );

  return container;
}

export function createTicketButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_verkaufen')
      .setLabel('Ich möchte meine Spawner Verkaufen')
      .setEmoji('💰')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('ticket_kaufen')
      .setLabel('Ich möchte Spawner Kaufen')
      .setEmoji('🛒')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('spawner_price_role')
      .setLabel('Spawer Ping Rolle')
      .setEmoji('🔔')
      .setStyle(ButtonStyle.Secondary)
  );
}

export function createPanelComponents() {
  return [createSpawnerPanel(), createTicketButtonRow()];
}

export async function updateSpawnerPanel() {
  if (!panelData.channelId || !panelData.messageId) {
    return false;
  }

  try {
    const channel = await discordClient.channels.fetch(panelData.channelId);

    if (!channel || !channel.isTextBased()) {
      return false;
    }

    const message = await channel.messages.fetch(panelData.messageId);

    await message.edit({
      components: createPanelComponents()
    });

    return true;
  } catch (error) {
    console.error('Spawner-Panel konnte nicht aktualisiert werden:', error);
    return false;
  }
}
