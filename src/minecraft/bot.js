import 'dotenv/config';
import mineflayer from 'mineflayer';

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags
} from 'discord.js';

import { createClanInfoContainer, getClanInfo } from './clan-info.js';
import { issueJwt, consumeVerifyCode } from '../db/database.js';
import { resolveLoginCode, sendToLoginSession } from '../db/api-server.js';

const AUTHORIZED_USER_IDS = (process.env.AUTHORIZED_USER_IDS || '')
  .split(',')
  .filter(id => id.trim());
const TRADER_ROLE_ID = process.env.TRADER_ROLE_ID;

const pendingPayRequests = new Map();
const messageHistory = new Map();

const RATE_LIMIT_WINDOW_MS = 5000;
const RATE_LIMIT_MAX_REQUESTS = 3;

let discordClient = null;

export const bot = mineflayer.createBot({
  host: 'hugosmp.net',
  port: 25565,
  username: 'JSK1905',
  auth: 'microsoft',
  version: '1.21.4'
});

bot._client.on('add_resource_pack', data => {
  console.log(`Accept Server-Resource-Pack. url: ${data.url} , uuid: ${data.uuid}`);
  bot._client.write('resource_pack_receive', { uuid: data.uuid, result: 3 });
  bot._client.write('resource_pack_receive', { uuid: data.uuid, result: 0 });
});

bot.on('kicked', () => {
  console.log('bot kicked!');
});

bot.on('spawn', () => {
  console.log('Mineflayer bot spawned successfully');
});

function validateRequest(playerName, messageContent, userId) {
  if (!playerName || playerName.trim().length === 0) {
    return 'Player name cannot be empty.';
  }

  if (!/^[a-zA-Z0-9_]{3,16}$/.test(playerName)) {
    return 'Invalid Minecraft username format.';
  }

  if (!messageContent || messageContent.trim().length === 0) {
    return 'Message content cannot be empty.';
  }

  if (messageContent.length > 256) {
    return 'Message exceeds maximum length of 256 characters.';
  }

  if (!messageHistory.has(userId) || Date.now() - messageHistory.get(userId) > RATE_LIMIT_WINDOW_MS) {
    return null;
  }

  const requestCount = Math.floor(
    (Date.now() - messageHistory.get(userId)) / RATE_LIMIT_WINDOW_MS
  );

  if (requestCount >= RATE_LIMIT_MAX_REQUESTS) {
    return 'Rate limit exceeded. Please wait before sending another message.';
  }

  return null;
}

function validateChatRequest(text, userId) {
  if (!text || text.trim().length === 0) {
    return 'Message text cannot be empty.';
  }

  if (text.length > 256) {
    return 'Message exceeds maximum length of 256 characters.';
  }

  if (!messageHistory.has(userId) || Date.now() - messageHistory.get(userId) > RATE_LIMIT_WINDOW_MS) {
    return null;
  }

  const requestCount = Math.floor(
    (Date.now() - messageHistory.get(userId)) / RATE_LIMIT_WINDOW_MS
  );

  if (requestCount >= RATE_LIMIT_MAX_REQUESTS) {
    return 'Rate limit exceeded. Please wait before sending another message.';
  }

  return null;
}

function buildSimpleContainer(content) {
  return new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(content)
  );
}

async function handleInteraction(interaction) {

    // Nur Minecraft-bezogene Interactions verarbeiten
  if (interaction.isChatInputCommand()) {
    const minecraftCommands = [
      'msg',
      'chat',
      'clan-chat',
      'clan-kick',
      'clan-invite',
      'tpaccept',
      'pay',
      'pay-request',
      'clan-info'
    ];

    if (!minecraftCommands.includes(interaction.commandName)) {
      return;
    }
  }

  if (interaction.isButton()) {
    const [action, requestId] = interaction.customId.split('_');

    if (action !== 'confirm' && action !== 'deny') return;

    if (!AUTHORIZED_USER_IDS.includes(interaction.user.id)) {
      await interaction.reply({
        content: 'You are not authorized to review payment requests.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const requestData = pendingPayRequests.get(requestId);

    if (!requestData || Date.now() > requestData.expiresAt) {
      pendingPayRequests.delete(requestId);

      await interaction.reply({
        content: 'This payment request has expired or is invalid.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (action === 'confirm') {
      try {
        if (!bot.player) {
          throw new Error('Minecraft bot is not connected.');
        }

        bot.chat(`/pay ${requestData.player} ${requestData.amount}`);

        pendingPayRequests.delete(requestId);

        const container = buildSimpleContainer(
          `# ✅ Payment Confirmed & Sent\n\n` +
          `**Confirmed by:** ${interaction.user.tag}\n\n` +
          `**Requested by:** ${requestData.userName}\n\n` +
          `**Recipient:** ${requestData.player}\n\n` +
          `**Amount:** $${requestData.amount}\n\n` +
          `**Reason:** ${requestData.reason}\n\n` +
          `**Minecraft Command:**\n` +
          `\`/pay ${requestData.player} ${requestData.amount}\``
        );

        await interaction.update({ components: [container] });
      } catch (error) {
        console.error('Payment execution failed:', error);

        await interaction.reply({
          content: 'Payment failed. Minecraft bot may be disconnected.',
          flags: MessageFlags.Ephemeral
        });
      }
    } else if (action === 'deny') {
      pendingPayRequests.delete(requestId);

      const container = buildSimpleContainer(
        `# ❌ Payment Request Denied\n\n` +
        `**Denied by:** ${interaction.user.tag}\n\n` +
        `**Requested by:** ${requestData.userName}\n\n` +
        `**Recipient:** ${requestData.player}\n\n` +
        `**Amount:** $${requestData.amount}\n\n` +
        `**Reason:** ${requestData.reason}\n\n` +
        `No Minecraft payment was executed.`
      );

      await interaction.update({ components: [container] });
    }

    return;
  }

async function hasTradeLeaderRole(interaction) {
  if (!interaction.guild) return false;

  const roleId = process.env.TRADE_LEADER_ROLE_ID;

  if (roleId) {
    const member = await interaction.guild.members.fetch(interaction.user.id);

    return member.roles.cache.has(roleId);
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);

  return member.roles.cache.some(
    role => role.name.toLowerCase() === 'trade leader'
  );
}

if (!interaction.isChatInputCommand()) return;

// TRADE LEADER Berechtigungsprüfung
try {
  const allowed = await hasTradeLeaderRole(interaction);

  if (!allowed) {
    await interaction.reply({
      content: '❌ Du benötigst die **TRADE leader** Rolle, um diesen Befehl auszuführen.',
      flags: MessageFlags.Ephemeral
    });

    return;
  }
} catch (error) {
  console.error('[TRADE LEADER CHECK ERROR]', error);

  await interaction.reply({
    content: '❌ Deine Berechtigung konnte nicht überprüft werden.',
    flags: MessageFlags.Ephemeral
  });

  return;
}

  if (interaction.commandName === 'msg') {
    if (!AUTHORIZED_USER_IDS.includes(interaction.user.id)) {
      await interaction.reply({
        content: 'You are not authorized to use this command.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const playerName = interaction.options.getString('player');
    const messageContent = interaction.options.getString('nachricht');

    const validationError = validateRequest(playerName, messageContent, interaction.user.id);

    if (validationError) {
      await interaction.reply({
        content: validationError,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    messageHistory.set(interaction.user.id, Date.now());

    try {
      bot.chat(`/msg ${playerName} ${messageContent}`);

      await interaction.reply({
        content: `Message sent to ${playerName}: "${messageContent}"`,
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      await interaction.reply({
        content: 'Failed to send message. Bot may be disconnected.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  if (interaction.commandName === 'chat') {
    if (!AUTHORIZED_USER_IDS.includes(interaction.user.id)) {
      await interaction.reply({
        content: 'You are not authorized to use this command.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const text = interaction.options.getString('text');

    const validationError = validateChatRequest(text, interaction.user.id);

    if (validationError) {
      await interaction.reply({
        content: validationError,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    messageHistory.set(interaction.user.id, Date.now());

    try {
      bot.chat(text);

      await interaction.reply({
        content: `Message sent to Minecraft chat: "${text}"`,
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      await interaction.reply({
        content: 'Failed to send message. Bot may be disconnected.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  if (interaction.commandName === 'clan-chat') {
    if (!AUTHORIZED_USER_IDS.includes(interaction.user.id)) {
      await interaction.reply({
        content: 'You are not authorized to use this command.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const text = interaction.options.getString('text');

    const validationError = validateChatRequest(text, interaction.user.id);

    if (validationError) {
      await interaction.reply({
        content: validationError,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    messageHistory.set(interaction.user.id, Date.now());

    try {
      bot.chat(`/c ${text}`);

      await interaction.reply({
        content: `Message sent to Clan chat: "${text}"`,
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      await interaction.reply({
        content: 'Failed to send message. Bot may be disconnected.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  if (interaction.commandName === 'clan-kick') {
    if (!AUTHORIZED_USER_IDS.includes(interaction.user.id)) {
      await interaction.reply({
        content: 'You are not authorized to use this command.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const playerName = interaction.options.getString('player');

    const validationError = validateChatRequest(playerName, interaction.user.id);

    if (validationError) {
      await interaction.reply({
        content: validationError,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    messageHistory.set(interaction.user.id, Date.now());

    try {
      bot.chat(`/clan kick ${playerName}`);

      setTimeout(() => {
        bot.chat(`/clan kick ${playerName} confirm`);
      }, 1100);

      await interaction.reply({
        content: `Player ${playerName} got kickt out of the Clan`,
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      await interaction.reply({
        content: 'Failed to send message. Bot may be disconnected.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  if (interaction.commandName === 'clan-invite') {
    if (!AUTHORIZED_USER_IDS.includes(interaction.user.id)) {
      await interaction.reply({
        content: 'You are not authorized to use this command.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const playerName = interaction.options.getString('player');

    const validationError = validateChatRequest(playerName, interaction.user.id);

    if (validationError) {
      await interaction.reply({
        content: validationError,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    messageHistory.set(interaction.user.id, Date.now());

    try {
      bot.chat(`/clan invite ${playerName}`);

      await interaction.reply({
        content: `Player ${playerName} got invitet in to the Clan`,
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      await interaction.reply({
        content: 'Failed to send message. Bot may be disconnected.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  if (interaction.commandName === 'tpaccept') {
    if (!AUTHORIZED_USER_IDS.includes(interaction.user.id)) {
      await interaction.reply({
        content: 'You are not authorized to use this command.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const playerName = interaction.options.getString('player');

    const validationError = validateChatRequest(playerName, interaction.user.id);

    if (validationError) {
      await interaction.reply({
        content: validationError,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    messageHistory.set(interaction.user.id, Date.now());

    try {
      bot.chat(`/tpaccept ${playerName}`);

      await interaction.reply({
        content: `Tpa got accepted`,
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      await interaction.reply({
        content: 'Failed to send message. Bot may be disconnected.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  if (interaction.commandName === 'pay') {
    if (!AUTHORIZED_USER_IDS.includes(interaction.user.id)) {
      await interaction.reply({
        content: 'You are not authorized to use this command.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const amount = interaction.options.getString('amount');
    const playerName = interaction.options.getString('player');

    const validationError = validateChatRequest(amount, interaction.user.id);

    if (validationError) {
      await interaction.reply({
        content: validationError,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    messageHistory.set(interaction.user.id, Date.now());

    try {
      bot.chat(`/pay ${playerName} ${amount}`);

      await interaction.reply({
        content: `Player ${playerName} got ${amount} payed`,
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      await interaction.reply({
        content: 'Failed to send message. Bot may be disconnected.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  if (interaction.commandName === 'pay-request') {
    const member = await interaction.guild.members.fetch(interaction.user.id);

    if (!member.roles.cache.has(TRADER_ROLE_ID)) {
      await interaction.reply({
        content: 'Only clan members can use this command.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const player = interaction.options.getString('player');
    const rawAmount = interaction.options.getString('amount');
    const reason = interaction.options.getString('reason');

    if (!/^[a-zA-Z0-9_]{3,16}$/.test(player)) {
      await interaction.reply({
        content: 'Invalid Minecraft username.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const amountString = rawAmount.replace(/^\$/, '');

    if (!/^\d+$/.test(amountString)) {
      await interaction.reply({
        content: 'Invalid amount. Example: $100',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const amount = Number(amountString);

    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1000000) {
      await interaction.reply({
        content: 'Amount must be between $1 and $1,000,000.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (!reason || reason.trim().length === 0) {
      await interaction.reply({
        content: 'Please provide a reason.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const requestId = `${interaction.user.id}-${Date.now()}`;

    pendingPayRequests.set(requestId, {
      userId: interaction.user.id,
      userName: interaction.user.tag,
      player,
      amount,
      reason,
      createdAt: Date.now(),
      expiresAt: Date.now() + 300000
    });

    const buttonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm_${requestId}`)
        .setLabel('Confirm Payment')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`deny_${requestId}`)
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger)
    );

    const container = new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 💰 New Payment Request\n\n` +
          `**Requested by:** ${interaction.user.tag}\n\n` +
          `**Recipient:** ${player}\n\n` +
          `**Amount:** $${amount.toLocaleString('en-US')}\n\n` +
          `**Reason:** ${reason}\n\n` +
          `**Status:** ⏳ Waiting for admin approval\n\n` +
          `**Minecraft Command:**\n` +
          `\`/pay ${player} ${amount}\`\n\n` +
          `A reviewer must confirm or deny this payment.`
        )
      )
      .addActionRowComponents(buttonRow);

    let delivered = 0;

    for (const adminId of AUTHORIZED_USER_IDS) {
      try {
        const admin = await interaction.client.users.fetch(adminId);

        await admin.send({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        });

        delivered++;
      } catch (error) {
        console.error(`Could not DM ${adminId}:`, error);
      }
    }

    if (delivered === 0) {
      pendingPayRequests.delete(requestId);

      await interaction.reply({
        content: 'Could not reach any reviewer via DM.',
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    await interaction.reply({
      content: `Payment request sent to ${delivered} reviewer(s).`,
      flags: MessageFlags.Ephemeral
    });

    setTimeout(() => {
      if (pendingPayRequests.has(requestId)) {
        pendingPayRequests.delete(requestId);
        console.log(`Pay request ${requestId} expired`);
      }
    }, 300000);
  }

  if (interaction.commandName === 'clan-info') {
    if (!AUTHORIZED_USER_IDS.includes(interaction.user.id)) {
      await interaction.reply({
        content: 'You are not authorized to use this command.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const clan = await getClanInfo(bot);

      const container = createClanInfoContainer(clan);

      await interaction.editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
    } catch (error) {
      console.error('[CLAN INFO ERROR]', error);

      await interaction.editReply({
        content: `❌ Clan info error: ${error.message}`
      });
    }
  }
}

export function attach(client) {
  discordClient = client;
  client.on('interactionCreate', handleInteraction);
}

bot.on('messagestr', async (message, position) => {
  if (position !== 'system') return;

  const match = message.match(
    /^\[Nachricht\]\s+([a-zA-Z0-9_]{3,16})\s+->\s+Du:\s*(\d{6})\s*$/
  );

  if (!match) return;

  const username = match[1];
  const code = match[2];

  console.log(`[VERIFY] Code von ${username} empfangen.`);

  try {
    const discordUserId = consumeVerifyCode(code);

    if (!discordUserId) {
      const login = resolveLoginCode(code);

      if (login) {
        sendToLoginSession(login.sessionId, {
          type: 'token',
          token: login.token,
          minecraftUsername: login.minecraftUsername,
          expiresAt: login.expiresAt
        });

        bot.chat(
          `/msg ${username} Login erfolgreich! Dein Token wurde an den Browser gesendet.`
        );

        console.log(`[LOGIN] Browser-Login fuer ${login.minecraftUsername} abgeschlossen.`);
        return;
      }

      bot.chat(
        `/msg ${username} Dein Code ist ungueltig oder abgelaufen. Bitte nutze Discord /verify erneut.`
      );

      console.log(`[VERIFY] Ungueltiger Code von ${username}`);
      return;
    }

    const token = issueJwt(discordUserId);

    console.log(`[VERIFY] JWT fuer ${username} erstellt.`);

    const response = await fetch(
      `http://127.0.0.1:${process.env.API_PORT || 3000}/api/internal/auth/complete`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': process.env.INTERNAL_API_SECRET
        },
        body: JSON.stringify({
          discordUserId,
          minecraftUsername: username,
          token
        })
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'API authentication failed');
    }

    console.log(`[VERIFY] ${username} erfolgreich bei der API angemeldet.`);

    bot.chat(
      `/msg ${username} Du wurdest erfolgreich verifiziert! Dein API-Zugang ist jetzt aktiviert.`
    );

    try {
      if (!discordClient) {
        throw new Error('Discord client nicht verfügbar.');
      }

      const discordUser = await discordClient.users.fetch(discordUserId);

      await discordUser.send({
        embeds: [
          {
            color: 0x57f287,
            title: '✅ Verifizierung erfolgreich!',
            description:
              'Dein Account wurde erfolgreich mit deinem Minecraft-Account verbunden.',
            fields: [
              { name: '🎮 Minecraft', value: username, inline: true },
              { name: '🔐 API-Zugang', value: 'Erfolgreich aktiviert', inline: true }
            ],
            footer: { text: 'TRADE API • Authentication' },
            timestamp: new Date().toISOString()
          }
        ]
      });

      console.log(`[VERIFY] Discord-DM an ${discordUser.tag} gesendet.`);
    } catch (discordError) {
      console.error('[VERIFY DISCORD DM ERROR]', discordError);
    }
  } catch (error) {
    console.error('[VERIFY ERROR]', error);

    bot.chat(
      `/msg ${username} Bei deiner Verifizierung ist ein Fehler aufgetreten. Bitte versuche es erneut oder kontaktiere das TRADE Team.`
    );
  }
});

bot.on('messagestr', (message, position) => {
  console.log(`[MC MESSAGE] Position: ${position}`);
  console.log(`[MC MESSAGE] ${message}`);
});
