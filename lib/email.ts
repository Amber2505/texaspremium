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
  customerPhone?: string;
  method?: string;
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
    : 'No Data';

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.NOTIFICATION_EMAIL,
    subject: `💳 New Payment: ${paymentDetails.amount} - ${paymentDetails.customerName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        <div style="background: #A0103D; padding: 20px; text-align: center;">
          <h2 style="color: white; margin: 0;">Texas Premium Insurance - Payment Received</h2>
        </div>
        <div style="padding: 20px; background: #ffffff;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #6b7280;">Amount</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #059669; text-align: right; font-size: 18px;">${paymentDetails.amount}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #6b7280;">Customer Name</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; text-align: right; font-weight: bold;">${paymentDetails.customerName}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #6b7280;">Email Address</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; text-align: right;">${paymentDetails.customerEmail}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #6b7280;">Payment Method</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; text-align: right;">${paymentDetails.method || 'Card'}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #6b7280;">Transaction ID</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-family: monospace; font-size: 11px; text-align: right;">${paymentDetails.transactionId}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; color: #6b7280;">Date/Time</td>
              <td style="padding: 12px 0; text-align: right; font-size: 13px;">${cstTimestamp}</td>
            </tr>
          </table>
          
          <div style="margin-top: 30px;">
            <p style="font-weight: bold; color: #374151; font-size: 13px; margin-bottom: 10px;">📋 Raw Square JSON Data:</p>
            <div style="background: #1e293b; padding: 15px; border-radius: 6px; overflow-x: auto;">
              <pre style="color: #4ade80; font-size: 11px; margin: 0; white-space: pre-wrap; font-family: monospace;">${escapedJson}</pre>
            </div>
          </div>
        </div>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
}