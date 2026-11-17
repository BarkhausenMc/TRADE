
import {
  getTraderStats,
  getTradeLeaderboard,
  getTradeHistory,
  createTrade,
  getTradeById,
  correctTrade,
  deleteTrade
} from '../db/database.js';

import {
  isTraderMember,
  resolveTraderRole,
  buildNotice,
  noticeFlags
} from './context.js';

import { hasTradeLeaderRole } from './context.js';
import { updateTradePanel } from './trade-panel.js';

const SOURCES = [
  'Ingame-Chat',
  'HugoSMP-Market',
  'Sonstige / manuell'
];

function isTradeLeader(interaction) {
  return hasTradeLeaderRole(interaction);
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin'
  });
}

function getSourceName(source) {
  if (source === 'ticket') return '🎫 Ticket';
  if (source === 'Ingame-Chat') return '💬 Ingame-Chat';
  if (source === 'HugoSMP-Market') return '🏪 HugoSMP-Market';
  return '📝 Sonstige / manuell';
}

function validSource(source) {
  return SOURCES.includes(source);
}


export async function handleTradeCommand(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const subcommand = interaction.options.getSubcommand();

    const traderRole = resolveTraderRole(interaction.guild);

    const isTrader = isTraderMember(interaction, traderRole);
    const isLeader = hasTradeLeaderRole(interaction);

    if (!isTrader && !isLeader) {
      return interaction.editReply({
        content: '❌ Du benötigst die Trader-Rolle oder TRADE Leader-Rolle.'
      });
    }

    if (['korrigieren', 'löschen'].includes(subcommand) && !isLeader) {
      return interaction.editReply({
        content: '❌ Nur TRADE Leader dürfen diese Aktion durchführen.'
      });
    }

    if (subcommand === 'eintragen') return handleTradeInsert(interaction);
    if (subcommand === 'stats') return handleTradeStats(interaction);
    if (subcommand === 'leaderboard') return handleLeaderboard(interaction);
    if (subcommand === 'historie') return handleHistory(interaction);
    if (subcommand === 'korrigieren') return handleCorrection(interaction);
    if (subcommand === 'löschen') return handleDeletion(interaction);

  } catch (error) {
    console.error('Trade Command Error:', error);

    return interaction.editReply({
      content: '❌ Beim Ausführen des Trade-Befehls ist ein Fehler aufgetreten.'
    }).catch(console.error);
  }
}


async function handleTradeInsert(interaction) {
  const traderRole = resolveTraderRole(interaction.guild);

  if (!isTraderMember(interaction, traderRole)) {
    return interaction.reply({
      components: [
        buildNotice('❌ Nur Mitglieder der Trader-Rolle dürfen Trades eintragen.')
      ],
      flags: noticeFlags
    });
  }

  const source = interaction.options.getString('quelle', true);

  if (!validSource(source)) {
    return interaction.reply({
      content: '❌ Ungültige Trade-Quelle.',
      ephemeral: true
    });
  }

  const result = createTrade({
    guildId: interaction.guild.id,
    traderId: interaction.user.id,
    source,
    createdBy: interaction.user.id
  });

  if (!result.success) {
    return interaction.reply({
      content: '❌ Dieser Trade wurde bereits eingetragen.',
      ephemeral: true
    });
  }

  const stats = getTraderStats(
    interaction.guild.id,
    interaction.user.id
  );

  await updateTradePanel(interaction.guild.id);

  return interaction.reply({
    content:
      `✅ Dein Trade wurde eingetragen!\n\n` +
      `**Quelle:** ${getSourceName(source)}\n` +
      `**Diese Woche:** ${stats.weekly}\n` +
      `**Dieser Monat:** ${stats.monthly}\n` +
      `**All Time:** ${stats.allTime}`,
    ephemeral: true
  });
}


async function handleTradeStats(interaction) {
  const user = interaction.options.getUser('trader') || interaction.user;

  const stats = getTraderStats(
    interaction.guild.id,
    user.id
  );

  return interaction.editReply({
    components: [
      buildNotice(
        `# 📊 TRADE STATISTIK\n` +
        `**Trader:** ${user}\n\n` +
        `📅 **Diese Woche:** ${stats.weekly}\n` +
        `🗓️ **Dieser Monat:** ${stats.monthly}\n` +
        `🏆 **All Time:** ${stats.allTime}`
      )
    ],
    flags: MessageFlags.IsComponentsV2
  });
}


async function handleLeaderboard(interaction) {
  const period = interaction.options.getString('zeitraum', true);

  const entries = getTradeLeaderboard(
    interaction.guild.id,
    period
  );

  if (!entries.length) {
    return interaction.reply({
      content: 'Es gibt für diesen Zeitraum noch keine Trades.',
      ephemeral: true
    });
  }

  const title = {
    weekly: 'DIESE WOCHE',
    monthly: 'DIESEN MONAT',
    all: 'ALL TIME'
  }[period];

  const medals = ['🥇', '🥈', '🥉'];

  const lines = entries.map((entry, index) => {
    const rank = medals[index] || `**${index + 1}.**`;

    return `${rank} <@${entry.trader_id}> — **${entry.trades} Trades**`;
  });

  return interaction.reply({
    components: [
      buildNotice(
        `# 🏆 TRADE LEADERBOARD\n` +
        `## ${title}\n\n` +
        lines.join('\n')
      )
    ],
    flags: noticeFlags
  });
}

async function handleHistory(interaction) {
  const user = interaction.options.getUser('trader');

  const history = getTradeHistory(
    interaction.guild.id,
    user?.id || null,
    10
  );

  if (!history.length) {
    return interaction.reply({
      content: 'Es wurden keine Trades gefunden.',
      ephemeral: true
    });
  }

  const lines = history.map(trade =>
    `**#${trade.id}** · <@${trade.trader_id}>\n` +
    `${getSourceName(trade.source)} · ${formatDate(trade.created_at)}`
  );

  return interaction.reply({
    components: [
      buildNotice(
        `# 📜 TRADE HISTORIE\n\n${lines.join('\n\n')}`
      )
    ],
    flags: noticeFlags
  });
}

async function handleCorrection(interaction) {
  if (!isTradeLeader(interaction)) {
    return interaction.reply({
      content: '❌ Nur die konfigurierte TRADE_LEADER_ROLE_ID darf Trades korrigieren.',
      ephemeral: true
    });
  }

  const tradeId = interaction.options.getInteger('trade_id', true);
  const trader = interaction.options.getUser('trader', true);
  const source = interaction.options.getString('quelle', true);
  const reason = interaction.options.getString('grund', true).trim();

  if (!validSource(source) || !reason) {
    return interaction.reply({
      content: '❌ Ungültige Quelle oder fehlender Grund.',
      ephemeral: true
    });
  }

  const result = correctTrade({
    tradeId,
    guildId: interaction.guild.id,
    traderId: trader.id,
    source,
    performedBy: interaction.user.id,
    reason
  });

  if (!result) {
    return interaction.reply({
      content: '❌ Trade nicht gefunden oder bereits gelöscht.',
      ephemeral: true
    });
  }

  await updateTradePanel(interaction.guild.id);

  return interaction.reply({
    content: `✅ Trade #${tradeId} wurde korrigiert.`,
    ephemeral: true
  });
}

async function handleDeletion(interaction) {
  if (!isTradeLeader(interaction)) {
    return interaction.reply({
      content: '❌ Nur die konfigurierte TRADE_LEADER_ROLE_ID darf Trades löschen.',
      ephemeral: true
    });
  }

  const tradeId = interaction.options.getInteger('trade_id', true);
  const reason = interaction.options.getString('grund', true).trim();

  if (!reason) {
    return interaction.reply({
      content: '❌ Bitte gib einen Löschgrund an.',
      ephemeral: true
    });
  }

  const result = deleteTrade({
    tradeId,
    guildId: interaction.guild.id,
    performedBy: interaction.user.id,
    reason
  });

  if (!result) {
    return interaction.reply({
      content: '❌ Trade nicht gefunden oder bereits gelöscht.',
      ephemeral: true
    });
  }

  await updateTradePanel(interaction.guild.id);

  return interaction.reply({
    content: `🗑️ Trade #${tradeId} wurde gelöscht und aus den Statistiken entfernt.`,
    ephemeral: true
  });
}
