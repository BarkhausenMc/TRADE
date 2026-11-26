import {
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
  PermissionFlagsBits
} from 'discord.js';

import { createVerifyCode } from '../db/database.js';
import { saveSpawners, setPanel } from '../db/database.js';

import {
  spawners,
  setSpawners,
  panelData,
  setPanelData,
  noticeFlags,
  buildNotice,
  priceText,
  parsePrice,
  hasTradeLeaderRole
} from './context.js';

import { updateSpawnerPanel, createPanelComponents } from './panel.js';
import { updatePriceLog } from './price-log.js';

import {
  buildSpawnerSelect,
  buildTicketModal,
  createTicketThread,
  handleTicketClaim,
  handleTicketRelease,
  handleTicketSold,
  handleTicketCancel,
  handleThreadDelete,
  updateOpenTicketPrices
} from './tickets.js';

import { setCompletedTrades } from './panel.js';
import { pushSpawner, removeSpawner } from '../hugoguard/hugoguard.js';

import { logInteractionError } from './logger.js';

import {
  addTicketBan,
  getTicketBan,
  getTicketBans
} from '../db/database.js';

import { handleTradeCommand } from './trades.js';
import { setupTradePanel } from './trade-panel.js';

import {
  handleGiveRole,
  handleRemoveRole,
  handleShowRoles
} from './roles.js';
import {
  handleAdminPanelCommand,
  handleAdminPanelComponent
} from './admin-panel.js';

import {
  handleToggleMarket,
  isMarketEnabled,
  buildMarketDisabledNotice
} from './market-toggle.js';

import {
  handleTraderPanelCommand,
  handleTraderStockEdit,
  handleTraderStockSelect,
  handleTraderStockModal
} from './trader-panel.js';

function canManageTicketBans(interaction) {
  return (
    interaction.memberPermissions?.has(
      PermissionFlagsBits.Administrator
    ) ||
    hasTradeLeaderRole(interaction)
  );
}

export function registerInteractions(client) {
  client.on('interactionCreate', async interaction => {
    try {
      await handleInteraction(interaction);
    } catch (error) {
      console.error('[INTERACTION ERROR]', error);

      logInteractionError(
        {
          interaction,
          note: interaction.isChatInputCommand()
            ? 'Slash-Command fehlgeschlagen'
            : 'Komponenten-Interaktion fehlgeschlagen'
        },
        error
      ).catch(() => {});
    }
  });
}

async function handleInteraction(interaction) {
    if (interaction.isButton() && interaction.customId.startsWith('admin_')) {
      return handleAdminPanelComponent(interaction);
    }

    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'give-role') {
        return handleGiveRole(interaction);
      }

      if (interaction.commandName === 'remove-role') {
        return handleRemoveRole(interaction);
      }

      if (interaction.commandName === 'setup-admin-panel') {
        return handleAdminPanelCommand(interaction);
      }

      if (interaction.commandName === 'show-roles') {
        return handleShowRoles(interaction);
      }

      if (interaction.commandName === 'toggle-market') {
        return handleToggleMarket(interaction);
      }
    }

     if (interaction.commandName === 'thread-delete') {
      return handleThreadDelete(interaction);
    }

    if (interaction.commandName === 'setup-trader-panel') {
      return handleTraderPanelCommand(interaction);
    }

    if (interaction.customId === 'trader_stock_edit') {
        return handleTraderStockEdit(interaction);
      }

    if (interaction.customId === 'trader_stock_select') {
        return handleTraderStockSelect(interaction);
      }

    if (interaction.customId?.startsWith('trader_stock_modal|')) {
        return handleTraderStockModal(interaction);
      }  

    if (interaction.commandName === 'update-price') {
      if (!hasTradeLeaderRole(interaction)) {
        return interaction.reply({
          components: [
            buildNotice('❌ Du benötigst die **TRADE leader** Rolle für diesen Befehl.')
          ],
          flags: noticeFlags
        });
      }

      await interaction.reply({
        components: [buildNotice('⏳ Preise in offenen Tickets werden aktualisiert...')],
        flags: noticeFlags
      });

      const results = await updateOpenTicketPrices();

      let body =
        `✅ **${results.updated}** Ticket(s) erfolgreich aktualisiert.\n` +
        `ℹ️ **${results.unchanged}** Ticket(s) unverändert (Preise bereits aktuell).\n` +
        `📋 Offene Tickets geprüft: **${results.total}**`;

      if (results.errors.length > 0) {
        body +=
          `\n\n⚠️ **Fehler bei ${results.errors.length} Ticket(s):**\n` +
          results.errors
            .map(e => `- Trade #${e.tradeNumber} (${e.spawnerName}): ${e.error}`)
            .join('\n');
      }

      return interaction.followUp({
        components: [buildNotice(body)],
        flags: noticeFlags
      });
    }

    if (interaction.isButton() && interaction.customId === 'spawner_price_role') {
      return handleSpawnerPriceRole(interaction);
    }

    if (interaction.isAutocomplete()) {
      if (
        interaction.commandName !== 'setprice' &&
        interaction.commandName !== 'spawner-remove'
      ) {
        return;
      }

      const focused = interaction.options.getFocused(true);

      if (focused.name !== 'name') {
        return;
      }

      const query = focused.value.trim().toLowerCase();

      await interaction.respond(
        spawners
          .filter(s => s.name.toLowerCase().includes(query))
          .slice(0, 25)
          .map(s => ({
            name: `${s.emoji || '🔹'} ${s.name}`,
            value: s.name
          }))
      );

      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'ticket_claim') {
        return handleTicketClaim(interaction);
      }

      if (interaction.customId === 'ticket_release') {
        return handleTicketRelease(interaction);
      }

      if (interaction.customId === 'ticket_sold') {
        return handleTicketSold(interaction);
      }

      if (interaction.customId === 'ticket_cancel') {
        return handleTicketCancel(interaction);
      }

      if (
        interaction.customId !== 'ticket_kaufen' &&
        interaction.customId !== 'ticket_verkaufen'
      ) {
        return;
      }

      const existingBan = getTicketBan(
        interaction.guild.id,
        interaction.user.id
      );

      if (existingBan) {
        return interaction.reply({
          components: [
            buildNotice(
              '🚫 Du darfst keine Tickets mehr erstellen.\n' +
              `**Grund:** $DIL2`
            )
          ],
          flags: noticeFlags
        });
      }

      const mode =
        interaction.customId === 'ticket_kaufen'
          ? 'kaufen'
          : 'verkaufen';

      if (!isMarketEnabled(mode)) {
        return interaction.reply(buildMarketDisabledNotice(mode));
      }

      if (spawners.length === 0) {
        return interaction.reply({
          components: [buildNotice('❌ Aktuell sind keine Spawner verfügbar.')],
          flags: noticeFlags
        });
      }

      return interaction.reply(buildSpawnerSelect(mode));
    }

        if (interaction.isStringSelectMenu()) {
        if (
            interaction.customId !== 'kaufen_select' &&
            interaction.customId !== 'verkaufen_select'
        ) {
            return;
        }

        const mode =
            interaction.customId === 'kaufen_select'
            ? 'kaufen'
            : 'verkaufen';

        const spawnerName = interaction.values[0];

        const spawner = spawners.find(
            s => s.name.toLowerCase() === spawnerName.toLowerCase()
        );

        if (!spawner) {
            return interaction.reply({
            components: [buildNotice('❌ Dieser Spawner existiert nicht mehr. Bitte wähle erneut.')],
            flags: noticeFlags
            });
        }

        const relevantPrice = mode === 'kaufen' ? spawner.verkauf : spawner.ankauf;

        if (relevantPrice === null) {
            return interaction.reply({
            components: [
                buildNotice(
                `⚠️ **${spawner.emoji || '🔹'} ${spawner.name}-Spawner** wird derzeit ` +
                (mode === 'kaufen' ? '**nicht verkauft** (Verkauf: Stop).' : '**nicht angekauft** (Ankauf: Stop).')
                )
            ],
            flags: noticeFlags
            });
        }

        return interaction.showModal(buildTicketModal(mode, spawnerName));
        }

    if (interaction.isModalSubmit()) {
      if (!interaction.customId.startsWith('ticket_modal|')) {
        return;
      }

      const [, mode, spawnerName] = interaction.customId.split('|');

      const ingameName = interaction.fields.getTextInputValue('ingame_name').trim();
      const anzahlRaw = interaction.fields.getTextInputValue('anzahl').trim();
      const anzahl = Number(anzahlRaw);

      if (!Number.isInteger(anzahl) || anzahl < 1) {
        return interaction.reply({
          components: [
            buildNotice('❌ Die Anzahl muss eine ganze Zahl größer als 0 sein.')
          ],
          flags: noticeFlags
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      return createTicketThread(interaction, mode, spawnerName, ingameName, anzahl);
    }

    if (!interaction.isChatInputCommand()) return;

    // =====================================
    // TRADER STATISTICS
    // =====================================

    if (interaction.commandName === 'trade') {
      return handleTradeCommand(interaction);
    }

    if (interaction.commandName === 'setup-trade-panel') {
      if (!hasTradeLeaderRole(interaction)) {
        return interaction.reply({
          content: '❌ Du benötigst die TRADE leader Rolle.',
          ephemeral: true
        });
      }

      return setupTradePanel(interaction);
    }

    // =====================================
    // TICKET BAN SYSTEM
    // =====================================

    if (
      interaction.commandName === 'ticket-ban' ||
      interaction.commandName === 'ticket-ban-list'
    ) {
      // Berechtigungsprüfung
      const canManageBans =
        interaction.memberPermissions?.has(
          PermissionFlagsBits.Administrator
        ) || hasTradeLeaderRole(interaction);

      if (!canManageBans) {
        return interaction.reply({
          components: [
            buildNotice(
              '❌ Du benötigst die **TRADE leader** Rolle oder Administratorrechte.'
            )
          ],
          flags: noticeFlags
        });
      }

      // =====================================
      // /ticket-ban
      // =====================================

      if (interaction.commandName === 'ticket-ban') {
        const user = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('grund', true).trim();

        if (user.bot) {
          return interaction.reply({
            components: [
              buildNotice('❌ Bots können nicht für Tickets gesperrt werden.')
            ],
            flags: noticeFlags
          });
        }

        if (!reason) {
          return interaction.reply({
            components: [
              buildNotice('❌ Bitte gib einen gültigen Ban-Grund an.')
            ],
            flags: noticeFlags
          });
        }

        const existingBan = getTicketBan(
          interaction.guild.id,
          user.id
        );

        addTicketBan(
          interaction.guild.id,
          user.id,
          reason,
          interaction.user.id
        );

        return interaction.reply({
          components: [
            buildNotice(
              `${existingBan
                ? '♻️ **Ticket-Ban aktualisiert!**'
                : '🚫 **Ticket-Ban ausgesprochen!**'
              }\n\n` +
              `👤 **Nutzer:** ${user}\n` +
              `🆔 **ID:** \`${user.id}\`\n` +
              `📝 **Grund:** ${reason}\n` +
              `🛡️ **Moderator:** ${interaction.user}`
            )
          ],
          flags: noticeFlags
        });
      }

      // =====================================
      // /ticket-ban-list
      // =====================================

      if (interaction.commandName === 'ticket-ban-list') {
        const bans = getTicketBans(interaction.guild.id);

        if (bans.length === 0) {
          return interaction.reply({
            components: [
              buildNotice(
                '✅ Es befinden sich aktuell keine Nutzer auf der Ticket-Ban-Liste.'
              )
            ],
            flags: noticeFlags
          });
        }

        const entries = bans.map((ban, index) => {
          const date = new Date(ban.created_at).toLocaleString('de-DE');

          return (
            `### ${index + 1}. <@${ban.user_id}>\n` +
            `🆔 **ID:** \`${ban.user_id}\`\n` +
            `📝 **Grund:** ${ban.reason}\n` +
            `🛡️ **Moderator:** <@${ban.banned_by}>\n` +
            `📅 **Datum:** ${date}`
          );
        });

        // Seiten erstellen
        const pages = [];
        let currentPage = '## 🚫 Ticket-Ban-Liste\n\n';

        for (const entry of entries) {
          if (currentPage.length + entry.length + 2 > 3500) {
            pages.push(currentPage);
            currentPage = '## 🚫 Ticket-Ban-Liste (Fortsetzung)\n\n';
          }

          currentPage += entry + '\n\n';
        }

        if (currentPage.trim()) {
          pages.push(currentPage);
        }

        // Erste Seite senden
        await interaction.reply({
          components: [
            new ContainerBuilder().addTextDisplayComponents(
              new TextDisplayBuilder().setContent(pages[0])
            )
          ],
          flags: noticeFlags
        });

        // Weitere Seiten senden
        for (let i = 1; i < pages.length; i++) {
          await interaction.followUp({
            components: [
              new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(pages[i])
              )
            ],
            flags: noticeFlags
          });
        }

        return;
      }
    }


    const tradeCommands = [
      'setup-spawner',
      'spawner-hinzufuegen',
      'setprice',
      'spawner-remove',
      'trades-counter'
    ];

    if (tradeCommands.includes(interaction.commandName)) {
      if (!hasTradeLeaderRole(interaction)) {
        return interaction.reply({
          components: [
            buildNotice('❌ Du benötigst die **TRADE leader** Rolle für diesen Befehl.')
          ],
          flags: noticeFlags
        });
      }
    }

    if (interaction.commandName === 'verify') {
      const code = createVerifyCode(interaction.user.id);

      await interaction.reply({
        components: [
          new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## 🔐 API-Verifizierung\n` +
              `Dein Code:\n` +
              `# \`${code}\`\n\n` +
              `Sende diesen Code per \`/msg JSK1905 <code>\` an den Minecraft-Bot. Du erhältst danach dein JWT zurück.\n\n` +
              `-# Gültig für 5 Minuten. Der Code funktioniert nur einmal.`
            )
          )
        ],
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      });

      return;
    }

    if (interaction.commandName === 'setup-spawner') {
      return handleSetupSpawner(interaction);
    }

    if (interaction.commandName === 'spawner-hinzufuegen') {
      return handleSpawnerHinzufuegen(interaction);
    }

    if (interaction.commandName === 'setprice') {
      return handleSetPrice(interaction);
    }

    if (interaction.commandName === 'spawner-remove') {
      return handleSpawnerRemove(interaction);
    }

    if (interaction.commandName === 'trades-counter') {
  const amount = interaction.options.getInteger('anzahl', true);

  try {
    await setCompletedTrades(amount);

    return interaction.reply({
      content: `✅ Der Trade-Counter wurde auf **${amount}** gesetzt und das Panel aktualisiert.`,
      ephemeral: true
    });
  } catch (error) {
    console.error('Trade-Counter konnte nicht geändert werden:', error);

    return interaction.reply({
      content: '❌ Der Trade-Counter konnte nicht geändert werden.',
      ephemeral: true
    });
  }
}
}

async function handleSpawnerPriceRole(interaction) {
  const roleId = process.env.SPAWNER_PING_ROLE_ID;

  if (!roleId) {
    return interaction.reply({
      components: [buildNotice('❌ Die Spawner Price Role ist nicht konfiguriert.')],
      flags: noticeFlags
    });
  }

  const role = interaction.guild.roles.cache.get(roleId);

  if (!role) {
    return interaction.reply({
      components: [buildNotice('❌ Die Spawner Price Rolle wurde nicht gefunden.')],
      flags: noticeFlags
    });
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);

  try {
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId);

      return interaction.reply({
        components: [
          buildNotice('🔕 Du bekommst nun keinen Ping mehr, wenn Preisänderungen vorgenommen wurden!')
        ],
        flags: noticeFlags
      });
    }

    await member.roles.add(roleId);

    return interaction.reply({
      components: [
        buildNotice('🔔 Du bekommst nun einen Ping, wenn Preisänderungen vorgenommen wurden!')
      ],
      flags: noticeFlags
    });
  } catch (error) {
    console.error('[SPAWNER PRICE ROLE ERROR]', error);

    return interaction.reply({
      components: [
        buildNotice('❌ Die Rolle konnte nicht geändert werden. Bitte überprüfe meine Discord-Berechtigungen.')
      ],
      flags: noticeFlags
    });
  }
}

async function handleSetupSpawner(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    let message = null;

    if (panelData.channelId && panelData.messageId) {
      try {
        const oldChannel = await client.channels.fetch(panelData.channelId);

        if (oldChannel?.isTextBased()) {
          message = await oldChannel.messages.fetch(panelData.messageId);
        }
      } catch {
        message = null;
      }
    }

    if (message) {
      await message.edit({
        components: createPanelComponents()
      });
    } else {
      message = await interaction.channel.send({
        components: createPanelComponents(),
        flags: MessageFlags.IsComponentsV2
      });

      setPanelData({
        channelId: message.channelId,
        messageId: message.id
      });

      setPanel(message.channelId, message.id);
    }

    await interaction.editReply({
      components: [
        buildNotice(
          message
            ? '✅ Das Spawner-Panel wurde erfolgreich aktualisiert!'
            : '✅ Das Spawner-Panel wurde erfolgreich erstellt!'
        )
      ],
      flags: MessageFlags.IsComponentsV2
    });
  } catch (error) {
    console.error(error);

    await interaction.editReply({
      components: [buildNotice('❌ Das Spawner-Panel konnte nicht erstellt werden.')],
      flags: MessageFlags.IsComponentsV2
    });
  }
}

async function handleSpawnerHinzufuegen(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const name = interaction.options.getString('name', true).trim();
  const emoji = interaction.options.getString('emoji', true).trim();

  const list = [...spawners];
  const existing = list.find(s => s.name.toLowerCase() === name.toLowerCase());

  let added = false;

  if (existing) {
    existing.emoji = emoji;
  } else {
    list.push({ name, emoji, ankauf: null, verkauf: null });
    added = true;
  }

  setSpawners(list);
  saveSpawners(list);

  const updated = await updateSpawnerPanel();

  await interaction.editReply({
    components: [
      buildNotice(
        (added
          ? `✅ **${emoji} ${name}-Spawner** wurde hinzugefügt.`
          : `♻️ **${emoji} ${name}-Spawner** existiert bereits, Emoji aktualisiert.`) +
        `\n🛒 **Ankauf:** \`${priceText(existing ? existing.ankauf : null)}\`` +
        `\n💰 **Verkauf:** \`${priceText(existing ? existing.verkauf : null)}\`` +
        (updated
          ? '\n\nDas Spawner-Panel wurde aktualisiert.'
          : '\n\n⚠️ Gespeichert, aber das Panel konnte nicht aktualisiert werden. Nutze `/setup-spawner`.')
      )
    ],
    flags: MessageFlags.IsComponentsV2
  });
}

async function handleSetPrice(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const name = interaction.options.getString('name', true).trim();

  const list = [...spawners];
  const spawner = list.find(s => s.name.toLowerCase() === name.toLowerCase());

  if (!spawner) {
    await interaction.editReply({
      components: [buildNotice(`❌ Der Spawner **${name}** wurde nicht gefunden.`)],
      flags: MessageFlags.IsComponentsV2
    });

    return;
  }

  const ankaufInput = interaction.options.getString('ankauf');
  const verkaufInput = interaction.options.getString('verkauf');
  const emojiInput = interaction.options.getString('emoji');

  if (ankaufInput === null && verkaufInput === null && emojiInput === null) {
    await interaction.editReply({
      components: [
        buildNotice('❌ Gib mindestens einen Wert an: `ankauf`, `verkauf` oder `emoji`.')
      ],
      flags: MessageFlags.IsComponentsV2
    });

    return;
  }

  const ankauf = ankaufInput === null ? undefined : parsePrice(ankaufInput);
  const verkauf = verkaufInput === null ? undefined : parsePrice(verkaufInput);

  if (
    (ankaufInput !== null && ankauf === undefined) ||
    (verkaufInput !== null && verkauf === undefined)
  ) {
    await interaction.editReply({
      components: [
        buildNotice('❌ Ungültiger Preis. Nutze eine Zahl (Mio.) oder `stop`.')
      ],
      flags: MessageFlags.IsComponentsV2
    });

    return;
  }

  const oldAnkauf = spawner.ankauf;
  const oldVerkauf = spawner.verkauf;
  const oldEmoji = spawner.emoji || '🔹';

  if (ankauf !== undefined) {
    spawner.ankauf = ankauf;
  }

  if (verkauf !== undefined) {
    spawner.verkauf = verkauf;
  }

  if (emojiInput !== null && emojiInput.trim() !== '') {
    spawner.emoji = emojiInput.trim();
  }

  setSpawners(list);
  saveSpawners(list);
    try {
    await pushSpawner(spawner);
  } catch (error) {
    console.error('[HugoGuard] Push fehlgeschlagen:', error);
  }

  const updated = await updateSpawnerPanel();

  const changes = [];

  if (ankauf !== undefined) {
    changes.push(`🛒 **Ankauf:** \`${priceText(oldAnkauf)}\` → \`${priceText(spawner.ankauf)}\``);
  }

  if (verkauf !== undefined) {
    changes.push(`💰 **Verkauf:** \`${priceText(oldVerkauf)}\` → \`${priceText(spawner.verkauf)}\``);
  }

  if (emojiInput !== null && emojiInput.trim() !== '') {
    changes.push(`🎨 **Emoji:** ${oldEmoji} → ${spawner.emoji}`);
  }

  if (changes.length > 0) {
    await updatePriceLog(interaction, spawner, changes);
  }

  await interaction.editReply({
    components: [
      buildNotice(
        `✅ Werte aktualisiert für **${spawner.emoji || '🔹'} ${spawner.name}-Spawner**\n` +
        `🛒 **Ankauf:** \`${priceText(spawner.ankauf)}\`\n` +
        `💰 **Verkauf:** \`${priceText(spawner.verkauf)}\`` +
        (updated
          ? '\n\nDas Spawner-Panel wurde aktualisiert.'
          : '\n\n⚠️ Gespeichert, aber das Panel konnte nicht aktualisiert werden. Nutze `/setup-spawner`.')
      )
    ],
    flags: MessageFlags.IsComponentsV2
  });
}

async function handleSpawnerRemove(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const name = interaction.options.getString('name', true).trim();

  const list = [...spawners];
  const index = list.findIndex(s => s.name.toLowerCase() === name.toLowerCase());

  if (index === -1) {
    await interaction.editReply({
      components: [buildNotice(`❌ Der Spawner **${name}** wurde nicht gefunden.`)],
      flags: noticeFlags
    });

    return;
  }

  const removed = list[index];
  list.splice(index, 1);

  setSpawners(list);
  saveSpawners(list);
    try {
    await removeSpawner(removed.name);
  } catch (error) {
    console.error('[HugoGuard] Remove fehlgeschlagen:', error);
  } 
  
  const updated = await updateSpawnerPanel();

  await interaction.editReply({
    components: [
      buildNotice(
        `✅ **${removed.emoji || '🔹'} ${removed.name}-Spawner** wurde entfernt.` +
        (updated
          ? '\nDas Spawner-Panel wurde aktualisiert.'
          : '\n⚠️ Das Panel konnte nicht aktualisiert werden. Nutze `/setup-spawner`.')
      )
    ],
    flags: noticeFlags
  });

}