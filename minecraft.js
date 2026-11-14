require('dotenv').config();
const mineflayer = require('mineflayer');

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder
} = require('discord.js');

const AUTHORIZED_USER_IDS = (process.env.AUTHORIZED_USER_IDS || '').split(',').filter(id => id.trim());
const TRADER_ROLE_ID = process.env.TRADER_ROLE_ID;

const pendingPayRequests = new Map();
const messageHistory = new Map();

const RATE_LIMIT_WINDOW_MS = 5000;
const RATE_LIMIT_MAX_REQUESTS = 3;

const bot = mineflayer.createBot({
  host: 'hugosmp.net',
  port: 25565,
  username: 'JSK1905',
  auth: 'microsoft',
  version: '1.21.4'
});


bot._client.on('add_resource_pack', (data) => {
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


function extractComponentText(component) {
  if (!component) return '';

  if (typeof component === 'string') {
    return component;
  }

  if (Array.isArray(component)) {
    return component.map(extractComponentText).join('');
  }

  if (typeof component !== 'object') return '';

  let result = typeof component.text === 'string'
    ? component.text
    : '';

  if (Array.isArray(component.extra)) {
    result += component.extra
      .map(extractComponentText)
      .join('');
  }

  return result;
}


function extractRoleNames(text, startRegex, endRegex) {
  const startMatch = startRegex.exec(text);

  if (!startMatch) return [];

  const startIndex = startMatch.index + startMatch[0].length;
  const remaining = text.slice(startIndex);

  const endMatch = endRegex.exec(remaining);

  let section = endMatch
    ? remaining.slice(0, endMatch.index)
    : remaining;

  section = section.replace(/^\s*\(\d+\)\s*:\s*/, '');

  let names = section.split('•')
    .map(name => name.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (names.length === 1 && !section.includes('•')) {
    names = [names[0].split(' ')[0]];
  }

  return names;
}

function parseClanInfo(text) {
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

  clan.leader = extractRoleNames(
    text,
    /Leader:\s*/,
    /Co-Leader\s*\(\d+\)\s*:/
  );

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

  clan.members = extractRoleNames(
    text,
    /Mitglieder\s*\(\d+\)\s*:\s*/,
    /$^/
  );

  return clan;
}

function getClanInfo() {
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

      const text = extractComponentText(component)
        || (typeof jsonMsg?.toString === 'function'
          ? jsonMsg.toString()
          : '');

      if (!text.includes('Clan-Informationen')) return;

      console.log('[CLAN INFO] Clan response received:');
      console.log(text);

      clearTimeout(responseTimer);

      responseTimer = setTimeout(() => {
        try {
          const clan = parseClanInfo(text);

          if (!clan.name || clan.name === 'Unknown') {
            return finish(
              new Error('Could not parse clan name.')
            );
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


function createClanInfoContainer(clan) {
  const totalMembers =
    clan.leader.length +
    clan.coLeaders.length +
    clan.moderators.length +
    clan.members.length;

  const formatPlayers = (players) => {
    if (!players.length) return '- Keine';

    return players
      .map(player => `• ${player}`)
      .join('\n');
  };

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# ⚔️ Clan Information\n` +
        `### 🏷️ ${clan.name} [${clan.tag}]\n` +
        `Welcome to the clan overview!`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**📅 Created:** \`${clan.created}\`\n` +
        `**⏱️ Online Time:** \`${clan.onlineTime}\`\n` +
        `**👥 Total Members:** \`${totalMembers}\``
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## 👑 Leader (${clan.leader.length})\n` +
        `${formatPlayers(clan.leader)}`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## 🛡️ Co-Leaders (${clan.coLeaders.length})\n` +
        `${formatPlayers(clan.coLeaders)}`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## 🔨 Moderators (${clan.moderators.length})\n` +
        `${formatPlayers(clan.moderators)}`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ⚔️ Members (${clan.members.length})\n` +
        `${formatPlayers(clan.members)}`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Trading Clan • \`[TRADE]\``
      )
    );

  return container;
}


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

  const requestCount = Math.floor((Date.now() - messageHistory.get(userId)) / RATE_LIMIT_WINDOW_MS);
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

  const requestCount = Math.floor((Date.now() - messageHistory.get(userId)) / RATE_LIMIT_WINDOW_MS);
  if (requestCount >= RATE_LIMIT_MAX_REQUESTS) {
    return 'Rate limit exceeded. Please wait before sending another message.';
  }

  return null;
}


async function handleInteraction(interaction) {

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

        const container = new ContainerBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `# ✅ Payment Confirmed & Sent\n\n` +
              `**Confirmed by:** ${interaction.user.tag}\n\n` +
              `**Requested by:** ${requestData.userName}\n\n` +
              `**Recipient:** ${requestData.player}\n\n` +
              `**Amount:** $${requestData.amount}\n\n` +
              `**Reason:** ${requestData.reason}\n\n` +
              `**Minecraft Command:**\n` +
              `\`/pay ${requestData.player} ${requestData.amount}\``
            )
          );

        await interaction.update({
          components: [container]
        });

      } catch (error) {

        console.error('Payment execution failed:', error);

        await interaction.reply({
          content: 'Payment failed. Minecraft bot may be disconnected.',
          flags: MessageFlags.Ephemeral
        });
      }

    } else if (action === 'deny') {

      pendingPayRequests.delete(requestId);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `# ❌ Payment Request Denied\n\n` +
            `**Denied by:** ${interaction.user.tag}\n\n` +
            `**Requested by:** ${requestData.userName}\n\n` +
            `**Recipient:** ${requestData.player}\n\n` +
            `**Amount:** $${requestData.amount}\n\n` +
            `**Reason:** ${requestData.reason}\n\n` +
            `No Minecraft payment was executed.`
          )
        );

      await interaction.update({
        components: [container]
      });
    }

    return;
  }

  if (!interaction.isChatInputCommand()) return;

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

    const buttonRow = new ActionRowBuilder()
      .addComponents(
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

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral
    });

    try {
      const clan = await getClanInfo();

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


function attach(client) {
  client.on('interactionCreate', handleInteraction);
}



const db = require('./db.js');


bot.on('messagestr', (message, position) => {
  if (position !== 'system') return;

  const match = message.match(
    /^\[Nachricht\]\s+([a-zA-Z0-9_]{3,16})\s+->\s+Du:\s*(\d{6})\s*$/
  );

  if (!match) return;

  const username = match[1];
  const code = match[2];

  console.log(`[VERIFY] Code von ${username} empfangen.`);

  try {
    const discordUserId = db.consumeVerifyCode(code);

    if (!discordUserId) {
      bot.chat(
        `/msg ${username} Dein Code ist ungueltig oder abgelaufen. Bitte nutze Discord /verify erneut.`
      );

      console.log(`[VERIFY] Ungueltiger Code von ${username}`);
      return;
    }

    const token = db.issueJwt(discordUserId);

    console.log(`[VERIFY] ${username} erfolgreich verifiziert.`);
    console.log(`[VERIFY] Sende JWT an ${username}...`);

    bot.chat(
      `/msg ${username} Verifiziert! Dein JWT ist 24 Stunden gueltig: ${token}`
    );

    console.log(`[VERIFY] JWT-Nachricht an ${username} gesendet.`);

  } catch (error) {
    console.error('[VERIFY ERROR]', error);

    try {
      bot.chat(
        `/msg ${username} Bei der Verifizierung ist ein Fehler aufgetreten.`
      );
    } catch (sendError) {
      console.error('[VERIFY MESSAGE ERROR]', sendError);
    }
  }
});




bot.on('messagestr', (message, position) => {
  console.log(`[MC MESSAGE] Position: ${position}`);
  console.log(`[MC MESSAGE] ${message}`);
});


module.exports = {
  attach,
  bot
};
