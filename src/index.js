import 'dotenv/config';
import chalk from 'chalk';

import { Client, GatewayIntentBits } from 'discord.js';

import { startApi } from './db/api-server.js';
import { attach } from './minecraft/bot.js';
import { restorePriceLog } from './discord/price-log.js';
import { registerInteractions } from './discord/interactions.js';
import { bindPanelClient } from './discord/panel.js';
import { bindPriceLogClient } from './discord/price-log.js';
import { bindTicketClient } from './discord/tickets.js';

import {
  bindLogger,
  logBotStart,
  logGuildMemberJoin,
  logGuildMemberLeave
} from './discord/logger.js';

import { createClient } from './discord/client.js';

const client = createClient();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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

client.once('clientReady', async () => {
  console.clear();

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

  console.log('\r' + gradient('✔ Trade systems initialized!       '));

  console.log(gradient('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

  console.log(gradient('  ✔ ') + chalk.white(`Logged in as: ${client.user.tag}`));
  console.log(gradient('  ✔ ') + chalk.white('Discord connection established'));

  console.log(gradient('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

  console.log(gradient('          ✨ TRADE BOT ONLINE ✨'));

  restorePriceLog();

  logBotStart().catch(() => {});
});

registerInteractions(client);
bindPanelClient(client);
bindPriceLogClient(client);
bindTicketClient(client);
bindLogger(client);

client.on('guildMemberAdd', member => {
  logGuildMemberJoin(member).catch(() => {});
});

client.on('guildMemberRemove', member => {
  logGuildMemberLeave(member).catch(() => {});
});

client.on('shardDisconnect', event => {
  console.warn('[DISCORD] Verbindung getrennt:', event?.code);
});

client.on('shardReconnecting', () => {
  console.warn('[DISCORD] Neuverbindung läuft...');
});

client.on('shardResume', id => {
  console.log(`[DISCORD] Shard ${id} wieder verbunden.`);
});

attach(client);

startApi();

process.on('unhandledRejection', error => {
  console.error('[UNHANDLED REJECTION]', error);
});

process.on('uncaughtException', error => {
  console.error('[UNCAUGHT EXCEPTION]', error);
});

client.on('error', error => console.error('[CLIENT ERROR]', error));
client.on('shardError', error => console.error('[SHARD ERROR]', error));

client.login(process.env.DISCORD_BOT_TOKEN);
