import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ChannelType,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';

import {
  spawners,
  panelData,
  ticketData,
  noticeFlags,
  publicFlags,
  buildNotice,
  formatPrice,
  priceText,
  saveJSON,
  resolveTraderRole,
  isTraderMember,
  TICKETS_FILE
} from './context.js';

import { updateSpawnerPanel } from './panel.js';

let discordClient = null;

export function bindTicketClient(client) {
  discordClient = client;
}

export function buildSpawnerSelect(mode) {
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      mode === 'kaufen'
        ? '## 🛒 Spawner Kaufen\n### Welchen Spawner möchtest du kaufen?\nDer Verkaufpreis gilt für diesen Kauf.'
        : '## 💰 Spawner Verkaufen\n### Welchen Spawner möchtest du verkaufen?\nDer Ankaufpreis gilt für diesen Verkauf.'
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${mode}_select`)
        .setPlaceholder(
          mode === 'kaufen'
            ? 'Welchen Spawner möchtest du kaufen?'
            : 'Welchen Spawner möchtest du verkaufen?'
        )
        .addOptions(
          spawners.slice(0, 25).map(spawner =>
            new StringSelectMenuOptionBuilder()
              .setLabel(`${spawner.name}-Spawner`)
              .setValue(spawner.name)
              .setDescription(
                mode === 'kaufen'
                  ? `Verkauf: ${priceText(spawner.verkauf)}`
                  : `Ankauf: ${priceText(spawner.ankauf)}`
              )
          )
        )
    )
  );

  return {
    components: [container],
    flags: noticeFlags
  };
}

export function buildTicketModal(mode, spawnerName) {
  const modal = new ModalBuilder()
    .setCustomId(`ticket_modal|${mode}|${spawnerName}`)
    .setTitle(mode === 'kaufen' ? 'Spawner Kaufen' : 'Spawner Verkaufen');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('ingame_name')
        .setLabel('Dein Ingame-Name')
        .setStyle(TextInputStyle.Short)
        .setMinLength(2)
        .setMaxLength(32)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('anzahl')
        .setLabel('Anzahl der Spawner')
        .setStyle(TextInputStyle.Short)
        .setMinLength(1)
        .setMaxLength(6)
        .setRequired(true)
    )
  );

  return modal;
}

function buildTicketEmbed(ticket, mention = '') {
  const titleLine =
    ticket.mode === 'kaufen'
      ? '📥 • Spawner Verkauf'
      : '📤 • Spawner Ankauf';

  let statusLine;

  if (ticket.abgeschlossen) {
    statusLine = '✅ **Trade abgeschlossen** – Ticket wird geschlossen.';
  } else if (ticket.claimedBy === null) {
    statusLine = '🔓 **Status:** Offen';
  } else {
    statusLine = `🔒 **Geclaimt von:** <@${ticket.claimedBy}>`;
  }

  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${titleLine}\n` +
      `**🤝 • Handel #${ticket.tradeNumber}**\n` +
       mention
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `👤 **Kunde:** <@${ticket.customerId}>\n` +
      `🎮 **ING:** \`${ticket.ingameName}\``
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `${ticket.spawnerEmoji || '🔹'}  **Spawner:** ${ticket.spawnerName}-Spawner\n` +
      `📦 **Menge:** \`${ticket.anzahl}\`\n` +
      `💵 **Preis/Stk:** \`${priceText(ticket.preisStk)}\`\n` +
      `💰 **Gesamtpreis:** \`${ticket.gesamtpreis}\``
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(statusLine)
  );

  return container;
}

function createClaimButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_claim')
      .setLabel('Claim')
      .setEmoji('🙋')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('ticket_cancel')
      .setLabel('Abbrechen')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Secondary)
  );
}

function createClaimedButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_sold')
      .setLabel('Als angekauft markieren')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('ticket_release')
      .setLabel('Freigeben')
      .setEmoji('🔓')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('ticket_cancel')
      .setLabel('Abbrechen')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Secondary)
  );
}

export function createTicketComponents(ticket, mention = '') {
  if (ticket.abgeschlossen) {
    return [buildTicketEmbed(ticket, mention)];
  }

  let buttonRow;

  if (ticket.claimedBy === null) {
    buttonRow = createClaimButtonRow();
  } else {
    buttonRow = createClaimedButtonRow();
  }

  return [buildTicketEmbed(ticket, mention), buttonRow];
}

async function updateTicketMessage(channel, ticket) {
  if (!ticket.messageId) {
    return;
  }

  try {
    const message = await channel.messages.fetch(ticket.messageId);

    await message.edit({
      components: createTicketComponents(ticket)
    });
  } catch (error) {
    console.error('Ticket-Nachricht konnte nicht aktualisiert werden:', error);
  }
}


export async function createTicketThread(interaction, mode, spawnerName, ingameName, anzahl) {
  const spawner = spawners.find(
    s => s.name.toLowerCase() === spawnerName.toLowerCase()
  );

  if (!spawner) {
    await interaction.editReply({
      components: [
        buildNotice('❌ Dieser Spawner existiert nicht mehr. Bitte wähle erneut.')
      ],
      flags: noticeFlags
    });

    return;
  }

  const actionLabel = mode === 'kaufen' ? '📥 Verkauf' : '📤 Ankauf';
  const relevantPrice = mode === 'kaufen' ? spawner.verkauf : spawner.ankauf;

  const gesamtpreis =
    relevantPrice === null
      ? 'Stop'
      : formatPrice(relevantPrice * anzahl);

  try {
    const panelChannel = await discordClient.channels.fetch(panelData.channelId);

    if (!panelChannel) {
      throw new Error('Panel-Kanal nicht gefunden');
    }

    const thread = await panelChannel.threads.create({
      name: `${actionLabel} • ${spawner.emoji || '🔹'} ${spawner.name} • 📦 Menge: ${anzahl}`,
      autoArchiveDuration: 1440,
      type: ChannelType.PrivateThread,
      invitable: false,
      reason: `Ticket: ${actionLabel} ${spawner.name}-Spawner (von ${interaction.user.tag})`
    });

    const traderRole = resolveTraderRole(interaction.guild);

    const membersToAdd = new Set([interaction.user.id]);

    if (traderRole) {
      for (const member of traderRole.members.values()) {
        membersToAdd.add(member.id);
      }
    }

    for (const userId of membersToAdd) {
      try {
        await thread.members.add(userId);
      } catch (error) {
        console.error(`Konnte ${userId} nicht zum Ticket hinzufügen:`, error);
      }
    }

    ticketData.count += 1;

    const ticket = {
      messageId: null,
      mode,
      spawnerName: spawner.name,
      spawnerEmoji: spawner.emoji || '🔹',
      ingameName,
      anzahl,
      tradeNumber: ticketData.count,
      customerId: interaction.user.id,
      preisStk: relevantPrice,
      gesamtpreis,
      claimedBy: null,
      abgeschlossen: false
    };

    // Ticket-Container senden
    const ticketMessage = await thread.send({
      components: createTicketComponents(ticket),
      flags: MessageFlags.IsComponentsV2
    });

    // WICHTIG: Message-ID und Ticket speichern
    ticket.messageId = ticketMessage.id;
    ticketData.tickets[thread.id] = ticket;

    saveTickets();

    console.log('[TICKET SAVED]', {
      threadId: thread.id,
      messageId: ticket.messageId,
      savedTickets: Object.keys(ticketData.tickets)
    });

    // Trader-Ping unter dem Container
    if (traderRole) {
      await thread.send({
        content: `||**<@&${traderRole.id}> — Neuer Trade von \`${ingameName}\`**!||`,
        allowedMentions: {
          roles: [traderRole.id]
        }
      });
    }

    await interaction.editReply({
      components: [
        buildNotice(
          `✅ Dein **${actionLabel}-Ticket** für **${spawner.emoji || '🔹'} ${spawner.name}-Spawner** wurde erstellt:\n` +
          `➡️ <#${thread.id}>`
        )
      ],
      flags: noticeFlags
    });

  } catch (error) {
    console.error('Ticket konnte nicht erstellt werden:', error);

    await interaction.editReply({
      components: [buildNotice('❌ Das Ticket konnte nicht erstellt werden.')],
      flags: noticeFlags
    });
  }
}


function saveTickets() {
  saveJSON(TICKETS_FILE, ticketData);
}

async function getTicketFromChannel(interaction) {
  const ticket = ticketData.tickets[interaction.channel.id];

  if (!ticket || !ticket.messageId) {
    await interaction.reply({
      components: [buildNotice('❌ Dieses Ticket konnte nicht gefunden werden.')],
      flags: noticeFlags
    });

    return null;
  }

  return ticket;
}

export async function handleTicketClaim(interaction) {
  const ticket = await getTicketFromChannel(interaction);

  if (!ticket) {
    return;
  }

  const traderRole = resolveTraderRole(interaction.guild);

  if (!isTraderMember(interaction, traderRole)) {
    return interaction.reply({
      components: [
        buildNotice('❌ Nur Mitglieder der **Trader**-Rolle können einen Trade claimen.')
      ],
      flags: noticeFlags
    });
  }

  if (ticket.claimedBy !== null) {
    return interaction.reply({
      components: [
        buildNotice(`⚠️ Dieser Trade wurde bereits von <@${ticket.claimedBy}> geclaimt.`)
      ],
      flags: noticeFlags
    });
  }

  ticket.claimedBy = interaction.user.id;

  saveTickets();

  await interaction.update({
    components: createTicketComponents(ticket)
  });

  await interaction.channel.send({
    components: [
      buildNotice(`✅ <@${interaction.user.id}> hat diesen Trade geclaimt.`)
    ],
    flags: publicFlags
  });
}

export async function handleTicketRelease(interaction) {
  const ticket = await getTicketFromChannel(interaction);

  if (!ticket) {
    return;
  }

  if (ticket.claimedBy === null) {
    return interaction.reply({
      components: [buildNotice('⚠️ Dieser Trade ist nicht geclaimt.')],
      flags: noticeFlags
    });
  }

  const traderRole = resolveTraderRole(interaction.guild);

  const allowed =
    interaction.user.id === ticket.claimedBy ||
    isTraderMember(interaction, traderRole);

  if (!allowed) {
    return interaction.reply({
      components: [
        buildNotice('❌ Nur der Claimer oder ein **Trader** kann den Trade freigeben.')
      ],
      flags: noticeFlags
    });
  }

  const previousClaimer = ticket.claimedBy;

  ticket.claimedBy = null;

  saveTickets();

  await interaction.update({
    components: createTicketComponents(ticket)
  });

  await interaction.channel.send({
    components: [
      buildNotice(
        `🔓 <@${previousClaimer}> hat den Trade freigegeben. ` +
        'Der Trade kann wieder geclaimt werden.'
      )
    ],
    flags: publicFlags
  });
}

export async function handleTicketSold(interaction) {
  const ticket = await getTicketFromChannel(interaction);

  if (!ticket) {
    return;
  }

  const traderRole = resolveTraderRole(interaction.guild);

  if (!isTraderMember(interaction, traderRole)) {
    return interaction.reply({
      components: [
        buildNotice('❌ Nur Mitglieder der **Trader**-Rolle können den Trade als angekauft markieren.')
      ],
      flags: noticeFlags
    });
  }

  if (ticket.abgeschlossen) {
    return interaction.reply({
      components: [buildNotice('⚠️ Dieser Trade wurde bereits abgeschlossen.')],
      flags: noticeFlags
    });
  }

    ticket.abgeschlossen = true;
    ticketData.completed += 1;

    saveTickets();

    // Spawner-Panel aktualisieren
    await updateSpawnerPanel();

  await updateTicketMessage(interaction.channel, ticket);

  await interaction.update({
    components: createTicketComponents(ticket)
  });

  await interaction.channel.send({
    components: [
      buildNotice(
        `✅ <@${interaction.user.id}> hat den Trade als angekauft markiert.\n` +
        '🗑️ Dieses Ticket wird in **5 Sekunden** geschlossen.'
      )
    ],
    flags: publicFlags
  });

  setTimeout(async () => {
    delete ticketData.tickets[interaction.channel.id];
    saveTickets();

    try {
      await interaction.channel.delete('Trade wurde abgeschlossen');
    } catch (error) {
      console.error('Ticket-Thread konnte nicht gelöscht werden:', error);
    }
  }, 5000);
}

export async function handleTicketCancel(interaction) {
  const ticket = await getTicketFromChannel(interaction);

  if (!ticket) {
    return;
  }

  if (ticket.abgeschlossen) {
    return interaction.reply({
      components: [buildNotice('⚠️ Dieser Trade wurde bereits abgeschlossen.')],
      flags: noticeFlags
    });
  }

  await interaction.reply({
    components: [buildNotice('🗑️ Dieses Ticket wird in **5 Sekunden** gelöscht.')],
    flags: noticeFlags
  });

  setTimeout(async () => {
    delete ticketData.tickets[interaction.channel.id];
    saveTickets();

    try {
      await interaction.channel.delete('Ticket wurde abgebrochen');
    } catch (error) {
      console.error('Ticket-Thread konnte nicht gelöscht werden:', error);
    }
  }, 5000);
}
