import {
  MessageFlags,
  PermissionFlagsBits
} from 'discord.js';

import {
  ticketData,
  panelData,
  noticeFlags,
  buildNotice,
  hasTradeLeaderRole
} from './context.js';

let discordClient = null;

export function bindOrphanThreadsClient(client) {
  discordClient = client;
}

function threadCreatedTimestamp(threadId) {
  return Number(BigInt(threadId) >> 22n) + 1420070400000;
}

async function getPanelThreads(guild) {
  if (!panelData.channelId) {
    return [];
  }

  const channel = await guild.channels
    .fetch(panelData.channelId)
    .catch(() => null);

  if (!channel || !channel.isTextBased()) {
    return [];
  }

  const threads = new Map();

  const active = await channel.threads.fetchActive().catch(() => null);

  if (active) {
    for (const [id, thread] of active.threads) {
      threads.set(id, thread);
    }
  }

  const archived = await channel.threads.fetchArchived().catch(() => null);

  if (archived) {
    for (const [id, thread] of archived.threads) {
      threads.set(id, thread);
    }
  }

  return [...threads.values()];
}

export async function findOrphanThreads(guild) {
  const threads = await getPanelThreads(guild);
  const now = Date.now();
  const gracePeriod = 5 * 60 * 1000;

  return threads.filter(thread => {
    if (ticketData.tickets[thread.id]) {
      return false;
    }

    return now - threadCreatedTimestamp(thread.id) > gracePeriod;
  });
}

export async function deleteOrphanThreads(guild) {
  const orphans = await findOrphanThreads(guild);

  const results = {
    deleted: [],
    failed: []
  };

  for (const thread of orphans) {
    try {
      await thread.delete('Verwaister Ticket-Thread bereinigt');
      results.deleted.push(thread);
    } catch (error) {
      console.error('[ORPHAN CLEANUP] Thread konnte nicht gelöscht werden:', thread.id, error);
      results.failed.push(thread);
    }
  }

  return results;
}

export async function sweepAllGuilds(client) {
  for (const guild of client.guilds.cache.values()) {
    try {
      const results = await deleteOrphanThreads(guild);

      if (results.deleted.length > 0 || results.failed.length > 0) {
        console.log(
          `[ORPHAN CLEANUP] ${guild.name}: ${results.deleted.length} gelöscht, ` +
          `${results.failed.length} fehlgeschlagen.`
        );
      }
    } catch (error) {
      console.error('[ORPHAN CLEANUP] Sweep fehlgeschlagen:', guild.id, error);
    }
  }
}

export async function handleThreadCleanupCommand(interaction) {
  const isAdmin =
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

  if (!isAdmin && !hasTradeLeaderRole(interaction)) {
    return interaction.reply({
      components: [
        buildNotice(
          '❌ Du benötigst die **TRADE leader** Rolle oder Administratorrechte.'
        )
      ],
      flags: noticeFlags
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const mode = interaction.options.getString('modus') ?? 'pruefen';
  const orphans = await findOrphanThreads(interaction.guild);

  if (orphans.length === 0) {
    return interaction.editReply({
      components: [
        buildNotice('✅ Keine verwaisten Ticket-Threads gefunden.')
      ]
    });
  }

  const list = orphans
    .map(thread => `- ${thread.name} • alter: <t:${Math.floor(threadCreatedTimestamp(thread.id) / 1000)}:R>`)
    .join('\n');

  if (mode === 'loeschen') {
    const results = await deleteOrphanThreads(interaction.guild);

    return interaction.editReply({
      components: [
        buildNotice(
          `🧹 **Bereinigung abgeschlossen**\n` +
          `🗑️ Gelöscht: **${results.deleted.length}**\n` +
          `⚠️ Fehlgeschlagen: **${results.failed.length}**`
        )
      ]
    });
  }

  return interaction.editReply({
    components: [
      buildNotice(
        `🔍 **${orphans.length} verwaiste Ticket-Threads gefunden:**\n${list}\n\n` +
        'Mit `/thread-cleanup modus:Löschen` entfernst du sie alle.'
      )
    ]
  });
}
