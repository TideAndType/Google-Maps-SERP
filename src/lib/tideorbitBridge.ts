import { randomBytes, timingSafeEqual } from 'crypto';
import { prisma } from './prisma';
import { getQueueStatus } from './scanQueue';

const KEY_SETTING = 'tideorbitBridgeKey';

export async function getOrCreateBridgeKey(): Promise<string> {
  const existing = await prisma.globalSetting.findUnique({ where: { key: KEY_SETTING } });
  if (existing?.value && existing.value.length >= 32) return existing.value;

  const value = randomBytes(32).toString('hex');
  await prisma.globalSetting.upsert({
    where: { key: KEY_SETTING },
    update: { value },
    create: { key: KEY_SETTING, value },
  });
  return value;
}

export async function regenerateBridgeKey(): Promise<string> {
  const value = randomBytes(32).toString('hex');
  await prisma.globalSetting.upsert({
    where: { key: KEY_SETTING },
    update: { value },
    create: { key: KEY_SETTING, value },
  });
  return value;
}

export function isLocalRequest(req: Request): boolean {
  try {
    const host = new URL(req.url).hostname.toLowerCase();
    return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

export async function authorizeTideOrbit(req: Request): Promise<boolean> {
  const provided = (req.headers.get('x-tideorbit-key') || '').trim();
  if (!provided) return false;

  const expected = await getOrCreateBridgeKey();
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function bridgeHealth() {
  return {
    ok: true,
    service: 'tideorbit-browser-bridge',
    protocol: 1,
    scanner: 'Google-Maps-SERP',
    queue: getQueueStatus(),
    timestamp: new Date().toISOString(),
  };
}

export function parseTopResults(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
