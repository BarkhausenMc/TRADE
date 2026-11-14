require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const express = require('express');
const jwt = require('jsonwebtoken');

const DB_FILE = path.join(__dirname, 'tradebot.db');
const LEGACY_SPAWNERS_FILE = path.join(__dirname, 'spawners.json');
const LEGACY_PANEL_FILE = path.join(__dirname, 'panel.json');

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

db.exec(`
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


function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);

  return row?.value ?? null;
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run(key, value);
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
  return db.prepare(
    'SELECT name, emoji, ankauf, verkauf FROM spawners ORDER BY rowid'
  ).all();
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

  return jwt.sign(
    { sub: discordUserId },
    secret,
    { expiresIn: process.env.API_JWT_EXPIRES || '24h' }
  );
}

function verifyJwt(token) {
  try {
    return jwt.verify(token, getOrCreateJwtSecret());
  } catch {
    return null;
  }
}


function requireToken(req, res, next) {
  const auth = req.headers.authorization || '';

  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const credential = auth.slice(7).trim();
  const payload = verifyJwt(credential);

  if (payload) {
    req.auth = { type: 'jwt', userId: payload.sub, expiresAt: payload.exp };
    return next();
  }

  const staticToken = process.env.API_TOKEN;

  if (staticToken && credential === staticToken) {
    req.auth = { type: 'token' };
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
}

const app = express();
app.use(express.json());
app.use(requireToken);

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.json(req.auth);
});

app.get('/api/spawners', (req, res) => {
  res.json(getSpawners());
});

app.get('/api/panel', (req, res) => {
  res.json(getPanel());
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});


function startApi() {
  const token = process.env.API_TOKEN;

  if (!token) {
    console.warn('[API] Kein API_TOKEN in der .env gesetzt – API wird NICHT gestartet.');
    return;
  }

  getOrCreateJwtSecret();

  const port = Number(process.env.API_PORT || 3000);
  const host = process.env.API_HOST || '127.0.0.1';

  app.listen(port, host, () => {
    console.log(`[API] http://${host}:${port} – Bearer Token oder JWT.`);
  });
}


module.exports = {
  getSpawners,
  saveSpawners,
  getPanel,
  setPanel,
  createVerifyCode,
  consumeVerifyCode,
  issueJwt,
  startApi
};
