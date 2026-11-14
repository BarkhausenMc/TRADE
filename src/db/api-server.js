import 'dotenv/config';
import crypto from 'node:crypto';
import http from 'node:http';

import express from 'express';
import { WebSocketServer } from 'ws';

import {
  db,
  getSpawners,
  getPanel,
  verifyJwt,
  getOrCreateJwtSecret
} from './database.js';

import jwt from 'jsonwebtoken';

const app = express();
app.use(express.json());

const LOGIN_TTL_MS = 5 * 60 * 1000;
const LOGIN_RATE_LIMIT_MS = 60 * 1000;
const LOGIN_RATE_LIMIT_MAX = 5;

const loginAttempts = new Map();
const pendingLoginSockets = new Map();

function requireToken(req, res, next) {
  const auth = req.headers.authorization || '';

  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = auth.slice(7).trim();
  const payload = verifyJwt(token);

  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired JWT' });
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

app.post('/api/internal/auth/complete', (req, res) => {
  try {
    const internalSecret = process.env.INTERNAL_API_SECRET;

    if (!internalSecret || req.headers['x-internal-secret'] !== internalSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { discordUserId, minecraftUsername, token } = req.body;

    if (!discordUserId || !minecraftUsername || !token) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const payload = verifyJwt(token);

    if (!payload || payload.sub !== discordUserId) {
      return res.status(401).json({ error: 'Invalid JWT' });
    }

    const secret = getOrCreateJwtSecret();

    const cipherKey = crypto.scryptSync(
      process.env.JWT_ENCRYPTION_KEY,
      'tradebot-jwt-storage-v1',
      32
    );

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', cipherKey, iv);

    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');

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
      encrypted,
      iv.toString('hex'),
      cipher.getAuthTag().toString('hex'),
      payload.exp * 1000,
      Date.now()
    );

    console.log(`[API AUTH] ${minecraftUsername} erfolgreich gespeichert.`);

    return res.json({
      success: true,
      message: 'Account successfully authenticated'
    });
  } catch (error) {
    console.error('[API AUTH ERROR]', error);
    return res.status(500).json({ error: 'Authentication storage failed' });
  }
});

app.post('/api/login', (req, res) => {
  const ip = req.socket.remoteAddress;

  if (isLoginRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many login attempts' });
  }

  const minecraftUsername =
    typeof req.body.minecraftUsername === 'string'
      ? req.body.minecraftUsername.trim()
      : '';

  if (!/^[a-zA-Z0-9_]{3,16}$/.test(minecraftUsername)) {
    return res.status(400).json({ error: 'Invalid Minecraft username' });
  }

  const session = createLoginSession(minecraftUsername);

  return res.json(session);
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

export {
  resolveLoginCode,
  sendToLoginSession,
  startApi,
  pendingLoginSockets
};
