import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export async function sendPaymentNotification(paymentDetails: {
  amount?: string;
  customerName?: string;
  customerEmail?: string;
  transactionId?: string;
  timestamp: Date;
  paymentJson?: string | null;
}) {
  const cstTimestamp = paymentDetails.timestamp.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }) + ' CST';

  const escapedJson = paymentDetails.paymentJson 
    ? paymentDetails.paymentJson
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
    : null;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.NOTIFICATION_EMAIL,
    subject: `💳 New Payment Received: ${paymentDetails.amount}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
        <div style="background: #A0103D; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="color: white; margin: 0;">New Payment Received!</h2>
        </div>
        <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb;">
          <div style="background: white; padding: 20px; border-radius: 8px;">
            <h3 style="color: #111827; margin-top: 0;">Payment Details</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 0; font-weight: 600; color: #374151;">Amount:</td>
                <td style="padding: 12px 0; color: #059669; font-size: 18px; font-weight: bold;">${paymentDetails.amount || 'N/A'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 0; font-weight: 600; color: #374151;">Customer:</td>
                <td style="padding: 12px 0; color: #111827;">${paymentDetails.customerName || 'N/A'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 0; font-weight: 600; color: #374151;">Email:</td>
                <td style="padding: 12px 0; color: #111827;">${paymentDetails.customerEmail || 'N/A'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 0; font-weight: 600; color: #374151;">Transaction ID:</td>
                <td style="padding: 12px 0; color: #111827; font-family: monospace; font-size: 12px;">${paymentDetails.transactionId || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 12px 0; font-weight: 600; color: #374151;">Date:</td>
                <td style="padding: 12px 0; color: #111827;">${cstTimestamp}</td>
              </tr>
            </table>
          </div>
          <div style="background: white; padding: 20px; border-radius: 8px; margin-top: 20px;">
            <h3 style="color: #111827; margin-top: 0;">📋 Raw Square Data</h3>
            <div style="background: #1e293b; padding: 20px; border-radius: 8px; overflow-x: auto;">
              <pre style="color: #4ade80; font-size: 11px; margin: 0; white-space: pre-wrap; font-family: monospace;">${escapedJson || 'No data'}</pre>
            </div>
          </div>
          <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">Automated notification from Texas Premium Insurance Services.</p>
        </div>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
}