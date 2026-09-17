'use client';

import { useState } from 'react';

/**
 * "Clear Cache & Reload" maintenance button.
 *
 * Map tiles are plain images, so if a basemap host ever returned an error
 * placeholder tile, Electron caches it exactly like a valid one and keeps
 * serving it even after the code is fixed. This flushes the HTTP cache and
 * reloads the window.
 *
 * Does not touch the database, scan history, or settings.
 */
export function ClearCacheButton() {
    const [status, setStatus] = useState<'idle' | 'working' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const api = typeof window !== 'undefined' ? (window as any).electronAPI : undefined;
    const available = Boolean(api?.clearCache);

    async function handleClear() {
        setStatus('working');
        setMessage('');
        try {
            const result = await api.clearCache();
            if (result?.ok) {
                // The main process reloads the window, so this rarely renders.
                setMessage('Cache cleared. Reloading...');
            } else {
                setStatus('error');
                setMessage(result?.error || 'Clear failed.');
            }
        } catch (err) {
            setStatus('error');
            setMessage(String(err));
        }
    }

    return (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-5">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-sm font-semibold text-neutral-100">Clear Cache &amp; Reload</h3>
                    <p className="mt-1 text-xs text-neutral-400">
                        Flushes cached map tiles and page assets, then reloads the app. Use this if
                        the map shows stale or broken tiles. Your scans, clients, and settings are
                        not affected.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={handleClear}
                    disabled={!available || status === 'working'}
                    className="shrink-0 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-medium text-neutral-100 transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {status === 'working' ? 'Clearing...' : 'Clear Cache'}
                </button>
            </div>

            {!available && (
                <p className="mt-3 text-xs text-amber-500">
                    Only available in the desktop app. In a browser, use a hard refresh instead.
                </p>
            )}

            {message && (
                <p className={`mt-3 text-xs ${status === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                    {message}
                </p>
            )}
        </div>
    );
}
