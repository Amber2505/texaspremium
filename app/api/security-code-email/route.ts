// api/security-code-email/route.ts
import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // Only the socket server may call this — it sends whatever code it's given
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { code, emails } = (await req.json().catch(() => ({}))) as {
    code?: string;
    emails?: string[];
  };

  if (!code || !/^\d{4}$/.test(code) || !Array.isArray(emails) || emails.length === 0) {
    return NextResponse.json({ error: 'code and emails required' }, { status: 400 });
  }

  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) {
    return NextResponse.json({ error: 'EMAIL_USER / EMAIL_PASS not set on Vercel' }, { status: 500 });
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  const dateLabel = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  let sent = 0;
  const failed: string[] = [];

  for (const to of emails.slice(0, 20)) {
    try {
      await transporter.sendMail({
        from: `"Texas Premium Admin" <${user}>`,
        to,
        subject: `Admin security code — ${dateLabel}`,
        text: `Your admin security code for today is: ${code}\n\nThis code expires in 24 hours.`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px;">
            <p style="margin:0 0 12px;color:#333;">Your admin security code for ${dateLabel}:</p>
            <p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:0 0 16px;color:#111;">${code}</p>
            <p style="margin:0;color:#888;font-size:12px;">This code expires in 24 hours.</p>
          </div>`,
      });
      sent++;
    } catch (err) {
      const e = err as { code?: string; message?: string };
      failed.push(`${to} (${e.code || e.message})`);
    }
  }

  return NextResponse.json({ sent, failed });
}