import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'tradebot.db');
const LEGACY_SPAWNERS_FILE = path.join(__dirname, '..', '..', 'spawners.json');
const LEGACY_PANEL_FILE = path.join(__dirname, '..', '..', 'panel.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS trader_inventory (
    guild_id TEXT NOT NULL,
    trader_id TEXT NOT NULL,
    spawner_name TEXT NOT NULL,
    menge INTEGER NOT NULL DEFAULT 0 CHECK (menge >= 0),
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, trader_id, spawner_name)
  );

  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    trader_id TEXT NOT NULL,
    source TEXT NOT NULL,
    ticket_id TEXT UNIQUE,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER,
    deleted_by TEXT,
    deletion_reason TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_trades_trader
  ON trades(guild_id, trader_id, created_at);

  CREATE INDEX IF NOT EXISTS idx_trades_created
  ON trades(guild_id, created_at);

  CREATE TABLE IF NOT EXISTS trade_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    performed_by TEXT NOT NULL,
    old_data TEXT,
    new_data TEXT,
    reason TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ticket_bans (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    banned_by TEXT NOT NULL,
   created_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS login_sessions (
    session_id TEXT PRIMARY KEY,
    minecraft_username TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS api_sessions (
    discord_user_id TEXT PRIMARY KEY,
    minecraft_username TEXT NOT NULL,
    encrypted_token TEXT NOT NULL,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS spawners (
    name TEXT PRIMARY KEY,
    emoji TEXT,
    ankauf REAL,
    verkauf REAL
  );
  CREATE TABLE IF NOT EXISTS panel (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    channel_id TEXT,
    message_id TEXT
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS verify_codes (
    code TEXT PRIMARY KEY,
    discord_user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  INSERT OR IGNORE INTO panel (id, channel_id, message_id) VALUES (1, NULL, NULL);
`);

if (
  fs.existsSync(LEGACY_SPAWNERS_FILE) &&
  db.prepare('SELECT COUNT(*) AS n FROM spawners').get().n === 0
) {
  try {
    const legacy = JSON.parse(fs.readFileSync(LEGACY_SPAWNERS_FILE, 'utf8'));

    const insert = db.prepare(
      'INSERT OR REPLACE INTO spawners (name, emoji, ankauf, verkauf) VALUES (?, ?, ?, ?)'
    );

    const migrate = db.transaction(items => {
      for (const s of items) {
        insert.run(s.name, s.emoji ?? null, s.ankauf ?? null, s.verkauf ?? null);
      }
    });

    migrate(Array.isArray(legacy) ? legacy : []);

    console.log(`[DB] ${Array.isArray(legacy) ? legacy.length : 0} Spawner aus spawners.json migriert.`);
  } catch (error) {
    console.error('[DB] Migration spawners.json fehlgeschlagen:', error);
  }
}

if (fs.existsSync(LEGACY_PANEL_FILE)) {
  try {
    const legacy = JSON.parse(fs.readFileSync(LEGACY_PANEL_FILE, 'utf8'));

    const row = db.prepare('SELECT channel_id, message_id FROM panel WHERE id = 1').get();

    if (legacy.channelId && !row.channel_id) {
      db.prepare('UPDATE panel SET channel_id = ?, message_id = ? WHERE id = 1')
        .run(legacy.channelId, legacy.messageId ?? null);
    }
  } catch (error) {
    console.error('[DB] Migration panel.json fehlgeschlagen:', error);
  }
}

function getEncryptionKey() {
  const secret = process.env.JWT_ENCRYPTION_KEY;

  if (!secret || secret.length < 32) {
    throw new Error('JWT_ENCRYPTION_KEY fehlt oder ist zu kurz.');
  }

  return crypto.scryptSync(secret, 'tradebot-jwt-storage-v1', 32);
}

function encryptJwt(token) {
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);

  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex')
  };
}

function decryptJwt(encrypted, iv, authTag) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(iv, 'hex')
  );

  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);

  return row?.value ?? null;
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

function getOrCreateJwtSecret() {
  let secret = getSetting('jwt_secret');

  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex');
    setSetting('jwt_secret', secret);
    console.log('[DB] Neues JWT-Secret generiert und gespeichert.');
  }

  return secret;
}

function getSpawners() {
  return db.prepare('SELECT name, emoji, ankauf, verkauf FROM spawners ORDER BY rowid').all();
}

function saveSpawners(spawners) {
  const replace = db.prepare(
    'INSERT OR REPLACE INTO spawners (name, emoji, ankauf, verkauf) VALUES (?, ?, ?, ?)'
  );

  const clear = db.prepare('DELETE FROM spawners');

  db.transaction(items => {
    clear.run();
    for (const s of items) {
      replace.run(s.name, s.emoji ?? null, s.ankauf ?? null, s.verkauf ?? null);
    }
  })(spawners);
}

function getPanel() {
  const row = db.prepare('SELECT channel_id, message_id FROM panel WHERE id = 1').get();

  return {
    channelId: row?.channel_id ?? null,
    messageId: row?.message_id ?? null
  };
}

function setPanel(channelId, messageId) {
  db.prepare('UPDATE panel SET channel_id = ?, message_id = ? WHERE id = 1')
    .run(channelId ?? null, messageId ?? null);
}

const VERIFY_CODE_TTL_MS = 5 * 60 * 1000;

function createVerifyCode(discordUserId) {
  db.prepare('DELETE FROM verify_codes WHERE discord_user_id = ?').run(discordUserId);

  const code = String(crypto.randomInt(100000, 1000000));
  const now = Date.now();

  db.prepare(
    'INSERT INTO verify_codes (code, discord_user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).run(code, discordUserId, now, now + VERIFY_CODE_TTL_MS);

  return code;
}

function consumeVerifyCode(code) {
  const row = db.prepare(
    'SELECT discord_user_id, expires_at FROM verify_codes WHERE code = ?'
  ).get(code);

  if (!row) {
    return null;
  }

  db.prepare('DELETE FROM verify_codes WHERE code = ?').run(code);

  if (Date.now() > row.expires_at) {
    return null;
  }

  return row.discord_user_id;
}

function issueJwt(discordUserId) {
  const secret = getOrCreateJwtSecret();

  return jwt.sign({ sub: discordUserId }, secret, {
    expiresIn: process.env.API_JWT_EXPIRES || '24h'
  });
}

function verifyJwt(token) {
  try {
    return jwt.verify(token, getOrCreateJwtSecret());
  } catch {
    return null;
  }
}

function addTicketBan(guildId, userId, reason, bannedBy) {
  db.prepare(`
    INSERT INTO ticket_bans (
      guild_id,
      user_id,
      reason,
      banned_by,
      created_at
    )
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id)
    DO UPDATE SET
      reason = excluded.reason,
      banned_by = excluded.banned_by,
      created_at = excluded.created_at
  `).run(guildId, userId, reason, bannedBy, Date.now());
}

function getTicketBan(guildId, userId) {
  return db.prepare(`
    SELECT *
    FROM ticket_bans
    WHERE guild_id = ? AND user_id = ?
  `).get(guildId, userId) ?? null;
}

function getTicketBans(guildId) {
  return db.prepare(`
    SELECT *
    FROM ticket_bans
    WHERE guild_id = ?
    ORDER BY created_at DESC
  `).all(guildId);
}

function getBerlinPeriods(timestamp = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(timestamp);

  const values = Object.fromEntries(
    parts.map(part => [part.type, part.value])
  );

  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);

  function berlinMidnight(y, m, d) {
    // Iterative Umrechnung lokaler Berliner Zeit in UTC.
    const target = Date.UTC(y, m - 1, d);
    let result = target;

    for (let i = 0; i < 3; i++) {
      const formatted = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Berlin',
        timeZoneName: 'longOffset',
        hour: '2-digit'
      }).formatToParts(result);

      const offset = formatted.find(p => p.type === 'timeZoneName')?.value;
      const match = offset?.match(/GMT([+-])(\d{2}):(\d{2})/);

      const minutes = match
        ? (match[1] === '+' ? 1 : -1) *
          (Number(match[2]) * 60 + Number(match[3]))
        : 0;

      result = target - minutes * 60_000;
    }

    return result;
  }

  const today = new Date(Date.UTC(year, month - 1, day));
  const weekday = today.getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;

  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - daysSinceMonday);

  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(monday.getUTCDate() + 7);

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextMonthYear = month === 12 ? year + 1 : year;

  return {
    weekStart: berlinMidnight(
      monday.getUTCFullYear(),
      monday.getUTCMonth() + 1,
      monday.getUTCDate()
    ),
    weekEnd: berlinMidnight(
      nextMonday.getUTCFullYear(),
      nextMonday.getUTCMonth() + 1,
      nextMonday.getUTCDate()
    ),
    monthStart: berlinMidnight(year, month, 1),
    monthEnd: berlinMidnight(nextMonthYear, nextMonth, 1)
  };
}

function createTrade({
  guildId,
  traderId,
  source,
  ticketId = null,
  createdBy
}) {
  const now = Date.now();

  try {
    const result = db.prepare(`
      INSERT INTO trades (
        guild_id,
        trader_id,
        source,
        ticket_id,
        created_by,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      guildId,
      traderId,
      source,
      ticketId,
      createdBy,
      now
    );

    const tradeId = Number(result.lastInsertRowid);

    db.prepare(`
      INSERT INTO trade_audit (
        trade_id,
        action,
        performed_by,
        new_data,
        created_at
      )
      VALUES (?, 'CREATE', ?, ?, ?)
    `).run(
      tradeId,
      createdBy,
      JSON.stringify({
        traderId,
        source,
        ticketId
      }),
      now
    );

    return {
      success: true,
      id: tradeId
    };
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return {
        success: false,
        reason: 'duplicate'
      };
    }

    throw error;
  }
}

function getTraderStats(guildId, traderId) {
  const periods = getBerlinPeriods();

  const result = db.prepare(`
    SELECT
      COUNT(*) AS all_time,
      SUM(CASE
        WHEN created_at >= ? AND created_at < ? THEN 1
        ELSE 0
      END) AS weekly,
      SUM(CASE
        WHEN created_at >= ? AND created_at < ? THEN 1
        ELSE 0
      END) AS monthly
    FROM trades
    WHERE guild_id = ?
      AND trader_id = ?
      AND deleted_at IS NULL
  `).get(
    periods.weekStart,
    periods.weekEnd,
    periods.monthStart,
    periods.monthEnd,
    guildId,
    traderId
  );

  return {
    weekly: result.weekly || 0,
    monthly: result.monthly || 0,
    allTime: result.all_time || 0
  };
}

function getTradeLeaderboard(guildId, period = 'weekly') {
  const periods = getBerlinPeriods();

  let condition = '';
  const params = [guildId];

  if (period === 'weekly') {
    condition = 'AND created_at >= ? AND created_at < ?';
    params.push(periods.weekStart, periods.weekEnd);
  } else if (period === 'monthly') {
    condition = 'AND created_at >= ? AND created_at < ?';
    params.push(periods.monthStart, periods.monthEnd);
  }

  return db.prepare(`
    SELECT
      trader_id,
      COUNT(*) AS trades
    FROM trades
    WHERE guild_id = ?
      AND deleted_at IS NULL
      ${condition}
    GROUP BY trader_id
    ORDER BY trades DESC, trader_id ASC
    LIMIT 25
  `).all(...params);
}

function getTradeHistory(guildId, traderId = null, limit = 10) {
  if (traderId) {
    return db.prepare(`
      SELECT *
      FROM trades
      WHERE guild_id = ?
        AND trader_id = ?
        AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT ?
    `).all(guildId, traderId, limit);
  }

  return db.prepare(`
    SELECT *
    FROM trades
    WHERE guild_id = ?
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT ?
  `).all(guildId, limit);
}

function getTradeById(tradeId, guildId) {
  return db.prepare(`
    SELECT *
    FROM trades
    WHERE id = ? AND guild_id = ?
  `).get(tradeId, guildId) ?? null;
}

function correctTrade({
  tradeId,
  guildId,
  traderId,
  source,
  performedBy,
  reason
}) {
  const trade = getTradeById(tradeId, guildId);

  if (!trade || trade.deleted_at !== null) {
    return false;
  }

  const now = Date.now();

  const update = db.transaction(() => {
    db.prepare(`
      UPDATE trades
      SET trader_id = ?, source = ?
      WHERE id = ? AND guild_id = ?
    `).run(traderId, source, tradeId, guildId);

    db.prepare(`
      INSERT INTO trade_audit (
        trade_id,
        action,
        performed_by,
        old_data,
        new_data,
        reason,
        created_at
      )
      VALUES (?, 'CORRECT', ?, ?, ?, ?, ?)
    `).run(
      tradeId,
      performedBy,
      JSON.stringify({
        traderId: trade.trader_id,
        source: trade.source
      }),
      JSON.stringify({
        traderId,
        source
      }),
      reason,
      now
    );
  });

  update();
  return true;
}

function deleteTrade({
  tradeId,
  guildId,
  performedBy,
  reason
}) {
  const trade = getTradeById(tradeId, guildId);

  if (!trade || trade.deleted_at !== null) {
    return false;
  }

  const now = Date.now();

  const remove = db.transaction(() => {
    db.prepare(`
      UPDATE trades
      SET deleted_at = ?,
          deleted_by = ?,
          deletion_reason = ?
      WHERE id = ? AND guild_id = ?
    `).run(now, performedBy, reason, tradeId, guildId);

    db.prepare(`
      INSERT INTO trade_audit (
        trade_id,
        action,
        performed_by,
        old_data,
        reason,
        created_at
      )
      VALUES (?, 'DELETE', ?, ?, ?, ?)
    `).run(
      tradeId,
      performedBy,
      JSON.stringify(trade),
      reason,
      now
    );
  });

  remove();
  return true;
}

function getTradeAudit(tradeId) {
  return db.prepare(`
    SELECT *
    FROM trade_audit
    WHERE trade_id = ?
    ORDER BY created_at DESC
  `).all(tradeId);
}

function getTradePanel() {
  return {
    channelId: getSetting('trade_panel_channel_id'),
    messageId: getSetting('trade_panel_message_id')
  };
}

function setTradePanel(channelId, messageId) {
  setSetting('trade_panel_channel_id', channelId);
  setSetting('trade_panel_message_id', messageId);
}

function getTraderInventory(guildId, traderId) {
  return db.prepare(`
    SELECT spawner_name, menge
    FROM trader_inventory
    WHERE guild_id = ? AND trader_id = ?
    ORDER BY spawner_name
  `).all(guildId, traderId);
}

function getGuildInventory(guildId) {
  return db.prepare(`
    SELECT trader_id, spawner_name, menge
    FROM trader_inventory
    WHERE guild_id = ?
    ORDER BY spawner_name, menge DESC
  `).all(guildId);
}

function setTraderStock({ guildId, traderId, spawnerName, menge }) {
  try {
    db.prepare(`
      INSERT INTO trader_inventory (guild_id, trader_id, spawner_name, menge, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(guild_id, trader_id, spawner_name)
      DO UPDATE SET
        menge = excluded.menge,
        updated_at = excluded.updated_at
    `).run(guildId, traderId, spawnerName, menge, Date.now());

    return { success: true };
  } catch (error) {
    console.error('[DB] setTraderStock fehlgeschlagen:', error);
    return { success: false };
  }
}

function completeTicketTradeWithStock({
  guildId,
  traderId,
  source,
  ticketId,
  createdBy,
  spawnerName,
  anzahl,
  mode
}) {
  const now = Date.now();

  const tx = db.transaction(() => {
    const existing = db
      .prepare('SELECT id FROM trades WHERE ticket_id = ?')
      .get(ticketId);

    if (existing) {
      return { success: false, reason: 'duplicate' };
    }

    const row = db.prepare(`
      SELECT menge
      FROM trader_inventory
      WHERE guild_id = ? AND trader_id = ? AND spawner_name = ?
    `).get(guildId, traderId, spawnerName);

    const vorher = row?.menge ?? 0;

    const neueMenge =
      mode === 'kaufen'
        ? Math.max(0, vorher - anzahl)
        : vorher + anzahl;

    db.prepare(`
      INSERT INTO trader_inventory (guild_id, trader_id, spawner_name, menge, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(guild_id, trader_id, spawner_name)
      DO UPDATE SET
        menge = excluded.menge,
        updated_at = excluded.updated_at
    `).run(guildId, traderId, spawnerName, neueMenge, now);

    const result = db.prepare(`
      INSERT INTO trades (
        guild_id, trader_id, source, ticket_id, created_by, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(guildId, traderId, source, ticketId, createdBy, now);

    const tradeId = Number(result.lastInsertRowid);

    db.prepare(`
      INSERT INTO trade_audit (
        trade_id, action, performed_by, new_data, created_at
      )
      VALUES (?, 'CREATE', ?, ?, ?)
    `).run(
      tradeId,
      createdBy,
      JSON.stringify({ traderId, source, ticketId }),
      now
    );

    return { success: true, id: tradeId, vorher, nachher: neueMenge };
  });

  try {
    return tx();
  } catch (error) {
    console.error('[DB] completeTicketTradeWithStock fehlgeschlagen:', error);
    return { success: false, reason: 'error' };
  }
}

function getTraderPanel() {
  return {
    channelId: getSetting('trader_panel_channel_id'),
    messageId: getSetting('trader_panel_message_id')
  };
}

function setTraderPanel(channelId, messageId) {
  setSetting('trader_panel_channel_id', channelId);
  setSetting('trader_panel_message_id', messageId);
}

export {
  db,
  encryptJwt,
  decryptJwt,
  getOrCreateJwtSecret,
  getSpawners,
  saveSpawners,
  getPanel,
  setPanel,
  createVerifyCode,
  consumeVerifyCode,
  issueJwt,
  verifyJwt,
  addTicketBan,
  getTicketBan,
  getTicketBans,
  createTrade,
  getTraderStats,
  getTradeLeaderboard,
  getTradeHistory,
  getTradeById,
  correctTrade,
  deleteTrade,
  getTradeAudit,
  getTradePanel,
  setTradePanel,
  getTraderInventory,
  getGuildInventory,
  setTraderStock,
  completeTicketTradeWithStock,
  getTraderPanel,
  setTraderPanel
};
