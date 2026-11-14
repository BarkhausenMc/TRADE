import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder
} from 'discord.js';

function extractComponentText(component) {
  if (!component) return '';

  if (typeof component === 'string') {
    return component;
  }

  if (Array.isArray(component)) {
    return component.map(extractComponentText).join('');
  }

  if (typeof component !== 'object') return '';

  let result = typeof component.text === 'string' ? component.text : '';

  if (Array.isArray(component.extra)) {
    result += component.extra.map(extractComponentText).join('');
  }

  return result;
}

function extractRoleNames(text, startRegex, endRegex) {
  const startMatch = startRegex.exec(text);

  if (!startMatch) return [];

  const startIndex = startMatch.index + startMatch[0].length;
  const remaining = text.slice(startIndex);

  const endMatch = endRegex.exec(remaining);

  let section = endMatch ? remaining.slice(0, endMatch.index) : remaining;

  section = section.replace(/^\s*\(\d+\)\s*:\s*/, '');

  let names = section
    .split('•')
    .map(name => name.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (names.length === 1 && !section.includes('•')) {
    names = [names[0].split(' ')[0]];
  }

  return names;
}

export function parseClanInfo(text) {
  const clan = {
    name: text.match(/Name:\s*(.+)/)?.[1]?.trim() || 'Unknown',
    tag: text.match(/Kürzel:\s*(.+)/)?.[1]?.trim() || 'Unknown',
    created: text.match(/Erstelldatum:\s*(.+)/)?.[1]?.trim() || 'Unknown',
    onlineTime: text.match(/Online-Zeit:\s*(.+)/)?.[1]?.trim() || 'Unknown',

    leader: [],
    coLeaders: [],
    moderators: [],
    members: []
  };

  clan.leader = extractRoleNames(text, /Leader:\s*/, /Co-Leader\s*\(\d+\)\s*:/);

  clan.coLeaders = extractRoleNames(
    text,
    /Co-Leader\s*\(\d+\)\s*:\s*/,
    /Moderatoren\s*\(\d+\)\s*:/
  );

  clan.moderators = extractRoleNames(
    text,
    /Moderatoren\s*\(\d+\)\s*:\s*/,
    /Mitglieder\s*\(\d+\)\s*:/
  );

  clan.members = extractRoleNames(text, /Mitglieder\s*\(\d+\)\s*:\s*/, /$^/);

  return clan;
}

export function createClanInfoContainer(clan) {
  const totalMembers =
    clan.leader.length +
    clan.coLeaders.length +
    clan.moderators.length +
    clan.members.length;

  const formatPlayers = players => {
    if (!players.length) return '- Keine';

    return players.map(player => `• ${player}`).join('\n');
  };

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# ⚔️ Clan Information\n` +
        `### 🏷️ ${clan.name} [${clan.tag}]\n` +
        `Welcome to the clan overview!`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**📅 Created:** \`${clan.created}\`\n` +
        `**⏱️ Online Time:** \`${clan.onlineTime}\`\n` +
        `**👥 Total Members:** \`${totalMembers}\``
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## 👑 Leader (${clan.leader.length})\n${formatPlayers(clan.leader)}`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## 🛡️ Co-Leaders (${clan.coLeaders.length})\n${formatPlayers(clan.coLeaders)}`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## 🔨 Moderators (${clan.moderators.length})\n${formatPlayers(clan.moderators)}`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ⚔️ Members (${clan.members.length})\n${formatPlayers(clan.members)}`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# Trading Clan • \`[TRADE]\``)
    );

  return container;
}

export function getClanInfo(bot) {
  return new Promise((resolve, reject) => {
    if (!bot.player) {
      return reject(new Error('Minecraft bot is not connected.'));
    }

    let finished = false;
    let responseTimer;
    let timeout;

    function cleanup() {
      clearTimeout(timeout);
      clearTimeout(responseTimer);
      bot.removeListener('message', messageHandler);
    }

    function finish(error, result) {
      if (finished) return;

      finished = true;
      cleanup();

      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    }

    function messageHandler(jsonMsg, position) {
      if (position !== 'system') return;

      const component = jsonMsg?.json ?? jsonMsg;

      const text =
        extractComponentText(component) ||
        (typeof jsonMsg?.toString === 'function' ? jsonMsg.toString() : '');

      if (!text.includes('Clan-Informationen')) return;

      console.log('[CLAN INFO] Clan response received:');
      console.log(text);

      clearTimeout(responseTimer);

      responseTimer = setTimeout(() => {
        try {
          const clan = parseClanInfo(text);

          if (!clan.name || clan.name === 'Unknown') {
            return finish(new Error('Could not parse clan name.'));
          }

          finish(null, clan);
        } catch (error) {
          finish(error);
        }
      }, 300);
    }

    bot.on('message', messageHandler);

    timeout = setTimeout(() => {
      finish(new Error('Clan information timed out.'));
    }, 10000);

    try {
      console.log('[CLAN INFO] Executing /clan info');
      bot.chat('/clan info');
    } catch (error) {
      finish(error);
    }
  });
}
