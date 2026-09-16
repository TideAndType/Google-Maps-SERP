'use client';

import { useEffect, useState } from 'react';
import { Map as MapIcon, Check, Loader2, Eye, EyeOff } from 'lucide-react';
import { Card, Button, Input } from '@/components/ui';

/**
 * Map provider credentials, stored in GlobalSetting via /api/settings.
 *
 * The CARTO basemap key is intentionally NOT read from NEXT_PUBLIC_* here:
 * env vars are inlined at build time, which is wrong for a desktop app the
 * user installs as a binary. Storing it in the DB lets the key be changed
 * and rotated at runtime with no rebuild.
 */
export function MapProviderSettings() {
    const [cartoKey, setCartoKey] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [reveal, setReveal] = useState(false);

    useEffect(() => {
        fetch('/api/settings')
            .then(res => res.json())
            .then(data => setCartoKey(data.settings?.cartoApiKey || ''))
            .catch(err => console.error('Failed to load map settings:', err))
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setSaved(false);
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'cartoApiKey', value: cartoKey.trim() }),
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch (err) {
            console.error('Failed to save CARTO key:', err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card className="p-8 border-none shadow-xl ring-1 ring-gray-200 bg-white">
            <div className="w-14 h-14 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mb-6 shadow-sm">
                <MapIcon size={28} />
            </div>

            <h3 className="text-xl font-black text-gray-900 mb-2">CARTO Basemap</h3>
            <p className="text-sm text-gray-500 font-medium mb-6 leading-relaxed">
                Optional. Leave blank to use CARTO&apos;s free keyless tiles, which are rate limited
                and may drop out under heavy scanning. Adding a key raises those limits.
            </p>

            <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">
                API Key
            </label>

            <div className="relative mb-4">
                <Input
                    type={reveal ? 'text' : 'password'}
                    value={cartoKey}
                    onChange={(e) => setCartoKey(e.target.value)}
                    placeholder={loading ? 'Loading...' : 'cb1_...'}
                    disabled={loading}
                    className="pr-12 font-mono text-sm"
                    autoComplete="off"
                    spellCheck={false}
                />
                <button
                    type="button"
                    onClick={() => setReveal(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label={reveal ? 'Hide API key' : 'Show API key'}
                >
                    {reveal ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
            </div>

            <div className="flex items-center gap-3">
                <Button onClick={handleSave} disabled={loading || saving}>
                    {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save Key'}
                </Button>
                {saved && (
                    <span className="flex items-center gap-1.5 text-sm font-bold text-green-600">
                        <Check size={16} /> Saved
                    </span>
                )}
            </div>

            <p className="text-xs text-gray-400 font-medium mt-5 leading-relaxed">
                Stored locally in your own database. Reload the Spatial View after saving for
                new tiles to be requested.
            </p>
        </Card>
    );
}
