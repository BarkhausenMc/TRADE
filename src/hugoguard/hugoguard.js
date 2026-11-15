import 'dotenv/config';

const HUGOGUARD_BASE_URL = process.env.HUGOGUARD_BASE_URL || 'https://api.hugoguard.net';
const HUGOGUARD_API_KEY = process.env.HUGOGUARD_PARTNER_API_KEY;

console.log('[HugoGuard] Modul geladen.');
console.log(`[HugoGuard] Base-URL: ${HUGOGUARD_BASE_URL}`);
console.log(`[HugoGuard] API-Key gesetzt: ${HUGOGUARD_API_KEY ? 'ja' : 'NEIN'}`);

const headers = {
  'Content-Type': 'application/json',
  'x-partner-api-key': HUGOGUARD_API_KEY
};

export async function hugoguardRequest(method, endpoint, body) {
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

export async function pushSpawner(spawner) {
  const item = toItem(spawner.name);
  const buyPrice = spawner.ankauf === null || spawner.ankauf === undefined ? null : toRaw(spawner.ankauf);
  const sellPrice = spawner.verkauf === null || spawner.verkauf === undefined ? null : toRaw(spawner.verkauf);

  console.log(`[HugoGuard] pushSpawner: "${spawner.name}" -> item "${item}", buy=${buyPrice}, sell=${sellPrice}`);

  if (buyPrice === null && sellPrice === null) {
    console.warn('[HugoGuard] Weder Ankauf noch Verkauf gesetzt – Eintrag wird gelöscht.');
    return removeSpawner(spawner.name);
  }

  try {
    return await hugoguardRequest('PATCH', `/partner/v1/spawners/${item}`, {
      buyPrice,
      sellPrice
    });
  } catch (error) {
    if (String(error.message).includes('404')) {
      console.log('[HugoGuard] Eintrag existiert noch nicht – lege ihn per PUT an.');
      return hugoguardRequest('PUT', `/partner/v1/spawners/${item}`, {
        quantity: 0,
        buyPrice,
        sellPrice
      });
    }

    throw error;
  }
}

export async function removeSpawner(name) {
  console.log(`[HugoGuard] removeSpawner: "${name}"`);
  return hugoguardRequest('DELETE', `/partner/v1/spawners/${toItem(name)}`);
}