require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const { WebSocketServer } = require('ws');

function getEncryptionKey() {
  const secret = process.env.JWT_ENCRYPTION_KEY;

  if (!secret || secret.length < 32) {
    throw new Error('JWT_ENCRYPTION_KEY fehlt oder ist zu kurz.');
  }

  return crypto.scryptSync(
    secret,
    'tradebot-jwt-storage-v1',
    32
  );
}

function encryptJwt(token) {
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    iv
  );

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

const Database = require('better-sqlite3');
const express = require('express');
const jwt = require('jsonwebtoken');

const DB_FILE = path.join(__dirname, 'tradebot.db');
const LEGACY_SPAWNERS_FILE = path.join(__dirname, 'spawners.json');
const LEGACY_PANEL_FILE = path.join(__dirname, 'panel.json');

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

db.exec(`
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
    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  const token = auth.slice(7).trim();
  const payload = verifyJwt(token);

  if (!payload) {
    return res.status(401).json({
      error: 'Invalid or expired JWT'
    });
  }

  const session = db.prepare(`
    SELECT minecraft_username, expires_at
    FROM api_sessions
    WHERE discord_user_id = ?
  `).get(payload.sub);

  req.auth = {
    type: 'jwt',
    userId: payload.sub,
    expiresAt: payload.exp,
    minecraftUsername: session ? session.minecraft_username : null
  };

  return next();
}


const app = express();
app.use(express.json());

app.post('/api/internal/auth/complete', (req, res) => {
  try {
    const internalSecret = process.env.INTERNAL_API_SECRET;

    if (
      !internalSecret ||
      req.headers['x-internal-secret'] !== internalSecret
    ) {
      return res.status(401).json({
        error: 'Unauthorized'
      });
    }

    const {
      discordUserId,
      minecraftUsername,
      token
    } = req.body;

    if (!discordUserId || !minecraftUsername || !token) {
      return res.status(400).json({
        error: 'Missing required fields'
      });
    }

    const payload = verifyJwt(token);

    if (!payload || payload.sub !== discordUserId) {
      return res.status(401).json({
        error: 'Invalid JWT'
      });
    }

    const encrypted = encryptJwt(token);

    db.prepare(`
      INSERT OR REPLACE INTO api_sessions (
        discord_user_id,
        minecraft_username,
        encrypted_token,
        iv,
        auth_tag,
        expires_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      discordUserId,
      minecraftUsername,
      encrypted.encrypted,
      encrypted.iv,
      encrypted.authTag,
      payload.exp * 1000,
      Date.now()
    );

    console.log(
      `[API AUTH] ${minecraftUsername} erfolgreich gespeichert.`
    );

    return res.json({
      success: true,
      message: 'Account successfully authenticated'
    });

  } catch (error) {
    console.error('[API AUTH ERROR]', error);

    return res.status(500).json({
      error: 'Authentication storage failed'
    });
  }
});

app.post('/api/login', (req, res) => {
  const ip = req.socket.remoteAddress;

  if (isLoginRateLimited(ip)) {
    return res.status(429).json({
      error: 'Too many login attempts'
    });
  }

  const minecraftUsername =
    typeof req.body.minecraftUsername === 'string'
      ? req.body.minecraftUsername.trim()
      : '';

  if (!/^[a-zA-Z0-9_]{3,16}$/.test(minecraftUsername)) {
    return res.status(400).json({
      error: 'Invalid Minecraft username'
    });
  }

  const session = createLoginSession(minecraftUsername);

  return res.json(session);
});

app.get('/login', (req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>TRADE API Login</title>
<style>
  body { font-family: sans-serif; background: #16171d; color: #eee; max-width: 560px; margin: 60px auto; padding: 0 20px; }
  input, button { font-size: 1rem; padding: 10px; border-radius: 8px; border: none; }
  input { width: 100%; box-sizing: border-box; background: #23252e; color: #eee; }
  button { background: #6d4aff; color: #fff; cursor: pointer; margin-top: 10px; }
  .code { font-size: 2rem; letter-spacing: 0.3em; color: #6d4aff; }
  pre { background: #23252e; padding: 15px; border-radius: 8px; overflow-wrap: anywhere; white-space: pre-wrap; }
</style>
</head>
<body>
<h1>TRADE API Login</h1>
<input id="name" placeholder="Minecraft-Name">
<br>
<button onclick="startLogin()">Login starten</button>
<p id="status"></p>
<script>
async function startLogin() {
  const name = document.getElementById('name').value.trim();
  const status = document.getElementById('status');

  const res = await fetch('/trade/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ minecraftUsername: name })
  });

  if (!res.ok) {
    status.textContent = 'Fehler: ' + (await res.json()).error;
    return;
  }

  const data = await res.json();

  status.innerHTML = 'Sende diesen Code im Spiel per <b>/msg JSK1905</b>:<br><span class="code">' + data.code + '</span>';

  const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
  const ws = new WebSocket(proto + location.host + '/trade/ws?sessionId=' + encodeURIComponent(data.sessionId));

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === 'token') {
      localStorage.setItem('api_token', msg.token);

      if (msg.expiresAt) {
        localStorage.setItem('api_token_expires', String(msg.expiresAt));
      }

      status.innerHTML = '✅ Login erfolgreich! Token wurde gespeichert.';

    } else if (msg.type === 'error') {
      status.textContent = msg.error;
    }
  };
}
</script>
</body>
</html>`);
});

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
  getOrCreateJwtSecret();

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (socket, req) => {
    const sessionId = new URL(req.url, 'http://localhost')
      .searchParams.get('sessionId');
    const session = sessionId ? getLoginSession(sessionId) : null;

    if (!session || session.status !== 'pending' || Date.now() > session.expires_at) {
      socket.send(JSON.stringify({
        type: 'error',
        error: 'Ungültige oder abgelaufene Session'
      }));
      socket.close();
      return;
    }

    pendingLoginSockets.set(sessionId, socket);

    socket.on('close', () => {
      if (pendingLoginSockets.get(sessionId) === socket) {
        pendingLoginSockets.delete(sessionId);
      }
    });

    setTimeout(() => {
      if (pendingLoginSockets.get(sessionId) === socket) {
        try {
          socket.send(JSON.stringify({
            type: 'error',
            error: 'Session abgelaufen'
          }));
          socket.close();
        } catch {}
        pendingLoginSockets.delete(sessionId);
      }
    }, session.expires_at - Date.now());
  });

  const port = Number(process.env.API_PORT || 3000);
  const host = process.env.API_HOST || '127.0.0.1';

  server.listen(port, host, () => {
    console.log(`[API] http://${host}:${port} – JWT Authentication aktiviert.`);
  });
}

const LOGIN_TTL_MS = 5 * 60 * 1000;
const LOGIN_RATE_LIMIT_MS = 60 * 1000;
const LOGIN_RATE_LIMIT_MAX = 5;

const loginAttempts = new Map();
const pendingLoginSockets = new Map();

function createLoginSession(minecraftUsername) {
  db.prepare('DELETE FROM login_sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('DELETE FROM login_sessions WHERE minecraft_username = ?').run(minecraftUsername);

  const sessionId = crypto.randomUUID();
  const code = String(crypto.randomInt(100000, 1000000));
  const now = Date.now();

  db.prepare(`
    INSERT INTO login_sessions (
      session_id,
      minecraft_username,
      code,
      status,
      created_at,
      expires_at
    ) VALUES (?, ?, ?, 'pending', ?, ?)
  `).run(sessionId, minecraftUsername, code, now, now + LOGIN_TTL_MS);

  return {
    sessionId,
    code,
    expiresInMs: LOGIN_TTL_MS
  };
}

function getLoginSession(sessionId) {
  return db.prepare(`
    SELECT session_id, minecraft_username, code, status, expires_at
    FROM login_sessions
    WHERE session_id = ?
  `).get(sessionId);
}

function resolveLoginCode(code) {
  const row = db.prepare(`
    SELECT session_id, minecraft_username, status, expires_at
    FROM login_sessions
    WHERE code = ?
  `).get(code);

  if (!row || row.status !== 'pending' || Date.now() > row.expires_at) {
    return null;
  }

  db.prepare("UPDATE login_sessions SET status = 'done' WHERE session_id = ?")
    .run(row.session_id);

  const secret = getOrCreateJwtSecret();
  const token = jwt.sign(
    {
      sub: row.minecraft_username,
      type: 'browser-login'
    },
    secret,
    { expiresIn: process.env.API_JWT_EXPIRES || '24h' }
  );

  const decoded = jwt.verify(token, secret);

  return {
    sessionId: row.session_id,
    minecraftUsername: row.minecraft_username,
    token,
    expiresAt: decoded.exp
  };
}

function sendToLoginSession(sessionId, data) {
  const socket = pendingLoginSockets.get(sessionId);

  if (!socket) {
    return false;
  }

  try {
    socket.send(JSON.stringify(data));
    socket.close();
    pendingLoginSockets.delete(sessionId);
    return true;
  } catch {
    pendingLoginSockets.delete(sessionId);
    return false;
  }
}

function isLoginRateLimited(ip) {
  const now = Date.now();
  const attempts = (loginAttempts.get(ip) || [])
    .filter(timestamp => now - timestamp < LOGIN_RATE_LIMIT_MS);

  attempts.push(now);
  loginAttempts.set(ip, attempts);

  return attempts.length > LOGIN_RATE_LIMIT_MAX;
}

module.exports = {
  getSpawners,
  saveSpawners,
  getPanel,
  setPanel,
  createVerifyCode,
  consumeVerifyCode,
  issueJwt,
  resolveLoginCode,
  sendToLoginSession,
  startApi
};
