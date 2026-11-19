import { readFileSync, writeFileSync } from 'node:fs';

import path from 'node:path';

import { MessageFlags } from 'discord.js';

import { buildNotice, noticeFlags } from './context.js';
import { isAuthorizedUser } from './roles.js';

const STATE_PATH = path.resolve('data', 'market-toggle.json');

const DEFAULT_STATE = {
  kaufen: true,
  verkauf: true
};

let state = { ...DEFAULT_STATE };

function loadState() {
  try {
    const raw = readFileSync(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);

    state = { ...DEFAULT_STATE, ...parsed };
  } catch {
    state = { ...DEFAULT_STATE };
  }
}

function saveState() {
  try {
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
  } catch (error) {
    console.error('[MARKET TOGGLE SAVE ERROR]', error);
  }
}

loadState();

export function isMarketEnabled(mode) {
  return state[mode] !== false;
}

export function getMarketToggleState() {
  return { ...state };
}

export function setMarketEnabled(mode, enabled) {
  if (!(mode in state)) {
    return;
  }

  state[mode] = enabled;
  saveState();
}

export function toggleMarket(mode) {
  const next = !isMarketEnabled(mode);

  setMarketEnabled(mode, next);

  return next;
}

export function buildMarketDisabledNotice(mode) {
  const label = mode === 'kaufen' ? 'Kaufen' : 'Verkaufen';

  return {
    components: [
      buildNotice(
        '⛔ Der **' + label + '**-Button ist derzeit deaktiviert.\n' +
        'Ein Admin kann ihn über `/toggle-market` oder das Admin-Panel wieder aktivieren.'
      )
    ],
    flags: noticeFlags
  };
}

export async function handleToggleMarket(interaction) {
  if (!isAuthorizedUser(interaction)) {
    return interaction.reply({
      components: [
        buildNotice('❌ Du bist nicht berechtigt, diesen Befehl zu nutzen.')
      ],
      flags: noticeFlags
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const button = interaction.options.getString('button', true);
  const status = interaction.options.getString('status');

  const modes =
    button === 'beide'
      ? ['kaufen', 'verkauf']
      : [button];

  for (const mode of modes) {
    if (status === 'aktivieren') {
      setMarketEnabled(mode, true);
    } else if (status === 'deaktivieren') {
      setMarketEnabled(mode, false);
    } else {
      toggleMarket(mode);
    }
  }

  console.log('[MARKET TOGGLE] Neuer Zustand:', state);

  let panelUpdated = null;

  try {
    const { updateSpawnerPanel } = await import('./panel.js');

    panelUpdated = await updateSpawnerPanel();
  } catch (error) {
    console.error('[MARKET TOGGLE PANEL UPDATE ERROR]', error);
    panelUpdated = false;
  }

  const line = mode =>
    (mode === 'kaufen' ? '🛒 **Kaufen-Button:** ' : '💰 **Verkaufen-Button:** ') +
    (isMarketEnabled(mode) ? '🟩 Aktiv' : '🟥 Deaktiviert');

  await interaction.editReply({
    components: [
      buildNotice(
        '✅ Market-Buttons aktualisiert:\n\n' +
        modes.map(line).join('\n') +
        '\n\n' +
        (panelUpdated
          ? '🛒 Das Spawner-Panel wurde automatisch aktualisiert.'
          : panelUpdated === false
            ? '⚠️ Zustand gespeichert, aber das Spawner-Panel konnte nicht aktualisiert werden. Nutze `/setup-spawner`.'
            : '🛒 Spawner-Panel nicht eingerichtet – Zustand wurde trotzdem gespeichert.')
      )
    ],
    flags: noticeFlags
  });
}