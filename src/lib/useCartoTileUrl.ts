'use client';

import { useEffect, useState } from 'react';

export const CARTO_BASE_URL =
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

// Build-time fallback only. The runtime key from Settings > Providers wins.
const CARTO_ENV_KEY = process.env.NEXT_PUBLIC_CARTO_API_KEY || '';

/**
 * Resolves the CARTO basemap tile URL.
 *
 * Priority:
 *   1. `cartoApiKey` saved in Settings > Providers (GlobalSetting, via /api/settings)
 *   2. NEXT_PUBLIC_CARTO_API_KEY (build-time env)
 *   3. CARTO's keyless public endpoint
 *
 * Storing the key in the DB rather than an env var matters for the Electron
 * build: NEXT_PUBLIC_* values are inlined at build time, so a packaged binary
 * could never change its key without a rebuild.
 */
export function useCartoTileUrl(): string {
    const [key, setKey] = useState<string>(CARTO_ENV_KEY);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/settings')
            .then(res => res.json())
            .then(data => {
                const saved = String(data?.settings?.cartoApiKey || '').trim();
                if (!cancelled && saved) setKey(saved);
            })
            .catch(() => {
                /* keep whatever fallback we already have */
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return key ? `${CARTO_BASE_URL}?api_key=${encodeURIComponent(key)}` : CARTO_BASE_URL;
}
