
require('dotenv').config();

const {
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('spawner')
    .setDescription('Verwalte die HugoSMP Spawner-Preise')

    .addSubcommand(subcommand =>
      subcommand
        .setName('set')
        .setDescription('Spawner hinzufügen oder Preise ändern')
        .addStringOption(option =>
          option
            .setName('name')
            .setDescription('Name des Spawners')
            .setRequired(true)
        )
        .addNumberOption(option =>
          option
            .setName('ankauf')
            .setDescription('Ankaufspreis in Millionen')
            .setMinValue(0)
            .setRequired(true)
        )
        .addNumberOption(option =>
          option
            .setName('verkauf')
            .setDescription('Verkaufspreis in Millionen')
            .setMinValue(0)
            .setRequired(true)
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Spawner aus der Preisliste entfernen')
        .addStringOption(option =>
          option
            .setName('name')
            .setDescription('Name des Spawners')
            .setRequired(true)
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Alle gespeicherten Spawner anzeigen')
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('spawner-panel')
    .setDescription('Erstellt oder aktualisiert das Spawner-Preis-Panel')
    .toJSON()
];

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
