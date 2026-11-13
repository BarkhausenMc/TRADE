require('dotenv').config();

const {
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('setup-spawner')
    .setDescription('Postet das Spawner-Panel oder aktualisiert die bestehende Nachricht'),

  new SlashCommandBuilder()
    .setName('spawner-hinzufuegen')
    .setDescription('Fügt einen neuen Spawner hinzu')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Name des Spawners')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('emoji')
        .setDescription('Emoji des Spawners')
        .setRequired(true)
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
      option
        .setName('ankauf')
        .setDescription('Ankauf in Mio. oder "stop"')
    )
    .addStringOption(option =>
      option
        .setName('verkauf')
        .setDescription('Verkauf in Mio. oder "stop"')
    )
    .addStringOption(option =>
      option
        .setName('emoji')
        .setDescription('Emoji des Spawners ändern')
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
  }
].map(command => command.toJSON ? command.toJSON() : command);

const rest = new REST({ version: '10' })
  .setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      {
        body: commands
      }
    );

    console.log('Alle Guild Slash Commands registriert.');
  } catch (error) {
    console.error(error);
  }
})();
