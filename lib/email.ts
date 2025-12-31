import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  // Higher timeout for serverless stability
  connectionTimeout: 10000, 
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
  // Verify connection first
  try {
    await transporter.verify();
  } catch (error) {
    console.error("Transporter Verify Failed:", error);
    throw error;
  }

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
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 20px auto; border: 1px solid #ddd; border-radius: 12px; overflow: hidden;">
        <div style="background: #A0103D; padding: 25px; text-align: center;">
          <h2 style="color: white; margin: 0;">New Payment Received</h2>
          <p style="color: #ffcdd2; margin: 5px 0 0 0;">Texas Premium Insurance Services</p>
        </div>
        <div style="padding: 30px; background: #ffffff;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666;">Amount</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: bold; font-size: 20px; color: #059669;">${paymentDetails.amount}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666;">Customer</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">${paymentDetails.customerName}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666;">Email</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; text-align: right;">${paymentDetails.customerEmail}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666;">Method</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #eee; text-align: right;">${paymentDetails.method}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; color: #666;">Time</td>
              <td style="padding: 12px 0; text-align: right; font-size: 13px;">${cstTimestamp}</td>
            </tr>
          </table>
          <details style="margin-top: 20px;">
            <summary style="cursor: pointer; color: #A0103D; font-size: 12px;">View Raw Data</summary>
            <pre style="background: #f4f4f4; padding: 10px; font-size: 10px; border-radius: 5px; overflow-x: auto;">${escapedJson}</pre>
          </details>
        </div>
      </div>
    `,
  };

  return await transporter.sendMail(mailOptions);
}