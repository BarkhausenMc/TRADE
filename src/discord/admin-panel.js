import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder
} from 'discord.js';

import {
  spawners,
  panelData,
  ticketData,
  priceLogData,
  setPanelData,
  noticeFlags,
  buildNotice
} from './context.js';

import {
  getTicketBans,
  getTradeLeaderboard,
  getTradePanel,
  setPanel,
  setTradePanel
} from '../db/database.js';

import { createPanelComponents, updateSpawnerPanel } from './panel.js';
import { updateTradePanel } from './trade-panel.js';
import { createPriceLogContainer, deletePriceLog } from './price-log.js';
import { isAuthorizedUser } from './roles.js';
import { bot } from '../minecraft/bot.js';

let discordClient = null;
let lastActionText = null;

export function bindAdminPanelClient(client) {
  discordClient = client;
}

const PAGE_IDS = ['overview', 'tickets', 'panels'];

const PAGE_LABELS = {
  overview: 'Übersicht',
  tickets: 'Tickets & Trades',
  panels: 'Panel-Verwaltung'
};

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin'
  });
}

function formatUptime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return hours + 'h ' + minutes + 'm ' + secs + 's';
}

async function buildOverviewPage(guild) {
  let members = null;

  try {
    members = await guild.members.fetch();
  } catch {}

  const botCount = members ? members.filter(m => m.user.bot).size : null;
  const humanCount = members && botCount !== null ? members.size - botCount : null;

  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '# 🖥️ SERVER-ÜBERSICHT\n*Live-Status von ' + guild.name + '*'
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '👥 **Mitglieder:** `' + guild.memberCount + '`' +
      (humanCount !== null ? ' (👤 ' + humanCount + ' · 🤖 ' + botCount + ')' : '') + '\n' +
      '💬 **Kanäle:** `' + guild.channels.cache.size + '`\n' +
      '🏷️ **Rollen:** `' + guild.roles.cache.size + '`\n' +
      '🚀 **Boosts:** `' + guild.premiumSubscriptionCount + '`\n' +
      '⏱️ **Discord-Bot-Uptime:** `' + formatUptime(process.uptime()) + '`\n' +
      '⛏️ **Minecraft-Bot:** ' +
      (bot.player
        ? '`🟩 Verbunden (' + bot.username + ')`'
        : '`🟥 Nicht verbunden`')
    )
  );

  return container;
}

function buildTicketsPage(guild) {
  const tickets = Object.entries(ticketData.tickets);
  const claimed = tickets.filter(([, t]) => t.claimedBy && !t.abgeschlossen).length;
  const open = tickets.filter(([, t]) => !t.claimedBy && !t.abgeschlossen).length;

  let bans = [];

  try {
    bans = getTicketBans(guild.id);
  } catch {}

  let weekly = [];
  let allTime = [];

  try {
    weekly = getTradeLeaderboard(guild.id, 'weekly');
    allTime = getTradeLeaderboard(guild.id, 'all');
  } catch {}

  const board = entries =>
    entries.length
      ? entries
          .slice(0, 5)
          .map(
            (entry, index) =>
              (['🥇', '🥈', '🥉'][index] || '**' + (index + 1) + '.**') +
              ' <@' + entry.trader_id + '> — **' + entry.trades + '** Trades'
          )
          .join('\n')
      : '*Keine Trades vorhanden.*';

  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('# 🎫 TICKETS & TRADES\n*Aktuelle Zahlen*')
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '🎫 **Tickets gesamt:** `' + ticketData.count + '`\n' +
      '🔓 **Offen:** `' + open + '`\n' +
      '🔒 **Geclaimt:** `' + claimed + '`\n' +
      '✅ **Abgeschlossene Trades:** `' + ticketData.completed + '`\n' +
      '🚫 **Ticket-Bans:** `' + bans.length + '`\n' +
      '🔹 **Spawner eingetragen:** `' + spawners.length + '`'
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '## 📅 TOP TRADER (WOCHE)\n' + board(weekly)
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '## 🏆 TOP TRADER (ALL TIME)\n' + board(allTime)
    )
  );

  if (tickets.length > 0) {
    container.addSeparatorComponents(new SeparatorBuilder());

    const lines = tickets
      .slice(0, 8)
      .map(
        ([threadId, t]) =>
          '**#' + t.tradeNumber + '** ' + (t.spawnerEmoji || '🔹') + ' ' +
          t.spawnerName + ' × ' + t.anzahl + ' · ' +
          (t.claimedBy
            ? '🔒 <@' + t.claimedBy + '>'
            : t.abgeschlossen
              ? '✅ Abgeschlossen'
              : '🔓 Offen') +
          ' → <#' + threadId + '>'
      );

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '## 🧾 TICKETS (' + tickets.length + ')\n' + lines.join('\n')
      )
    );
  }

  return container;
}

function buildPanelsPage() {
  const tradePanel = getTradePanel();

  const spawnerStatus = panelData.channelId
    ? '🟩 Aktiv in <#' + panelData.channelId + '> (`' + panelData.messageId + '`)'
    : '🟥 Nicht eingerichtet';

  const tradeStatus = tradePanel.channelId
    ? '🟩 Aktiv in <#' + tradePanel.channelId + '> (`' + tradePanel.messageId + '`)'
    : '🟥 Nicht eingerichtet';

  const priceStatus = priceLogData.channelId
    ? '🟩 Aktiv in <#' + priceLogData.channelId + '> (`' + priceLogData.messageId + '`) · ' +
      priceLogData.entries.length + ' Einträge · Letzte Änderung: ' +
      (priceLogData.lastChangeAt ? formatDate(priceLogData.lastChangeAt) : '–')
    : '⬜ Kein aktiver Price-Log';

  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('# 🧩 PANEL-VERWALTUNG\n*Status aller Panels*')
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('🛒 **Spawner-Panel**\n' + spawnerStatus)
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('💎 **Trade-Statistik-Panel**\n' + tradeStatus)
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('💸 **Price-Log**\n' + priceStatus)
  );

  if (lastActionText) {
    container.addSeparatorComponents(new SeparatorBuilder());

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# ' + lastActionText)
    );
  }

  return container;
}

function pageContainer(guild, page) {
  if (page === 'tickets') {
    return buildTicketsPage(guild);
  }

  if (page === 'panels') {
    return buildPanelsPage();
  }

  return buildOverviewPage(guild);
}

function buildNavRow(page) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('admin_page_overview')
      .setLabel(PAGE_LABELS.overview)
      .setEmoji('🖥️')
      .setStyle(page === 'overview' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('admin_page_tickets')
      .setLabel(PAGE_LABELS.tickets)
      .setEmoji('🎫')
      .setStyle(page === 'tickets' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('admin_page_panels')
      .setLabel(PAGE_LABELS.panels)
      .setEmoji('🧩')
      .setStyle(page === 'panels' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('admin_refresh_' + page)
      .setLabel('Aktualisieren')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Primary)
  );
}

function buildPanelActionRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('admin_action_render_spawner')
      .setLabel('Spawner-Panel aktualisieren')
      .setEmoji('🛒')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('admin_action_rebuild_spawner')
      .setLabel('Spawner-Panel neu erstellen')
      .setEmoji('🏗️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('admin_action_render_trade')
      .setLabel('Trade-Panel aktualisieren')
      .setEmoji('💎')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('admin_action_render_pricelog')
      .setLabel('Price-Log aktualisieren')
      .setEmoji('💸')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('admin_action_delete_pricelog')
      .setLabel('Price-Log löschen')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger)
  );
}

async function buildAdminComponents(guild, page) {
  const components = [await pageContainer(guild, page), buildNavRow(page)];

  if (page === 'panels') {
    components.push(buildPanelActionRow());
  }

  return components;
}

async function runPanelAction(action, interaction) {
  if (action === 'render_spawner') {
    const ok = await updateSpawnerPanel();

    return ok
      ? '✅ Spawner-Panel aktualisiert.'
      : '⚠️ Spawner-Panel-Nachricht nicht gefunden. Nutze „Neu erstellen".';
  }

  if (action === 'rebuild_spawner') {
    if (panelData.channelId && panelData.messageId && discordClient) {
      try {
        const oldChannel = await discordClient.channels.fetch(panelData.channelId);
        const oldMessage = await oldChannel.messages.fetch(panelData.messageId);

        await oldMessage.delete();
      } catch {}
    }

    const message = await interaction.channel.send({
      components: createPanelComponents(),
      flags: MessageFlags.IsComponentsV2
    });

    setPanelData({
      channelId: message.channelId,
      messageId: message.id
    });

    setPanel(message.channelId, message.id);

    return '✅ Spawner-Panel neu erstellt in <#' + message.channelId + '>.';
  }

  if (action === 'render_trade') {
    const ok = await updateTradePanel(interaction.guild.id);

    return ok
      ? '✅ Trade-Statistik-Panel aktualisiert.'
      : '⚠️ Trade-Panel-Nachricht nicht gefunden. Nutze /setup-trade-panel.';
  }

  if (action === 'render_pricelog') {
    if (!priceLogData.channelId || !priceLogData.messageId || !discordClient) {
      return '⚠️ Kein aktiver Price-Log vorhanden.';
    }

    const channel = await discordClient.channels.fetch(priceLogData.channelId);
    const message = await channel.messages.fetch(priceLogData.messageId);

    await message.edit({
      components: [createPriceLogContainer()],
      flags: MessageFlags.IsComponentsV2
    });

    return '✅ Price-Log aktualisiert.';
  }

  if (action === 'delete_pricelog') {
    await deletePriceLog();

    return '🗑️ Price-Log gelöscht.';
  }

  return '❓ Unbekannte Aktion.';
}

export async function handleAdminPanelCommand(interaction) {
  if (!isAuthorizedUser(interaction)) {
    return interaction.reply({
      components: [
        buildNotice('❌ Du bist nicht berechtigt, dieses Panel zu nutzen.')
      ],
      flags: noticeFlags
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const components = await buildAdminComponents(interaction.guild, 'overview');

    await interaction.editReply({
      components,
      flags: noticeFlags
    });
  } catch (error) {
    console.error('[ADMIN PANEL ERROR]', error);

    await interaction.editReply({
      components: [buildNotice('❌ Das Admin-Panel konnte nicht geladen werden.')],
      flags: noticeFlags
    });
  }
}

export async function handleAdminPanelComponent(interaction) {
  if (!isAuthorizedUser(interaction)) {
    return interaction.reply({
      components: [
        buildNotice('❌ Du bist nicht berechtigt, dieses Panel zu nutzen.')
      ],
      flags: noticeFlags
    });
  }

  const customId = interaction.customId;

  if (
    customId.startsWith('admin_page_') ||
    customId.startsWith('admin_refresh_')
  ) {
    const page = customId.startsWith('admin_page_')
      ? customId.slice('admin_page_'.length)
      : customId.slice('admin_refresh_'.length);

    if (!PAGE_IDS.includes(page)) {
      return interaction.reply({
        components: [buildNotice('❌ Unbekannte Panel-Seite.')],
        flags: noticeFlags
      });
    }

    try {
      const components = await buildAdminComponents(interaction.guild, page);

      return interaction.update({ components });
    } catch (error) {
      console.error('[ADMIN PANEL PAGE ERROR]', error);

      return interaction.reply({
        components: [buildNotice('❌ Die Seite konnte nicht geladen werden.')],
        flags: noticeFlags
      });
    }
  }

  if (customId.startsWith('admin_action_')) {
    const action = customId.slice('admin_action_'.length);

    try {
      lastActionText = await runPanelAction(action, interaction);
    } catch (error) {
      console.error('[ADMIN PANEL ACTION ERROR]', error);

      lastActionText =
        '❌ Aktion fehlgeschlagen: ' + (error?.message || 'Unbekannter Fehler');
    }

    try {
      const components = await buildAdminComponents(interaction.guild, 'panels');

      return interaction.update({ components });
    } catch (error) {
      console.error('[ADMIN PANEL PAGE ERROR]', error);

      return interaction.reply({
        components: [
          buildNotice('❌ Die Seite konnte nicht aktualisiert werden.')
        ],
        flags: noticeFlags
      });
    }
  }
}