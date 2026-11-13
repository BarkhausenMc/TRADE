require('dotenv').config();
const chalk = require('chalk');
const fs = require('node:fs');
const path = require('node:path');

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
  Events
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

});


const SPAWNER_FILE = path.join(__dirname, 'spawners.json');
const PANEL_FILE = path.join(__dirname, 'panel.json');

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

function formatPrice(price) {
  return `${Number(price).toLocaleString('de-DE')} Mio.`;
}

function priceText(price) {
  if (price === null || price === undefined) {
    return '⛔ Stop';
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

function hasTradeLeaderRole(interaction) {
  return interaction.member?.roles?.cache?.some(
    role =>
      role.name === 'TRADE leader' ||
      role.id === process.env.TRADE_LEADER_ROLE_ID
  ) ?? false;
}


function createSpawnerPanel() {
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '# 💎 HUGOSMP – SPAWNER MARKT\n' +
      '### Aktuelle An- und Verkaufspreise\n' +
      'Hier findest du alle aktuellen Spawner-Preise.'
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
        `🛒 **Ankauf:** ${priceText(spawner.ankauf)}\n` +
        `💰 **Verkauf:** ${priceText(spawner.verkauf)}`
      )
    );

    container.addSeparatorComponents(
      new SeparatorBuilder()
    );
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '-# 💎 TRADE BOT • HUGOSMP\n' +
      '-# Preise können sich jederzeit ändern.'
    )
  );

  return container;
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
      components: [createSpawnerPanel()]
    });

    return true;
  } catch (error) {
    console.error('Spawner-Panel konnte nicht aktualisiert werden:', error);
    return false;
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
          components: [createSpawnerPanel()]
        });
      } else {
        message = await interaction.channel.send({
          components: [createSpawnerPanel()],
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
          `\n🛒 **Ankauf:** ${priceText(existing ? existing.ankauf : null)}` +
          `\n💰 **Verkauf:** ${priceText(existing ? existing.verkauf : null)}` +
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

    const ankauf = ankaufInput === null ? undefined : parsePrice(ankaufInput);
    const verkauf = verkaufInput === null ? undefined : parsePrice(verkaufInput);

    if (ankauf === undefined || verkauf === undefined) {
      await interaction.editReply({
        components: [
          buildNotice('❌ Ungültiger Preis. Nutze eine Zahl (Mio.) oder `stop`.')
        ],
        flags: MessageFlags.IsComponentsV2
      });

      return;
    }

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

    await interaction.editReply({
      components: [
        buildNotice(
          `✅ Werte aktualisiert für **${spawner.emoji || '🔹'} ${spawner.name}-Spawner**\n` +
          `🛒 **Ankauf:** ${priceText(spawner.ankauf)}\n` +
          `💰 **Verkauf:** ${priceText(spawner.verkauf)}` +
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
        flags: MessageFlags.IsComponentsV2
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
      flags: MessageFlags.IsComponentsV2
    });

    return;
  }
});


client.login(process.env.DISCORD_BOT_TOKEN);
