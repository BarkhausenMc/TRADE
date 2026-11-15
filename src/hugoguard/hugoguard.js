require('dotenv').config();

const HUGOGUARD_BASE_URL = process.env.HUGOGUARD_BASE_URL || 'https://api.hugoguard.net';
const HUGOGUARD_API_KEY = process.env.HUGOGUARD_PARTNER_API_KEY;

const headers = {
  'Content-Type': 'application/json',
  'x-partner-api-key': HUGOGUARD_API_KEY
};

async function hugoguardRequest(method, endpoint, body) {
  if (!HUGOGUARD_API_KEY) {
    throw new Error('HUGOGUARD_PARTNER_API_KEY ist nicht gesetzt.');
  }

  const response = await fetch(`${HUGOGUARD_BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HugoGuard API ${method} ${endpoint} -> ${response.status}: ${text}`);
  }

  return response.json().catch(() => null);
}

async function pushSpawner(spawner) {
  const item = spawner.name.toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  return hugoguardRequest('PUT', `/partner/v1/spawners/${item}`, {
    name: spawner.name,
    ankauf: spawner.ankauf,
    verkauf: spawner.verkauf
  });
}

async function removeSpawner(name) {
  const item = name.toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  return hugoguardRequest('DELETE', `/partner/v1/spawners/${item}`);
}

async function syncAllSpawners(spawners) {
  const results = [];
  for (const spawner of spawners) {
    try {
      await pushSpawner(spawner);
      results.push({ name: spawner.name, ok: true });
    } catch (error) {
      results.push({ name: spawner.name, ok: false, error: error.message });
    }
  }
  return results;
}

module.exports = { hugoguardRequest, pushSpawner, removeSpawner, syncAllSpawners };