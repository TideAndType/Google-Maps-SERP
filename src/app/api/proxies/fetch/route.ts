import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * Proxifly free-proxy-list.
 * Refreshed every ~5 minutes upstream and served over jsDelivr's CDN, so this
 * is far fresher than the old static raw.githubusercontent.com text lists.
 * Unlike those lists, each entry carries protocol / anonymity / score /
 * geolocation, which lets us keep only the candidates worth testing.
 */
const PROXIFLY_URL =
    'https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/all/data.json';

interface ProxiflyEntry {
    proxy: string;
    protocol: string;
    ip: string;
    port: number;
    https?: boolean;
    anonymity?: string;
    score?: number;
    geolocation?: { country?: string; city?: string };
}

const MAX_IMPORT = 500;
const MAX_TEST = 100;

export async function POST(req: Request) {
    logger.info('POST request received at /api/proxies/fetch', 'PROXY_FETCHER');
    try {
        // Optional body: { country?: string }  e.g. "US" to only import US exits.
        let country = '';
        try {
            const body = await req.json();
            country = typeof body?.country === 'string' ? body.country.trim().toUpperCase() : '';
        } catch {
            // No body sent - import from all countries.
        }

        // Safety Check: Check for active scans
        const activeScans = await prisma.scan.findFirst({
            where: { status: 'RUNNING' }
        });

        if (activeScans) {
            return NextResponse.json({
                success: false,
                logs: ['[CAUTION] Active scan detected.', '[ABORT] Proxy pool synchronization paused to prevent routing instability.'],
                count: 0
            });
        }

        const logs: string[] = [];

        // Be honest about what this feature is: free, public, shared proxy lists.
        // Typically 90-95% are dead at any moment, and the survivors are widely
        // abused so Google often blocks or degrades them.
        logs.push('[NOTICE] Source: Proxifly free public proxy list (refreshed every ~5 min).');
        logs.push('[NOTICE] Expect most candidates to test DEAD - that is normal for free proxies.');
        logs.push('[NOTICE] Free proxies are frequently blocked by Google. For reliable scans use Direct Connection or paid residential proxies.');

        let entries: ProxiflyEntry[] = [];
        try {
            logger.info(`Fetching Proxifly list: ${PROXIFLY_URL}`, 'PROXY_FETCHER');
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000);

            const res = await fetch(PROXIFLY_URL, {
                cache: 'no-store',
                signal: controller.signal
            }).finally(() => clearTimeout(timeoutId));

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const parsed = await res.json();
            if (!Array.isArray(parsed)) throw new Error('Unexpected payload shape');
            entries = parsed as ProxiflyEntry[];
            logs.push(`[SOURCE] Proxifly returned ${entries.length} live candidates.`);
        } catch (err: any) {
            logger.error(`Failed Proxifly fetch: ${err.message}`, 'PROXY_FETCHER');
            return NextResponse.json({
                success: false,
                logs: [...logs, `[ERROR] Could not reach Proxifly: ${err.message}`],
                count: 0
            });
        }

        // Only import HTTP/HTTPS. SOCKS proxies are in the feed but the pool's
        // health checker and browser launcher expect HTTP-style endpoints, so
        // importing SOCKS would just flood the pool with false DEAD entries.
        let candidates = entries.filter(e => e.protocol === 'http' || e.protocol === 'https');
        logs.push(`[FILTER] ${candidates.length} HTTP/HTTPS candidates (SOCKS entries skipped).`);

        if (country) {
            const before = candidates.length;
            candidates = candidates.filter(e => (e.geolocation?.country || '').toUpperCase() === country);
            logs.push(`[FILTER] Country ${country}: ${candidates.length} of ${before} retained.`);
        }

        // Prefer proxies that hide the real client IP, then highest reliability score.
        const anonRank = (a?: string) => {
            const v = (a || '').toLowerCase();
            if (v === 'elite') return 0;
            if (v === 'anonymous') return 1;
            return 2;
        };
        candidates.sort((a, b) => {
            const r = anonRank(a.anonymity) - anonRank(b.anonymity);
            if (r !== 0) return r;
            return (b.score ?? 0) - (a.score ?? 0);
        });

        const seen = new Set<string>();
        const proxyData = candidates
            .filter(e => {
                const key = `${e.ip}:${e.port}`;
                if (!e.ip || !e.port || seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .slice(0, MAX_IMPORT)
            .map(e => ({
                host: e.ip,
                port: Number(e.port),
                type: 'DATACENTER' as const,
                enabled: true
            }))
            .filter(p => p.host && !isNaN(p.port));

        if (proxyData.length === 0) {
            return NextResponse.json({
                success: false,
                logs: [...logs, '[ABORT] No usable candidates after filtering.'],
                count: 0
            });
        }

        logger.info(`Performing quality check on ${MAX_TEST} discovered routing pairs...`, 'PROXY_FETCHER');
        logs.push(`Evaluating routing quality for ${MAX_TEST} candidates...`);

        const { validateProxyBatch } = await import('@/lib/proxy-tester');
        const testPool = proxyData.slice(0, MAX_TEST);
        const results = await validateProxyBatch(testPool);

        let alive = 0;
        let dead = 0;
        const statusByKey = new Map<string, boolean>();
        for (const r of results) {
            const ok = Boolean((r as any).alive ?? (r as any).ok ?? (r as any).success);
            statusByKey.set(`${(r as any).host}:${(r as any).port}`, ok);
            if (ok) alive++; else dead++;
        }

        logs.push(`[HEALTH] Validation complete: ${alive} Active, ${dead} Dead.`);

        const processedProxies = proxyData.map(p => {
            const key = `${p.host}:${p.port}`;
            if (!statusByKey.has(key)) {
                return { ...p, status: 'UNTESTED' as const };
            }
            return {
                ...p,
                status: (statusByKey.get(key) ? 'ACTIVE' : 'DEAD') as 'ACTIVE' | 'DEAD',
                lastTestedAt: new Date()
            };
        });

        logs.push(`Registered ${processedProxies.length} potential routes.`);

        logger.info(`Saving ${processedProxies.length} proxies to pool...`, 'PROXY_FETCHER');

        // SQLite doesn't support skipDuplicates in createMany.
        // We filter out existing proxies manually to avoid unique constraint violations.
        const existingProxies = await prisma.proxy.findMany({
            select: { host: true, port: true }
        });

        const existingKeys = new Set(existingProxies.map(p => `${p.host}:${p.port}`));
        const newProxies = processedProxies.filter(p => !existingKeys.has(`${p.host}:${p.port}`));

        logger.info(`Pool has ${existingProxies.length} existing. Detected ${newProxies.length} new unique from ${processedProxies.length} candidates.`, 'PROXY_FETCHER');
        logs.push(`Deduplication: ${existingKeys.size} already in pool, ${newProxies.length} new discovered.`);

        let count = 0;
        let errors = 0;
        let firstError = '';

        if (newProxies.length > 0) {
            for (const p of newProxies) {
                try {
                    await prisma.proxy.create({
                        data: {
                            host: p.host,
                            port: p.port,
                            type: p.type,
                            enabled: p.enabled,
                            status: p.status,
                            lastTestedAt: 'lastTestedAt' in p ? p.lastTestedAt : undefined
                        }
                    });
                    count++;
                } catch (err: any) {
                    // Try fallback for stale schema
                    try {
                        await prisma.proxy.create({
                            data: {
                                host: p.host,
                                port: p.port,
                                type: p.type,
                                enabled: p.enabled
                            }
                        });
                        count++;
                        if (!firstError) firstError = 'Schema mismatch: Saved without status fields.';
                    } catch (fallbackErr: any) {
                        errors++;
                        if (errors === 1) firstError = err.message;
                        if (errors <= 5) {
                            logger.error(`Insertion error: ${err.message}`, 'PROXY_FETCHER');
                        }
                    }
                }
            }
        }

        const currentCount = await prisma.proxy.count();
        logger.info(`Sync complete. Added ${count} new. Total in pool: ${currentCount}. Errors: ${errors}`, 'PROXY_FETCHER');

        return NextResponse.json({
            success: true,
            sources: ['Proxifly'],
            logs: [
                ...logs,
                `[SYNC] Completed: ${count} added, ${processedProxies.length - newProxies.length} skipped duplicates.`,
                `[STATS] Total routing units in pool: ${currentCount}.`,
                ...(errors > 0 ? [`[WARN] ${errors} coordinate pairs failed to register. First Error: ${firstError}`] : [])
            ],
            count: count
        });

    } catch (error: any) {
        logger.error(`Global proxy fetch error: ${error.message}`, 'PROXY_FETCHER');
        return NextResponse.json({
            success: false,
            error: 'Failed to fetch proxies',
            details: error.message
        }, { status: 500 });
    }
}
