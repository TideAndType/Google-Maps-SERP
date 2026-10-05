import { NextResponse } from 'next/server';
import { authorizeTideOrbit, bridgeHealth } from '@/lib/tideorbitBridge';

export async function GET(req: Request) {
  if (!(await authorizeTideOrbit(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(bridgeHealth());
}
