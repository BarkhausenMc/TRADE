import {
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder
} from 'discord.js';

import { buildNotice, noticeFlags } from './context.js';
import { sendLog } from './logger.js';

function getAuthorizedUserIds() {
  return (process.env.AUTHORIZED_USER_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
}

function getAllowedRoleIds() {
  return (process.env.ALLOWED_ROLE_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
}

export function isAuthorizedUser(interaction) {
  return getAuthorizedUserIds().includes(interaction.user.id);
}

async function replyNotice(interaction, content) {
  await interaction.editReply({
    components: [buildNotice(content)],
    flags: noticeFlags
  });
}

async function changeRole(interaction, mode) {
  if (!isAuthorizedUser(interaction)) {
    return interaction.reply({
      components: [
        buildNotice('❌ Du bist nicht berechtigt, diesen Befehl zu nutzen.')
      ],
      flags: noticeFlags
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const user = interaction.options.getUser('user', true);
  const role = interaction.options.getRole('role', true);

  if (!getAllowedRoleIds().includes(role.id)) {
    return replyNotice(
      interaction,
      '❌ Die Rolle **' + role.name + '** steht nicht auf der Whitelist.\n' +
      'Erlaubte Rollen werden über `ALLOWED_ROLE_IDS` in der `.env` konfiguriert.'
    );
  }

  if (interaction.guild.members.me.roles.highest.position <= role.position) {
    return replyNotice(
      interaction,
      '❌ Die Rolle **' + role.name + '** ist höher oder gleich meiner höchsten Rolle.\n' +
      'Verschiebe meine Rolle in der Hierarchie nach oben.'
    );
  }

  let member;

  try {
    member = await interaction.guild.members.fetch(user.id);
  } catch {
    return replyNotice(
      interaction,
      '❌ Der Nutzer ' + user + ' ist nicht auf diesem Server.'
    );
  }

  const hasRole = member.roles.cache.has(role.id);

  try {
    if (mode === 'add') {
      if (hasRole) {
        return replyNotice(
          interaction,
          '⚠️ ' + user + ' besitzt die Rolle ' + role + ' bereits.'
        );
      }

      await member.roles.add(
        role.id,
        '/give-role von ' + interaction.user.tag
      );
    } else {
      if (!hasRole) {
        return replyNotice(
          interaction,
          '⚠️ ' + user + ' besitzt die Rolle ' + role + ' nicht.'
        );
      }

      await member.roles.remove(
        role.id,
        '/remove-role von ' + interaction.user.tag
      );
    }
  } catch (error) {
    console.error('[ROLE CHANGE ERROR]', error);

    return replyNotice(
      interaction,
      '❌ Die Rolle konnte nicht geändert werden. Bitte überprüfe meine Discord-Berechtigungen.'
    );
  }

  const successText =
    mode === 'add'
      ? '✅ ' + user + ' hat jetzt die Rolle ' + role + '.'
      : '✅ ' + user + ' hat die Rolle ' + role + ' nicht mehr.';

  const logTitle = mode === 'add' ? '📜 ROLLE VERGEBEN' : '⛔ ROLLE ENTFERNT';

  await sendLog(
    logTitle,
    '👤 **Nutzer:** ' + user + '\n' +
    '🏷️ **Rolle:** ' + role.name + ' (`' + role.id + '`)\n' +
    '🛡️ **Durchgeführt von:** <@' + interaction.user.id + '>'
  ).catch(() => {});

  return replyNotice(interaction, successText);
}

export async function handleGiveRole(interaction) {
  return changeRole(interaction, 'add');
}

export async function handleRemoveRole(interaction) {
  return changeRole(interaction, 'remove');
}

async function fetchGuildMembers(interaction) {
  try {
    return await interaction.guild.members.fetch();
  } catch (error) {
    console.error('[SHOW ROLES MEMBERS ERROR]', error);

    return null;
  }
}

function chunkPages(header, sections) {
  const pages = [];
  let currentPage = header;

  for (const section of sections) {
    if (currentPage.length + section.length + 2 > 3500) {
      pages.push(currentPage);

      currentPage = header + ' (Fortsetzung)\n\n';
    }

    currentPage += section + '\n\n';
  }

  if (currentPage.trim()) {
    pages.push(currentPage);
  }

  return pages;
}

async function sendEphemeralPages(interaction, pages) {
  const toContainer = content =>
    new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(content)
    );

  await interaction.editReply({
    components: [toContainer(pages[0])],
    flags: noticeFlags
  });

  for (let i = 1; i < pages.length; i++) {
    await interaction.followUp({
      components: [toContainer(pages[i])],
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
  }
}

async function showRoleMembers(interaction, role, members) {
  if (!members) {
    return replyNotice(
      interaction,
      '❌ Die Mitglieder konnten nicht geladen werden. Bitte versuche es erneut.'
    );
  }

  const holders = [...members.values()]
    .filter(member => member.roles.cache.has(role.id))
    .map(member => '<@' + member.id + '>');

  const header =
    '# 👥 ' + role.name + '\n' +
    '*Alle Nutzer mit dieser Rolle*';

  if (holders.length === 0) {
    return replyNotice(
      interaction,
      '⚠️ Niemand auf diesem Server besitzt die Rolle ' + role + '.'
    );
  }

  const sections = holders.map(holder => '- ' + holder);

  const pages = chunkPages(header + '\n**' + holders.length + ' Nutzer**\n', sections);

  return sendEphemeralPages(interaction, pages);
}

async function showAllRoles(interaction) {
  const roleList = [...interaction.guild.roles.cache.values()]
    .filter(role => role.id !== interaction.guild.id)
    .sort((a, b) => b.position - a.position);

  if (roleList.length === 0) {
    return replyNotice(interaction, '⚠️ Auf diesem Server existieren keine Rollen.');
  }

  const sections = roleList.map(role => {
    const icon = role.icon ? role.icon + ' ' : '';

    return '- ' + icon + role.name;
  });

  const pages = chunkPages(
    '# 🏷️ ROLLEN-ÜBERSICHT\n**' + roleList.length + ' Rollen**\n',
    sections
  );

  return sendEphemeralPages(interaction, pages);
}

export async function handleShowRoles(interaction) {
  if (!isAuthorizedUser(interaction)) {
    return interaction.reply({
      components: [
        buildNotice('❌ Du bist nicht berechtigt, diesen Befehl zu nutzen.')
      ],
      flags: noticeFlags
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const role = interaction.options.getRole('role');

  if (role) {
    const members = await fetchGuildMembers(interaction);

    return showRoleMembers(interaction, role, members);
  }

  return showAllRoles(interaction);
}