require('dotenv').config();

const HUGOGUARD_BASE_URL = process.env.HUGOGUARD_BASE_URL || 'https://api.hugoguard.net';
const HUGOGUARD_API_KEY = process.env.HUGOGUARD_PARTNER_API_KEY;

console.log('[HugoGuard] Modul geladen.');
console.log(`[HugoGuard] Base-URL: ${HUGOGUARD_BASE_URL}`);
console.log(`[HugoGuard] API-Key gesetzt: ${HUGOGUARD_API_KEY ? 'ja' : 'NEIN'}`);

const headers = {
  'Content-Type': 'application/json',
  'x-partner-api-key': HUGOGUARD_API_KEY
};

async function hugoguardRequest(method, endpoint, body) {
  console.log(`[HugoGuard] Request: ${method} ${endpoint}`);
  console.log(`[HugoGuard] Body: ${JSON.stringify(body)}`);

  if (!HUGOGUARD_API_KEY) {
    console.error('[HugoGuard] Abbruch: kein API-Key in .env');
    throw new Error('HUGOGUARD_PARTNER_API_KEY ist nicht gesetzt.');
  }

  const response = await fetch(`${HUGOGUARD_BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  console.log(`[HugoGuard] Status: ${response.status} ${response.statusText}`);

  const text = await response.text();
  console.log(`[HugoGuard] Antwort: ${text || '(leer)'}`);

  if (!response.ok) {
    throw new Error(`HugoGuard API ${method} ${endpoint} -> ${response.status}: ${text}`);
  }

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function toItem(name) {
  return name.toLowerCase().replace(/[^a-z0-9_]+/g, '_');
}

function toRaw(priceInMio) {
  return Math.round(Number(priceInMio) * 1000000);
}

async function pushSpawner(spawner) {
  const item = toItem(spawner.name);
  console.log(`[HugoGuard] pushSpawner: "${spawner.name}" -> item "${item}", buy=${toRaw(spawner.ankauf)}, sell=${toRaw(spawner.verkauf)}`);
  return hugoguardRequest('PUT', `/partner/v1/spawners/${item}`, {
    quantity: 0,
    buyPrice: toRaw(spawner.ankauf),
    sellPrice: toRaw(spawner.verkauf)
  });
}

async function removeSpawner(name) {
  console.log(`[HugoGuard] removeSpawner: "${name}"`);
  return hugoguardRequest('DELETE', `/partner/v1/spawners/${toItem(name)}`);
}

module.exports = { hugoguardRequest, pushSpawner, removeSpawner, toItem, toRaw };