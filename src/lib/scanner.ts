import { prisma } from './prisma';
import { generateGrid } from './grid';
import { scrapeGMB } from './scraper';
import { Browser, BrowserContext, Page } from 'playwright-core';
import { chromium, getElectronLaunchDefaults } from './browser';
import { logger } from './logger';
import { dispatchWebhook } from './webhookDispatcher';
import { resolveTargetRank, logMatchMiss } from './rankMatch';
import type { Scan } from '@prisma/client';

/**
 * Derives regional settings based on coordinates.
 * Ensures English language preference while matching local region markers.
 */
function getRegionalSettings(lat: number, lng: number) {
    // Default to US English
    let locale = 'en-US';
    let timezoneId = 'UTC';

    // Logic to detect major regions by coordinate bounds
    if (lat > 24 && lat < 50 && lng > -125 && lng < -66) {
        // USA
        locale = 'en-US';
        if (lng > -85) timezoneId = 'America/New_York';
        else if (lng > -95) timezoneId = 'America/Chicago';
        else if (lng > -107) timezoneId = 'America/Denver';
        else timezoneId = 'America/Los_Angeles';
    } else if (lat > 49 && lat < 61 && lng > -11 && lng < 2) {
        // United Kingdom
        locale = 'en-GB';
        timezoneId = 'Europe/London';
    } else if (lat > 35 && lat < 72 && lng > -10 && lng < 40) {
        // Europe (using en- variants to keep language English)
        locale = 'en-FR';
        timezoneId = 'Europe/Paris';
        if (lng > 20) timezoneId = 'Europe/Berlin';
    } else if (lat > -48 && lat < -10 && lng > 110 && lng < 155) {
        // Australia
        locale = 'en-AU';
        timezoneId = 'Australia/Sydney';
    } else if (lat > 8 && lat < 37 && lng > 68 && lng < 98) {
        // India
        locale = 'en-IN';
        timezoneId = 'Asia/Kolkata';
    } else if (lat > 12 && lat < 35 && lng > 34 && lng < 60) {
        // Middle East
        locale = 'en-AE';
        timezoneId = 'Asia/Dubai';
    } else if (lat > 42 && lat < 83 && lng > -141 && lng < -52) {
        // Canada
        locale = 'en-CA';
        timezoneId = 'America/Toronto';
        if (lng < -110) timezoneId = 'America/Vancouver';
    }

    return { locale, timezoneId };
}

export async function runScan(scanId: string) {
    let browser: Browser | null = null;
    let currentProxyId: string | null = null;
    const usedProxyIds = new Set<string>();
    let scan: Scan | null = null;

    try {
        await logger.info(`[Launcher] Initializing scanner process...`, 'SCANNER', { scanId });

        scan = await prisma.scan.findUnique({
            where: { id: scanId },
        });

        if (!scan) {
            await logger.error(`[Launcher] Aborting: Scan ${scanId} not found in database.`, 'SCANNER');
            return;
        }

        // Generate or reuse the runId for this execution
        const runId = scan.currentRunId || `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const runAt = new Date();

        await prisma.scan.update({
            where: { id: scanId },
            data: { status: 'RUNNING', currentRunId: runId },
        });

        await logger.info(`[Launcher] Status set to RUNNING for keyword: "${scan.keyword}" (runId: ${runId})`, 'SCANNER');

        const points = scan.customPoints
            ? JSON.parse(scan.customPoints)
            : generateGrid(scan.centerLat, scan.centerLng, scan.radius, scan.gridSize, scan.shape as any);

        await logger.debug(`[Launcher] Generated ${points.length} coordinates for scan.`, 'SCANNER');

        // ═══ SCAN RESUMABILITY ═══
        // Check for already-completed points from a previous partial run (crash recovery)
        const existingResults = await prisma.result.findMany({
            where: { scanId, runId },
            select: { lat: true, lng: true }
        });
        const completedPoints = new Set(
            existingResults.map(r => `${r.lat.toFixed(6)},${r.lng.toFixed(6)}`)
        );
        const remainingPoints = points.filter(
            (p: any) => !completedPoints.has(`${p.lat.toFixed(6)},${p.lng.toFixed(6)}`)
        );
        if (existingResults.length > 0) {
            await logger.info(`[Resume] Found ${existingResults.length} completed points. Resuming from point ${existingResults.length + 1}/${points.length}.`, 'SCANNER', { scanId });
        }

        // Initial fetch of proxy settings
        const proxySetting = await prisma.globalSetting.findUnique({ where: { key: 'useSystemProxy' } });
        const useSystemProxy = proxySetting ? proxySetting.value === 'true' : true;

        // If the Auto-Fetch toggle is on and the pool has run dry, top it up
        // before the first browser launch. Never throws - a failed refresh
        // just leaves the existing pool in place.
        if (!useSystemProxy) {
            const { maybeRefreshProxyPool } = await import('./proxyRefresh');
            await maybeRefreshProxyPool();
        }

        async function launchBrowser(failedProxyId?: string): Promise<Browser> {
            await logger.debug('Launching browser...', 'SCANNER', { failedProxyId });

            // If a proxy failed, disable it and log the event
            if (failedProxyId) {
                try {
                    await prisma.proxy.update({
                        where: { id: failedProxyId },
                        data: { status: 'DEAD', enabled: false, lastTestedAt: new Date() }
                    });
                    await logger.warn(`[ProxyCleanup] Proxy ${failedProxyId} marked DEAD and auto-disabled after failure.`, 'SCANNER');
                } catch { /* proxy may already be deleted */ }
            }

            const launchOptions: any = { headless: true, ...getElectronLaunchDefaults() };

            if (!useSystemProxy) {
                // Fetch healthy proxies (ACTIVE or UNTESTED)
                const availableProxies = await prisma.proxy.findMany({
                    where: {
                        enabled: true,
                        status: { in: ['ACTIVE', 'UNTESTED'] }
                    }
                });

                if (availableProxies.length > 0) {
                    // Prioritize ACTIVE proxies if available, otherwise use UNTESTED
                    const activeOnes = availableProxies.filter((p: any) => p.status === 'ACTIVE');
                    const pool = activeOnes.length > 0 ? activeOnes : availableProxies;

                    // Prefer proxies not yet used in this scan so a 49-point grid
                    // spreads across the pool instead of hammering one IP.
                    const unused = pool.filter((x: any) => !usedProxyIds.has(x.id));
                    const chooseFrom = unused.length > 0 ? unused : pool;
                    if (unused.length === 0) usedProxyIds.clear();

                    const p = chooseFrom[Math.floor(Math.random() * chooseFrom.length)];
                    currentProxyId = p.id;
                    usedProxyIds.add(p.id);

                    // Scheme-aware: honour socks5/http(s) instead of assuming http.
                    // Accepts a `protocol` column if present, or a host already carrying a scheme.
                    const rawHost: string = String(p.host || '');
                    const declared: string = String((p as any).protocol || '').toLowerCase();
                    let server: string;
                    if (rawHost.includes('://')) {
                        server = `${rawHost}:${p.port}`;
                    } else if (declared) {
                        server = `${declared}://${rawHost}:${p.port}`;
                    } else {
                        server = `http://${rawHost}:${p.port}`;
                    }

                    launchOptions.proxy = {
                        server,
                        username: p.username || undefined,
                        password: p.password || undefined,
                    };
                }
            }

            try {
                return await chromium.launch(launchOptions);
            } catch (launchErr: any) {
                await logger.warn(`Failed to launch browser with proxy ${launchOptions.proxy?.server || 'DIRECT'}: ${launchErr.message}. Retrying without proxy...`, 'SCANNER');

                // Mark the specific proxy as DEAD if it was the cause
                if (currentProxyId) {
                    await prisma.proxy.update({
                        where: { id: currentProxyId },
                        data: { status: 'DEAD', lastTestedAt: new Date() }
                    }).catch(() => { });
                }

                // Fallback to direct connection
                delete launchOptions.proxy;
                return await chromium.launch(launchOptions);
            }
        }

        /**
         * Create a completely fresh, isolated browser context for a single grid point.
         * This is CRITICAL for accuracy — prevents Google from personalizing results
         * based on cookies/history from previous grid points.
         */
        async function createFreshContext(b: Browser, lat: number, lng: number): Promise<{ context: BrowserContext; page: Page }> {
            const { locale, timezoneId } = getRegionalSettings(scan!.centerLat, scan!.centerLng);

            // Randomize viewport slightly to reduce fingerprinting
            const widthJitter = Math.floor(Math.random() * 100) - 50;
            const heightJitter = Math.floor(Math.random() * 100) - 50;

            // Rotate User Agents
            const userAgents = [
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0'
            ];
            const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];

            const ctx = await b.newContext({
                viewport: { width: 1366 + widthJitter, height: 768 + heightJitter },
                userAgent: randomUA,
                locale,
                timezoneId,
                // Start with zero state — no cookies, no storage
                storageState: { cookies: [], origins: [] },
                extraHTTPHeaders: {
                    'Accept-Language': 'en-US,en;q=0.9',
                    'DNT': '1',           // Do Not Track
                    'Sec-GPC': '1',       // Global Privacy Control
                    'Upgrade-Insecure-Requests': '1',
                },
                // Disable service workers to prevent caching
                serviceWorkers: 'block',
                // Permissions: Geolocation is critical
                permissions: ['geolocation'],
                geolocation: { latitude: lat, longitude: lng }
            });

            // Clear all storage as extra safety
            await ctx.clearCookies();

            const pg = await ctx.newPage();

            // Anti-detection: Add random mouse movements
            await pg.evaluate(() => {
                const moveMouse = () => {
                    const event = new MouseEvent('mousemove', {
                        'view': window,
                        'bubbles': true,
                        'cancelable': true,
                        'clientX': Math.random() * window.innerWidth,
                        'clientY': Math.random() * window.innerHeight
                    });
                    document.dispatchEvent(event);
                };
                setInterval(moveMouse, 3000 + Math.random() * 2000);
            });

            return { context: ctx, page: pg };
        }

        browser = await launchBrowser();

        // ═══ PROXY ROTATION ═══
        // The browser (and therefore the exit IP) used to be launched once for the
        // whole grid, so every point hit Google from the same address. Relaunch
        // periodically so the scan spreads across the proxy pool.
        let pointsSinceLaunch = 0;
        const ROTATE_EVERY_N_POINTS = 5;

        // ═══ CIRCUIT BREAKER ═══
        // Tracks consecutive failures. If too many in a row, pause to let Google cool down.
        let consecutiveFailures = 0;
        const CIRCUIT_BREAKER_THRESHOLD = 5; // 5 consecutive failures = trip
        const CIRCUIT_BREAKER_PAUSE_MS = 60_000; // 60 second cooldown

        for (const point of remainingPoints) {
            // Rotate the exit IP every few points (proxy mode only).
            if (!useSystemProxy && pointsSinceLaunch >= ROTATE_EVERY_N_POINTS) {
                try {
                    await logger.debug(`[ProxyRotation] Rotating exit IP after ${pointsSinceLaunch} points.`, 'SCANNER', { scanId });
                    await browser.close().catch(() => { });
                    browser = await launchBrowser();
                    pointsSinceLaunch = 0;
                } catch (rotErr: any) {
                    await logger.warn(`[ProxyRotation] Rotation failed (${rotErr?.message}); continuing on current connection.`, 'SCANNER');
                    pointsSinceLaunch = 0;
                }
            }
            pointsSinceLaunch++;

            // Check if scan has been stopped or reset
            const currentScan = await prisma.scan.findUnique({
                where: { id: scanId },
                select: { status: true }
            });

            // If status is PENDING, it means a NEW process (rerun) has reset this scan.
            // We must exit the OLD process loop immediately to avoid data corruption.
            if (!currentScan || currentScan.status === 'STOPPED' || currentScan.status === 'PENDING') {
                await logger.info(`Scan ${scanId} was stopped or reset. Current status: ${currentScan?.status}. Exiting process ${currentScan ? 'cleanly' : 'due to deletion'}.`, 'SCANNER');
                break;
            }

            let results: any[] = [];
            let success = false;
            let attempts = 0;
            const maxAttempts = 3;

            while (!success && attempts < maxAttempts) {
                attempts++;

                // Check if scan was stopped mid-retry (prevents wasted scrape cycles)
                if (attempts > 1) {
                    const midCheck = await prisma.scan.findUnique({
                        where: { id: scanId },
                        select: { status: true }
                    });
                    if (!midCheck || midCheck.status === 'STOPPED' || midCheck.status === 'PENDING') {
                        await logger.info(`Scan ${scanId} stopped/reset during retry loop. Aborting point.`, 'SCANNER');
                        break;
                    }
                }

                // Create a FRESH context for each attempt — this is the key accuracy fix.
                // Each grid point gets a clean browser with no cookies/cache/history.
                let pointContext: BrowserContext | null = null;
                let pointPage: Page | null = null;
                try {
                    const fresh = await createFreshContext(browser!, point.lat, point.lng);
                    pointContext = fresh.context;
                    pointPage = fresh.page;

                    results = await scrapeGMB(pointPage, scan.keyword, point.lat, point.lng);
                    success = true;
                    consecutiveFailures = 0; // Reset circuit breaker on success

                    // Validate result count
                    if (results.length < 20) {
                        await logger.debug(`[Accuracy] Point ${point.lat},${point.lng}: only ${results.length} results found (expected ~20)`, 'SCANNER');
                    }
                } catch (scrapeError: any) {
                    await logger.warn(`Attempt ${attempts} failed for point ${point.lat},${point.lng}: ${scrapeError.message}`, 'SCANNER');
                    if (attempts < maxAttempts) {
                        const isProxyError = scrapeError.message.includes('ERR_PROXY_CONNECTION_FAILED') ||
                            scrapeError.message.includes('ERR_TUNNEL_CONNECTION_FAILED') ||
                            scrapeError.message.includes('TIMEOUT');

                        const isBlockError = scrapeError.message.includes('418') ||
                            scrapeError.message.includes('429') ||
                            scrapeError.message.includes('captcha') ||
                            scrapeError.message.includes('unusual traffic');

                        if (isProxyError || isBlockError) {
                            // Re-launch browser with a different proxy on connection or block errors
                            if (browser) await browser.close().catch(() => { });
                            browser = await launchBrowser(currentProxyId || undefined);
                        }

                        // Exponential backoff between retries (2s, 4s)
                        const backoffMs = Math.min(2000 * Math.pow(2, attempts - 1), 8000);
                        await new Promise(resolve => setTimeout(resolve, backoffMs + Math.random() * 1000));
                    }
                } finally {
                    // ALWAYS close the point context to free resources
                    if (pointContext) await pointContext.close().catch(() => { });
                }
            }

            if (!success) {
                consecutiveFailures++;
                await logger.warn(`Point capture failed: ${point.lat}, ${point.lng} after max attempts. (consecutive: ${consecutiveFailures})`, 'SCANNER');

                // ═══ CIRCUIT BREAKER TRIP ═══
                if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
                    await logger.warn(`[CircuitBreaker] ${consecutiveFailures} consecutive failures — Google may be blocking. Pausing ${CIRCUIT_BREAKER_PAUSE_MS / 1000}s...`, 'SCANNER', { scanId });
                    // Close and relaunch browser with fresh proxy
                    if (browser) await browser.close().catch(() => { });
                    await new Promise(resolve => setTimeout(resolve, CIRCUIT_BREAKER_PAUSE_MS));
                    browser = await launchBrowser(currentProxyId || undefined);
                    consecutiveFailures = 0; // Reset after cooldown
                    await logger.info(`[CircuitBreaker] Cooldown complete. Resuming scan.`, 'SCANNER', { scanId });
                }

                await prisma.result.create({
                    data: {
                        scanId: scan.id,
                        runId,
                        runAt,
                        lat: point.lat,
                        lng: point.lng,
                        topResults: JSON.stringify([]),
                        rank: null,
                    },
                });
                continue;
            }

            // ── Resolve the target business's rank for this grid point ──
            const matched = resolveTargetRank(
                { businessName: scan.businessName, placeId: scan.placeId },
                results
            );
            const { rank, targetName, matchMethod } = matched;

            if (rank !== null) {
                await logger.debug(
                    `[Matching] Point ${point.lat},${point.lng}: Rank ${rank} via ${matchMethod} ("${targetName}")`,
                    'SCANNER'
                );

                // Backfill identity so subsequent runs use reliable ID matching
                if (matchMethod === 'Name' && matched.cid && !scan.placeId) {
                    await prisma.scan.update({
                        where: { id: scan.id },
                        data: { placeId: matched.cid }
                    });
                    await logger.info(`[Matching] Auto-saved CID ${matched.cid} for scan ${scan.id} from name match`, 'SCANNER');
                }
                if (!scan.businessName && targetName) {
                    await prisma.scan.update({
                        where: { id: scan.id },
                        data: { businessName: targetName }
                    });
                }
            } else {
                // Log WHY there is no rank — distinguishes a config gap from a real miss
                await logMatchMiss(
                    scan.id,
                    point,
                    { businessName: scan.businessName, placeId: scan.placeId },
                    results,
                    matchMethod
                );
            }

            await prisma.result.create({
                data: {
                    scanId: scan.id,
                    runId,
                    runAt,
                    lat: point.lat,
                    lng: point.lng,
                    topResults: JSON.stringify(results),
                    rank,
                    targetName,
                    placeId: matched.placeId,
                    cid: matched.cid
                },
            });
            await logger.debug(`Captured point ${point.lat},${point.lng}. Target Rank: ${rank || 'N/A'} (${results.length} results)`, 'SCANNER');

            // Random delay between points
            await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
        }

        // Calculate NEXT RUN if recurring
        let nextRun = null;
        if (scan.frequency === 'DAILY') {
            nextRun = new Date(Date.now() + 24 * 60 * 60 * 1000);
        } else if (scan.frequency === 'WEEKLY') {
            nextRun = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        }

        // Check for rank changes and create alerts
        if (scan.businessName) {
            const previousScan = await prisma.scan.findFirst({
                where: {
                    keyword: scan.keyword,
                    businessName: scan.businessName,
                    status: 'COMPLETED',
                    id: { not: scanId }
                },
                orderBy: { createdAt: 'desc' },
                include: { results: true }
            });

            if (previousScan) {
                const currentResults = await prisma.result.findMany({ where: { scanId } });
                const currentAvg = currentResults.filter((r: any) => r.rank !== null).reduce((acc: any, r: any) => acc + (r.rank || 21), 0) / (currentResults.filter((r: any) => r.rank !== null).length || 1);
                const previousAvg = previousScan.results.filter((r: any) => r.rank !== null).reduce((acc: any, r: any) => acc + (r.rank || 21), 0) / (previousScan.results.filter((r: any) => r.rank !== null).length || 1);

                const diff = previousAvg - currentAvg;
                if (Math.abs(diff) >= 0.5) {
                    const direction = diff > 0 ? 'improved' : 'dropped';
                    const alertMsg = `${scan.businessName} rank ${direction} by ${Math.abs(diff).toFixed(1)} points for "${scan.keyword}"`;

                    // Use transaction to ensure both alert and status update succeed together
                    await prisma.$transaction([
                        prisma.alert.create({
                            data: {
                                type: diff > 0 ? 'RANK_UP' : 'RANK_DOWN',
                                message: alertMsg,
                                scanId: scan.id
                            }
                        }),
                        prisma.scan.update({
                            where: { id: scanId },
                            data: {
                                status: 'COMPLETED',
                                nextRun
                            }
                        })
                    ]);

                    // Dispatch rank change webhook (fire-and-forget)
                    dispatchWebhook('RANK_CHANGE', {
                        scanId, keyword: scan.keyword, businessName: scan.businessName,
                        direction, change: Math.abs(diff).toFixed(1), message: alertMsg, runId
                    }).catch(() => { });
                } else {
                    await prisma.scan.update({
                        where: { id: scanId },
                        data: {
                            status: 'COMPLETED',
                            nextRun
                        }
                    });
                }
            } else {
                await prisma.scan.update({
                    where: { id: scanId },
                    data: {
                        status: 'COMPLETED',
                        nextRun
                    }
                });
            }
        } else {
            await prisma.scan.update({
                where: { id: scanId },
                data: {
                    status: 'COMPLETED',
                    nextRun
                }
            });
        }

        await logger.info(`Scan sequence completed successfully for "${scan.keyword}"`, 'SCANNER', { scanId });

        // Dispatch webhooks (fire-and-forget, never blocks scan completion)
        const finalResults = await prisma.result.findMany({ where: { scanId, runId } });
        const finalAvg = finalResults.filter(r => r.rank !== null).reduce((sum, r) => sum + (r.rank || 20), 0) / (finalResults.length || 1);
        dispatchWebhook('SCAN_COMPLETE', {
            scanId, keyword: scan.keyword, businessName: scan.businessName,
            avgRank: Math.round(finalAvg * 10) / 10, totalPoints: finalResults.length, runId
        }).catch(() => { });
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        await logger.error(`Critical failure in scan: ${errorMsg}`, 'SCANNER', {
            scanId,
            stack: error instanceof Error ? error.stack : undefined
        });

        await prisma.scan.update({
            where: { id: scanId },
            data: { status: 'FAILED' },
        }).catch(() => { });

        if (scan) {
            await prisma.alert.create({
                data: {
                    type: 'SCAN_ERROR',
                    message: `Scan failed for "${scan.keyword}": ${errorMsg}`,
                    scanId: scanId
                }
            }).catch(() => { });

            // Dispatch scan failed webhook (fire-and-forget)
            dispatchWebhook('SCAN_FAILED', {
                scanId, keyword: scan.keyword, businessName: scan.businessName,
                error: errorMsg
            }).catch(() => { });
        }
    } finally {
        if (browser) await browser.close().catch(() => { });
    }
}
