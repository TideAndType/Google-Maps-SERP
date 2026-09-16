'use client';

import { useEffect, useState } from 'react';

/**
 * CARTO's public basemap endpoints are keyless — they require no API key and
 * no account. Do NOT append an `api_key` param: CARTO responds to unrecognised
 * credentials by serving an "API Key Required" placeholder image for every
 * tile, which renders as that text repeated across the whole map.
 *
 * CARTO platform/Maps-API tokens (the `cb1_...` format) are NOT basemap
 * credentials and will trigger exactly that failure.
 */
export const BASEMAPS = {
    voyager: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    osm: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
} as const;

export type BasemapStyle = keyof typeof BASEMAPS;

export const DEFAULT_BASEMAP: BasemapStyle = 'voyager';
export const CARTO_BASE_URL = BASEMAPS[DEFAULT_BASEMAP];

/**
 * Resolves the basemap tile URL.
 *
 * Reads the optional `mapBasemap` row from Settings > Providers
 * (GlobalSetting, via /api/settings). Any unknown or empty value falls back to
 * the default style, so a bad setting can never break the map.
 *
 * The style is stored in the DB rather than an env var because NEXT_PUBLIC_*
 * values are inlined at build time — a packaged Electron binary could never
 * change its basemap without a full rebuild.
 */
export function useCartoTileUrl(): string {
    const [style, setStyle] = useState<BasemapStyle>(DEFAULT_BASEMAP);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/settings')
            .then(res => res.json())
            .then(data => {
                const saved = String(data?.settings?.mapBasemap || '').trim().toLowerCase();
                if (!cancelled && saved in BASEMAPS) {
                    setStyle(saved as BasemapStyle);
                }
            })
            .catch(() => {
                /* keep the default style */
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return BASEMAPS[style] || BASEMAPS[DEFAULT_BASEMAP];
}
