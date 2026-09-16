import { prisma } from './prisma';
import { logger } from './logger';

/**
 * Refreshes the proxy pool from the Proxifly public list.
 *
 * This is the server-side counterpart to the "Auto-Fetch Proxy Pool" toggle in
 * Settings -> Providers. It is intentionally conservative: it only tops the pool
 * up when the healthy pool has fallen below MIN_HEALTHY, and it never throws -
 * a failed refresh must never take a scan down with it.
 *
 * Note: these are free, shared, public proxies. Most are dead at any moment and
 * the survivors are widely abused, so Google often blocks or degrades them.
 * Paid residential proxies remain the right choice for client-facing data.
 */

const PROXIFLY_URL =
    'https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/all/data.json';

/** Only top up when fewer than this many usable proxies remain. */
const MIN_HEALTHY = 10;
/** Hard cap on how many we add per refresh, to keep the DB tidy. */
const MAX_ADD = 200;

interface ProxiflyEntry {
    protocol: string;
    ip: string;
    port: number;
    anonymity?: string;
    score?: number;
    geolocation?: { country?: string };
}

function anonRank(a?: string): number {
    const v = (a || '').toLowerCase();
    if (v === 'elite') return 0;
    if (v === 'anonymous') return 1;
    return 2;
}

export async function maybeRefreshProxyPool(): Promise<{ added: number; skipped: string | null }> {
    try {
        const enabledSetting = await prisma.globalSetting.findUnique({
            where: { key: 'autoFetchProxies' }
        });
        if (!enabledSetting || enabledSetting.value !== 'true') {
            return { added: 0, skipped: 'disabled' };
        }

        const healthy = await prisma.proxy.count({
            where: { enabled: true, status: { in: ['ACTIVE', 'UNTESTED'] } }
        });
        if (healthy >= MIN_HEALTHY) {
            return { added: 0, skipped: `pool healthy (${healthy})` };
        }

        const countrySetting = await prisma.globalSetting.findUnique({
            where: { key: 'proxyCountry' }
        });
        const country = (countrySetting?.value || '').trim().toUpperCase();

        await logger.info(
            `[ProxyAutoFetch] Healthy pool is ${healthy} (< ${MIN_HEALTHY}). Refreshing from Proxifly...`,
            'SCANNER'
        );

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);
        const res = await fetch(PROXIFLY_URL, {
            cache: 'no-store',
            signal: controller.signal
        }).finally(() => clearTimeout(timeoutId));

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const parsed = await res.json();
        if (!Array.isArray(parsed)) throw new Error('Unexpected payload shape');

        let candidates = (parsed as ProxiflyEntry[]).filter(
            e => e.protocol === 'http' || e.protocol === 'https'
        );
        if (country) {
            candidates = candidates.filter(
                e => (e.geolocation?.country || '').toUpperCase() === country
            );
        }

        candidates.sort((a, b) => {
            const r = anonRank(a.anonymity) - anonRank(b.anonymity);
            if (r !== 0) return r;
            return (b.score ?? 0) - (a.score ?? 0);
        });

        const existing = await prisma.proxy.findMany({ select: { host: true, port: true } });
        const existingKeys = new Set(existing.map(p => `${p.host}:${p.port}`));

        const seen = new Set<string>();
        const toAdd = candidates
            .filter(e => {
                if (!e.ip || !e.port) return false;
                const key = `${e.ip}:${e.port}`;
                if (seen.has(key) || existingKeys.has(key)) return false;
                seen.add(key);
                return true;
            })
            .slice(0, MAX_ADD);

        let added = 0;
        for (const e of toAdd) {
            try {
                await prisma.proxy.create({
                    data: {
                        host: e.ip,
                        port: Number(e.port),
                        type: 'DATACENTER',
                        enabled: true,
                        status: 'UNTESTED'
                    }
                });
                added++;
            } catch {
                // Fallback for stale schemas without the status column.
                try {
                    await prisma.proxy.create({
                        data: {
                            host: e.ip,
                            port: Number(e.port),
                            type: 'DATACENTER',
                            enabled: true
                        }
                    });
                    added++;
                } catch { /* skip this candidate */ }
            }
        }

        await logger.info(
            `[ProxyAutoFetch] Added ${added} untested proxies${country ? ` (country ${country})` : ''}.`,
            'SCANNER'
        );
        return { added, skipped: null };
    } catch (err: any) {
        // Never let a proxy refresh failure abort a scan.
        try {
            await logger.warn(
                `[ProxyAutoFetch] Refresh failed, continuing with existing pool: ${err?.message}`,
                'SCANNER'
            );
        } catch { /* logger unavailable */ }
        return { added: 0, skipped: 'error' };
    }
}
