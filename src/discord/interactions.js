import {
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags
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
  handleTicketCancel
} from './tickets.js';

import { setCompletedTrades } from './panel.js';

export function registerInteractions(client) {
  client.on('interactionCreate', async interaction => {
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

      const mode =
        interaction.customId === 'ticket_kaufen'
          ? 'kaufen'
          : 'verkaufen';

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
  });
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

