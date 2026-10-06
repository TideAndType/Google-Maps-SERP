import { NextResponse } from 'next/server';
import { authorizeTideOrbit } from '@/lib/tideorbitBridge';

export async function GET(request: Request) {
  if (!(await authorizeTideOrbit(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const address = String(searchParams.get('address') || '').trim();

  if (!address || address.length > 300) {
    return NextResponse.json({ error: 'A city or address is required.' }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`,
      {
        headers: {
          'User-Agent': 'TideOrbit-GBP-Rank-Tracker/1.9.8 (+https://github.com/TideAndType/Google-Maps-SERP)',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(15000),
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      return NextResponse.json({ error: `Location lookup failed (HTTP ${response.status}).` }, { status: 502 });
    }

    const data = await response.json();
    const first = Array.isArray(data) ? data[0] : null;

    if (!first || !Number.isFinite(Number(first.lat)) || !Number.isFinite(Number(first.lon))) {
      return NextResponse.json({ error: 'Location not found. Try a city, ZIP code, or full street address.' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      lat: Number(first.lat),
      lng: Number(first.lon),
      displayName: String(first.display_name || address),
      source: 'nominatim',
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Location lookup failed.', details: String(error) },
      { status: 502 },
    );
  }
}
