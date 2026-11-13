require('dotenv').config();
const chalk = require('chalk');
const fs = require('node:fs');
const path = require('node:path');
const minecraft = require('./minecraft.js');

const {
  Client,
  GatewayIntentBits,
  ChannelType,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
  ThumbnailBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonStyle,
  TextDisplayComponent,
  SectionBuilder,
  Sweepers,
  Events,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});


client.once('clientReady', async () => {
  console.clear();

  const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

  const gradient = (text) => {
    const start = [0, 0, 139];
    const end = [135, 206, 250];

    return [...text].map((char, i) => {
      const t = i / Math.max(text.length - 1, 1);

      const r = Math.round(start[0] + (end[0] - start[0]) * t);
      const g = Math.round(start[1] + (end[1] - start[1]) * t);
      const b = Math.round(start[2] + (end[2] - start[2]) * t);

      return chalk.rgb(r, g, b)(char);
    }).join('');
  };

  const trade = [
    '████████╗██████╗  █████╗ ██████╗ ███████╗',
    '╚══██╔══╝██╔══██╗██╔══██╗██╔══██╗██╔════╝',
    '   ██║   ██████╔╝███████║██║  ██║█████╗  ',
    '   ██║   ██╔══██╗██╔══██║██║  ██║██╔══╝  ',
    '   ██║   ██║  ██║██║  ██║██████╔╝███████╗',
    '   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚══════╝'
  ];

  console.log('\n');

  for (let i = 0; i < trade.length; i++) {
    console.log(gradient(trade[i]));
    await sleep(100);
  }

  console.log('');
  console.log(gradient('       💎 T R A D E   B O T 💎'));
  console.log('');

  const frames = [
    '⠋', '⠙', '⠹', '⠸', '⠼',
    '⠴', '⠦', '⠧', '⠇', '⠏'
  ];

  for (let i = 0; i < 20; i++) {
    process.stdout.write(
      `\r${gradient(frames[i % frames.length])} ` +
      chalk.white('Initializing Trade systems...')
    );

    await sleep(100);
  }

  console.log(
    '\r' + gradient('✔ Trade systems initialized!       ')
  );

  console.log(gradient('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

  console.log(
    gradient('  ✔ ') +
    chalk.white(`Logged in as: ${client.user.tag}`)
  );

  console.log(
    gradient('  ✔ ') +
    chalk.white('Discord connection established')
  );

  console.log(gradient('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

  console.log(gradient('          ✨ TRADE BOT ONLINE ✨'));

// Gespeicherten Price-Log-Timer wiederherstellen
if (priceLogData.lastChangeAt) {
  console.log('[PRICE LOG] Wiederherstelle Lösch-Timer...');
  armPriceLogDeletion();
}

});


const SPAWNER_FILE = path.join(__dirname, 'spawners.json');
const PANEL_FILE = path.join(__dirname, 'panel.json');
const TICKETS_FILE = path.join(__dirname, 'tickets.json');

const PRICE_LOG_FILE = path.join(__dirname, 'price-log.json');
const PRICE_LOG_TIMEOUT = 5 * 60 * 1000;
let priceLogData = loadJSON(PRICE_LOG_FILE, {
  channelId: null,
  messageId: null,
  lastChangeAt: null,
  entries: []
});

let priceLogTimeout;

function loadJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (error) {
    console.error(`Fehler beim Laden von ${file}:`, error);
  }

  return fallback;
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let spawners = loadJSON(SPAWNER_FILE, []);
let panelData = loadJSON(PANEL_FILE, {
  channelId: null,
  messageId: null
});
let ticketData = loadJSON(TICKETS_FILE, {
  count: 0,
  completed: 0,
  tickets: {}
});

if (!ticketData.tickets) {
  ticketData.tickets = {};
}

if (typeof ticketData.count !== 'number') {
  ticketData.count = 0;
}

if (typeof ticketData.completed !== 'number') {
  ticketData.completed = 0;
}

function formatPrice(price) {
  const value = Number(price);

  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toLocaleString('de-DE', {
      maximumFractionDigits: 2
    })} b`;
  }

  return `${value.toLocaleString('de-DE')} Mio.`;
}

function priceText(price) {
  if (price === null || price === undefined) {
    return 'Stop';
  }

  return formatPrice(price);
}

function parsePrice(input) {
  const value = input.trim().toLowerCase();

  if (value === 'stop') {
    return null;
  }

  const parsed = Number(value.replace(',', '.'));

  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildNotice(content) {
  return new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(content)
  );
}

const NOTICE_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const PUBLIC_FLAGS = MessageFlags.IsComponentsV2;

function hasTradeLeaderRole(interaction) {
  return interaction.member?.roles?.cache?.some(
    role =>
      role.name === 'TRADE leader' ||
      role.id === process.env.TRADE_LEADER_ROLE_ID
  ) ?? false;
}

function resolveTraderRole(guild) {
  if (process.env.TRADER_ROLE_ID) {
    const roleById = guild.roles.cache.get(process.env.TRADER_ROLE_ID);

    if (roleById) {
      return roleById;
    }
  }

  return guild.roles.cache.find(
    role => role.name.toLowerCase() === 'trader'
  ) ?? null;
}

function isTraderMember(interaction, traderRole) {
  return (
    traderRole &&
    interaction.member?.roles?.cache?.has(traderRole.id)
  ) ?? false;
}


function createSpawnerPanel() {
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '# 🛒 • SPAWNER TRADING • 💰\n' +
      '*TRADE (yayk Clan Spawner Trading)*\n' +
      '||*Only Trusted Trader, Faire Preise 💜*||'
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder()
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**Insgesamt abgeschlossene Trades:** \`${ticketData.completed}\``
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder()
  );

  if (spawners.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '*Aktuell sind keine Spawner eingetragen.*'
      )
    );
  }

  for (const spawner of spawners) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${spawner.emoji || '🔹'} ${spawner.name}-Spawner\n` +
        `🛒 **Ankaufspreise:** \`${priceText(spawner.ankauf)}\`\n` +
        `💰 **Verkaufspreise:** \`${priceText(spawner.verkauf)}\``
      )
    );

    container.addSeparatorComponents(
      new SeparatorBuilder()
    );
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '-# Preise werden und können jederzeit durch das TRADE Team geändert' 
    )
  );

  return container;
}

function createTicketButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_verkaufen')
      .setLabel('Ich möchte meine Spawner Verkaufen')
      .setEmoji('💰')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('ticket_kaufen')
      .setLabel('Ich möchte Spawner Kaufen')
      .setEmoji('🛒')
      .setStyle(ButtonStyle.Primary)
  );
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

function createCompletedButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_cancel')
      .setLabel('Abbrechen')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Secondary)
  );
}

function createPanelComponents() {
  return [createSpawnerPanel(), createTicketButtonRow()];
}

async function updateSpawnerPanel() {
  if (!panelData.channelId || !panelData.messageId) {
    return false;
  }

  try {
    const channel = await client.channels.fetch(
      panelData.channelId
    );

    if (!channel || !channel.isTextBased()) {
      return false;
    }

    const message = await channel.messages.fetch(
      panelData.messageId
    );

    await message.edit({
      components: createPanelComponents()
    });

    return true;
  } catch (error) {
    console.error('Spawner-Panel konnte nicht aktualisiert werden:', error);
    return false;
  }
}


function buildSpawnerSelect(mode) {
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      mode === 'kaufen'
        ? '## 🛒 Spawner Kaufen\n### Welchen Spawner möchtest du kaufen?\nDer Verkaufpreis gilt für diesen Kauf.'
        : '## 💰 Spawner Verkaufen\n### Welchen Spawner möchtest du verkaufen?\nDer Ankaufpreis gilt für diesen Verkauf.'
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder()
  );

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
    flags: NOTICE_FLAGS
  };
}


function buildTicketModal(mode, spawnerName) {
  const modal = new ModalBuilder()
    .setCustomId(`ticket_modal|${mode}|${spawnerName}`)
    .setTitle(
      mode === 'kaufen'
        ? 'Spawner Kaufen'
        : 'Spawner Verkaufen'
    );

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


function buildTicketEmbed(ticket) {
  const titleLine =
    ticket.mode === 'kaufen'
      ? '🛒 • Spawner Kaufen'
      : '💰 • Spawner Verkauf';

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
      `**🤝 • Handel #${ticket.tradeNumber}**`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder()
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `👤 **Kunde:** <@${ticket.customerId}>\n` +
      `🎮 **ING:** \`${ticket.ingameName}\``
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder()
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `${ticket.spawnerEmoji || '🔹'}  **Spawner:** ${ticket.spawnerName}-Spawner\n` +
      `📦 **Menge:** \`${ticket.anzahl}\`\n` +
      `💵 **Preis/Stk:** \`${priceText(ticket.preisStk)}\`\n` +
      `💰 **Gesamtpreis:** \`${ticket.gesamtpreis}\``
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder()
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(statusLine)
  );

  return container;
}

function createTicketComponents(ticket) {
  let buttonRow;

  if (ticket.abgeschlossen) {
    buttonRow = createCompletedButtonRow();
  } else if (ticket.claimedBy === null) {
    buttonRow = createClaimButtonRow();
  } else {
    buttonRow = createClaimedButtonRow();
  }

  return [buildTicketEmbed(ticket), buttonRow];
}

async function updateTicketMessage(channel, ticket) {
  if (!ticket.messageId) {
    return;
  }

  try {
    const message = await channel.messages.fetch(
      ticket.messageId
    );

    await message.edit({
      components: createTicketComponents(ticket)
    });
  } catch (error) {
    console.error('Ticket-Nachricht konnte nicht aktualisiert werden:', error);
  }
}


async function createTicketThread(interaction, mode, spawnerName, ingameName, anzahl) {
  const spawner = spawners.find(
    s => s.name.toLowerCase() === spawnerName.toLowerCase()
  );

  if (!spawner) {
    await interaction.editReply({
      components: [
        buildNotice('❌ Dieser Spawner existiert nicht mehr. Bitte wähle erneut.')
      ],
      flags: NOTICE_FLAGS
    });

    return;
  }

  const actionLabel = mode === 'kaufen' ? 'Kaufen' : 'Verkauf';
  const relevantPrice = mode === 'kaufen' ? spawner.verkauf : spawner.ankauf;
  const gesamtpreis =
    relevantPrice === null
      ? 'Stop'
      : formatPrice(relevantPrice * anzahl);

  try {
    const panelChannel = await client.channels.fetch(
      panelData.channelId
    );

    if (!panelChannel) {
      throw new Error('Panel-Kanal nicht gefunden');
    }

    const thread = await panelChannel.threads.create({
      name: `${spawner.emoji || '🔹'} ${spawner.name}-Spawner • ${actionLabel} • ${ingameName}`,
      autoArchiveDuration: 1440,
      type: ChannelType.PrivateThread,
      invitable: false,
      reason: `Ticket: ${actionLabel} ${spawner.name}-Spawner (von ${interaction.user.tag})`
    });

    const memberRows = await interaction.guild.members.fetch();
    const traderRole = resolveTraderRole(interaction.guild);

    const membersToAdd = new Set([interaction.user.id]);

    if (traderRole) {
      for (const member of memberRows.values()) {
        if (member.roles.cache.has(traderRole.id)) {
          membersToAdd.add(member.id);
        }
      }
    }

    for (const userId of membersToAdd) {
      try {
        await thread.members.add(userId);
      } catch {
        continue;
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

    const ticketMessage = await thread.send({
      components: createTicketComponents(ticket),
      flags: MessageFlags.IsComponentsV2
    });

    ticket.messageId = ticketMessage.id;
    ticketData.tickets[thread.id] = ticket;

    saveJSON(TICKETS_FILE, ticketData);

    await interaction.editReply({
      components: [
        buildNotice(
          `✅ Dein **${actionLabel}-Ticket** für **${spawner.emoji || '🔹'} ${spawner.name}-Spawner** wurde erstellt:\n` +
          `➡️ <#${thread.id}>`
        )
      ],
      flags: NOTICE_FLAGS
    });
  } catch (error) {
    console.error('Ticket konnte nicht erstellt werden:', error);

    await interaction.editReply({
      components: [
        buildNotice('❌ Das Ticket konnte nicht erstellt werden.')
      ],
      flags: NOTICE_FLAGS
    });
  }
}


async function getTicketFromChannel(interaction) {
  const ticket = ticketData.tickets[interaction.channel.id];

  if (!ticket || !ticket.messageId) {
    await interaction.reply({
      components: [
        buildNotice('❌ Dieses Ticket konnte nicht gefunden werden.')
      ],
      flags: NOTICE_FLAGS
    });

    return null;
  }

  return ticket;
}


async function handleTicketClaim(interaction) {
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
      flags: NOTICE_FLAGS
    });
  }

  if (ticket.claimedBy !== null) {
    return interaction.reply({
      components: [
        buildNotice(
          `⚠️ Dieser Trade wurde bereits von <@${ticket.claimedBy}> geclaimt.`
        )
      ],
      flags: NOTICE_FLAGS
    });
  }

  ticket.claimedBy = interaction.user.id;

  saveJSON(TICKETS_FILE, ticketData);

  await interaction.update({
    components: createTicketComponents(ticket)
  });

  await interaction.channel.send({
    components: [
      buildNotice(`🙋 <@${interaction.user.id}> hat diesen Trade geclaimt.`)
    ],
    flags: PUBLIC_FLAGS
  });
}


async function handleTicketRelease(interaction) {
  const ticket = await getTicketFromChannel(interaction);

  if (!ticket) {
    return;
  }

  if (ticket.claimedBy === null) {
    return interaction.reply({
      components: [
        buildNotice('⚠️ Dieser Trade ist nicht geclaimt.')
      ],
      flags: NOTICE_FLAGS
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
      flags: NOTICE_FLAGS
    });
  }

  const previousClaimer = ticket.claimedBy;

  ticket.claimedBy = null;

  saveJSON(TICKETS_FILE, ticketData);

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
    flags: PUBLIC_FLAGS
  });
}


async function handleTicketSold(interaction) {
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
      flags: NOTICE_FLAGS
    });
  }

  if (ticket.abgeschlossen) {
    return interaction.reply({
      components: [
        buildNotice('⚠️ Dieser Trade wurde bereits abgeschlossen.')
      ],
      flags: NOTICE_FLAGS
    });
  }

  ticket.abgeschlossen = true;
  ticketData.completed += 1;

  saveJSON(TICKETS_FILE, ticketData);

  await updateTicketMessage(interaction.channel, ticket);

  await updateSpawnerPanel();

  await interaction.channel.send({
    components: [
      buildNotice(
        `✅ <@${interaction.user.id}> hat den Trade als angekauft markiert.\n` +
        '🗑️ Dieses Ticket wird in **5 Sekunden** geschlossen.'
      )
    ],
    flags: PUBLIC_FLAGS
  });

  await interaction.deferUpdate();

  setTimeout(async () => {
    delete ticketData.tickets[interaction.channel.id];
    saveJSON(TICKETS_FILE, ticketData);

    try {
      await interaction.channel.delete(
        'Trade wurde abgeschlossen'
      );
    } catch (error) {
      console.error('Ticket-Thread konnte nicht gelöscht werden:', error);
    }
  }, 5000);
}


async function handleTicketCancel(interaction) {
  const ticket = await getTicketFromChannel(interaction);

  if (!ticket) {
    return;
  }

  if (ticket.abgeschlossen) {
    return interaction.reply({
      components: [
        buildNotice('⚠️ Dieser Trade wurde bereits abgeschlossen.')
      ],
      flags: NOTICE_FLAGS
    });
  }

  await interaction.reply({
    components: [
      buildNotice('🗑️ Dieses Ticket wird in **5 Sekunden** gelöscht.')
    ],
    flags: NOTICE_FLAGS
  });

  setTimeout(async () => {
    delete ticketData.tickets[interaction.channel.id];
    saveJSON(TICKETS_FILE, ticketData);

    try {
      await interaction.channel.delete(
        'Ticket wurde abgebrochen'
      );
    } catch (error) {
      console.error('Ticket-Thread konnte nicht gelöscht werden:', error);
    }
  }, 5000);
}

function createPriceLogContainer() {
  const container = new ContainerBuilder();

  const roleId = process.env.SPAWNER_PING_ROLE_ID;

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## SPAWNER PRICE CHANGES\n` +
      (roleId ? `<@&${roleId}>` : '')
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder()
  );

  if (priceLogData.entries.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '*Keine aktuellen Preisänderungen.*'
      )
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

    container.addSeparatorComponents(
      new SeparatorBuilder()
    );
  }

  return container;
}

async function updatePriceLog(interaction, spawner, changes) {
  const channelId = process.env.PRICE_LOG_CHANNEL_ID;
  const roleId = process.env.SPAWNER_PING_ROLE_ID;

  if (!channelId) {
    console.error('[PRICE LOG] PRICE_LOG_CHANNEL_ID fehlt!');
    return;
  }

  try {
    const channel = await client.channels.fetch(channelId);

    if (!channel?.isTextBased()) {
      throw new Error('Price-Log-Channel nicht gefunden.');
    }

    // Vorhandenen Eintrag dieses Spawners aktualisieren
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

    // Maximal 10 Spawner im aktuellen Log anzeigen
    priceLogData.entries = priceLogData.entries.slice(-10);

    let message = null;

    // Vorhandene Nachricht suchen
    if (
      priceLogData.messageId &&
      priceLogData.channelId === channelId
    ) {
      try {
        message = await channel.messages.fetch(
          priceLogData.messageId
        );
      } catch {
        message = null;
      }
    }

    const components = [createPriceLogContainer()];

    const pingContent = roleId
      ? `<@&${roleId}>`
      : '';

    // Nachricht aktualisieren oder neu erstellen
    if (message) {
      await message.edit({
        components
      });

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

    // Zeitpunkt der letzten Änderung speichern
    priceLogData.lastChangeAt = Date.now();

    saveJSON(PRICE_LOG_FILE, priceLogData);

    // Alten Lösch-Timer zurücksetzen
    armPriceLogDeletion();

    // Spawner Ping versenden
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

function armPriceLogDeletion() {
  clearTimeout(priceLogTimeout);

  const expiration =
    priceLogData.lastChangeAt + PRICE_LOG_TIMEOUT;

  const remaining = expiration - Date.now();

  if (remaining <= 0) {
    deletePriceLog();
    return;
  }

  priceLogTimeout = setTimeout(() => {
    deletePriceLog();
  }, remaining);
}


async function deletePriceLog() {
  try {
    if (priceLogData.channelId && priceLogData.messageId) {
      const channel = await client.channels.fetch(
        priceLogData.channelId
      );

      if (channel?.isTextBased()) {
        try {
          const message = await channel.messages.fetch(
            priceLogData.messageId
          );

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

    priceLogData = {
      channelId: null,
      messageId: null,
      lastChangeAt: null,
      entries: []
    };

    saveJSON(PRICE_LOG_FILE, priceLogData);
  }
}

client.on(Events.InteractionCreate, async interaction => {
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
        components: [
          buildNotice('❌ Aktuell sind keine Spawner verfügbar.')
        ],
        flags: NOTICE_FLAGS
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

    return interaction.showModal(
      buildTicketModal(mode, spawnerName)
    );
  }

  if (interaction.isModalSubmit()) {
    if (!interaction.customId.startsWith('ticket_modal|')) {
      return;
    }

    const [, mode, spawnerName] = interaction.customId.split('|');

    const ingameName = interaction.fields
      .getTextInputValue('ingame_name')
      .trim();

    const anzahlRaw = interaction.fields
      .getTextInputValue('anzahl')
      .trim();

    const anzahl = Number(anzahlRaw);

    if (!Number.isInteger(anzahl) || anzahl < 1) {
      return interaction.reply({
        components: [
          buildNotice('❌ Die Anzahl muss eine ganze Zahl größer als 0 sein.')
        ],
        flags: NOTICE_FLAGS
      });
    }

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral
    });

    return createTicketThread(
      interaction,
      mode,
      spawnerName,
      ingameName,
      anzahl
    );
  }

  if (!interaction.isChatInputCommand()) return;

  const tradeCommands = [
    'setup-spawner',
    'spawner-hinzufuegen',
    'setprice',
    'spawner-remove'
  ];

  if (tradeCommands.includes(interaction.commandName)) {
    if (!hasTradeLeaderRole(interaction)) {
      return interaction.reply({
        components: [
          buildNotice('❌ Du benötigst die **TRADE leader** Rolle für diesen Befehl.')
        ],
        flags: NOTICE_FLAGS
      });
    }
  }

  if (interaction.commandName === 'setup-spawner') {
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral
    });

    try {
      let message = null;

      if (panelData.channelId && panelData.messageId) {
        try {
          const oldChannel = await client.channels.fetch(
            panelData.channelId
          );

          if (oldChannel?.isTextBased()) {
            message = await oldChannel.messages.fetch(
              panelData.messageId
            );
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

        panelData = {
          channelId: message.channelId,
          messageId: message.id
        };

        saveJSON(PANEL_FILE, panelData);
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
        components: [
          buildNotice('❌ Das Spawner-Panel konnte nicht erstellt werden.')
        ],
        flags: MessageFlags.IsComponentsV2
      });
    }

    return;
  }

  if (interaction.commandName === 'spawner-hinzufuegen') {
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral
    });

    const name = interaction.options.getString('name', true).trim();
    const emoji = interaction.options.getString('emoji', true).trim();

    const existing = spawners.find(
      s => s.name.toLowerCase() === name.toLowerCase()
    );

    let added = false;

    if (existing) {
      existing.emoji = emoji;
    } else {
      spawners.push({
        name,
        emoji,
        ankauf: null,
        verkauf: null
      });

      added = true;
    }

    saveJSON(SPAWNER_FILE, spawners);

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

    return;
  }

  if (interaction.commandName === 'setprice') {
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral
    });

    const name = interaction.options.getString('name', true).trim();

    const spawner = spawners.find(
      s => s.name.toLowerCase() === name.toLowerCase()
    );

    if (!spawner) {
      await interaction.editReply({
        components: [
          buildNotice(`❌ Der Spawner **${name}** wurde nicht gefunden.`)
        ],
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

    const ankauf = ankaufInput === null
      ? undefined
      : parsePrice(ankaufInput);

    const verkauf = verkaufInput === null
      ? undefined
      : parsePrice(verkaufInput);

    // Nur tatsächlich angegebene Preise überprüfen
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

    saveJSON(SPAWNER_FILE, spawners);

    const updated = await updateSpawnerPanel();

const changes = [];

if (ankauf !== undefined) {
  changes.push(
    `🛒 **Ankauf:** \`${priceText(oldAnkauf)}\` → \`${priceText(spawner.ankauf)}\``
  );
}

if (verkauf !== undefined) {
  changes.push(
    `💰 **Verkauf:** \`${priceText(oldVerkauf)}\` → \`${priceText(spawner.verkauf)}\``
  );
}

if (emojiInput !== null && emojiInput.trim() !== '') {
  changes.push(
    `🎨 **Emoji:** ${oldEmoji} → ${spawner.emoji}`
  );
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

    return;
  }

  if (interaction.commandName === 'spawner-remove') {
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral
    });

    const name = interaction.options.getString('name', true).trim();

    const index = spawners.findIndex(
      s => s.name.toLowerCase() === name.toLowerCase()
    );

    if (index === -1) {
      await interaction.editReply({
        components: [
          buildNotice(`❌ Der Spawner **${name}** wurde nicht gefunden.`)
        ],
        flags: NOTICE_FLAGS
      });

      return;
    }

    const removed = spawners[index];

    spawners.splice(index, 1);

    saveJSON(SPAWNER_FILE, spawners);

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
      flags: NOTICE_FLAGS
    });

    return;
  }
});

minecraft.attach(client);
client.login(process.env.DISCORD_BOT_TOKEN);
