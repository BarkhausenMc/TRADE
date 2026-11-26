import 'dotenv/config';

import {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits
} from 'discord.js';


const commands = [
  new SlashCommandBuilder()
    .setName('setup-spawner')
    .setDescription('Postet das Spawner-Panel oder aktualisiert die bestehende Nachricht'),

  new SlashCommandBuilder()
    .setName('spawner-hinzufuegen')
    .setDescription('Fügt einen neuen Spawner hinzu')
    .addStringOption(option =>
      option.setName('name').setDescription('Name des Spawners').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('emoji').setDescription('Emoji des Spawners').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('setprice')
    .setDescription('Setzt An- und Verkaufspreise eines Spawners oder setzt sie auf Stop')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Name des Spawners')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option.setName('ankauf').setDescription('Ankauf in Mio. oder "stop"')
    )
    .addStringOption(option =>
      option.setName('verkauf').setDescription('Verkauf in Mio. oder "stop"')
    )
    .addStringOption(option =>
      option.setName('emoji').setDescription('Emoji des Spawners ändern')
    ),

  new SlashCommandBuilder()
    .setName('spawner-remove')
    .setDescription('Entfernt einen Spawner')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Name des Spawners')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Erzeugt einen 6-stelligen Code für den API-Zugriff'),

  {
    name: 'msg',
    description: 'Send a private message to a Minecraft player',
    options: [
      {
        name: 'player',
        description: 'Minecraft username of the recipient',
        type: 3,
        required: true
      },
      {
        name: 'nachricht',
        description: 'Message content to send',
        type: 3,
        required: true
      }
    ]
  },
  {
    name: 'chat',
    description: 'Send a message to the Minecraft chat',
    options: [
      {
        name: 'text',
        description: 'Message content to send',
        type: 3,
        required: true
      }
    ]
  },
  {
    name: 'clan-chat',
    description: 'Send a message to the Clan chat',
    options: [
      {
        name: 'text',
        description: 'Message content to send',
        type: 3,
        required: true
      }
    ]
  },
  {
    name: 'clan-kick',
    description: 'Kicks a Clan Member out of the Clan',
    options: [
      {
        name: 'player',
        description: 'Member that is getting kickt',
        type: 3,
        required: true
      }
    ]
  },
  {
    name: 'clan-invite',
    description: 'Invits a Player into the Clan',
    options: [
      {
        name: 'player',
        description: 'Player is getting invited into the Clan',
        type: 3,
        required: true
      }
    ]
  },
  {
    name: 'tpaccept',
    description: 'Accepts a Tpa from another Player',
    options: [
      {
        name: 'player',
        description: 'Player whos Tpa get Accepted',
        type: 3,
        required: true
      }
    ]
  },
  {
    name: 'pay',
    description: 'Pays someone Money Ingame',
    options: [
      {
        name: 'player',
        description: 'Minecraft username of the recipient',
        type: 3,
        required: true
      },
      {
        name: 'amount',
        description: 'A pay out for Clan Duels or Spawner',
        type: 3,
        required: true
      }
    ]
  },
  {
    name: 'pay-request',
    description: 'Send a payment request for clan review',
    options: [
      {
        name: 'player',
        description: 'Minecraft username receiving the payment',
        type: 3,
        required: true
      },
      {
        name: 'amount',
        description: 'Payment amount (e.g. $100)',
        type: 3,
        required: true
      },
      {
        name: 'reason',
        description: 'Reason for the payment',
        type: 3,
        required: true
      }
    ]
  },
  {
    name: 'clan-info',
    description: 'Shows all clan members and their roles'
  },

    new SlashCommandBuilder()
    .setName('trades-counter')
    .setDescription('Stellt den abgeschlossenen Trade-Counter ein')
    .addIntegerOption(option =>
      option
        .setName('anzahl')
        .setDescription('Neue Anzahl abgeschlossener Trades')
        .setRequired(true)
        .setMinValue(0)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

      // Ticket-Ban
  new SlashCommandBuilder()
    .setName('ticket-ban')
    .setDescription('Sperrt einen Nutzer für die Erstellung neuer Tickets')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Der Nutzer, der gesperrt werden soll')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('grund')
        .setDescription('Grund für den Ticket-Ban')
        .setRequired(true)
        .setMaxLength(500)
    ),

  // Ticket-Ban-Liste
  new SlashCommandBuilder()
    .setName('ticket-ban-list')
    .setDescription('Zeigt alle Nutzer mit einem Ticket-Ban an'),


  new SlashCommandBuilder()
    .setName('trade')
    .setDescription('Trader-Statistiken und Trade-Verwaltung')

    .addSubcommand(sub =>
      sub
        .setName('eintragen')
        .setDescription('Trage einen eigenen Trade ein')
        .addStringOption(option =>
          option
            .setName('quelle')
            .setDescription('Wo wurde der Trade durchgeführt?')
            .setRequired(true)
            .addChoices(
              { name: 'Ingame-Chat', value: 'Ingame-Chat' },
              { name: 'HugoSMP-Market', value: 'HugoSMP-Market' },
              { name: 'Sonstige / manuell', value: 'Sonstige / manuell' }
            )
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('stats')
        .setDescription('Zeigt die Statistiken eines Traders')
        .addUserOption(option =>
          option
            .setName('trader')
            .setDescription('Trader (optional)')
            .setRequired(false)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('leaderboard')
        .setDescription('Zeigt die Trader-Rangliste')
        .addStringOption(option =>
          option
            .setName('zeitraum')
            .setDescription('Zeitraum')
            .setRequired(true)
            .addChoices(
              { name: 'Diese Woche', value: 'weekly' },
              { name: 'Dieser Monat', value: 'monthly' },
              { name: 'All Time', value: 'all' }
            )
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('historie')
        .setDescription('Zeigt die letzten Trades')
        .addUserOption(option =>
          option
            .setName('trader')
            .setDescription('Trader (optional)')
            .setRequired(false)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('korrigieren')
        .setDescription('Korrigiert einen Trade (TRADE Leader)')
        .addIntegerOption(option =>
          option
            .setName('trade_id')
            .setDescription('ID des Trades')
            .setRequired(true)
            .setMinValue(1)
        )
        .addUserOption(option =>
          option
            .setName('trader')
            .setDescription('Neuer Trader')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('quelle')
            .setDescription('Neue Quelle')
            .setRequired(true)
            .addChoices(
              { name: 'Ingame-Chat', value: 'Ingame-Chat' },
              { name: 'HugoSMP-Market', value: 'HugoSMP-Market' },
              { name: 'Sonstige / manuell', value: 'Sonstige / manuell' },
              { name: 'Ticket', value: 'ticket' }
            )
        )
        .addStringOption(option =>
          option
            .setName('grund')
            .setDescription('Grund der Korrektur')
            .setRequired(true)
            .setMaxLength(500)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('löschen')
        .setDescription('Löscht einen Trade aus der Statistik')
        .addIntegerOption(option =>
          option
            .setName('trade_id')
            .setDescription('ID des Trades')
            .setRequired(true)
            .setMinValue(1)
        )
        .addStringOption(option =>
          option
            .setName('grund')
            .setDescription('Grund der Löschung')
            .setRequired(true)
            .setMaxLength(500)
        )
    ),

  new SlashCommandBuilder()
    .setName('setup-trade-panel')
    .setDescription('Erstellt oder aktualisiert das Trade-Statistik-Panel'),

  new SlashCommandBuilder()
    .setName('give-role')
    .setDescription('Gibt einem Nutzer eine Rolle')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Der Nutzer, der die Rolle erhalten soll')
        .setRequired(true)
    )
    .addRoleOption(option =>
      option
        .setName('role')
        .setDescription('Die Rolle, die vergeben werden soll')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('remove-role')
    .setDescription('Entfernt einem Nutzer eine Rolle')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Der Nutzer, dem die Rolle entfernt werden soll')
        .setRequired(true)
    )
    .addRoleOption(option =>
      option
        .setName('role')
        .setDescription('Die Rolle, die entfernt werden soll')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('setup-admin-panel')
    .setDescription('Zeigt dir das Admin-Panel (nur für dich sichtbar)'),

  new SlashCommandBuilder()
    .setName('show-roles')
    .setDescription('Zeigt Rollen und deren Nutzer (nur für dich sichtbar)')
    .addRoleOption(option =>
      option
        .setName('role')
        .setDescription('Rolle, deren Nutzer aufgelistet werden sollen (optional)')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('toggle-market')
    .setDescription('Aktiviert oder deaktiviert die Kaufen/Verkaufen-Buttons im Spawner-Panel')
    .addStringOption(option =>
      option
        .setName('button')
        .setDescription('Welcher Button soll umgestellt werden?')
        .setRequired(true)
        .addChoices(
          { name: 'Kaufen', value: 'kaufen' },
          { name: 'Verkaufen', value: 'verkauf' },
          { name: 'Beide', value: 'beide' }
        )
    )
    .addStringOption(option =>
      option
        .setName('status')
        .setDescription('Neuer Status (ohne Angabe wird umgeschaltet)')
        .setRequired(false)
        .addChoices(
          { name: 'Aktivieren', value: 'aktivieren' },
          { name: 'Deaktivieren', value: 'deaktivieren' }
        )
    ),

  new SlashCommandBuilder()
    .setName('thread-delete')
    .setDescription('Notfall: Löscht den aktuellen Thread sofort'),

  new SlashCommandBuilder()
    .setName('update-price')
    .setDescription('Aktualisiert die Preise in allen offenen Tickets'),  
 
  new SlashCommandBuilder()
    .setName('setup-trader-panel')
    .setDescription('Erstellt oder aktualisiert das Trader-Panel (nur Trader)'),

].map(command => (command.toJSON ? command.toJSON() : command));

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

try {
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );

  console.log('Alle Guild Slash Commands registriert.');
} catch (error) {
  console.error(error);
}