import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} from 'discord.js';

import {
  spawners,
  ticketData,
  noticeFlags,
  buildNotice,
  isTraderMember,
  resolveTraderRole
} from './context.js';

import {
  getTraderPanel,
  setTraderPanel,
  getTraderInventory,
  setTraderStock,
  getGuildInventory
} from '../db/database.js';

let discordClient = null;

export function bindTraderPanelClient(client) {
  discordClient = client;
}

function formatTimestamp(ts) {
  const seconds = Math.floor(ts / 1000);
  return `<t:${seconds}:d> <t:${seconds}:t>`;
}

function buildOpenTradesText() {
  const open = Object.entries(ticketData.tickets)
    .filter(([, ticket]) => !ticket.abgeschlossen)
    .sort((a, b) => (a[1].tradeNumber ?? 0) - (b[1].tradeNumber ?? 0));

  if (open.length === 0) {
    return '*Aktuell keine offenen Trades.*';
  }

  return open
    .map(([channelId, ticket]) => {
      const modeLabel =
        ticket.mode === 'kaufen' ? '🛒 Verkauf an Kunde' : '💰 Ankauf vom Kunde';
      const trader = ticket.claimedBy ? `<@${ticket.claimedBy}>` : '*noch offen*';
      const zeit = ticket.createdAt ? formatTimestamp(ticket.createdAt) : '';

      return (
        `**#${ticket.tradeNumber}** • ${modeLabel}\n` +
        `${ticket.spawnerEmoji || '🔹'} ${ticket.spawnerName}-Spawner × \`${ticket.anzahl}\`\n` +
        `👤 Kunde: <@${ticket.customerId}> • 🙋 Trader: ${trader}\n` +
        `${zeit ? `📅 ${zeit}\n` : ''}➡️ <#${channelId}>`
      );
    })
    .join('\n\n');
}

function buildInventoryText(guildId) {
  const rows = getGuildInventory(guildId);

  if (rows.length === 0) {
    return '*Keine Bestände eingetragen.*';
  }

  const bySpawner = new Map();

  for (const row of rows) {
    if (!bySpawner.has(row.spawner_name)) {
      bySpawner.set(row.spawner_name, []);
    }

    bySpawner.get(row.spawner_name).push(`<@${row.trader_id}>: \`${row.menge}\``);
  }

  return spawners
    .filter(spawner => bySpawner.has(spawner.name))
    .map(
      spawner =>
        `### ${spawner.emoji || '🔹'} ${spawner.name}-Spawner\n` +
        bySpawner.get(spawner.name).join(' • ')
    )
    .join('\n');
}

export function buildTraderPanelContainer(guildId) {
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '# 📦 • TRADER PANEL • 🗂️\n*Bestands- und Trade-Übersicht*'
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## 🔄 Offene Trades\n${buildOpenTradesText()}`)
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## 📦 Spawner-Bestand\n${buildInventoryText(guildId)}`
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('trader_stock_edit')
        .setLabel('Bestand bearbeiten')
        .setEmoji('✏️')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return container;
}

function checkTrader(interaction) {
  const traderRole = resolveTraderRole(interaction.guild);

  if (!isTraderMember(interaction, traderRole)) {
    interaction
      .reply({
        components: [
          buildNotice(
            '❌ Nur Mitglieder der **Trader**-Rolle können das Trader-Panel nutzen.'
          )
        ],
        flags: noticeFlags
      })
      .catch(() => {});

    return false;
  }

  return true;
}

export async function handleTraderPanelCommand(interaction) {
  const traderRole = resolveTraderRole(interaction.guild);

  if (!isTraderMember(interaction, traderRole)) {
    return interaction.reply({
      components: [
        buildNotice('❌ Du benötigst die **Trader**-Rolle für diesen Befehl.')
      ],
      flags: noticeFlags
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const existing = getTraderPanel();
    let message = null;

    if (existing.channelId && existing.messageId) {
      try {
        const channel = await interaction.client.channels.fetch(existing.channelId);

        if (channel?.isTextBased()) {
          message = await channel.messages.fetch(existing.messageId);
        }
      } catch {
        message = null;
      }
    }

    if (message) {
      await message.edit({
        components: [buildTraderPanelContainer(interaction.guild.id)]
      });
    } else {
      message = await interaction.channel.send({
        components: [buildTraderPanelContainer(interaction.guild.id)],
        flags: MessageFlags.IsComponentsV2
      });

      setTraderPanel(message.channelId, message.id);
    }

    await interaction.editReply({
      components: [
        buildNotice(
          message
            ? '✅ Das Trader-Panel wurde aktualisiert.'
            : '✅ Das Trader-Panel wurde erstellt.'
        )
      ]
    });
  } catch (error) {
    console.error(error);

    await interaction.editReply({
      components: [buildNotice('❌ Das Trader-Panel konnte nicht erstellt werden.')]
    });
  }
}

export function handleTraderStockEdit(interaction) {
  if (!checkTrader(interaction)) {
    return;
  }

  if (spawners.length === 0) {
    return interaction.reply({
      components: [buildNotice('❌ Aktuell sind keine Spawner angelegt.')],
      flags: noticeFlags
    });
  }

  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '## ✏️ Bestand bearbeiten\n### Welchen Spawner möchtest du eintragen?\nDeine Eingabe setzt deinen persönlichen Bestand für diese Spawner-Art.'
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('trader_stock_select')
        .setPlaceholder('Spawner-Art wählen')
        .addOptions(
          spawners.slice(0, 25).map(spawner =>
            new StringSelectMenuOptionBuilder()
              .setLabel(`${spawner.name}-Spawner`)
              .setValue(spawner.name)
              .setDescription('Bestand für diesen Spawner setzen')
              .setEmoji(spawner.emoji || '🔹')
          )
        )
    )
  );

  return interaction.reply({ components: [container], flags: noticeFlags });
}

export function handleTraderStockSelect(interaction) {
  if (!checkTrader(interaction)) {
    return;
  }

  const spawnerName = interaction.values[0];

  const spawner = spawners.find(
    s => s.name.toLowerCase() === spawnerName.toLowerCase()
  );

  if (!spawner) {
    return interaction.reply({
      components: [buildNotice('❌ Dieser Spawner existiert nicht mehr.')],
      flags: noticeFlags
    });
  }

  const inventory = getTraderInventory(interaction.guild.id, interaction.user.id);
  const current = inventory.find(entry => entry.spawner_name === spawner.name);

  const modal = new ModalBuilder()
    .setCustomId(`trader_stock_modal|${spawner.name}`)
    .setTitle(`Bestand: ${spawner.name}`.slice(0, 45));

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('menge')
        .setLabel('Verfügbarer Bestand')
        .setStyle(TextInputStyle.Short)
        .setMinLength(1)
        .setMaxLength(9)
        .setValue(String(current?.menge ?? 0))
        .setRequired(true)
    )
  );

  return interaction.showModal(modal);
}

export async function handleTraderStockModal(interaction) {
  if (!checkTrader(interaction)) {
    return;
  }

  const [, spawnerName] = interaction.customId.split('|');
  const menge = Number(interaction.fields.getTextInputValue('menge').trim());

  if (!Number.isInteger(menge) || menge < 0) {
    return interaction.reply({
      components: [buildNotice('❌ Die Menge muss eine ganze Zahl ≥ 0 sein.')],
      flags: noticeFlags
    });
  }

  const spawner = spawners.find(
    s => s.name.toLowerCase() === spawnerName.toLowerCase()
  );

  if (!spawner) {
    return interaction.reply({
      components: [buildNotice('❌ Dieser Spawner existiert nicht mehr.')],
      flags: noticeFlags
    });
  }

  const result = setTraderStock({
    guildId: interaction.guild.id,
    traderId: interaction.user.id,
    spawnerName: spawner.name,
    menge
  });

  if (!result.success) {
    return interaction.reply({
      components: [buildNotice('❌ Der Bestand konnte nicht gespeichert werden.')],
      flags: noticeFlags
    });
  }

  await interaction.reply({
    components: [
      buildNotice(
        `✅ Dein Bestand für **${spawner.emoji || '🔹'} ${spawner.name}-Spawner** wurde auf \`${menge}\` gesetzt.`
      )
    ],
    flags: noticeFlags
  });

  await updateTraderPanel(interaction.guild.id);
}

export async function updateTraderPanel(guildId) {
  const panel = getTraderPanel();

  if (!panel.channelId || !panel.messageId || !discordClient) {
    return false;
  }

  try {
    const channel = await discordClient.channels.fetch(panel.channelId);

    if (!channel || !channel.isTextBased()) {
      return false;
    }

    const message = await channel.messages.fetch(panel.messageId);

    await message.edit({
      components: [buildTraderPanelContainer(guildId)]
    });

    return true;
  } catch (error) {
    console.error('Trader-Panel konnte nicht aktualisiert werden:', error);
    return false;
  }
}
