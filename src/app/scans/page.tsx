import { prisma } from '@/lib/prisma';
import ScansClient from './ScansClient';

// Always read live DB state. Without this, Next.js statically prerenders
// this page at build time and it would show stale/empty data forever.
export const dynamic = 'force-dynamic';

export default async function ScansPage() {
    const scans = await prisma.scan.findMany({
        orderBy: { createdAt: 'desc' },
    });

    // Serialize dates for client component
    const serializedScans = scans.map(scan => ({
        ...scan,
        createdAt: scan.createdAt.toISOString()
    }));

    return <ScansClient initialScans={serializedScans} />;
}
