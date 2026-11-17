import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags
} from 'discord.js';

import { getSpawners, getPanel } from '../db/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

export const TICKETS_FILE = path.join(DATA_DIR, 'tickets.json');
export const PRICE_LOG_FILE = path.join(DATA_DIR, 'price-log.json');

export const PRICE_LOG_TIMEOUT = 60 * 60 * 1000;

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

export function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

export { loadJSON };

export let spawners = getSpawners();
export let panelData = getPanel();

export let ticketData = loadJSON(TICKETS_FILE, {
  count: 0,
  completed: 0,
  tickets: {}
});

export let priceLogData = loadJSON(PRICE_LOG_FILE, {
  channelId: null,
  messageId: null,
  lastChangeAt: null,
  entries: []
});

export function setSpawners(next) {
  spawners = next;
}

export function setPanelData(next) {
  panelData = next;
}

export function setTicketData(next) {
  ticketData = next;
}

export function setPriceLogData(next) {
  priceLogData = next;
}

export const noticeFlags = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
export const publicFlags = MessageFlags.IsComponentsV2;

export function buildNotice(content) {
  return new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(content)
  );
}

export function formatPrice(price) {
  const value = Number(price);

  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} b`;
  }

  return `${value.toLocaleString('de-DE')} Mio.`;
}

export function priceText(price) {
  if (price === null || price === undefined) {
    return 'Stop';
  }

  return formatPrice(price);
}

export function parsePrice(input) {
  const value = input.trim().toLowerCase();

  if (value === 'stop') {
    return null;
  }

  const parsed = Number(value.replace(',', '.'));

  return Number.isFinite(parsed) ? parsed : undefined;
}


function memberHasRole(interaction, roleId) {
  const roles = interaction.member?.roles;

  if (!roles || !roleId) return false;

  // Normales Discord.js GuildMember
  if (roles.cache) {
    return roles.cache.has(roleId);
  }

  // APIInteractionGuildMember
  if (Array.isArray(roles)) {
    return roles.includes(roleId);
  }

  return false;
}

export function hasTradeLeaderRole(interaction) {
  const roles = interaction.member?.roles;

  if (!roles) return false;

  if (roles.cache) {
    return roles.cache.some(
      role =>
        role.name === 'TRADE leader' ||
        role.id === process.env.TRADE_LEADER_ROLE_ID
    );
  }

  if (Array.isArray(roles)) {
    return Boolean(
      process.env.TRADE_LEADER_ROLE_ID &&
      roles.includes(process.env.TRADE_LEADER_ROLE_ID)
    );
  }

  return false;
}

export function resolveTraderRole(guild) {
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

export function isTraderMember(interaction, traderRole) {
  return (
    traderRole &&
    interaction.member?.roles?.cache?.has(traderRole.id)
  ) ?? false;
}
