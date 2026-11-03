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

  const digitCells = code
    .split('')
    .map(
      (d) => `
        <td style="padding:0 5px;">
          <div style="width:54px;height:66px;line-height:66px;text-align:center;font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:bold;color:#1E3A5F;background-color:#f3f5f9;border:2px solid #d6dce8;border-radius:10px;">${d}</div>
        </td>`,
    )
    .join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#eef0f4;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef0f4;padding:28px 12px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.08);">

        <!-- Logo -->
        <tr><td style="padding:22px 20px 18px;text-align:center;">
          <img src="https://www.texaspremiumins.com/logo.png" alt="Texas Premium Insurance Services" style="height:44px;">
        </td></tr>

        <!-- Gradient header -->
        <tr><td bgcolor="#1E3A5F" style="background:#1E3A5F;background-image:linear-gradient(135deg,#1E3A5F 0%,#2B4C7E 45%,#6B1D3A 80%,#8B1A3D 100%);padding:26px 24px;text-align:center;">
          <p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.7);">Admin Portal</p>
          <h1 style="margin:0;font-size:22px;color:#ffffff;font-weight:bold;">🔐 Your Daily Security Code</h1>
          <p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">${dateLabel}</p>
        </td></tr>

        <!-- Code -->
        <tr><td style="padding:32px 24px 8px;text-align:center;">
          <p style="margin:0 0 18px;font-size:15px;color:#374151;">Use this code to sign in to the admin dashboard today:</p>
          <table cellpadding="0" cellspacing="0" align="center"><tr>${digitCells}</tr></table>
          <p style="margin:18px 0 0;font-size:13px;color:#6b7280;">Valid until <strong style="color:#1E3A5F;">7:00 AM CST tomorrow</strong>, when a new code is issued.</p>
        </td></tr>

        <!-- Security note -->
        <tr><td style="padding:24px 24px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fdf4f6;border-left:4px solid #8B1A3D;border-radius:6px;">
            <tr><td style="padding:14px 16px;">
              <p style="margin:0;font-size:13px;line-height:1.5;color:#6B1D3A;">
                <strong>Keep this code private.</strong> Texas Premium staff will never ask you for it by phone, text, or email. If you didn't expect this message, let a manager know.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:18px 24px;background-color:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;font-size:11px;line-height:1.6;color:#9ca3af;">
            Automated message from the Texas Premium admin system.<br>
            © ${new Date().getFullYear()} Texas Premium Insurance Services, LLC
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Texas Premium Admin — Daily Security Code

${dateLabel}

Your code: ${code}

Valid until 7:00 AM CST tomorrow, when a new code is issued.

Keep this code private. Staff will never ask you for it by phone, text, or email.`;

  let sent = 0;
  const failed: string[] = [];

  for (const to of emails.slice(0, 20)) {
    try {
      await transporter.sendMail({
        from: `"Texas Premium Admin" <${user}>`,
        to,
        subject: `🔐 Admin security code — ${dateLabel}`,
        text,
        html,
      });
      sent++;
    } catch (err) {
      const e = err as { code?: string; message?: string };
      failed.push(`${to} (${e.code || e.message})`);
    }
  }

  return NextResponse.json({ sent, failed });
}