import 'dotenv/config';

const HUGOGUARD_BASE_URL = process.env.HUGOGUARD_BASE_URL || 'https://hugoguard.net/api';

const NAME_MAP = {
  'skellet': 'SKELETON',
  'skeleton': 'SKELETON',
  'zombie': 'ZOMBIE',
  'creeper': 'CREEPER',
  'spider': 'SPIDER',
  'blaze': 'BLAZE',
  'iron-golem': 'IRON_GOLEM',
  'cow': 'COW',
  'piglin': 'ZOMBIE_PIGLIN'
};

function toItem(name) {
  const key = String(name).trim().toLowerCase();
  return NAME_MAP[key] || key.toUpperCase();
}

function toRaw(priceInMio) {
  return Math.round(Number(priceInMio) * 1000000);
}

async function hugoguardRequest(method, endpoint, body) {
  const apiKey = process.env.HUGOGUARD_PARTNER_API_KEY;

  if (!apiKey) {
    throw new Error('HUGOGUARD_PARTNER_API_KEY ist nicht gesetzt.');
  }

  const response = await fetch(`${HUGOGUARD_BASE_URL}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-partner-api-key': apiKey
    },
    body: body ? JSON.stringify(body) : undefined
  });

  console.log(`[HugoGuard] ${method} ${endpoint} -> ${response.status}`);

  const text = await response.text();

  if (!response.ok) {
    console.error(`[HugoGuard] Antwort: ${text}`);
    throw new Error(`HugoGuard API ${method} ${endpoint} -> ${response.status}: ${text}`);
  }

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export async function pushSpawner(spawner) {
  const item = toItem(spawner.name);
  const buyPrice = spawner.ankauf == null ? null : toRaw(spawner.ankauf);
  const sellPrice = spawner.verkauf == null ? null : toRaw(spawner.verkauf);

  console.log(`[HugoGuard] pushSpawner: "${spawner.name}" -> "${item}", buy=${buyPrice}, sell=${sellPrice}`);

  if (buyPrice === null && sellPrice === null) {
    return removeSpawner(spawner.name);
  }

  try {
    return await hugoguardRequest('PATCH', `/partner/v1/spawners/${item}`, { buyPrice, sellPrice });
  } catch (error) {
    if (String(error.message).includes('404')) {
      console.log('[HugoGuard] Eintrag existiert noch nicht – lege ihn per PUT an.');
      return hugoguardRequest('PUT', `/partner/v1/spawners/${item}`, { quantity: 0, buyPrice, sellPrice });
    }
    throw error;
  }
}

export async function removeSpawner(name) {
  console.log(`[HugoGuard] removeSpawner: "${name}"`);
  return hugoguardRequest('DELETE', `/partner/v1/spawners/${toItem(name)}`);
}