require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const express = require('express');

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


function requireToken(req, res, next) {

console.log('Recv:', JSON.stringify(auth), '| Expected:', JSON.stringify(`Bearer ${token}`));

  const token = process.env.API_TOKEN;
  const auth = req.headers.authorization || '';

  if (!token || auth !== `Bearer ${token}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

const app = express();
app.use(express.json());
app.use(requireToken);

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
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

  const port = Number(process.env.API_PORT || 3000);
  const host = process.env.API_HOST || '127.0.0.1';

  app.listen(port, host, () => {
    console.log(`[API] http://${host}:${port} – geschützt via Bearer Token.`);
  });
}


module.exports = {
  getSpawners,
  saveSpawners,
  getPanel,
  setPanel,
  startApi
};
