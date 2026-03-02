import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    console.log('🔔 Webhook hit!', new Date().toISOString());
    
    const validationToken = req.headers.get('validation-token');
    if (validationToken) {
      return NextResponse.json({}, {
        headers: { 'Validation-Token': validationToken }
      });
    }

    const body = await req.json();
    console.log('📦 Webhook body:', JSON.stringify(body));
    
    const messageId = body?.body?.id;
    if (!messageId) {
      console.log('❌ No messageId found in body');
      return NextResponse.json({ ok: true });
    }

    const railwayUrl = process.env.NEXT_PUBLIC_SOCKET_URL!
      .replace('ws://', 'http://')
      .replace('wss://', 'https://');

    console.log('🚀 Calling Railway at:', `${railwayUrl}/trigger-sync`);

    const syncRes = await fetch(`${railwayUrl}/trigger-sync`, { method: 'POST' });
    console.log('✅ Railway response status:', syncRes.status);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('❌ Webhook error:', err);
    return NextResponse.json({ ok: true });
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