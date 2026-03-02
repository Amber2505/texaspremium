import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const validationToken = req.headers.get('validation-token');
    if (validationToken) {
      return NextResponse.json({}, {
        headers: { 'Validation-Token': validationToken }
      });
    }

    const body = await req.json();
    const messageId = body?.body?.id;
    if (!messageId) return NextResponse.json({ ok: true });

    // Tell Railway to sync immediately
    const railwayUrl = process.env.NEXT_PUBLIC_RAILWAY_WS_URL!
      .replace('ws://', 'http://')
      .replace('wss://', 'https://');

    fetch(`${railwayUrl}/trigger-sync`, { method: 'POST' }); // fire and forget

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // always 200 to RC
  }
}

export async function GET(req: NextRequest) {
  const validationToken = req.headers.get('validation-token');
  if (validationToken) {
    return NextResponse.json({}, {
      headers: { 'Validation-Token': validationToken }
    });
  }
  return NextResponse.json({ ok: true });
}