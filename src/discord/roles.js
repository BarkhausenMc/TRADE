import { MessageFlags } from 'discord.js';

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