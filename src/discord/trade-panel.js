
import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags
} from 'discord.js';

import {
  getTradeLeaderboard,
  getTradePanel,
  setTradePanel
} from '../db/database.js';

let discordClient = null;

export function bindTradePanelClient(client) {
  discordClient = client;
}

export function createTradePanel(guildId) {
  const container = new ContainerBuilder();

  const weekly = getTradeLeaderboard(guildId, 'weekly');
  const monthly = getTradeLeaderboard(guildId, 'monthly');
  const allTime = getTradeLeaderboard(guildId, 'all');

  function formatRanking(entries) {
    if (!entries.length) {
      return '*Noch keine Trades vorhanden.*';
    }

    return entries.slice(0, 10).map((entry, index) => {
      const medals = ['🥇', '🥈', '🥉'];
      const rank = medals[index] || `**${index + 1}.**`;

      return `${rank} <@${entry.trader_id}> — **${entry.trades}** Trades`;
    }).join('\n');
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '# 💎 TRADE STATISTICS\n' +
      '*Die aktuellen Statistiken aller Trader*'
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '## 📅 WÖCHENTLICHE RANGLISTE\n' +
      formatRanking(weekly)
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '## 🗓️ MONATLICHE RANGLISTE\n' +
      formatRanking(monthly)
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '## 🏆 ALL-TIME RANGLISTE\n' +
      formatRanking(allTime)
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# Zuletzt aktualisiert: ${new Date().toLocaleString('de-DE', {
        timeZone: 'Europe/Berlin'
      })} Uhr`
    )
  );

  return container;
}

export async function updateTradePanel(guildId) {
  if (!discordClient) return false;

  const panel = getTradePanel();

  if (!panel.channelId || !panel.messageId) {
    return false;
  }

  try {
    const channel = await discordClient.channels.fetch(panel.channelId);

    if (!channel?.isTextBased()) return false;

    const message = await channel.messages.fetch(panel.messageId);

    await message.edit({
      components: [createTradePanel(guildId)],
      flags: MessageFlags.IsComponentsV2
    });

    return true;
  } catch (error) {
    console.error('[TRADE PANEL UPDATE ERROR]', error);
    return false;
  }
}

export async function setupTradePanel(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const existing = getTradePanel();
    let message = null;

    if (existing.channelId && existing.messageId) {
      try {
        const channel = await discordClient.channels.fetch(
          existing.channelId
        );

        message = await channel.messages.fetch(existing.messageId);
      } catch {
        message = null;
      }
    }

    if (message) {
      await message.edit({
        components: [createTradePanel(interaction.guild.id)],
        flags: MessageFlags.IsComponentsV2
      });
    } else {
      message = await interaction.channel.send({
        components: [createTradePanel(interaction.guild.id)],
        flags: MessageFlags.IsComponentsV2
      });

      setTradePanel(message.channelId, message.id);
    }

    await interaction.editReply({
      content: message
        ? '✅ Das Trade-Statistik-Panel wurde erstellt bzw. aktualisiert.'
        : '❌ Das Panel konnte nicht erstellt werden.'
    });
  } catch (error) {
    console.error('[TRADE PANEL SETUP ERROR]', error);

    await interaction.editReply({
      content: '❌ Das Trade-Panel konnte nicht eingerichtet werden.'
    });
  }
}
