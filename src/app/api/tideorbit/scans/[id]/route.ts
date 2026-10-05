import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeTideOrbit, parseTopResults } from '@/lib/tideorbitBridge';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await authorizeTideOrbit(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const scan = await prisma.scan.findUnique({ where: { id } });
  if (!scan) {
    return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
  }

  const runId = scan.currentRunId;
  const results = await prisma.result.findMany({
    where: runId ? { scanId: id, runId } : { scanId: id },
    orderBy: { capturedAt: 'asc' },
  });

  const normalized = results.map((r) => ({
    lat: r.lat,
    lng: r.lng,
    rank: r.rank,
    targetName: r.targetName,
    placeId: r.placeId,
    cid: r.cid,
    capturedAt: r.capturedAt.toISOString(),
    topResults: parseTopResults(r.topResults),
  }));

  const ranked = normalized.filter((r) => r.rank !== null);
  const avgRank = ranked.length
    ? Math.round((ranked.reduce((sum, r) => sum + Number(r.rank || 0), 0) / ranked.length) * 10) / 10
    : null;

  return NextResponse.json({
    ok: true,
    protocol: 1,
    scan: {
      id: scan.id,
      status: scan.status,
      keyword: scan.keyword,
      businessName: scan.businessName,
      placeId: scan.placeId,
      centerLat: scan.centerLat,
      centerLng: scan.centerLng,
      gridSize: scan.gridSize,
      currentRunId: scan.currentRunId,
      createdAt: scan.createdAt.toISOString(),
      resultCount: normalized.length,
      averageRank: avgRank,
      results: normalized,
    },
  });
}
