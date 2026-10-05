import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET() {
    try {
        const settings = await prisma.globalSetting.findMany();
        const settingsMap = settings.reduce((acc, curr) => {
            // Never expose the TideOrbit bridge secret through the generic settings API.
            if (curr.key === 'tideorbitBridgeKey') return acc;
            acc[curr.key] = curr.value;
            return acc;
        }, {} as Record<string, string>);

        return NextResponse.json({ settings: settingsMap });
    } catch (error) {
        logger.error('Settings GET error', 'SETTINGS', { error: String(error) });
        return NextResponse.json({ settings: {}, error: 'Failed to fetch settings' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { key, value } = await req.json();

        if (key === 'tideorbitBridgeKey') {
            return NextResponse.json({ error: 'Bridge key must be managed from the local TideOrbit pairing endpoint.' }, { status: 403 });
        }

        const setting = await prisma.globalSetting.upsert({
            where: { key },
            update: { value: String(value) },
            create: { key, value: String(value) },
        });

        return NextResponse.json(setting);
    } catch (error) {
        logger.error('Setting update failed', 'SETTINGS', { error: String(error) });
        return NextResponse.json({ error: 'Failed to update setting' }, { status: 500 });
    }
}
