import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags
} from 'discord.js';

import {
  priceLogData,
  setPriceLogData,
  saveJSON,
  PRICE_LOG_TIMEOUT
} from './context.js';

import { archivePriceChange, logPriceChange } from './logger.js';

const PRICE_LOG_FILE_URL = new URL('../../data/price-log.json', import.meta.url);

let discordClient = null;
let priceLogTimeout = null;

export function bindPriceLogClient(client) {
  discordClient = client;
}

function savePriceLog() {
  saveJSON(PRICE_LOG_FILE_URL, priceLogData);
}

export function createPriceLogContainer() {
  const container = new ContainerBuilder();

  const roleId = process.env.SPAWNER_PING_ROLE_ID;

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## SPAWNER PRICE CHANGES\n` +
      (roleId ? `<@&${roleId}>` : '')
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  if (priceLogData.entries.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('*Keine aktuellen Preisänderungen.*')
    );
  }

  for (const entry of [...priceLogData.entries].reverse()) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${entry.emoji} ${entry.name}-Spawner\n` +
        `${entry.changes.join('\n')}\n\n` +
        `-# Geändert von <@${entry.changedBy}>`
      )
    );

    container.addSeparatorComponents(new SeparatorBuilder());
  }

  return container;
}

export async function updatePriceLog(interaction, spawner, changes) {
  const channelId = process.env.PRICE_LOG_CHANNEL_ID;
  const roleId = process.env.SPAWNER_PING_ROLE_ID;

  if (!channelId) {
    console.error('[PRICE LOG] PRICE_LOG_CHANNEL_ID fehlt!');
    return;
  }

  try {
    const channel = await discordClient.channels.fetch(channelId);

    if (!channel?.isTextBased()) {
      throw new Error('Price-Log-Channel nicht gefunden.');
    }

    const existingIndex = priceLogData.entries.findIndex(
      entry => entry.name.toLowerCase() === spawner.name.toLowerCase()
    );

    const newEntry = {
      name: spawner.name,
      emoji: spawner.emoji || '🔹',
      changes,
      changedBy: interaction.user.id,
      changedAt: Date.now()
    };

    if (existingIndex !== -1) {
      priceLogData.entries[existingIndex] = newEntry;
    } else {
      priceLogData.entries.push(newEntry);
    }

    priceLogData.entries = priceLogData.entries.slice(-10);

    let message = null;

    if (priceLogData.messageId && priceLogData.channelId === channelId) {
      try {
        message = await channel.messages.fetch(priceLogData.messageId);
      } catch {
        message = null;
      }
    }

    const components = [createPriceLogContainer()];

    if (message) {
      await message.edit({ components });
      console.log('[PRICE LOG] Nachricht aktualisiert.');
    } else {
      message = await channel.send({
        components,
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: {
          roles: roleId ? [roleId] : []
        }
      });

      priceLogData.channelId = channelId;
      priceLogData.messageId = message.id;

      console.log('[PRICE LOG] Neue Nachricht erstellt.');
    }

    priceLogData.lastChangeAt = Date.now();

    savePriceLog();

    armPriceLogDeletion();

    const logChannelId = process.env.LOG_CHANNEL_ID;

    if (logChannelId && logChannelId !== channelId) {
      logPriceChange(
        spawner.name,
        spawner.emoji,
        changes.join('\n'),
        interaction.user.id
      ).catch(() => {});
    } else {
      archivePriceChange(
        spawner.name,
        spawner.emoji,
        changes.join('\n'),
        interaction.user.id
      );
    }

    if (roleId) {
      try {
        const pingMessage = await channel.send({
          content: `<@&${roleId}>`,
          allowedMentions: {
            roles: [roleId]
          }
        });

        setTimeout(async () => {
          try {
            await pingMessage.delete();
          } catch {}
        }, 5000);
      } catch (error) {
        console.error('[PRICE PING ERROR]', error);
      }
    }
  } catch (error) {
    console.error('[PRICE LOG ERROR]', error);
  }
}

export function armPriceLogDeletion() {
  clearTimeout(priceLogTimeout);

  const expiration = priceLogData.lastChangeAt + PRICE_LOG_TIMEOUT;
  const remaining = expiration - Date.now();

  if (remaining <= 0) {
    deletePriceLog();
    return;
  }

  priceLogTimeout = setTimeout(() => {
    deletePriceLog();
  }, remaining);
}

export async function deletePriceLog() {
  try {
    if (priceLogData.channelId && priceLogData.messageId) {
      const channel = await discordClient.channels.fetch(priceLogData.channelId);

      if (channel?.isTextBased()) {
        try {
          const message = await channel.messages.fetch(priceLogData.messageId);

          await message.delete();

          console.log('[PRICE LOG] Nachricht automatisch gelöscht.');
        } catch (error) {
          if (error.code !== 10008) {
            console.error('[PRICE LOG DELETE ERROR]', error);
          }
        }
      }
    }
  } catch (error) {
    console.error('[PRICE LOG DELETE ERROR]', error);
  } finally {
    clearTimeout(priceLogTimeout);

    setPriceLogData({
      channelId: null,
      messageId: null,
      lastChangeAt: null,
      entries: []
    });

    savePriceLog();
  }
}

export function restorePriceLog() {
  if (priceLogData.lastChangeAt) {
    console.log('[PRICE LOG] Wiederherstelle Lösch-Timer...');
    armPriceLogDeletion();
  }
}
