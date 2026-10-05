import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enqueueScan } from '@/lib/scanQueue';
import { authorizeTideOrbit } from '@/lib/tideorbitBridge';
import { logger } from '@/lib/logger';

type Point = { lat: number; lng: number; row?: number; col?: number };

function validPoint(p: any): p is Point {
  return p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))
    && Number(p.lat) >= -90 && Number(p.lat) <= 90
    && Number(p.lng) >= -180 && Number(p.lng) <= 180;
}

export async function POST(req: Request) {
  if (!(await authorizeTideOrbit(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const keyword = String(body.keyword || '').trim();
    const businessName = String(body.businessName || '').trim();
    const placeId = String(body.placeId || '').trim();
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const gridSize = Math.max(1, Math.min(15, Number.parseInt(String(body.gridSize || 3), 10) || 3));
    const radius = Math.max(0.1, Math.min(100, Number(body.radius || 5)));
    const customPoints = Array.isArray(body.customPoints)
      ? body.customPoints.filter(validPoint).slice(0, 225).map((p: Point) => ({ lat: Number(p.lat), lng: Number(p.lng) }))
      : null;

    if (!keyword || keyword.length > 200) {
      return NextResponse.json({ error: 'A keyword up to 200 characters is required.' }, { status: 400 });
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json({ error: 'Valid center coordinates are required.' }, { status: 400 });
    }
    if (!businessName && !placeId) {
      return NextResponse.json({ error: 'businessName or placeId is required for rank matching.' }, { status: 400 });
    }

    const scan = await prisma.scan.create({
      data: {
        keyword,
        centerLat: lat,
        centerLng: lng,
        radius,
        gridSize,
        shape: customPoints && customPoints.length ? 'SQUARE' : 'SQUARE',
        customPoints: customPoints && customPoints.length ? JSON.stringify(customPoints) : null,
        frequency: 'ONCE',
        businessName: businessName || undefined,
        placeId: placeId || undefined,
        status: 'PENDING',
      },
    });

    const queueStatus = enqueueScan(scan.id);
    await logger.info(`[TideOrbit] Scan ${scan.id} accepted (${queueStatus}) for "${keyword}"`, 'API');

    return NextResponse.json({
      ok: true,
      scanId: scan.id,
      status: scan.status,
      queueStatus,
      protocol: 1,
    }, { status: 202 });
  } catch (error) {
    await logger.error('TideOrbit scan creation failed', 'API', { error: String(error) });
    return NextResponse.json({ error: 'Failed to create browser scan', details: String(error) }, { status: 500 });
  }
}
