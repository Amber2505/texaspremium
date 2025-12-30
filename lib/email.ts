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
    subject: `✅ Payment: ${paymentDetails.amount} - ${paymentDetails.customerName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 20px auto; border: 1px solid #ddd; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
        <div style="background: #A0103D; padding: 25px; text-align: center;">
          <h2 style="color: white; margin: 0; font-size: 24px;">New Payment Received</h2>
          <p style="color: #ffcdd2; margin: 5px 0 0 0; font-size: 14px;">Texas Premium Insurance Services</p>
        </div>
        <div style="padding: 30px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 25px;">
            <span style="font-size: 32px; font-weight: bold; color: #059669;">${paymentDetails.amount}</span>
          </div>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666;">Customer Name</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: bold; color: #111;">${paymentDetails.customerName}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666;">Email</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; text-align: right; color: #111;">${paymentDetails.customerEmail}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666;">Payment Method</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; text-align: right; color: #111;">${paymentDetails.method}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666;">Transaction ID</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; text-align: right; font-family: monospace; font-size: 12px;">${paymentDetails.transactionId}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; color: #666;">Processed On</td>
              <td style="padding: 12px 0; text-align: right; font-size: 13px;">${cstTimestamp}</td>
            </tr>
          </table>
          
          <div style="margin-top: 30px; border-top: 2px dashed #eee; padding-top: 20px;">
            <details>
              <summary style="cursor: pointer; color: #A0103D; font-weight: bold; font-size: 13px;">View Raw Square Data (Technical)</summary>
              <pre style="background: #f8fafc; color: #334155; padding: 15px; border-radius: 8px; font-size: 11px; margin-top: 10px; border: 1px solid #e2e8f0; white-space: pre-wrap;">${escapedJson}</pre>
            </details>
          </div>
        </div>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
}