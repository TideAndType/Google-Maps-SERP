import { NextResponse } from 'next/server';
import { getOrCreateBridgeKey, isLocalRequest, regenerateBridgeKey } from '@/lib/tideorbitBridge';

export async function GET(req: Request) {
  if (!isLocalRequest(req)) {
    return NextResponse.json({ error: 'Pairing key is only available from the local scanner app.' }, { status: 403 });
  }
  const key = await getOrCreateBridgeKey();
  return NextResponse.json({ key });
}

export async function POST(req: Request) {
  if (!isLocalRequest(req)) {
    return NextResponse.json({ error: 'Pairing key can only be regenerated from the local scanner app.' }, { status: 403 });
  }
  const key = await regenerateBridgeKey();
  return NextResponse.json({ key, regenerated: true });
}
