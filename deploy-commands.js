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
    )
].map(command => command.toJSON());

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
