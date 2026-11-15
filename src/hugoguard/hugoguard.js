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

function toItem(name) {
  return name.toLowerCase().replace(/[^a-z0-9_]+/g, '_');
}

function toRaw(priceInMio) {
  return Math.round(Number(priceInMio) * 1000000);
}

async function pushSpawner(spawner) {
  const item = toItem(spawner.name);
  return hugoguardRequest('PUT', `/partner/v1/spawners/${item}`, {
    quantity: 0,
    buyPrice: toRaw(spawner.ankauf),
    sellPrice: toRaw(spawner.verkauf)
  });
}

async function removeSpawner(name) {
  return hugoguardRequest('DELETE', `/partner/v1/spawners/${toItem(name)}`);
}

module.exports = { hugoguardRequest, pushSpawner, removeSpawner, toItem, toRaw };