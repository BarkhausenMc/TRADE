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
  Events,
  PermissionFlagsBits
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

  // Farbverlauf: Dunkelblau -> Hellblau
  const gradient = (text) => {
    const start = [0, 0, 139];      // Dark Blue
    const end = [135, 206, 250];    // Light Sky Blue

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
                `🛒 **Ankauf:** ${formatPrice(spawner.ankauf)}\n` +
                `💰 **Verkauf:** ${formatPrice(spawner.verkauf)}`
            )
        )

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
  if (!interaction.isChatInputCommand()) return;

  // Nur Administratoren dürfen Preise verwalten
  if (
    interaction.commandName === 'spawner' ||
    interaction.commandName === 'spawner-panel'
  ) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: '❌ Du benötigst Administrator-Rechte für diesen Befehl.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  // PANEL ERSTELLEN / AKTUALISIEREN
  if (interaction.commandName === 'spawner-panel') {
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral
    });

    try {
      let message = null;

      // Versuche die bisherige Nachricht zu finden
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

      // Wenn die Nachricht noch existiert, bearbeiten
      if (message) {
        await message.edit({
          components: [createSpawnerPanel()]
        });
      } else {
        // Ansonsten einmalig eine neue Nachricht erstellen
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

      await interaction.editReply(
        '✅ Das Spawner-Panel wurde erfolgreich aktualisiert!'
      );

    } catch (error) {
      console.error(error);

      await interaction.editReply(
        '❌ Das Spawner-Panel konnte nicht erstellt werden.'
      );
    }

    return;
  }

  if (interaction.commandName !== 'spawner') return;

  const subcommand = interaction.options.getSubcommand();

  // SPAWNER SETZEN
if (subcommand === 'set') {
    const name = interaction.options.getString('name').trim();
    const ankauf = interaction.options.getNumber('ankauf');
    const verkauf = interaction.options.getNumber('verkauf');
    const emoji = interaction.options.getString('emoji');

    const existing = spawners.find(
      s => s.name.toLowerCase() === name.toLowerCase()
    );

    if (existing) {
    existing.ankauf = ankauf;
    existing.verkauf = verkauf;
    existing.emoji = emoji;
    } else {
    spawners.push({
        name,
        ankauf,
        verkauf,
        emoji
    });
    }

    saveJSON(SPAWNER_FILE, spawners);

    const updated = await updateSpawnerPanel();

    return interaction.reply({
      content:
            `## ${spawner.emoji || '🔹'} ${spawner.name}-Spawner\n` +
            `🛒 **Ankauf:** ${formatPrice(spawner.ankauf)}\n` +
            `💰 **Verkauf:** ${formatPrice(spawner.verkauf)}`
        (updated
          ? 'Die zentrale Preisliste wurde aktualisiert.'
          : '⚠️ Die Preise wurden gespeichert. Erstelle das Panel mit `/spawner-panel`.'),
      flags: MessageFlags.Ephemeral
    });
  }

  // SPAWNER ENTFERNEN
  if (subcommand === 'remove') {
    const name = interaction.options.getString('name').trim();

    const index = spawners.findIndex(
      s => s.name.toLowerCase() === name.toLowerCase()
    );

    if (index === -1) {
      return interaction.reply({
        content: `❌ Der Spawner **${name}** wurde nicht gefunden.`,
        flags: MessageFlags.Ephemeral
      });
    }

    const removed = spawners[index];

    spawners.splice(index, 1);

    saveJSON(SPAWNER_FILE, spawners);

    const updated = await updateSpawnerPanel();

    return interaction.reply({
      content:
        `✅ **${removed.name}-Spawner** wurde entfernt.` +
        (updated
          ? '\nDie Preisliste wurde aktualisiert.'
          : '\n⚠️ Die Preisliste konnte nicht aktualisiert werden.'),
      flags: MessageFlags.Ephemeral
    });
  }

  // SPAWNER AUFLISTEN
  if (subcommand === 'list') {
    if (spawners.length === 0) {
      return interaction.reply({
        content: 'Es sind noch keine Spawner gespeichert.',
        flags: MessageFlags.Ephemeral
      });
    }

    const list = spawners.map(s =>
      `**${s.name}**\n` +
      `🟢 Ankauf: ${formatPrice(s.ankauf)}\n` +
      `🔵 Verkauf: ${formatPrice(s.verkauf)}`
    ).join('\n\n');

    return interaction.reply({
      content: `💎 **Gespeicherte Spawner:**\n\n${list}`,
      flags: MessageFlags.Ephemeral
    });
  }
});


client.login(process.env.DISCORD_BOT_TOKEN);