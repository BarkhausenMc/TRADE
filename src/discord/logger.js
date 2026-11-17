import fs from 'node:fs';

import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags
} from 'discord.js';

const ARCHIVE_FILE_URL = new URL('../../data/price-log-archive.json', import.meta.url);

const SUMMARY_CHECK_INTERVAL_MS = 60 * 1000;

let discordClient = null;
let summaryTimer = null;

export function bindLogger(client) {
  discordClient = client;
  startSummaryLoop();
}

function buildLogContainer(title, body) {
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${title}`)
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(body)
  );

  return container;
}

async function getLogChannel() {
  const channelId = process.env.LOG_CHANNEL_ID;

  if (!channelId) {
    console.error('[LOG] LOG_CHANNEL_ID fehlt!');
    return null;
  }

  try {
    const channel = await discordClient.channels.fetch(channelId);

    if (!channel?.isTextBased()) {
      throw new Error('Log-Channel nicht gefunden.');
    }

    return channel;
  } catch (error) {
    console.error('[LOG CHANNEL ERROR]', error);
    return null;
  }
}

export async function sendLog(title, body) {
  if (!discordClient) {
    console.error('[LOG] Kein Client gebunden – Log verworfen:', title);
    return;
  }

  const channel = await getLogChannel();

  if (!channel) {
    return;
  }

  try {
    await channel.send({
      components: [buildLogContainer(title, body)],
      flags: MessageFlags.IsComponentsV2
    });
  } catch (error) {
    console.error('[LOG ERROR]', error);
  }
}

function loadArchive() {
  try {
    if (fs.existsSync(ARCHIVE_FILE_URL)) {
      return JSON.parse(fs.readFileSync(ARCHIVE_FILE_URL, 'utf8'));
    }
  } catch (error) {
    console.error('[LOG ARCHIVE LOAD ERROR]', error);
  }

  return { days: {} };
}

function saveArchive(archive) {
  try {
    fs.mkdirSync(new URL('.', ARCHIVE_FILE_URL), { recursive: true });
    fs.writeFileSync(ARCHIVE_FILE_URL, JSON.stringify(archive, null, 2));
  } catch (error) {
    console.error('[LOG ARCHIVE SAVE ERROR]', error);
  }
}

function dayKey(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function buildDailySummary(day, entries) {
  const grouped = new Map();

  for (const entry of entries) {
    if (!grouped.has(entry.spawnerName)) {
      grouped.set(entry.spawnerName, []);
    }

    grouped.get(entry.spawnerName).push(entry);
  }

  const lines = [`📅 **${day}** – ${entries.length} Preisänderung(en)\n`];

  for (const [name, list] of grouped) {
    lines.push(`**${list[0].emoji || '🔹'} ${name}-Spawner** (${list.length}x)`);

    for (const entry of list) {
      const time = new Date(entry.timestamp).toLocaleTimeString('de-DE');
      lines.push(`- ${time} – ${entry.changes}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

function startSummaryLoop() {
  clearInterval(summaryTimer);

  summaryTimer = setInterval(checkDailySummaries, SUMMARY_CHECK_INTERVAL_MS);

  checkDailySummaries();
}

async function checkDailySummaries() {
  const archive = loadArchive();
  const today = dayKey(Date.now());
  const pendingDays = Object.entries(archive.days)
    .filter(([day, data]) => day !== today && !data.summarized && data.entries.length > 0)
    .map(([day]) => day)
    .sort();

  for (const day of pendingDays) {
    const data = archive.days[day];

    await sendLog(
      '📊 PREIS ARCHIV',
      buildDailySummary(day, data.entries)
    );

    data.summarized = true;
  }

  if (pendingDays.length > 0) {
    saveArchive(archive);
  }
}

export function archivePriceChange(spawnerName, emoji, changes, changedBy) {
  const archive = loadArchive();
  const day = dayKey(Date.now());

  if (!archive.days[day]) {
    archive.days[day] = { entries: [], summarized: false };
  }

  archive.days[day].entries.push({
    spawnerName,
    emoji,
    changes,
    changedBy,
    timestamp: Date.now()
  });

  saveArchive(archive);
}

export async function logPriceChange(spawnerName, emoji, changes, changedBy) {
  archivePriceChange(spawnerName, emoji, changes, changedBy);

  await sendLog(
    '💸 PREISÄNDERUNG',
    `${emoji || '🔹'} **${spawnerName}-Spawner**\n${changes}\n\n-# Geändert von <@${changedBy}>`
  );
}

export async function logTicketCreated(ticket, threadUrl) {
  await sendLog(
    '🎫 TICKET ERSTELLT',
    `**Trade #${ticket.tradeNumber}** – ${ticket.mode === 'kaufen' ? '📥 Verkauf' : '📤 Ankauf'}\n` +
    `${ticket.spawnerEmoji || '🔹'} **${ticket.spawnerName}-Spawner** × ${ticket.anzahl}\n` +
    `👤 Kunde: <@${ticket.customerId}> (\`${ticket.ingameName}\`)\n` +
    `💰 Gesamtpreis: \`${ticket.gesamtpreis}\`\n` +
    (threadUrl ? `➡️ ${threadUrl}` : '')
  );
}

export async function logTicketClaimed(ticket, userId) {
  await sendLog(
    '🙋 TICKET GECLAIMT',
    `**Trade #${ticket.tradeNumber}** – ${ticket.spawnerName}-Spawner\n` +
    `<@${userId}> hat den Trade geclaimt.`
  );
}

export async function logTicketReleased(ticket, previousClaimer) {
  await sendLog(
    '🔓 TICKET FREIGEGEBEN',
    `**Trade #${ticket.tradeNumber}** – ${ticket.spawnerName}-Spawner\n` +
    `<@${previousClaimer}> hat den Trade freigegeben.`
  );
}

export async function logTicketCompleted(ticket, userId) {
  await sendLog(
    '✅ TRADE ABGESCHLOSSEN',
    `**Trade #${ticket.tradeNumber}** – ${ticket.spawnerName}-Spawner × ${ticket.anzahl}\n` +
    `👤 Kunde: <@${ticket.customerId}> (\`${ticket.ingameName}\`)\n` +
    `💰 Gesamtpreis: \`${ticket.gesamtpreis}\`\n` +
    `✅ Markiert von <@${userId}>`
  );
}

export async function logTicketCancelled(ticket) {
  await sendLog(
    '🗑️ TICKET ABGEBROCHEN',
    `**Trade #${ticket.tradeNumber}** – ${ticket.spawnerName}-Spawner\n` +
    `👤 Kunde: <@${ticket.customerId}>`
  );
}

export async function logInteractionError(context, error) {
  let details = '';

  if (context?.interaction) {
    const interaction = context.interaction;

    details =
      `**Command:** \`${interaction.commandName ?? interaction.customId ?? 'unbekannt'}\`\n` +
      `**User:** <@${interaction.user?.id ?? 'unbekannt'}>\n`;
  }

  if (context?.note) {
    details += `**Kontext:** ${context.note}\n`;
  }

  await sendLog(
    '⚠️ INTERAKTIONS-FEHLER',
    `${details}\`\`\`\n${String(error?.stack || error).slice(0, 900)}\n\`\`\``
  );
}

export async function logBotStart() {
  await sendLog(
    '🟢 BOT GESTARTET',
    'Der Bot wurde erfolgreich gestartet und ist mit Discord verbunden.'
  );
}

export async function logBotReconnect() {
  await sendLog(
    '🔄 BOT RECONNECT',
    'Die WebSocket-Verbindung zu Discord wurde wiederhergestellt.'
  );
}

export async function logGuildMemberLeave(member) {
  await sendLog(
    '👋 SERVER VERLASSEN',
    `**${member.user.tag}** hat den Server verlassen.\n` +
    `-# Mitglieder: ${member.guild.memberCount}`
  );
}

export async function logMinecraftPlayerJoin(username) {
  await sendLog(
    '🎮 MINECRAFT JOIN',
    `\`${username}\` ist dem Server beigetreten.`
  );
}

export async function logMinecraftPlayerLeave(username) {
  await sendLog(
    '🎮 MINECRAFT LEAVE',
    `\`${username}\` hat den Server verlassen.`
  );
}

export async function logMinecraftChat(username, message) {
  await sendLog(
    '💬 MINECRAFT CHAT',
    `**${username}:** ${message}`
  );
}

export async function logMinecraftStatus(state, details) {
  const emoji = state === 'online' ? '🟩' : state === 'kicked' ? '🟥' : '🟨';

  await sendLog(
    `${emoji} MINECRAFT STATUS`,
    `**Status:** ${state}\n${details ? details : ''}`
  );
}
