'use client';

import { useEffect, useState } from 'react';
import { BASEMAPS, DEFAULT_BASEMAP, type BasemapStyle } from '@/lib/useCartoTileUrl';

const STYLE_OPTIONS: { value: BasemapStyle; label: string; hint: string }[] = [
    { value: 'voyager', label: 'Voyager', hint: 'Balanced colour basemap (default)' },
    { value: 'light', label: 'Light', hint: 'Muted — rank pins stand out most' },
    { value: 'dark', label: 'Dark', hint: 'Dark basemap for low-light use' },
    { value: 'osm', label: 'OpenStreetMap', hint: 'Classic OSM styling' },
];

export function MapProviderSettings() {
    const [style, setStyle] = useState<BasemapStyle>(DEFAULT_BASEMAP);
    const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('loading');

    useEffect(() => {
        let cancelled = false;
        fetch('/api/settings')
            .then(res => res.json())
            .then(data => {
                if (cancelled) return;
                const saved = String(data?.settings?.mapBasemap || '').trim().toLowerCase();
                if (saved in BASEMAPS) setStyle(saved as BasemapStyle);
                setStatus('idle');
            })
            .catch(() => {
                if (!cancelled) setStatus('idle');
            });
        return () => {
            cancelled = true;
        };
    }, []);

    async function save(next: BasemapStyle) {
        setStyle(next);
        setStatus('saving');
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'mapBasemap', value: next }),
            });
            if (!res.ok) throw new Error('save failed');
            setStatus('saved');
            setTimeout(() => setStatus('idle'), 2000);
        } catch {
            setStatus('error');
        }
    }

    return (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                        Map Basemap
                    </h3>
                    <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                        Basemap tiles for the Spatial View. No API key or account is required —
                        all styles use free public endpoints.
                    </p>
                </div>
                {status === 'saved' && (
                    <span className="shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        Saved
                    </span>
                )}
                {status === 'saving' && (
                    <span className="shrink-0 text-xs text-neutral-400">Saving…</span>
                )}
                {status === 'error' && (
                    <span className="shrink-0 text-xs font-medium text-red-600 dark:text-red-400">
                        Save failed
                    </span>
                )}
            </div>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {STYLE_OPTIONS.map(opt => {
                    const active = style === opt.value;
                    return (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => save(opt.value)}
                            className={[
                                'text-left rounded-lg border px-4 py-3 transition-colors',
                                active
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
                                    : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600',
                            ].join(' ')}
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                                    {opt.label}
                                </span>
                                {active && (
                                    <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                                        Active
                                    </span>
                                )}
                            </div>
                            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                                {opt.hint}
                            </p>
                        </button>
                    );
                })}
            </div>

            <p className="mt-4 text-xs text-neutral-400 dark:text-neutral-500">
                Note: CARTO platform tokens (<code>cb1_…</code>) are not basemap credentials.
                Supplying one causes CARTO to return &ldquo;API Key Required&rdquo; placeholder
                tiles, so no key field is offered here.
            </p>
        </div>
    );
}
